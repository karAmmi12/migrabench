// `npm run trial:agent -- <build|isolation|probe|run> ...` : fait tourner
// l'agent qui produit un candidat d'essai dans un conteneur Docker (ADR 0010,
// procédure dans docs/candidat-essai.md). Le conteneur ne monte que le
// répertoire de travail de l'agent, sous /work, et part d'une configuration
// de Claude Code vierge, propre au conteneur (fixtures/trial-agent/Dockerfile).
//
// Le jeton d'abonnement (`claude setup-token`) est lu dans la variable
// CLAUDE_CODE_OAUTH_TOKEN du shell et passé au conteneur par son nom
// seulement : sa valeur n'apparaît dans aucune ligne de commande.
//
//   build                     construit l'image
//   isolation <dir>           vérifie depuis le conteneur que le dépôt et $HOME
//                             ne sont pas visibles
//   probe <dir> <journal>     sonde d'isolement de Claude Code
//   run <dir> <journal>       lancement de l'agent avec le prompt du kit
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, realpathSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { workDirRefusal } from "./legacy-copy.ts";
import { ROOT } from "../shared/root.ts";

export const AGENT_IMAGE = "migrabench-trial-agent";
export const TOKEN_VARIABLE = "CLAUDE_CODE_OAUTH_TOKEN";
const AGENT_WORKDIR = "/work";
const PROBE_PROMPT = "Reply with one short sentence: what is two plus two?";

/** Arguments de `docker run` : le répertoire de travail seul monté, le jeton passé par son nom. */
export function agentRunArgs(workDir: string, command: readonly string[]): string[] {
  return [
    "run", "--rm",
    "--hostname", "workstation",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--mount", `type=bind,source=${workDir},target=${AGENT_WORKDIR}`,
    "-e", TOKEN_VARIABLE,
    AGENT_IMAGE,
    ...command,
  ];
}

/** Claude Code sans question d'autorisation, journal `stream-json`. */
export function claudeArgs(prompt: string): string[] {
  return ["claude", "-p", prompt, "--permission-mode", "bypassPermissions", "--output-format", "stream-json", "--verbose"];
}

/**
 * Conteneurs du banc parmi les noms que liste `docker ps` : le conteneur de
 * l'agent joint les ports publiés sur l'hôte (host.docker.internal), et le
 * legacy du banc y répond avec son realm `migrabench`.
 */
export function benchContainers(dockerPsNames: string): string[] {
  return dockerPsNames.split("\n").filter((name) => name.startsWith("migrabench"));
}

interface InitEvent {
  type?: string;
  subtype?: string;
  cwd?: string;
  mcp_servers?: unknown[];
  plugins?: { name: string; path: string }[];
  permissionMode?: string;
}

/**
 * Écarts de l'événement `system/init` d'un journal à une session isolée :
 * `cwd` vaut /work, aucun serveur MCP, seulement des plugins intégrés, et le
 * mode qui ne pose pas de question.
 */
export function initFindings(log: string): string[] {
  const init = log
    .split("\n")
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as InitEvent];
      } catch {
        return [];
      }
    })
    .find((event) => event.type === "system" && event.subtype === "init");
  if (init === undefined) return ["no system/init event in the log"];
  const findings: string[] = [];
  if (init.cwd !== AGENT_WORKDIR) findings.push(`cwd is ${init.cwd}, expected ${AGENT_WORKDIR}`);
  if ((init.mcp_servers ?? []).length > 0) findings.push(`mcp_servers is not empty: ${JSON.stringify(init.mcp_servers)}`);
  const userPlugins = (init.plugins ?? []).filter((plugin) => plugin.path !== "builtin");
  if (userPlugins.length > 0) findings.push(`plugins not built in: ${userPlugins.map((plugin) => plugin.name).join(", ")}`);
  if (init.permissionMode !== "bypassPermissions") findings.push(`permissionMode is ${init.permissionMode}, expected bypassPermissions`);
  return findings;
}

