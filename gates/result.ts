// Format d'un résultat de porte (ADR 0008, spec de l'étape 4, « Format d'un
// résultat ») : des résultats nommés, jugés ou relevés, cinq issues, le nombre
// d'éléments examinés et des constats bornés. `gateResultPassed` est la seule
// règle de réussite : aucun autre module ne compare une issue à `passed`
// (tests/gates/passed-rule.test.ts).

// Sorte d'un résultat nommé, déclarée par la porte.
export type GateResultKind = "judged" | "measured";

// Étape où une porte s'est mise en erreur, posée par le runner selon la partie qui a levé
// l'erreur (préparation ou examen), jamais d'après le message.
export type GateErrorStage = "before-candidate" | "on-candidate";
// Liste fermée des causes : elle ne s'étend que par la spec. `timeout` : la
// porte a dépassé son délai, ou a été coupée en cours par l'échéance de la
// phase. `gates-phase-timeout` : la porte n'a jamais été lancée, la phase
// ayant dépassé son délai global ; elle n'a rien examiné.
export const GATE_ERROR_CAUSES = ["timeout", "gates-phase-timeout", "exception", "tool-missing"] as const;
export type GateErrorCause = (typeof GATE_ERROR_CAUSES)[number];

export interface GateError {
  stage: GateErrorStage;
  cause: GateErrorCause;
  message: string;
}

// Nombre de constats gardés dans un résultat : au-delà, la liste est tronquée
// et `findingsTotal` dit combien il y en avait. Valeur de conception.
export const FINDINGS_LIMIT = 50;

interface Fields {
  gate: string;
  name: string;
  // Nombre d'éléments examinés : 0 sans erreur donne `not-evaluable`.
  examined: number;
  // Détail propre à la porte, borné à FINDINGS_LIMIT.
  findings: unknown[];
  findingsTotal: number;
  findingsKept: number;
  // Nombres nommés, documentés par chaque porte. Ils ne décident pas de l'issue.
  values: Record<string, number>;
  // Bruts cités par leur empreinte (ADR 0005), par leur nom.
  raw: Record<string, string>;
  // Présent seulement pour l'issue `errored`.
  error?: GateError;
}

export type JudgedResult = Fields & { kind: "judged"; outcome: "passed" | "failed" | "not-evaluable" | "errored" };
export type MeasuredResult = Fields & { kind: "measured"; outcome: "measured" | "not-evaluable" | "errored" };
export type GateResult = JudgedResult | MeasuredResult;
export type GateOutcome = GateResult["outcome"];

interface ResultInput {
  gate: string;
  name: string;
  examined: number;
  findings?: readonly unknown[];
  values?: Record<string, number>;
  raw?: Record<string, string>;
}

// Résultat jugé : `passed` ou `failed` selon le jugement de la porte, sauf si
// elle n'a rien examiné. `evaluable: false` : la porte a examiné des éléments
// sans pouvoir conclure à une réussite (#153) ; un échec constaté reste
// `failed`.
export function judged({ passed, evaluable = true, ...input }: ResultInput & { passed: boolean; evaluable?: boolean }): JudgedResult {
  return fields(input, "judged", input.examined === 0 ? "not-evaluable" : !passed ? "failed" : evaluable ? "passed" : "not-evaluable");
}

// Résultat relevé : des valeurs sans jugement, sauf s'il n'a rien examiné.
export function measured(input: ResultInput): MeasuredResult {
  return fields(input, "measured", input.examined === 0 ? "not-evaluable" : "measured");
}

// Résultat d'une porte en erreur, pour un de ses résultats nommés.
export function errored({ gate, name, kind, error }: { gate: string; name: string; kind: GateResultKind; error: GateError }): GateResult {
  return { ...fields({ gate, name, examined: 0 }, kind, "errored"), error };
}

// Seule règle de réussite : vraie pour `passed` seulement. Un résultat relevé
// est refusé par le compilateur.
export function gateResultPassed(result: JudgedResult): boolean {
  return result.outcome === "passed";
}

// Preuve d'une mesure invalide par une erreur de porte avant le candidat
// (`gate-error-before-candidate`) : chaque résultat concerné, une ligne
// chacun. Rien si aucun : les autres résultats ne changent pas le verdict.
export function beforeCandidateEvidence(results: readonly GateResult[]): string | undefined {
  const lines = results.flatMap(({ gate, name, error }) =>
    error?.stage === "before-candidate" ? [`Gate ${gate}, result ${name}: errored before-candidate (${error.cause}): ${error.message}`] : [],
  );
  return lines.length === 0 ? undefined : lines.join("\n");
}

// Champs dans l'ordre de l'exemple de la spec, celui de measure.json.
function fields<K extends GateResultKind, O extends GateOutcome>({ gate, name, examined, findings = [], values = {}, raw = {} }: ResultInput, kind: K, outcome: O) {
  const kept = findings.slice(0, FINDINGS_LIMIT);
  return { gate, name, kind, outcome, examined, findings: kept, findingsTotal: findings.length, findingsKept: kept.length, values, raw };
}
