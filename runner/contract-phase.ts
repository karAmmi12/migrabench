// Phase 2 d'une mesure, le contrat (spec de l'étape 3, « Phases d'une mesure
// et leurs issues ») : lit candidate.json, package.json et package-lock.json
// dans la copie du candidat, les passe au contrat (runner/contract.ts) et rend
// l'issue de la phase. Aucun code du candidat ne tourne ici : une erreur
// imprévue du runner est `runner-error-before-candidate`, avec l'erreur pour
// preuve.
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

export async function contractPhase(dir: string): Promise<ContractPhaseResult> {
  let check: ReturnType<typeof checkContract>;
  try {
    const files: CandidateFiles = {
      candidateJson: await readIfPresent(dir, "candidate.json"),
      packageJson: await readIfPresent(dir, "package.json"),
      packageLock: await readIfPresent(dir, "package-lock.json"),
    };
    check = checkContract(files);
  } catch (error) {
    return { outcome: "runner-error-before-candidate", candidate: {}, detail: (error as Error).message };
  }
  if (!check.ok) return { outcome: "contract-invalid", candidate: {}, detail: check.failures.join("\n") };
  const { contract, build, start } = check.contract;
  return { outcome: "ok", candidate: { contract, ...(build === undefined ? {} : { build }), start } };
}

// Un fichier absent est un manquement du contrat, pas une erreur du runner.
async function readIfPresent(dir: string, name: string): Promise<string | undefined> {
  try {
    return await readFile(join(dir, name), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`${name}: ${(error as Error).message}`);
  }
}