// Contrôles faits dans le conteneur : arguments $1 le dépôt, $2 le $HOME de
// l'hôte, $3 le nom d'utilisateur. Points de montage attendus : la racine,
// /work, et les trois fichiers que Docker gère lui-même. Les ports 8080 et
// 8090 sont ceux que docker-compose.yml publie sur l'hôte. Sans curl ou sans
// host.docker.internal, le contrôle des ports n'examine rien : il est
// « UNCHECKED » et fait échouer la sonde, jamais réussi.
const ISOLATION_SCRIPT = `
status=0
for path in "$1" "$2"; do
  if [ -e "$path" ]; then echo "LEAK visible path: $path"; status=1; else echo "ok absent: $path"; fi
done
extra=$(awk '{print $5}' /proc/self/mountinfo | grep -v -E '^/(proc|sys|dev)(/|$)' | grep -v -x -E '/|/work|/etc/resolv.conf|/etc/hostname|/etc/hosts')
if [ -n "$extra" ]; then echo "LEAK extra mounts: $extra"; status=1; else echo "ok mounts: / /work and Docker's /etc files only"; fi
files=$(ls -A /work | tr '\\n' ' ')
if [ "$files" = "brief.md legacy-app " ]; then echo "ok /work: $files"; else echo "LEAK /work holds: $files"; status=1; fi
if ! command -v curl >/dev/null || ! getent hosts host.docker.internal >/dev/null; then
  echo "UNCHECKED host ports: no curl or no host.docker.internal in the container"; status=1
else for port in 8080 8090; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://host.docker.internal:$port/")
  if [ "$code" = "000" ]; then echo "ok no answer on host port $port"; else echo "LEAK host port $port answers $code"; status=1; fi
done; fi
hits=$(grep -rIlis -e migrabench -e "$3" / --exclude-dir=proc --exclude-dir=sys --exclude-dir=dev 2>/dev/null)
if [ -n "$hits" ]; then echo "LEAK files naming the bench or the user:"; echo "$hits"; status=1; else echo "ok no file names the bench or the user"; fi
exit $status
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function workDirOf(argument: string | undefined): string {
  if (argument === undefined || !existsSync(argument)) fail("The work directory must exist (npm run trial:copy)");
  const dir = realpathSync(argument);
  const refusal = workDirRefusal(dir, { root: realpathSync(ROOT), home: realpathSync(homedir()) });
  if (refusal !== undefined) fail(refusal);
  // Une virgule couperait l'option --mount de docker run.
  if (dir.includes(",")) fail(`${dir} must not contain a comma`);
  refuseWhileBenchRuns();
  return dir;
}

// Refuse de lancer le conteneur pendant qu'un conteneur du banc tourne.
function refuseWhileBenchRuns(): void {
  const listing = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" });
  if (listing.error !== undefined || listing.status !== 0) fail(`docker ps failed, the bench containers cannot be checked: ${listing.error?.message ?? listing.stderr}`);
  const running = benchContainers(listing.stdout);
  if (running.length > 0) fail(`Stop the bench containers first (docker compose stop, in the repository):\n${running.join("\n")}`);
}

function docker(args: readonly string[], logPath?: string): number {
  const out = logPath === undefined ? "inherit" : openSync(logPath, "w");
  const result = spawnSync("docker", args, { stdio: ["ignore", out, "inherit"] });
  if (typeof out === "number") closeSync(out);
  if (result.error !== undefined) fail(`docker could not run: ${result.error.message}`);
  return result.status ?? 1;
}

// Lance Claude Code dans le conteneur, puis contrôle `system/init` du journal.
function runClaude(workDir: string, prompt: string, logPath: string): number {
  if (!process.env[TOKEN_VARIABLE]) fail(`${TOKEN_VARIABLE} is not set: run claude setup-token, then export it in this shell`);
  const version = spawnSync("docker", ["run", "--rm", AGENT_IMAGE, "claude", "--version"], { encoding: "utf8" }).stdout?.trim() ?? "";
  if (version === "") fail(`No Claude Code version in ${AGENT_IMAGE}: npm run trial:agent -- build`);
  const started = new Date().toISOString();
  console.log(JSON.stringify({ claudeCode: version, image: AGENT_IMAGE, started }));
  const status = docker(agentRunArgs(workDir, claudeArgs(prompt)), logPath);
  const findings = initFindings(readFileSync(logPath, "utf8"));
  console.log(JSON.stringify({ ended: new Date().toISOString(), exitCode: status, log: logPath, initFindings: findings }, null, 2));
  return findings.length > 0 ? 1 : status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, dir, logPath] = process.argv.slice(2);
  if (command === "build") {
    process.exit(docker(["build", "-t", AGENT_IMAGE, join(ROOT, "fixtures/trial-agent")]));
  } else if (command === "isolation") {
    const args = ["sh", "-c", ISOLATION_SCRIPT, "isolation", ROOT, homedir(), userInfo().username];
    process.exit(docker(agentRunArgs(workDirOf(dir), args)));
  } else if ((command === "probe" || command === "run") && logPath !== undefined) {
    const prompt = command === "probe" ? PROBE_PROMPT : readFileSync(join(ROOT, "fixtures/trial-kit/prompt.md"), "utf8");
    process.exit(runClaude(workDirOf(dir), prompt, logPath));
  } else {
    fail("Usage: npm run trial:agent -- build | isolation <work dir> | probe <work dir> <log> | run <work dir> <log>");
  }
}
