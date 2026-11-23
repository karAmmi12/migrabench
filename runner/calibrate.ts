// Étalonnage (spec de l'étape 3, « Candidat d'étalonnage ») : un seul point
// d'entrée, calibrateCandidate, sur lequel `migrabench calibrate` est une
// commande mince. Il mesure plusieurs fois le candidat d'étalonnage, sous le
// plafond de sécurité et sans autre délai, comme une mesure le construirait
// et le démarrerait, et relève à chaque fois la durée de construction, la
// durée jusqu'à la disponibilité, le pic de mémoire et l'usage de CPU de
// chaque phase. Il n'exécute pas l'oracle : le candidat n'a pas à le réussir.
//
// En CI, le résultat va dans results/calibration/, pour être versionné ;
// ailleurs, dans results/diagnostic/calibration/, ignoré par Git et jamais
// appliqué à une mesure (runner/calibration.ts, chooseCalibration).
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { join, relative } from "node:path";
import { browserVersions } from "../oracle/browser-versions.ts";
import { ciRunOf, resultFileName } from "../oracle/ci-run.ts";
import { recreateStack, stackImages } from "../oracle/execute.ts";
import { GIT_STATUS_ARGS, worktreeState } from "../oracle/worktree.ts";
import { citedFileSha256 as digestOf } from "../shared/digest.ts";
import { spawnCommand, stdoutOf } from "../shared/process.ts";
import { ARTIFACTS_DIR_FROM_ROOT, readBenchEnv, ROOT } from "../shared/root.ts";
import { buildCandidate } from "./build.ts";
import { CALIBRATION_READINGS, type CalibrationReading, calibrationSummary, DECLARED_MULTIPLES, readingValues } from "./calibration.ts";
import { contentDigest } from "./candidate-content.ts";
import {
  buildRuntimeImage,
  CANDIDATE_BASE_URL,
  CANDIDATE_PORT,
  candidateContainer,
  candidateFiles,
  candidateService,
  copyCandidate,
  RUNTIME_IMAGE,
  startCandidate,
  stopCandidate,
  waitUntilReady,
} from "./candidate-runtime.ts";
import { containerUser } from "./container-user.ts";
import { contractPhase } from "./contract-phase.ts";
import { measureLimits, SAFETY_CAP } from "./limits.ts";
import { CALIBRATION_DIR_FROM_ROOT, LOCAL_CALIBRATION_DIR_FROM_ROOT } from "./paths.ts";
import { cgroupUsage, type ResourceUsage } from "./resource-usage.ts";

export const CALIBRATION_CANDIDATE = "fixtures/calibration-candidate";
export const CALIBRATION_FORMAT = 1;

export interface CalibrateOptions {
  // Nombre de relevés ; défaut : le paramètre déclaré du banc.
  readings?: number;
}

