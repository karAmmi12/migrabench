// Copies de vrais fichiers produits par le banc (#115), versionnées sous
// tests/fixtures/ avec leur provenance (PROVENANCE.md de chaque dossier
// d'exécution). Un test qui imite un fichier du banc part d'une de ces copies
// et ne change que ce qu'il regarde.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { measureRecord } from "../runner/measure-record.ts";

// Les chemins de ce module (MEASURES, CALIBRATION, PROOF_RESULTS) sont relatifs
// à tests/fixtures/.
const FIXTURES = new URL("fixtures/", import.meta.url);

// Chemin d'une copie depuis la racine du dépôt, tel qu'un message le cite.
export function fixturePath(path: string): string {
  return `tests/fixtures/${path}`;
}

// Chemin absolu d'une copie, pour un outil lancé hors de Node (faux Playwright).
export function absoluteFixturePath(path: string): string {
  return fileURLToPath(new URL(path, FIXTURES));
}

export function readFixture(path: string): string {
  return readFileSync(new URL(path, FIXTURES), "utf8");
}

export function readJsonFixture<T = unknown>(path: string): T {
  return JSON.parse(readFixture(path)) as T;
}

// measure.json tel que le banc l'écrit (runner/measure-record.ts).
export type RecordedMeasure = ReturnType<typeof measureRecord>["record"];

// measure.json d'une mesure de MEASURES, relu à chaque appel : chaque test
// peut le modifier sans toucher aux autres.
export function readMeasure({ results }: { results: string }): RecordedMeasure {
  return readJsonFixture<RecordedMeasure>(`${results}/measure.json`);
}

// Variante d'une copie : `change` modifie un clone, la copie reste intacte.
export function variant<T>(value: T, change: (copy: T) => void): T {
  const copy = structuredClone(value);
  change(copy);
  return copy;
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
  // Candidat défectueux « sonde d'isolation », avec la tentative sur le
  // relais CDP du navigateur (#134) : mesure locale (local-e353940/).
  probeWithCdp: {
    results: "local-e353940/results/diagnostic/20261127T124602Z-e353940-defective-candidates-isolation-probe",
    artifacts: "local-e353940/oracle-artifacts/20261127T124602Z-e353940-defective-candidates-isolation-probe",
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

// Dossier des bruts de l'oracle d'une mesure de MEASURES, tel que le runner de
// la CI le citait : sous `.oracle-artifacts/`, avec le point que sa copie n'a pas.
export function ciOracleDir({ artifacts }: { artifacts: string }): string {
  return `${CI_ROOT}/.oracle-artifacts/${basename(artifacts)}/oracle`;
}

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

// Exécution 45812433661, job des mesures de la PR #141, commit 6a101d0 : les
// premières mesures avec un résultat de porte (#124).
const GATES_RUN = "ci45812433661/results/diagnostic";
export const GATE_MEASURES = {
  reference: { results: `${GATES_RUN}/20261126T114027Z-6a101d0-reference-candidate` },
  relayForgedHealthcheck: { results: `${GATES_RUN}/20261126T114545Z-6a101d0-defective-candidates-relay-forged-healthcheck` },
  relayUntouched: { results: `${GATES_RUN}/20261126T114631Z-6a101d0-conforming-candidates-relay-untouched` },
};

// Exécution 45861318349, job des mesures de la PR #147, commit 0d2eb7a : les
// premières mesures avec la porte d'accessibilité (#128).
const ACCESSIBILITY_RUN = "ci45861318349/results/diagnostic";
export const ACCESSIBILITY_MEASURES = {
  reference: { results: `${ACCESSIBILITY_RUN}/20261126T164430Z-0d2eb7a-reference-candidate` },
  relayUntouched: { results: `${ACCESSIBILITY_RUN}/20261126T165025Z-0d2eb7a-conforming-candidates-relay-untouched` },
};
