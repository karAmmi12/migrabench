// Résultats d'étalonnage versionnés (spec de l'étape 3, « Candidat
// d'étalonnage ») : lecture de results/calibration/ et résultat appliqué aux
// mesures, le plus récent des étalonnages faits en CI (runner/calibration.ts).
// Seuls les fichiers suivis par Git comptent : un artefact de CI téléchargé
// mais pas encore versionné n'est jamais appliqué.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { citedFileSha256 as digestOf } from "../shared/digest.ts";
import { stdoutOf } from "../shared/process.ts";
import { ROOT } from "../shared/root.ts";
import { type CalibrationFile, type CalibrationIdentity, chooseCalibration, type Multiples } from "./calibration.ts";
import type { AppliedCalibration, Limits } from "./limits.ts";
import { CALIBRATION_DIR_FROM_ROOT } from "./paths.ts";

type StoredCalibration = CalibrationIdentity & { multiples: Multiples; limits: Limits };

// Résultat d'étalonnage appliqué, ou `undefined` tant qu'aucun étalonnage de
// CI n'est versionné.
export async function appliedCalibration(): Promise<AppliedCalibration | undefined> {
  const tracked = await stdoutOf("git", ["ls-files", "--", `${CALIBRATION_DIR_FROM_ROOT}/*.json`]);
  const files: CalibrationFile<StoredCalibration>[] = [];
  for (const file of tracked === "" ? [] : tracked.split("\n")) {
    files.push({ file, record: JSON.parse(await readFile(join(ROOT, file), "utf8")) as StoredCalibration });
  }
  const chosen = chooseCalibration(files);
  if (chosen === undefined) return undefined;
  const { multiples, limits } = chosen.record;
  return { file: chosen.file, digest: await digestOf(join(ROOT, chosen.file)), multiples, limits };
}
