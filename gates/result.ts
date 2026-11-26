// Format d'un résultat de porte (ADR 0008, spec de l'étape 4, « Format d'un
// résultat ») : des résultats nommés, jugés ou relevés, cinq issues, le nombre
// d'éléments examinés et des constats bornés. `gateResultPassed` est la seule
// règle de réussite : aucun autre module ne compare une issue à `passed`
// (tests/gates/passed-rule.test.ts).

// Sorte d'un résultat nommé, déclarée par la porte.
export type GateResultKind = "judged" | "measured";

// Étape où une porte a planté, posée par le runner selon la partie qui a levé
// l'erreur (préparation ou examen), jamais d'après le message.
export type GateErrorStage = "before-candidate" | "on-candidate";
// Liste fermée des causes : elle ne s'étend que par la spec.
export const GATE_ERROR_CAUSES = ["timeout", "exception", "tool-missing"] as const;
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
// elle n'a rien examiné.
export function judged({ passed, ...input }: ResultInput & { passed: boolean }): JudgedResult {
  return fields(input, "judged", input.examined === 0 ? "not-evaluable" : passed ? "passed" : "failed");
}

// Résultat relevé : des valeurs sans jugement, sauf s'il n'a rien examiné.
export function measured(input: ResultInput): MeasuredResult {
  return fields(input, "measured", input.examined === 0 ? "not-evaluable" : "measured");
}

// Résultat d'une porte qui a planté, pour un de ses résultats nommés.
export function errored({ gate, name, kind, error }: { gate: string; name: string; kind: GateResultKind; error: GateError }): GateResult {
  const result = kind === "judged" ? fields({ gate, name, examined: 0 }, kind, "errored") : fields({ gate, name, examined: 0 }, kind, "errored");
  return { ...result, error };
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
