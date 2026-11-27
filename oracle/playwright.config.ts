// Configuration Playwright de l'oracle (spec de l'étape 2, « Exécution »).
// Lancée par executeOracle (oracle/execute.ts), qui fournit BASE_URL, le dossier de
// sortie hors du dépôt, le fichier du reporter JSON et les métadonnées.
import { defineConfig, devices } from "@playwright/test";
import { BROWSER_WS_ENDPOINT } from "./browser.ts";
import { DEFAULT_BASE_URL, ORACLE_ENV } from "./env.ts";

const outputDir = process.env[ORACLE_ENV.outputDir] ?? "../test-results/oracle";

export default defineConfig({
  testDir: "./scenarios",
  outputDir,
  fullyParallel: true,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["json", { outputFile: process.env[ORACLE_ENV.report] ?? `${outputDir}/report.json` }]],
  metadata: JSON.parse(process.env[ORACLE_ENV.metadata] ?? "{}") as Record<string, unknown>,
  // En CI, Playwright ajoute par défaut aux métadonnées le commit (gitCommit) et
  // le diff de la PR (gitDiff). Le commit est déjà dans benchCommit, et le diff
  // n'a pas sa place dans un résultat versionné : ses chemins `../` font refuser
  // le résultat par la collecte (#39, premier job de CI de l'oracle).
  captureGitInfo: { commit: false, diff: false },
  use: {
    baseURL: process.env.BASE_URL ?? DEFAULT_BASE_URL,
    trace: "on",
    // Chromium du service `browser` (#78), jamais un navigateur local. Sans
    // jeton, sa passerelle refuse : la fixture `connectOptions` des scénarios
    // (support.ts) y ajoute le jeton, hors de cette configuration, que le
    // résultat recopie (#160).
    connectOptions: { wsEndpoint: BROWSER_WS_ENDPOINT },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
