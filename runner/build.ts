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
import { type BuildStep, buildStepOutcome, type BuildStepOutcome } from "./build-outcome.ts";
import { isFetchedWith } from "./candidate-content.ts";
import { type ContainerUser, dockerUser } from "./container-user.ts";
import type { Limits } from "./limits.ts";

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
}

export interface BuildResult {
  outcome: BuildStepOutcome;
  // Empreinte de chaque brut, par son chemin dans le dossier des bruts.
  raw: Record<string, string>;
}

const WORKDIR = "/candidate";
const NPM_CACHE = "/npm-cache";
const NPM_LOGS = "/npm-logs";

export async function buildCandidate({ measureId, image, user, rawDir, copyDir, build, limits }: BuildInput): Promise<BuildResult> {
  const deadline = Date.now() + limits.buildTimeoutMs;
  const raw: Record<string, string> = {};
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
    const run = await runStep({
      container: `migrabench-${measureId}-${step}`,
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
        "--workdir", WORKDIR,
        image, "sh", "-c", command,
      ],
    });
    raw[output] = await digestOf(join(rawDir, output));
    let npmLog = "";
    for (const name of (await readdir(npmLogs)).sort()) {
      const path = join(npmLogs, name);
      raw[relative(rawDir, path)] = await digestOf(path);
      npmLog += await readFile(path, "utf8");
    }
    const outcome = buildStepOutcome({ step, ...run, npmLog }, NPM_REGISTRY);
    if (outcome.outcome !== "ok") return { outcome, raw };
  }
  return { outcome: { outcome: "ok" }, raw };
}

interface StepRun {
  exitCode: number;
  timedOut: boolean;
  oomKilled: boolean;
}

// Lance un conteneur nommé et l'arrête au délai global : `docker kill` est
// répété chaque seconde, au cas où le conteneur n'existerait pas encore au
// premier essai. Le conteneur est gardé jusqu'au relevé de `OOMKilled`.
async function runStep({ container, deadline, logFile, args }: { container: string; deadline: number; logFile: string; args: string[] }): Promise<StepRun> {
  let timedOut = false;
  let killer: NodeJS.Timeout | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    const kill = () => void spawnCommand("docker", ["kill", container], { allowFailure: true });
    kill();
    killer = setInterval(kill, 1_000);
  }, Math.max(0, deadline - Date.now()));
  try {
    const { code } = await spawnCommand("docker", ["run", "--name", container, ...args], { logFile, allowFailure: true });
    const inspect = await spawnCommand("docker", ["inspect", "--format", "{{.State.OOMKilled}}", container], { allowFailure: true });
    return { exitCode: code, timedOut, oomKilled: inspect.stdout.trim() === "true" };
  } finally {
    clearTimeout(timer);
    clearInterval(killer);
    await spawnCommand("docker", ["rm", "--force", container], { allowFailure: true });
  }
}
