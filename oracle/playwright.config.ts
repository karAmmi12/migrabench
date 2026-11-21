// Configuration Playwright de l'oracle (spec de l'étape 2, « Exécution »).
// Lancée par runOracle (oracle/run.ts), qui fournit BASE_URL, le dossier de
// sortie hors du dépôt, le fichier du reporter JSON et les métadonnées.
import { defineConfig, devices } from "@playwright/test";

const outputDir = process.env.MB_ORACLE_OUTPUT_DIR ?? "../test-results/oracle";

export default defineConfig({
  testDir: "./scenarios",
  outputDir,
  fullyParallel: true,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["json", { outputFile: process.env.MB_ORACLE_REPORT ?? `${outputDir}/report.json` }]],
  metadata: JSON.parse(process.env.MB_ORACLE_METADATA ?? "{}") as Record<string, unknown>,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
    trace: "on",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
