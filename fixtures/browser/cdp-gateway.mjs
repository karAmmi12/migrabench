// Passerelle CDP du navigateur du banc (#134, décision de Karim du 27/11) :
// Lighthouse parle au Chromium par le protocole DevTools (CDP), que le
// serveur de Playwright ne donne pas. La passerelle lance, à la demande du banc, un
// Chromium de l'image figée qui écoute en CDP sur la boucle locale du
// conteneur, et relaie ce CDP vers le port publié.
//
// Le candidat est sur le réseau `default`, comme ce service : il joint ce
// port. Toute requête doit donc porter le jeton de la pile (MB_BROWSER_TOKEN,
// tiré à chaque démarrage par le banc) en tête de son chemin. Sans jeton dans
// le service, tout est refusé. Le jeton n'est jamais relayé au Chromium.
//
// Routes, toutes sous `/<jeton>/` :
// - `POST launch` : lance un Chromium, rend `{ id, path }`, où `path` est le
//   chemin DevTools du navigateur ;
// - `POST close/<id>` : arrête ce Chromium ;
// - `GET cdp/<id>/devtools/…` : relaie la connexion WebSocket au Chromium,
//   chemin réécrit sans `/<jeton>/cdp/<id>`.
//
// Sans dépendance hors de Node : le fichier est monté tel quel dans le
// conteneur, et importé par les tests du banc.
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Longueur minimale du jeton : 32 caractères, `openssl rand -hex 16` au moins.
const MIN_TOKEN_LENGTH = 32;
// Taille maximale de l'en-tête d'une requête, au-delà de laquelle elle est refusée.
const MAX_HEAD_BYTES = 16 * 1024;
// Attente du port CDP d'un Chromium lancé.
const LAUNCH_TIMEOUT_MS = 30_000;

// Options du Chromium lancé : celles de chrome-launcher, avec lequel
// Lighthouse lance Chrome (Launcher.defaultFlags() de chrome-launcher 1.2.3,
// tests/browser-cdp-gateway.test.ts), le nouveau mode headless, et
// `--no-sandbox` : le conteneur tourne en root, comme le lance Playwright.
export const CHROMIUM_FLAGS = [
  "--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,CertificateTransparencyComponentUpdater,AutofillServerCommunication,PrivacySandboxSettings4",
  "--disable-extensions",
  "--disable-component-extensions-with-background-pages",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-client-side-phishing-detection",
  "--disable-sync",
  "--metrics-recording-only",
  "--disable-default-apps",
  "--mute-audio",
  "--no-default-browser-check",
  "--no-first-run",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--disable-ipc-flooding-protection",
  "--password-store=basic",
  "--use-mock-keychain",
  "--force-fieldtrials=*BackgroundTracing/default/",
  "--disable-hang-monitor",
  "--disable-prompt-on-repost",
  "--disable-domain-reliability",
  "--propagate-iph-for-testing",
  "--headless=new",
  "--no-sandbox",
];

