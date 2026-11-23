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
  "access-log-inactive",
  "oracle-error",
  "marker-out-of-place",
  "runner-error-before-candidate",
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

// Issues possibles de chaque phase (table de la spec). Deux règles s'ajoutent
// à la table : `interrupted` peut survenir dans toute phase ; dès le lancement
// de `npm ci`, une erreur imprévue du runner est une panne pendant que le
// candidat tourne (`stack-down-while-candidate`), avant lui une
// `runner-error-before-candidate`.
export const PHASE_OUTCOMES = {
  preparation: ["ok", "runner-error-before-candidate", "interrupted"],
  contract: ["ok", "contract-invalid", "runner-error-before-candidate", "interrupted"],
  build: ["ok", "build-failed", "build-timeout", "build-resource-limit", "registry-network-error", "stack-down-while-candidate", "interrupted"],
  start: ["ok", "stack-failed-before-candidate", "access-log-inactive", "start-exited", "start-not-ready", "stack-down-while-candidate", "interrupted"],
  oracle: ["ok", "oracle-error", "stack-down-while-candidate", "interrupted"],
  gates: ["ok", "stack-down-while-candidate", "interrupted"],
  closing: ["ok", "marker-out-of-place", "access-log-inactive", "stack-down-while-candidate", "interrupted"],
} as const satisfies Record<PhaseName, readonly ("ok" | FailureOutcome)[]>;

// Issue d'une phase : une de sa ligne de la table, ou `not-run` si la mesure
// s'est arrêtée avant elle.
export type PhaseOutcome<N extends PhaseName = PhaseName> = (typeof PHASE_OUTCOMES)[N][number] | "not-run";

// Chaque issue d'échec est produite par au moins une phase.
const EVERY_FAILURE_HAS_A_PHASE: [Exclude<FailureOutcome, PhaseOutcome>] extends [never] ? true : never = true;
void EVERY_FAILURE_HAS_A_PHASE;

interface PhaseFields {
  startedAt: string;
  durationMs: number;
  detail?: string;
  // Preuve d'une issue qui rend la mesure invalide : ligne du journal de npm,
  // état du service, lignes du journal d'accès.
  evidence?: string;
  // Empreinte de chaque brut de la phase, par son chemin dans le dossier des bruts.
  raw: Record<string, string>;
}

export type PhaseRecord = { [N in PhaseName]: PhaseFields & { name: N; outcome: PhaseOutcome<N> } }[PhaseName];

export interface Verdict {
  category: Category;
  // L'issue de la phase qui a décidé, `ok` pour une mesure complète.
  reason: string;
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
  const decisive = phases.find(({ outcome }) => outcome !== "ok" && outcome !== "not-run");
  if (decisive === undefined) return { verdict: { category: "completed", reason: "ok" }, exitCode: 0 };
  const category = CATEGORY_OF.get(decisive.outcome);
  if (category === undefined) throw new Error(`Outcome ${decisive.outcome} has no category`);
  if (category !== "invalid") return { verdict: { category, reason: decisive.outcome }, exitCode: 0 };
  if (decisive.evidence === undefined || decisive.evidence === "") {
    throw new Error(`Outcome ${decisive.outcome} of phase ${decisive.name} makes the measure invalid without evidence`);
  }
  return { verdict: { category, reason: decisive.outcome, evidence: decisive.evidence }, exitCode: 3 };
}
