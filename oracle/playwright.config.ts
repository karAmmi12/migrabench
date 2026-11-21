// Configuration Playwright de l'oracle (spec de l'étape 2, « Exécution »).
// Lancée par executeOracle (oracle/execute.ts), qui fournit BASE_URL, le dossier de
// sortie hors du dépôt, le fichier du reporter JSON et les métadonnées.
import { defineConfig, devices } from "@playwright/test";
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
  use: {
    baseURL: process.env.BASE_URL ?? DEFAULT_BASE_URL,
    trace: "on",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
