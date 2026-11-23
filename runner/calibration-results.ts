// Résultats d'étalonnage versionnés (spec de l'étape 3, « Candidat
// d'étalonnage ») : lecture de results/calibration/ et résultat appliqué aux
// mesures, le plus récent des étalonnages faits en CI (runner/calibration.ts).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { citedFileSha256 as digestOf } from "../shared/digest.ts";
import { ROOT } from "../shared/root.ts";
import { type CalibrationFile, type CalibrationIdentity, chooseCalibration, type Multiples } from "./calibration.ts";
import type { AppliedCalibration, Limits } from "./limits.ts";
import { CALIBRATION_DIR_FROM_ROOT } from "./paths.ts";

type StoredCalibration = CalibrationIdentity & { multiples: Multiples; limits: Limits };

// Résultat d'étalonnage appliqué, ou `undefined` tant qu'aucun étalonnage de
// CI n'est versionné.
export async function appliedCalibration(): Promise<AppliedCalibration | undefined> {
  const dir = join(ROOT, CALIBRATION_DIR_FROM_ROOT);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  } catch {
    return undefined;
  }
  const files: CalibrationFile<StoredCalibration>[] = [];
  for (const name of names) {
    files.push({ file: `${CALIBRATION_DIR_FROM_ROOT}/${name}`, record: JSON.parse(await readFile(join(dir, name), "utf8")) as StoredCalibration });
  }
  const chosen = chooseCalibration(files);
  if (chosen === undefined) return undefined;
  const { multiples, limits } = chosen.record;
  return { file: chosen.file, digest: await digestOf(join(ROOT, chosen.file)), multiples, limits };
}
