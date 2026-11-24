// Phase 2 d'une mesure, le contrat (spec de l'étape 3, « Phases d'une mesure
// et leurs issues ») : lit candidate.json, package.json et package-lock.json
// dans la copie du candidat, les passe au contrat (runner/contract.ts) et rend
// l'issue de la phase. Aucun code du candidat ne tourne ici : une erreur
// imprévue du runner est `runner-error-before-candidate`, avec l'erreur pour
// preuve. Un défaut des fichiers fournis par le candidat (fichier illisible,
// candidate.json qui est un dossier, lien symbolique relevé à la préparation)
// est un manquement du contrat : seul ce que le candidat ne peut ni fournir ni
// fabriquer rend la mesure invalide (règle 7, #68).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type CandidateFiles, checkContract } from "./contract.ts";
import type { CandidateRecord } from "./measure-record.ts";

// Champs de `candidate` dans measure.json tirés du contrat : vides si le
// contrat est invalide.
type Declared = Pick<CandidateRecord, "contract" | "build" | "start">;

export type ContractPhaseResult =
  | { outcome: "ok"; candidate: Declared }
  | { outcome: "contract-invalid" | "runner-error-before-candidate"; candidate: Declared; detail: string };

// `defects` : défauts des fichiers du candidat relevés à la préparation
// (runner/candidate-runtime.ts), cités en tête des manquements.
export async function contractPhase(dir: string, defects: readonly string[] = []): Promise<ContractPhaseResult> {
  const read = { candidateJson: "candidate.json", packageJson: "package.json", packageLock: "package-lock.json" } as const;
  const files: CandidateFiles = { candidateJson: undefined, packageJson: undefined, packageLock: undefined };
  const unreadable: string[] = [];
  for (const [key, name] of Object.entries(read) as [keyof typeof read, string][]) {
    try {
      files[key] = await readIfPresent(dir, name);
    } catch (error) {
      unreadable.push(`${name}: cannot be read: ${(error as Error).message}`);
    }
  }
  const invalid = (failures: readonly string[]): ContractPhaseResult => ({ outcome: "contract-invalid", candidate: {}, detail: [...defects, ...failures].join("\n") });
  if (unreadable.length > 0) return invalid(unreadable);
  let check: ReturnType<typeof checkContract>;
  try {
    check = checkContract(files);
  } catch (error) {
    return { outcome: "runner-error-before-candidate", candidate: {}, detail: (error as Error).message };
  }
  if (!check.ok) return invalid(check.failures);
  if (defects.length > 0) return invalid([]);
  const { contract, build, start } = check.contract;
  return { outcome: "ok", candidate: { contract, ...(build === undefined ? {} : { build }), start } };
}

// Un fichier absent est un manquement du contrat, pas une erreur du runner ;
// un fichier illisible aussi, cité par l'appelant.
async function readIfPresent(dir: string, name: string): Promise<string | undefined> {
  try {
    return await readFile(join(dir, name), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
