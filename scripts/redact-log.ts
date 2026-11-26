// `npm run trial:redact -- <journal> <copie expurgée> [répertoire de travail]` :
// expurge le journal de l'agent qui a produit un candidat d'essai (procédure
// de docs/candidat-essai.md, étape 4) avant de le verser dans la provenance.
// Remplace le répertoire personnel, le nom d'utilisateur, le nom de la
// machine, le répertoire de travail et les identifiants de session. Écrit à
// côté de la copie `<copie>.redaction.json` : sha256 de l'original et nombre
// de remplacements par étiquette, jamais les valeurs remplacées.
import { readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { resolve } from "node:path";
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output, workDir] = process.argv.slice(2);
  if (input === undefined || output === undefined) {
    console.error("Usage: npm run trial:redact -- <log> <redacted copy> [work directory]");
    process.exit(1);
  }
  const original = readFileSync(input);
  const text = original.toString("utf8");
  const replacements: Replacement[] = [
    { label: "<HOME>", value: homedir() },
    { label: "<USER>", value: userInfo().username },
    { label: "<HOST>", value: hostname() },
    ...(workDir === undefined ? [] : [{ label: "<WORKDIR>", value: resolve(workDir) }]),
    ...sessionIdsOf(text).map((value) => ({ label: "<SESSION_ID>", value })),
  ];
  const result = redactLog(text, replacements);
  writeFileSync(output, result.text);
  writeFileSync(`${output}.redaction.json`, `${JSON.stringify({ original: `sha256:${sha256(original)}`, replacements: result.counts }, null, 2)}\n`);
  console.log(JSON.stringify(result.counts));
}
