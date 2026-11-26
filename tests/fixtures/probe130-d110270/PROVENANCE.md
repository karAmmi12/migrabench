# Provenance : sonde de #130 sur le commit `d110270`

Copies, sans aucune modification (vérifié avec `cmp`), de deux HAR écrits par
la sonde `.probes/130/` (dépôt ignoré par Git), le 2026-11-26, sur un arbre
propre au commit `d110270` de la branche `feat/130-witness-value`. Le HAR est
enregistré comme l'oracle (`oracle/support.ts`) : `recordHar` avec `content:
"embed"`, sans filtre d'URL, par le navigateur du banc (service `browser`,
Playwright 1.65.1, Chromium 159.0.8154.6, `linux/arm64`), sous le verrou du
banc. La page et ses corps sont servis par `server.mjs`, lancé dans un
conteneur de l'image du service `browser`, sur le réseau `migrabench_default`
avec l'alias `candidate` : le navigateur l'atteint sur `http://127.0.0.1:8100/`
par son relais, comme un candidat.

| Copie | Version de la page | Entrées |
|---|---|---|
| `probe-unread.har` | première version : les `fetch` ne lisent pas les corps des réponses, et ni `/post-latin` ni `/post-blob` ne sont envoyés | 10 |
| `probe.har` | version ci-dessous : chaque corps de réponse est lu (`arrayBuffer()`) | 12 |

Relevé de la sonde, sur `probe.har` sauf mention :

| Corps | Dans le HAR |
|---|---|
| réponse `gzip` (`/gzip-text`) ou `br` (`/br-json`), texte | décompressé, en texte, sans `encoding`, `compression: 0` |
| réponse binaire (`/binary`, `/png`), et binaire `gzip` (`/gzip-binary`) | décompressé, en base64, `encoding: "base64"` |
| réponse jamais lue par la page (`probe-unread.har`) | absent : `size: -1`, sans `text` ni `encoding` |
| requête binaire (`Uint8Array` avec des octets nuls, `/post-binary`) | `postData.text` vide |
| requête binaire sans octet nul, UTF-8 invalide (`/post-latin`) | `postData.text`, l'octet invalide remplacé par U+FFFD |
| requête `Blob` (`/post-blob`) | pas de `postData` |
| requête JSON, formulaire | `postData.text` en clair |

## `server.mjs`, version de `probe.har`

```js
// Sonde de #130 : serveur joint par le navigateur du banc sous l'alias
// `candidate:8100`. Il sert des corps gzip, br et binaires portant la valeur
// témoin, pour relever comment Playwright les écrit dans un HAR.
import { createServer } from "node:http";
import { brotliCompressSync, gzipSync } from "node:zlib";

const V = "mbtemoin-7c41e9a2b58d306f";
const bytes = Buffer.from(V);
const b64 = (k) => Buffer.concat([Buffer.alloc(k, 0x41), bytes]).toString("base64");
const hexU = bytes.toString("hex").toUpperCase();
const binary = Buffer.concat([Buffer.from([0xff, 0x00, 0xfe, 0x80]), bytes, Buffer.from([0x00, 0xc3, 0x28])]);

const page = `<!doctype html><html><head><title>probe</title></head><body><script>
(async () => {
  const bin = new Uint8Array([0xff, 0x00, 0xfe, 0x80, ...new TextEncoder().encode("${V}"), 0x00, 0xc3, 0x28]);
  await (await fetch("/gzip-text")).arrayBuffer();
  await (await fetch("/br-json")).arrayBuffer();
  await (await fetch("/binary")).arrayBuffer();
  await (await fetch("/gzip-binary")).arrayBuffer();
  await (await fetch("/png")).arrayBuffer();
  await fetch("/post-binary", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: bin });
  await fetch("/post-latin", { method: "POST", headers: { "content-type": "text/plain" }, body: new Uint8Array([0x41, 0xe9, ...new TextEncoder().encode("${V}")]) });
  await fetch("/post-blob", { method: "POST", body: new Blob([bin]) });
  await fetch("/post-json", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: "${hexU}" }) });
  await fetch("/post-form", { method: "POST", body: new URLSearchParams({ t: "${V}" }) });
  await (await fetch("/header", { headers: { "x-probe": "${b64(2)}" } })).arrayBuffer();
  document.title = "done";
})();
</script></body></html>`;

createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    const url = req.url;
    if (url === "/") return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page);
    if (url === "/gzip-text") return res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "content-encoding": "gzip" }).end(gzipSync(`plain ${V} end`));
    if (url === "/br-json") return res.writeHead(200, { "content-type": "application/json", "content-encoding": "br" }).end(brotliCompressSync(JSON.stringify({ b64: b64(1) })));
    if (url === "/binary") return res.writeHead(200, { "content-type": "application/octet-stream" }).end(binary);
    if (url === "/gzip-binary") return res.writeHead(200, { "content-type": "application/octet-stream", "content-encoding": "gzip" }).end(gzipSync(binary));
    if (url === "/png") return res.writeHead(200, { "content-type": "image/png" }).end(binary);
    if (url === "/header") return res.writeHead(200, { "content-type": "text/plain", "x-echo": hexU }).end("ok");
    return res.writeHead(204).end();
  });
}).listen(8100, "0.0.0.0");
```

## `probe.ts`, version de `probe.har`

Tel qu'il a tourné pour `probe.har` : il écrivait `.probes/130/probe-read.har`,
copié ici sous le nom `probe.har`. Pour `probe-unread.har`, il écrivait
`.probes/130/probe.har` (résumé `summary.json`), copié ici sous le nom
`probe-unread.har`.

```ts
// Sonde de #130 : enregistre un HAR comme l'oracle (oracle/support.ts :
// recordHar, content "embed", navigateur du banc) sur le serveur de la sonde,
// et résume comment Playwright y écrit chaque corps.
import { writeFileSync } from "node:fs";
import { acquireBenchLockOrExit } from "../../shared/bench-lock.ts";
import { connectBenchBrowser } from "../../oracle/browser.ts";

const lock = acquireBenchLockOrExit({ tool: "oracle" });
const harPath = new URL("./probe-read.har", import.meta.url).pathname;
try {
  const browser = await connectBenchBrowser();
  const context = await browser.newContext({ recordHar: { path: harPath, content: "embed" } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8100/");
  await page.waitForFunction(() => document.title === "done", undefined, { timeout: 15_000 });
  await context.close();
  await browser.close();
} finally {
  lock.release();
}
const har = JSON.parse((await import("node:fs")).readFileSync(harPath, "utf8"));
const summary = har.log.entries.map((e: any) => ({
  url: e.request.url,
  method: e.request.method,
  postData: e.request.postData,
  content: { ...e.response.content, text: e.response.content.text?.slice(0, 120) },
  headers: e.response.headers.filter((h: any) => /encoding|type|x-echo/i.test(h.name)),
}));
writeFileSync(new URL("./summary-read.json", import.meta.url), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
```
