// Porte Lighthouse (spec de l'étape 4, « Lighthouse (relevé) ») : la
// performance de l'écran d'arrivée du candidat, relevée sans seuil.
//
// Lighthouse, en mode « navigation », sur BASE_URL, dans un Chromium de
// l'image figée (#78), lancé par le relais CDP du service `browser`
// (gates/cdp-browser.ts) : profil desktop, ralentissement simulé, catégorie
// performance seule. La session est celle de l'agent, par l'en-tête
// `Authorization` (BASIC) que Lighthouse envoie avec chaque requête
// (`extraHeaders`). Avant chaque passe, Lighthouse vide le stockage de
// l'origine et le cache du navigateur (`disableStorageReset` à faux) : les
// identifiants, portés par l'en-tête, ne sont pas perdus.
//
// Résultat relevé, `performance` :
// - `examined` : le nombre de passes abouties, sur trois. Une passe aboutit
//   quand Lighthouse rend un rapport sans `runtimeError`, avec le score et les
//   quatre mesures ;
// - `findings` : les passes qui n'ont pas abouti, avec leur raison ;
// - `values` : pour chaque passe aboutie, `pass<N>.score`, `.lcp`, `.tbt`,
//   `.cls`, `.speedIndex`, et pour chaque passe `pass<N>.completed` (1 ou 0) ;
//   puis la médiane des passes abouties : `score` (de 0 à 1), `lcp`, `tbt` et
//   `speedIndex` (en ms), `cls` (sans unité).
//
// Aucun seuil avant l'étalonnage (#100). Les scores de l'étape 4 sont relevés
// sous la limite provisoire de #66 et ne servent à aucune conclusion.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseUsersWithoutUnknown } from "../scripts/users.ts";
import { ROOT } from "../shared/root.ts";
import { launchCdpChromium, type CdpChromium } from "./cdp-browser.ts";
import type { Gate } from "./registry.ts";
import { saveGateRaw } from "./raw.ts";
import { measured, type MeasuredResult } from "./result.ts";

const GATE = "lighthouse";
export const PASSES = 3;
// Délai de conception de la porte : trois passes, chacune bornée par
// l'attente du chargement de Lighthouse (45 s par défaut). Étalonné par #100.
const LIGHTHOUSE_TIMEOUT_MS = 300_000;

export const METRICS = ["score", "lcp", "tbt", "cls", "speedIndex"] as const;
export type Metric = (typeof METRICS)[number];

// Ce que la porte lit d'un rapport de Lighthouse (LHR).
export interface Lhr {
  runtimeError?: { code: string; message: string };
  categories: { performance?: { score: number | null } };
  audits: Record<string, { numericValue?: number } | undefined>;
}

export type PassOutcome = { completed: true; metrics: Record<Metric, number> } | { completed: false; reason: string };

const AUDITS: Record<Exclude<Metric, "score">, string> = {
  lcp: "largest-contentful-paint",
  tbt: "total-blocking-time",
  cls: "cumulative-layout-shift",
  speedIndex: "speed-index",
};

