// Variables par lesquelles executeOracle (oracle/execute.ts) passe à la configuration
// Playwright (oracle/playwright.config.ts) ce que seule l'exécution complète connaît.
export const ORACLE_ENV = {
  outputDir: "MB_ORACLE_OUTPUT_DIR",
  report: "MB_ORACLE_REPORT",
  metadata: "MB_ORACLE_METADATA",
  // Fichier où la fixture des scénarios écrit chaque échec de connexion au
  // navigateur du banc (#168, oracle/browser.ts, checkBenchBrowser).
  benchBrowserLog: "MB_ORACLE_BENCH_BROWSER_LOG",
} as const;

// Le legacy, cible par défaut de l'oracle.
export const DEFAULT_BASE_URL = "http://localhost:8080";
