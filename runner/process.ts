// Lancement des commandes du runner depuis la racine du dépôt : Git, Docker.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { ROOT } from "./paths.ts";

export interface SpawnOptions {
  env?: Record<string, string>;
  // Fichier où écrire la sortie standard et la sortie d'erreur mêlées (brut d'une phase).
  logFile?: string;
  // Rendre le code au lieu de rejeter quand la commande échoue.
  allowFailure?: boolean;
}

export interface SpawnResult {
  code: number;
  stdout: string;
}

export function spawnCommand(command: string, args: readonly string[], { env = {}, logFile, allowFailure = false }: SpawnOptions = {}): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    const log = logFile === undefined ? undefined : createWriteStream(logFile, { flags: "a" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      log?.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      log?.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const done = () => {
        if (code === 0 || allowFailure) resolve({ code: code ?? 1, stdout });
        else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}: ${stderr.trim()}`));
      };
      if (log === undefined) done();
      else log.end(done);
    });
  });
}

export async function stdoutOf(command: string, args: readonly string[]): Promise<string> {
  return (await spawnCommand(command, args)).stdout.trim();
}
