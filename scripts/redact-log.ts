// `npm run trial:redact -- <journal> <copie expurgée> <répertoire de travail>` :
// expurge le journal de l'agent qui a produit un candidat d'essai (procédure
// de docs/candidat-essai.md, étape 5) avant de le verser dans la provenance.
// Remplace le jeton d'abonnement, le répertoire personnel, le nom
// d'utilisateur, le nom de la machine, le répertoire de travail et les
// identifiants de session. Écrit à côté de la copie
// `<copie>.redaction.json` : sha256 de l'original et nombre de remplacements
// par étiquette, jamais les valeurs remplacées.
//
// Le jeton est lu dans CLAUDE_CODE_OAUTH_TOKEN, celle du lancement : sans
// elle, le script refuse, car la vérification ne serait pas faite. Il refuse
// aussi un répertoire de travail dont un fichier contient le jeton, puisque
// ce répertoire sera versionné.
import { readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../shared/digest.ts";

export interface Replacement {
  label: string;
  value: string;
}

/** Le texte, chaque valeur remplacée par son étiquette, la plus longue d'abord. */
export function redactLog(text: string, replacements: readonly Replacement[]): { text: string; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  let redacted = text;
  for (const { label, value } of [...replacements].sort((a, b) => b.value.length - a.value.length)) {
    const parts = value === "" ? [redacted] : redacted.split(value);
    counts[label] = (counts[label] ?? 0) + parts.length - 1;
    redacted = parts.join(label);
  }
  return { text: redacted, counts };
}

/** Identifiants de session d'un journal `stream-json`, dans l'ordre, une fois chacun. */
export function sessionIdsOf(log: string): string[] {
  return [...new Set([...log.matchAll(/"session_id"\s*:\s*"([^"]+)"/g)].map((match) => match[1] as string))];
}

/** Fichiers du répertoire, à toute profondeur, qui contiennent le secret, en chemins relatifs. */
export function filesContaining(dir: string, secret: string): string[] {
  if (secret === "") throw new Error("An empty secret is found in every file");
  const needle = Buffer.from(secret);
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => readFileSync(path).includes(needle))
    .map((path) => relative(dir, path));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output, workDir] = process.argv.slice(2);
  if (input === undefined || output === undefined || workDir === undefined) {
    console.error("Usage: npm run trial:redact -- <log> <redacted copy> <work directory>");
    process.exit(1);
  }
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "";
  if (token === "") {
    console.error("CLAUDE_CODE_OAUTH_TOKEN is not set: export the token used for the run, so that its absence can be checked");
    process.exit(1);
  }
  const leaks = filesContaining(workDir, token);
  if (leaks.length > 0) {
    console.error(`The token is written in the work directory, remove it before anything is versioned:\n${leaks.join("\n")}`);
    process.exit(1);
  }
  const original = readFileSync(input);
  const text = original.toString("utf8");
  const replacements: Replacement[] = [
    { label: "<OAUTH_TOKEN>", value: token },
    { label: "<HOME>", value: homedir() },
    { label: "<USER>", value: userInfo().username },
    { label: "<HOST>", value: hostname() },
    // Chemin donné et chemin réel : /tmp est un lien vers /private/tmp sous macOS.
    ...[...new Set([resolve(workDir), realpathSync(workDir)])].map((value) => ({ label: "<WORKDIR>", value })),
    ...sessionIdsOf(text).map((value) => ({ label: "<SESSION_ID>", value })),
  ];
  const result = redactLog(text, replacements);
  writeFileSync(output, result.text);
  writeFileSync(`${output}.redaction.json`, `${JSON.stringify({ original: `sha256:${sha256(original)}`, replacements: result.counts }, null, 2)}\n`);
  console.log(JSON.stringify(result.counts));
}
