// Copies de vrais fichiers produits par le banc (#115), versionnées sous
// tests/fixtures/ avec leur provenance (PROVENANCE.md de chaque dossier
// d'exécution). Un test qui imite un fichier du banc part d'une de ces copies
// et ne change que ce qu'il regarde.
import { readFileSync } from "node:fs";

const FIXTURES = new URL("fixtures/", import.meta.url);

export function readFixture(path: string): string {
  return readFileSync(new URL(path, FIXTURES), "utf8");
}

export function readJsonFixture<T = unknown>(path: string): T {
  return JSON.parse(readFixture(path)) as T;
}

// Exécution 45624689673, job des mesures sur main, commit 52303ae.
const MEASURES_RUN = "ci45624689673";
export const MEASURES = {
  // Mesure comptée du candidat de référence. measure.json et oracle.json
  // copiés par #114 dans measure-cases/ ; ses bruts dans ci45624689673/.
  reference: {
    results: "measure-cases/20261125T133422Z-52303ae-reference-candidate",
    artifacts: `${MEASURES_RUN}/oracle-artifacts/20261125T133422Z-52303ae-reference-candidate`,
  },
  // Mesure du candidat de référence interrompue pendant l'oracle.
  interrupted: {
    artifacts: `${MEASURES_RUN}/oracle-artifacts/20261125T133512Z-52303ae-reference-candidate`,
  },
  // Candidat défectueux « sonde d'isolation » (version de #110).
  probe: {
    results: `${MEASURES_RUN}/results/diagnostic/20261125T133634Z-52303ae-defective-candidates-isolation-probe`,
    artifacts: `${MEASURES_RUN}/oracle-artifacts/20261125T133634Z-52303ae-defective-candidates-isolation-probe`,
  },
  // Candidat défectueux « relais qui altère un libellé ».
  relay: {
    results: `${MEASURES_RUN}/results/diagnostic/20261125T133740Z-52303ae-defective-candidates-relay-alters-label`,
    artifacts: `${MEASURES_RUN}/oracle-artifacts/20261125T133740Z-52303ae-defective-candidates-relay-alters-label`,
  },
  // Candidat défectueux « contrat invalide » : l'oracle n'est pas lancé, seule
  // la liste de ses scénarios l'est.
  contractInvalid: {
    results: `${MEASURES_RUN}/results/diagnostic/20261125T133535Z-52303ae-defective-candidates-contract-invalid`,
    artifacts: `${MEASURES_RUN}/oracle-artifacts/20261125T133535Z-52303ae-defective-candidates-contract-invalid`,
  },
} as const;

// Racine du dépôt sur le runner de la CI, citée par les rapports bruts de Playwright.
export const CI_ROOT = "/home/runner/work/migrabench/migrabench";

// Exécution 45509307133, étalonnage sur main, commit aeb3037.
export const CALIBRATION = {
  result: "ci45509307133/results/calibration/20261124T232316Z-aeb3037-ci45509307133.1-1.json",
  usage: "ci45509307133/oracle-artifacts/calibration-20261124T232316Z-aeb3037-ci45509307133.1-1/reading-1/usage",
} as const;

// Exécution 45041781224, job de preuve de l'oracle, commit a664b7b : ses cinq
// résultats, rangs 1 à 5.
export const PROOF_RESULTS = [
  "ci45041781224/results/oracle/20261122T160818Z-a664b7b-ci45041781224.1-1.json",
  "ci45041781224/results/oracle/20261122T160901Z-a664b7b-ci45041781224.1-2.json",
  "ci45041781224/results/oracle/20261122T160952Z-a664b7b-ci45041781224.1-3.json",
  "ci45041781224/results/oracle/20261122T161042Z-a664b7b-ci45041781224.1-4.json",
  "ci45041781224/results/oracle/20261122T161133Z-a664b7b-ci45041781224.1-5.json",
] as const;
