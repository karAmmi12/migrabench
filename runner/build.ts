// Phase de construction (spec de l'étape 3, « Exécution du candidat » ;
// ADR 0007) : `npm ci` puis la commande `build` du candidat, dans des
// conteneurs de l'image d'exécution, sous un délai global et des limites de
// mémoire et de CPU. Ni `mb-internal` ni variable du banc.
//
// La construction se fait en trois étapes (runner/build-outcome.ts) :
// - `fetch` : `npm ci --ignore-scripts` dans une copie du candidat sans son
//   `.npmrc`, sur le réseau `bridge`. Elle remplit un cache npm propre à la
//   mesure. Aucun code du candidat n'y tourne : son journal de npm est la seule
//   preuve recevable d'une erreur du registre imposé ;
// - `install` : `npm ci --offline` dans la copie du candidat, scripts
//   d'installation actifs, depuis ce cache, sans réseau ;
// - `build` : la commande déclarée, lancée par `sh -c`, sans réseau.
// Le seul accès réseau de la phase est donc celui de npm vers le registre
// imposé, sans code du candidat.
import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { citedFileSha256 as digestOf } from "../shared/digest.ts";
import { spawnCommand } from "../shared/process.ts";
import { BUILD_STEPS, type BuildStep, buildStepOutcome, type BuildStepOutcome, type BuildStepRun } from "./build-outcome.ts";
import { isFetchedWith } from "./candidate-content.ts";
import { type ContainerUser, dockerUser } from "./container-user.ts";
import type { Limits } from "./limits.ts";
import { cgroupUsage, type ResourceUsage } from "./resource-usage.ts";

// Registre public npm imposé, par une variable de npm, qui prime sur un `.npmrc` du candidat.
export const NPM_REGISTRY = "https://registry.npmjs.org/";

export interface BuildInput {
  measureId: string;
  image: string;
  user: ContainerUser;
  // Dossier des bruts de la mesure, et copie du candidat dans ce dossier.
  rawDir: string;
  copyDir: string;
  // Commande de construction déclarée, facultative.
  build: string | undefined;
  limits: Limits;
  // Relève les ressources de chaque étape (`migrabench calibrate` seulement).
  collectUsage?: boolean;
  // Appelé juste avant le lancement du conteneur de `fetch`, celui de `npm ci` :
  // une erreur imprévue du runner levée avant reste invalide (#68).
  onNpmCiLaunch?: () => void;
}

export interface BuildResult {
  outcome: BuildStepOutcome;
  // Empreinte de chaque brut, par son chemin dans le dossier des bruts.
  raw: Record<string, string>;
  // Durée de la phase entière, celle que borne le délai global.
  durationMs: number;
  // Étapes lancées, avec leur durée et, sur demande, leurs ressources.
  steps: { step: BuildStep; durationMs: number; usage?: ResourceUsage }[];
}

const WORKDIR = "/candidate";
const NPM_CACHE = "/npm-cache";
const NPM_LOGS = "/npm-logs";
const USAGE = "/usage";
// Relevé des ressources : la commande de l'étape (`$0`) tourne dans un
// sous-shell, puis les compteurs du cgroup v2 du conteneur sont copiés, et le
// code de sortie de la commande est rendu tel quel.
const USAGE_WRAPPER = `sh -c "$0"; status=$?; cat /sys/fs/cgroup/memory.peak > ${USAGE}/memory.peak; cat /sys/fs/cgroup/cpu.stat > ${USAGE}/cpu.stat; exit $status`;