export async function calibrateCandidate({ readings = CALIBRATION_READINGS }: CalibrateOptions = {}): Promise<{ resultFile: string }> {
  const calibratedAt = new Date();
  const ciRun = ciRunOf(process.env);
  const benchCommit = await stdoutOf("git", ["rev-parse", "HEAD"]);
  const worktree = worktreeState((await spawnCommand("git", [...GIT_STATUS_ARGS])).stdout);
  const name = resultFileName(calibratedAt, benchCommit, ciRun);
  const id = `calibration-${name.replace(/\.json$/, "")}`;
  const resultFile = join(ROOT, ciRun === undefined ? LOCAL_CALIBRATION_DIR_FROM_ROOT : CALIBRATION_DIR_FROM_ROOT, name);
  const artifacts = `${ARTIFACTS_DIR_FROM_ROOT}/${id}`;

  const candidateDir = join(ROOT, CALIBRATION_CANDIDATE);
  const files = await candidateFiles(candidateDir);
  // Le même contrat qu'une mesure (runner/contract-phase.ts) : le candidat
  // d'étalonnage doit être un candidat valide.
  const contract = await contractPhase(candidateDir);
  if (contract.outcome !== "ok") throw new Error(`The calibration candidate breaks the contract: ${contract.outcome}: ${contract.detail}`);
  const { contract: version, build: buildCommand, start: startCommand } = contract.candidate;
  if (version === undefined || startCommand === undefined) throw new Error("A valid contract declares its version and start");
  const runtimeImage = await buildRuntimeImage();
  const user = containerUser(process.getuid?.(), process.getgid?.());
  // Sans autre délai que le plafond de sécurité.
  const { limits, record: limitsRecord } = measureLimits({ safetyCap: SAFETY_CAP });

  const recorded = [];
  for (let reading = 1; reading <= readings; reading++) {
    console.log(`Calibration reading ${reading}/${readings}`);
    const rawDir = join(ROOT, artifacts, `reading-${reading}`);
    const copyDir = join(rawDir, "candidate");
    await mkdir(rawDir, { recursive: true });
    await copyCandidate(candidateDir, files, copyDir);
    const startedAt = new Date().toISOString();

    const build = await buildCandidate({ measureId: `${id}-${reading}`, image: RUNTIME_IMAGE, user, rawDir, copyDir, build: buildCommand, limits, collectUsage: true });
    if (build.outcome.outcome !== "ok") throw new Error(`Calibration reading ${reading}: ${build.outcome.outcome}: ${build.outcome.detail}`);

    // Pile recréée comme pour une mesure, puis le candidat démarré seul.
    const service = await candidateService({ rawDir, copyDir, user, start: startCommand });
    await recreateStack(randomBytes(32).toString("hex"));
    let start: CalibrationReading["start"];
    try {
      await startCandidate(service);
      const upAt = Date.now();
      const outcome = await waitUntilReady(service, limits.readyTimeoutMs);
      const readyMs = Date.now() - upAt;
      if (outcome !== "ok") throw new Error(`Calibration reading ${reading}: ${outcome}`);
      start = { readyMs, ...(await runningUsage(await candidateContainer(service))) };
    } finally {
      await stopCandidate(service);
    }

    const measured: CalibrationReading = {
      build: { durationMs: build.durationMs, steps: build.steps.map(({ step, durationMs, usage }) => ({ step, durationMs, ...usage! })) },
      start,
    };
    recorded.push({
      reading,
      startedAt,
      ...measured,
      values: readingValues(measured),
      composeOverride: service.composeOverride,
      raw: { ...build.raw, "start.log": await digestOf(service.startLog) },
    });
  }

  const summary = calibrationSummary(
    recorded.map(({ values }) => values),
    DECLARED_MULTIPLES,
  );
  const env = await readBenchEnv();
  const record = {
    format: CALIBRATION_FORMAT,
    calibratedAt: calibratedAt.toISOString(),
    candidate: { path: CALIBRATION_CANDIDATE, contentDigest: contentDigest(files), contract: version, ...(buildCommand === undefined ? {} : { build: buildCommand }), start: startCommand },
    environment: {
      benchCommit,
      worktree,
      node: process.version,
      ...(await browserVersions()),
      images: await stackImages(),
      frozenDate: env.FROZEN_DATE ?? null,
      baseUrl: CANDIDATE_BASE_URL,
      artifacts,
      ...(ciRun === undefined ? {} : { ciRun }),
      runtimeImage,
      containerUser: user,
      port: CANDIDATE_PORT,
      limits: limitsRecord,
      machine: await machine(),
    },
    multiples: DECLARED_MULTIPLES,
    readings: recorded,
    minimum: summary.minimum,
    maximum: summary.maximum,
    limits: summary.limits,
  };
  await mkdir(join(resultFile, ".."), { recursive: true });
  await writeFile(resultFile, `${JSON.stringify(record, null, 2)}\n`);
  return { resultFile: relative(ROOT, resultFile) };
}

// Ressources du conteneur du candidat depuis son démarrage, lues dans son
// cgroup v2 au moment où il devient disponible.
async function runningUsage(container: string): Promise<ResourceUsage> {
  const read = async (file: string) => {
    const { code, stdout } = await spawnCommand("docker", ["exec", container, "cat", `/sys/fs/cgroup/${file}`], { allowFailure: true });
    return code === 0 ? stdout : undefined;
  };
  const [memoryPeak, cpuStat] = [await read("memory.peak"), await read("cpu.stat")];
  return cgroupUsage({ memoryPeak, cpuStat });
}

// Machine de l'étalonnage : l'hôte, le démon Docker qui exécute les
// conteneurs et, en CI, l'image du runner GitHub.
async function machine() {
  const docker = JSON.parse(await stdoutOf("docker", ["info", "--format", "{{json .}}"])) as Record<string, unknown>;
  const runner = Object.fromEntries(
    (["RUNNER_OS", "RUNNER_ARCH", "ImageOS", "ImageVersion"] as const).flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]])),
  );
  return {
    platform: platform(),
    release: release(),
    arch: arch(),
    cpus: cpus().length,
    cpuModel: cpus()[0]?.model ?? null,
    memoryBytes: totalmem(),
    docker: {
      serverVersion: docker.ServerVersion,
      operatingSystem: docker.OperatingSystem,
      kernelVersion: docker.KernelVersion,
      cgroupVersion: docker.CgroupVersion,
      cpus: docker.NCPU,
      memoryBytes: docker.MemTotal,
    },
    ...(Object.keys(runner).length === 0 ? {} : { runner }),
  };
}