// Mesures d'une passe, ou la raison pour laquelle elle n'a pas abouti.
export function passOutcome(lhr: Lhr): PassOutcome {
  if (lhr.runtimeError !== undefined) return { completed: false, reason: `${lhr.runtimeError.code}: ${lhr.runtimeError.message}` };
  const score = lhr.categories.performance?.score;
  if (typeof score !== "number") return { completed: false, reason: "no performance score" };
  const metrics: Record<Metric, number> = { score, lcp: 0, tbt: 0, cls: 0, speedIndex: 0 };
  for (const [metric, audit] of Object.entries(AUDITS) as [Exclude<Metric, "score">, string][]) {
    const value = lhr.audits[audit]?.numericValue;
    if (typeof value !== "number") return { completed: false, reason: `no numeric value for ${audit}` };
    metrics[metric] = value;
  }
  return { completed: true, metrics };
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function lighthouseResult(passes: readonly PassOutcome[], raw: Record<string, string>): MeasuredResult {
  const values: Record<string, number> = {};
  const findings: { pass: number; reason: string }[] = [];
  const completed: Record<Metric, number>[] = [];
  passes.forEach((outcome, index) => {
    const pass = `pass${index + 1}`;
    values[`${pass}.completed`] = outcome.completed ? 1 : 0;
    if (!outcome.completed) return void findings.push({ pass: index + 1, reason: outcome.reason });
    completed.push(outcome.metrics);
    for (const metric of METRICS) values[`${pass}.${metric}`] = outcome.metrics[metric];
  });
  if (completed.length > 0) for (const metric of METRICS) values[metric] = median(completed.map((metrics) => metrics[metric]));
  return measured({ gate: GATE, name: "performance", examined: completed.length, findings, values, raw });
}

interface Prepared {
  chromium: CdpChromium;
  authorization: string;
  lighthouse: typeof import("lighthouse").default;
  puppeteer: typeof import("puppeteer-core").default;
  config: import("lighthouse").Config;
}

// Version de Lighthouse installée, celle qui relève.
function lighthouseVersion(): string {
  const manifest = createRequire(import.meta.url).resolve("lighthouse/package.json");
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
}

export const lighthouseGate: Gate<Prepared> = {
  name: GATE,
  group: "browser-read",
  results: { performance: "measured" },
  timeoutMs: LIGHTHOUSE_TIMEOUT_MS,
  tools: () => ({ lighthouse: lighthouseVersion() }),
  // Entrées du banc : l'identité de l'agent, Lighthouse et un Chromium de
  // l'image figée. Chargés ici seulement : Lighthouse est lourd, et toute
  // commande du runner charge le registre des portes (#128).
  prepare: async (context) => {
    const users = parseUsersWithoutUnknown(readFileSync(`${ROOT}/fixtures/users.json`, "utf8"));
    const agent = users.find(({ role }) => role === "agent");
    if (agent === undefined) throw new Error("No user with role agent in fixtures/users.json");
    const [{ default: lighthouse }, { default: desktopConfig }, { default: puppeteer }] = await Promise.all([
      import("lighthouse"),
      import("lighthouse/core/config/desktop-config.js"),
      import("puppeteer-core"),
    ]);
    const config = { extends: "lighthouse:default", settings: { ...desktopConfig.settings, onlyCategories: ["performance"], throttlingMethod: "simulate" as const } };
    return {
      chromium: await launchCdpChromium(context.browserToken),
      authorization: `Basic ${Buffer.from(`${agent.username}:${agent.password}`).toString("base64")}`,
      lighthouse,
      puppeteer,
      config,
    };
  },
  examine: async (context, { chromium, authorization, lighthouse, puppeteer, config }) => {
    try {
      const browser = await puppeteer.connect({ browserWSEndpoint: chromium.browserWSEndpoint, defaultViewport: null });
      try {
        const passes: PassOutcome[] = [];
        const raw: Record<string, string> = {};
        for (let pass = 1; pass <= PASSES; pass++) {
          const page = await browser.newPage();
          try {
            const result = await lighthouse(context.candidateUrl, { output: "json", logLevel: "error", extraHeaders: { Authorization: authorization } }, config, page);
            if (result === undefined) {
              passes.push({ completed: false, reason: "Lighthouse returned no result" });
              continue;
            }
            const [path, digest] = await saveGateRaw(context.rawDir, GATE, `pass-${pass}.json`, `${JSON.stringify(result.lhr, null, 2)}\n`);
            raw[path] = digest;
            passes.push(passOutcome(result.lhr as unknown as Lhr));
          } catch (error) {
            if (context.signal.aborted) throw error;
            passes.push({ completed: false, reason: error instanceof Error ? error.message.split("\n")[0]! : String(error) });
          } finally {
            await page.close().catch(() => undefined);
          }
        }
        return [lighthouseResult(passes, raw)];
      } finally {
        await browser.disconnect();
      }
    } finally {
      await chromium.close();
    }
  },
};
