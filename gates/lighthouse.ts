// Porte Lighthouse (spec de l'étape 4, « Lighthouse (relevé) ») : la
// performance de l'écran d'arrivée du candidat, relevée sans seuil.
//
// Lighthouse, en mode « navigation », sur BASE_URL, dans un Chromium de
// l'image figée (#78), lancé par la passerelle CDP du service `browser`
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
import { BenchBrowserUnreachable } from "../shared/bench-browser.ts";
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
  browser: import("puppeteer-core").Browser;
  authorization: string;
  lighthouse: typeof import("lighthouse").default;
  config: import("lighthouse").Config;
}

// Message d'une erreur, sur sa première ligne, sans le jeton du navigateur :
// l'adresse DevTools le porte, et le message finit dans measure.json.
export function errorMessage(error: unknown, token: string): string {
  // puppeteer rejette une connexion refusée par un ErrorEvent de `ws`, qui
  // porte un `message` sans être une Error (#168).
  const text = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  const message = text.split("\n")[0] ?? "";
  return message.replaceAll(token, "<token>");
}

// Connexion de puppeteer au Chromium lancé par la passerelle CDP : son échec
// arrête ce Chromium et lève BenchBrowserUnreachable (#168).
export async function connectCdp(puppeteer: Pick<typeof import("puppeteer-core").default, "connect">, chromium: CdpChromium, token: string) {
  try {
    return await puppeteer.connect({ browserWSEndpoint: chromium.browserWSEndpoint, defaultViewport: null });
  } catch (error) {
    await chromium.close().catch(() => undefined);
    throw new BenchBrowserUnreachable(`Could not connect to the CDP gateway: ${errorMessage(error, token)}`);
  }
}

// Arrête le Chromium sans masquer ce qui a été relevé : un échec de l'arrêt
// est une panne du banc, et la pile recréée à la mesure suivante l'arrête.
async function release({ chromium, browser }: Pick<Prepared, "chromium" | "browser">): Promise<void> {
  await browser.disconnect().catch(() => undefined);
  await chromium.close().catch(() => undefined);
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
    // Le Chromium du banc et la connexion CDP sont des entrées du banc :
    // leur échec rend la mesure invalide (`bench-browser-unreachable`,
    // #168), jamais un échec du candidat.
    const chromium = await launchCdpChromium(context.browserToken);
    const browser = await connectCdp(puppeteer, chromium, context.browserToken);
    return { chromium, browser, authorization: `Basic ${Buffer.from(`${agent.username}:${agent.password}`).toString("base64")}`, lighthouse, config };
  },
  examine: async (context, prepared) => {
    const { browser, authorization, lighthouse, config } = prepared;
    try {
      const passes: PassOutcome[] = [];
      const raw: Record<string, string> = {};
      for (let pass = 1; pass <= PASSES; pass++) {
        const page = await browser.newPage();
        let result: Awaited<ReturnType<typeof lighthouse>>;
        try {
          // Seul Lighthouse sur la page du candidat peut échouer du fait du
          // candidat : son erreur est une passe qui n'aboutit pas. Une erreur
          // du banc (page, brut) remonte et rend la porte `errored`.
          result = await lighthouse(context.candidateUrl, { output: "json", logLevel: "error", extraHeaders: { Authorization: authorization } }, config, page);
        } catch (error) {
          if (context.signal.aborted) throw error;
          passes.push({ completed: false, reason: errorMessage(error, context.browserToken) });
          continue;
        } finally {
          await page.close().catch(() => undefined);
        }
        if (result === undefined) {
          passes.push({ completed: false, reason: "Lighthouse returned no result" });
          continue;
        }
        const [path, digest] = await saveGateRaw(context.rawDir, GATE, `pass-${pass}.json`, `${JSON.stringify(result.lhr, null, 2)}\n`);
        raw[path] = digest;
        passes.push(passOutcome(result.lhr as unknown as Lhr));
      }
      return [lighthouseResult(passes, raw)];
    } catch (error) {
      throw new Error(errorMessage(error, context.browserToken));
    } finally {
      await release(prepared);
    }
  },
};