export async function buildCandidate({ measureId, image, user, rawDir, copyDir, build, limits, collectUsage = false, onNpmCiLaunch }: BuildInput): Promise<BuildResult> {
  const startedAt = Date.now();
  const deadline = startedAt + limits.buildTimeoutMs;
  const raw: Record<string, string> = {};
  const recorded: BuildResult["steps"] = [];
  const result = (outcome: BuildStepOutcome): BuildResult => ({ outcome, raw, durationMs: Date.now() - startedAt, steps: recorded });
  const fetchDir = join(rawDir, "fetch");
  const cacheDir = join(rawDir, "npm-cache");
  await cp(copyDir, fetchDir, { recursive: true, filter: (source) => isFetchedWith(relative(copyDir, source).split("\\").join("/")) });
  await mkdir(cacheDir, { recursive: true });

  const steps: { step: BuildStep; dir: string; network: "bridge" | "none"; command: string }[] = [
    { step: "fetch", dir: fetchDir, network: "bridge", command: "npm ci --ignore-scripts" },
    { step: "install", dir: copyDir, network: "none", command: "npm ci --offline" },
    ...(build === undefined ? [] : [{ step: "build" as const, dir: copyDir, network: "none" as const, command: build }]),
  ];
  for (const { step, dir, network, command } of steps) {
    const output = `${step}.log`;
    const npmLogs = join(rawDir, "npm-logs", step);
    await mkdir(npmLogs, { recursive: true });
    const usageDir = join(rawDir, "usage", step);
    if (collectUsage) await mkdir(usageDir, { recursive: true });
    if (step === "fetch") onNpmCiLaunch?.();
    const stepStartedAt = Date.now();
    const run = await runStep({
      container: buildContainer(measureId, step),
      deadline,
      logFile: join(rawDir, output),
      args: [
        "--user", dockerUser(user),
        "--network", network,
        "--memory", String(limits.buildMemoryBytes),
        "--memory-swap", String(limits.buildMemoryBytes),
        "--cpus", String(limits.buildCpus),
        "--env", "HOME=/tmp",
        "--env", `npm_config_registry=${NPM_REGISTRY}`,
        "--env", "npm_config_update_notifier=false",
        "--env", "npm_config_audit=false",
        "--env", "npm_config_fund=false",
        "--env", `npm_config_cache=${NPM_CACHE}`,
        "--env", `npm_config_logs_dir=${NPM_LOGS}`,
        "--volume", `${dir}:${WORKDIR}`,
        "--volume", `${cacheDir}:${NPM_CACHE}`,
        "--volume", `${npmLogs}:${NPM_LOGS}`,
        ...(collectUsage ? ["--volume", `${usageDir}:${USAGE}`] : []),
        "--workdir", WORKDIR,
        image, "sh", "-c", ...(collectUsage ? [USAGE_WRAPPER, command] : [command]),
      ],
    });
    const durationMs = Date.now() - stepStartedAt;
    raw[output] = await digestOf(join(rawDir, output));
    let npmLog = "";
    for (const name of (await readdir(npmLogs)).sort()) {
      const path = join(npmLogs, name);
      raw[relative(rawDir, path)] = await digestOf(path);
      npmLog += await readFile(path, "utf8");
    }
    const outcome = buildStepOutcome({ step, ...run, npmLog, log: await readFile(join(rawDir, output), "utf8") }, NPM_REGISTRY);
    if (outcome.outcome !== "ok") return result(outcome);
    recorded.push({ step, durationMs, ...(collectUsage ? { usage: await usageOf(usageDir) } : {}) });
  }
  return result({ outcome: "ok" });
}

// Conteneur d'une étape de la construction, nommé par la mesure.
function buildContainer(measureId: string, step: BuildStep): string {
  return `migrabench-${measureId}-${step}`;
}

// Supprime les conteneurs de la construction d'une mesure interrompue (#71) :
// `docker run`, interrompu, peut laisser le sien en marche.
export async function removeBuildContainers(measureId: string): Promise<void> {
  await spawnCommand("docker", ["rm", "--force", ...BUILD_STEPS.map((step) => buildContainer(measureId, step))], { allowFailure: true });
}

async function usageOf(dir: string): Promise<ResourceUsage> {
  const read = (name: string) => readFile(join(dir, name), "utf8").catch(() => undefined);
  const [memoryPeak, cpuStat] = await Promise.all([read("memory.peak"), read("cpu.stat")]);
  return cgroupUsage({ memoryPeak, cpuStat });
}

// `State.StartedAt` d'un conteneur créé mais jamais démarré.
const NEVER_STARTED = "0001-01-01";

interface StepRun {
  exitCode: number;
  container: BuildStepRun["container"];
  timedOut: boolean;
  oomKilled: boolean;
}

// Lance un conteneur nommé et l'arrête au délai global : `docker kill` est
// répété chaque seconde, au cas où le conteneur n'existerait pas encore au
// premier essai. Le conteneur est gardé jusqu'au relevé de `OOMKilled` et de
// son démarrage : un conteneur jamais démarré (`StartedAt` à zéro) dit que
// `docker run` a échoué de lui-même ; un `docker inspect` en échec laisse son
// état inconnu, avec la sortie de `docker inspect` (#68).
async function runStep({ container, deadline, logFile, args }: { container: string; deadline: number; logFile: string; args: string[] }): Promise<StepRun> {
  let timedOut = false;
  let killer: NodeJS.Timeout | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    // Refusé après une interruption (#71) : la clôture supprime le conteneur.
    const kill = () => void spawnCommand("docker", ["kill", container], { allowFailure: true }).catch(() => undefined);
    kill();
    killer = setInterval(kill, 1_000);
  }, Math.max(0, deadline - Date.now()));
  try {
    const { code } = await spawnCommand("docker", ["run", "--name", container, ...args], { logFile, allowFailure: true });
    const inspect = await spawnCommand("docker", ["inspect", "--format", "{{.State.OOMKilled}} {{.State.StartedAt}}", container], { allowFailure: true });
    if (inspect.code !== 0) return { exitCode: code, container: { inspectFailed: `${inspect.stderr}${inspect.stdout}` }, timedOut, oomKilled: false };
    const [oomKilled, startedAt = ""] = inspect.stdout.trim().split(" ");
    return { exitCode: code, container: startedAt.startsWith(NEVER_STARTED) ? "never-started" : "started", timedOut, oomKilled: oomKilled === "true" };
  } finally {
    clearTimeout(timer);
    clearInterval(killer);
    await spawnCommand("docker", ["rm", "--force", container], { allowFailure: true });
  }
}
