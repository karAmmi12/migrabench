// Lancement des commandes du banc depuis la racine du dépôt (Git, Docker,
// Playwright), partagé par l'oracle et le runner.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { ROOT } from "./root.ts";

export interface SpawnOptions {
  // Variables ajoutées à l'environnement du processus courant.
  env?: Record<string, string>;
  // Sorties affichées dans le terminal au lieu d'être capturées.
  inherit?: boolean;
  // Fichier où ajouter la sortie standard et la sortie d'erreur mêlées (brut d'une phase).
  logFile?: string;
  // Rendre le code au lieu de rejeter quand la commande échoue.
  allowFailure?: boolean;
}

export interface SpawnResult {
  code: number;
  // Sortie standard capturée, vide avec `inherit`.
  stdout: string;
}

export function spawnCommand(
  command: string,
  args: readonly string[],
  { env = {}, inherit = false, logFile, allowFailure = false }: SpawnOptions = {},
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const output = inherit ? "inherit" : "pipe";
    const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", output, output] });
    const log = logFile === undefined ? undefined : createWriteStream(logFile, { flags: "a" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      log?.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      log?.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const done = () => {
        if (code === 0 || allowFailure) resolve({ code: code ?? 1, stdout });
        else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}${stderr === "" ? "" : `: ${stderr.trim()}`}`));
      };
      if (log === undefined) done();
      else log.end(done);
    });
  });
}

// Sortie standard d'une commande qui doit réussir, sans les blancs des bords.
export async function stdoutOf(command: string, args: readonly string[]): Promise<string> {
  return (await spawnCommand(command, args)).stdout.trim();
}