function sameToken(given, token) {
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Route d'une requête, d'après son en-tête complet (jusqu'à la ligne vide).
 * @param {string} head
 * @param {string | undefined} token
 * @returns {{ kind: "refused" } | { kind: "launch" } | { kind: "close", id: string } | { kind: "cdp", id: string, head: string }}
 */
export function routeRequest(head, token) {
  const refused = { kind: "refused" };
  if (token === undefined || token.length < MIN_TOKEN_LENGTH) return refused;
  const lineEnd = head.indexOf("\r\n");
  if (lineEnd === -1) return refused;
  const requestLine = head.slice(0, lineEnd);
  const match = /^(GET|POST) \/([^/ ]+)(\/[^ ]*) HTTP\/1\.1$/.exec(requestLine);
  if (match === null) return refused;
  const [, method, given, rest] = match;
  if (!sameToken(given, token)) return refused;
  if (method === "POST" && rest === "/launch") return { kind: "launch" };
  const close = /^\/close\/(\d+)$/.exec(rest);
  if (method === "POST" && close !== null) return { kind: "close", id: close[1] };
  const cdp = /^\/cdp\/(\d+)(\/devtools\/[^ ]*)$/.exec(rest);
  if (method === "GET" && cdp !== null) return { kind: "cdp", id: cdp[1], head: `GET ${cdp[2]} HTTP/1.1${head.slice(lineEnd)}` };
  return refused;
}

/**
 * Efface le profil d'un Chromium arrêté. Ses processus fils peuvent y écrire
 * encore (ENOTEMPTY) : l'échec est ignoré, jamais rejeté, car une promesse
 * rejetée sans gestionnaire ferait tomber le service, serveur de Playwright
 * compris (exécution 46006087156 de la CI). Le conteneur est recréé avec la
 * pile, et son /tmp avec lui.
 * @param {string} userDataDir
 * @param {typeof rm} remove
 * @returns {Promise<void>}
 */
export async function removeProfile(userDataDir, remove = rm) {
  await remove(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
}

function respond(socket, status, body) {
  const text = body === undefined ? "" : JSON.stringify(body);
  socket.end(`HTTP/1.1 ${status}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`);
}

// Port et chemin DevTools d'un Chromium lancé, écrits par lui dans
// `DevToolsActivePort` de son dossier de profil.
async function devToolsActivePort(userDataDir, exited) {
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited()) throw new Error("Chromium exited before opening its DevTools port");
    const content = await readFile(join(userDataDir, "DevToolsActivePort"), "utf8").catch(() => "");
    const [port, path] = content.split("\n");
    if (port && path) return { port: Number(port), path };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Chromium did not open its DevTools port within ${LAUNCH_TIMEOUT_MS} ms`);
}

/**
 * Démarre la passerelle CDP.
 * @param {{ port: number, token: string | undefined, executablePath: string }} options
 */
export function startCdpGateway({ port, token, executablePath }) {
  const launched = new Map();
  let nextId = 1;

  async function launch() {
    const id = String(nextId++);
    const userDataDir = await mkdtemp(join(tmpdir(), "mb-cdp-"));
    const chromium = spawn(executablePath, [...CHROMIUM_FLAGS, "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`, "about:blank"], { stdio: "ignore" });
    let exited = false;
    // Exécutable introuvable ou non lancé : l'erreur ne doit pas faire tomber
    // le service, serveur de Playwright compris.
    chromium.on("error", () => {
      exited = true;
      void removeProfile(userDataDir);
    });
    chromium.on("exit", () => {
      exited = true;
      launched.delete(id);
      void removeProfile(userDataDir);
    });
    try {
      const devTools = await devToolsActivePort(userDataDir, () => exited);
      launched.set(id, { chromium, port: devTools.port });
      return { id, path: devTools.path };
    } catch (error) {
      chromium.kill("SIGKILL");
      throw error;
    }
  }

  function close(id) {
    const entry = launched.get(id);
    if (entry === undefined) return false;
    entry.chromium.kill("SIGKILL");
    launched.delete(id);
    return true;
  }

  const server = createServer((socket) => {
    let buffered = Buffer.alloc(0);
    socket.on("error", () => socket.destroy());
    const onData = (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf("\r\n\r\n");
      if (end === -1) {
        if (buffered.length > MAX_HEAD_BYTES) {
          socket.off("data", onData);
          respond(socket, "431 Request Header Fields Too Large");
        }
        return;
      }
      socket.off("data", onData);
      socket.pause();
      const head = buffered.subarray(0, end + 4).toString("latin1");
      const body = buffered.subarray(end + 4);
      const route = routeRequest(head, token);
      if (route.kind === "refused") return respond(socket, "403 Forbidden");
      if (route.kind === "launch") {
        return void launch().then(
          (result) => respond(socket, "200 OK", result),
          (error) => respond(socket, "500 Internal Server Error", { error: error.message }),
        );
      }
      if (route.kind === "close") return close(route.id) ? respond(socket, "200 OK", {}) : respond(socket, "404 Not Found");
      const entry = launched.get(route.id);
      if (entry === undefined) return respond(socket, "404 Not Found");
      const upstream = createConnection({ host: "127.0.0.1", port: entry.port });
      const teardown = () => {
        socket.destroy();
        upstream.destroy();
      };
      upstream.on("error", teardown);
      socket.on("close", teardown);
      upstream.write(Buffer.concat([Buffer.from(route.head, "latin1"), body]));
      socket.pipe(upstream).pipe(socket);
      socket.resume();
    };
    socket.on("data", onData);
  });
  server.listen(port, "0.0.0.0");
  const closeAll = () => {
    for (const id of [...launched.keys()]) close(id);
  };
  return { server, closeAll };
}
