// Verdict d'une mesure (spec de l'étape 3, « Phases d'une mesure et leurs
// issues », « Codes de sortie ») : fonction pure qui prend les enregistrements
// des phases et rend la catégorie de la mesure, sa raison, sa preuve et le code
// de sortie. C'est la seule définition de « invalide ».

export const PHASES = ["preparation", "contract", "build", "start", "oracle", "gates", "closing"] as const;
export type PhaseName = (typeof PHASES)[number];

// Liste fermée des causes d'invalidité, celles du glossaire : chacune est une
// preuve que le candidat ne peut ni recevoir ni fabriquer.
export const INVALIDITY_CAUSES = [
  "registry-network-error",
  "stack-failed-before-candidate",
  "stack-not-from-this-copy",
  "access-log-inactive",
  "oracle-error",
  "marker-out-of-place",
  "runner-error-before-candidate",
  "gate-error-before-candidate",
  "bench-browser-unreachable",
  "interrupted",
] as const;
export type InvalidityCause = (typeof INVALIDITY_CAUSES)[number];

// Issues autres que `ok`, rangées par catégorie de la mesure. La catégorie
// `invalid` ne reçoit que la liste fermée : aucune autre issue ne peut rendre
// une mesure invalide.
const FAILURES = {
  "contract-failure": ["contract-invalid"],
  // Un délai dépassé ou une limite atteinte est toujours un échec du candidat (règle 7).
  "candidate-failure": ["build-failed", "build-timeout", "build-resource-limit", "start-exited", "start-not-ready"],
  "stack-down-while-candidate": ["stack-down-while-candidate"],
  invalid: INVALIDITY_CAUSES,
} as const;
type FailureCategory = keyof typeof FAILURES;
export type Category = "completed" | FailureCategory;
type FailureOutcome = (typeof FAILURES)[FailureCategory][number];

// Issues possibles de chaque phase (table de la spec) : `interrupted` dans
// toute phase, `stack-down-while-candidate` à partir de la construction (une
// erreur imprévue du runner dès le lancement de `npm ci`). Les portes (étape
// 4, ADR 0008) : une erreur de porte avant tout examen du candidat
// (`gate-error-before-candidate`), dans la phase des portes ou dans la
// clôture (porte du relais), et les issues d'un redémarrage du legacy demandé
// par une porte, celles du démarrage. `runner-error-before-candidate`
// reste possible en construction (Docker n'a pas démarré le conteneur de
// `fetch` : `npm ci` n'a pas été lancé) et en clôture (mesure arrêtée avant la
// construction) (#68). Navigateur du banc injoignable
// (`bench-browser-unreachable`, #168) : dans l'oracle et dans les portes,
// les seules phases qui s'y connectent.
export const PHASE_OUTCOMES = {
  preparation: ["ok", "runner-error-before-candidate", "stack-not-from-this-copy", "interrupted"],
  contract: ["ok", "contract-invalid", "runner-error-before-candidate", "interrupted"],
  build: ["ok", "build-failed", "build-timeout", "build-resource-limit", "registry-network-error", "runner-error-before-candidate", "stack-down-while-candidate", "interrupted"],
  start: ["ok", "stack-failed-before-candidate", "stack-not-from-this-copy", "access-log-inactive", "start-exited", "start-not-ready", "stack-down-while-candidate", "interrupted"],
  oracle: ["ok", "oracle-error", "bench-browser-unreachable", "stack-down-while-candidate", "interrupted"],
  gates: ["ok", "gate-error-before-candidate", "bench-browser-unreachable", "stack-failed-before-candidate", "stack-not-from-this-copy", "access-log-inactive", "start-exited", "start-not-ready", "stack-down-while-candidate", "interrupted"],
  closing: ["ok", "marker-out-of-place", "access-log-inactive", "gate-error-before-candidate", "runner-error-before-candidate", "stack-down-while-candidate", "interrupted"],
} as const satisfies Record<PhaseName, readonly ("ok" | FailureOutcome)[]>;

// Issue d'une erreur imprévue du runner (#68) : invalide avant le lancement
// de `npm ci`, une panne pendant que le candidat tourne ensuite.
export type RunnerErrorOutcome = "runner-error-before-candidate" | "stack-down-while-candidate";

// Issue d'une phase : une de sa ligne de la table, ou `not-run` si la mesure
// s'est arrêtée avant elle.
export type PhaseOutcome<N extends PhaseName = PhaseName> = (typeof PHASE_OUTCOMES)[N][number] | "not-run";

// Chaque issue d'échec est produite par au moins une phase.
const EVERY_FAILURE_HAS_A_PHASE: [Exclude<FailureOutcome, PhaseOutcome>] extends [never] ? true : never = true;
void EVERY_FAILURE_HAS_A_PHASE;

interface PhaseFields {
  startedAt: string;
  durationMs: number;
  // Message, manquements du contrat, service tombé. Pour une issue qui rend la
  // mesure invalide, c'est sa preuve (ligne du journal de npm, état du
  // service, lignes du journal d'accès), reprise dans le verdict.
  detail?: string;
  // Empreinte de chaque brut de la phase, par son chemin dans le dossier des bruts.
  raw: Record<string, string>;
}

export type PhaseRecord = { [N in PhaseName]: PhaseFields & { name: N; outcome: PhaseOutcome<N> } }[PhaseName];

export interface Verdict {
  category: Category;
  // L'issue de la phase qui a décidé, `ok` pour une mesure complète.
  reason: Exclude<PhaseOutcome, "not-run">;
  // Pour une mesure invalide seulement.
  evidence?: string;
}

// 0 : mesure valide ; 3 : mesure invalide. Le score n'y entre jamais.
export type ExitCode = 0 | 3;

const CATEGORY_OF = new Map<string, FailureCategory>(
  (Object.keys(FAILURES) as FailureCategory[]).flatMap((category) => FAILURES[category].map((outcome) => [outcome, category] as const)),
);

export function verdict(phases: readonly PhaseRecord[]): { verdict: Verdict; exitCode: ExitCode } {
  for (const { name, outcome } of phases) {
    if (outcome !== "not-run" && !(PHASE_OUTCOMES[name] as readonly string[]).includes(outcome)) {
      throw new Error(`Outcome ${outcome} is not an outcome of phase ${name}`);
    }
  }
  // La première issue autre que `ok` décide, sauf une interruption, invalide
  // quelle que soit la phase : un échec du candidat déjà relevé ne la masque pas.
  const decisive =
    phases.find(({ outcome }) => outcome === "interrupted") ?? phases.find(({ outcome }) => outcome !== "ok" && outcome !== "not-run");
  if (decisive === undefined) return { verdict: { category: "completed", reason: "ok" }, exitCode: 0 };
  // Ni `ok` ni `not-run` : une issue d'échec, vérifiée ci-dessus pour sa phase.
  const reason = decisive.outcome as FailureOutcome;
  const category = CATEGORY_OF.get(reason);
  if (category === undefined) throw new Error(`Outcome ${reason} has no category`);
  if (category !== "invalid") return { verdict: { category, reason }, exitCode: 0 };
  if (decisive.detail === undefined || decisive.detail === "") {
    throw new Error(`Outcome ${reason} of phase ${decisive.name} makes the measure invalid without evidence`);
  }
  return { verdict: { category, reason, evidence: decisive.detail }, exitCode: 3 };
}
