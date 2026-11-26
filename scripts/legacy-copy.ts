// Copie expurgée du legacy (ADR 0010, #125) : ce que voit l'agent qui produit
// un candidat d'essai, puis, à l'étape 6, l'agent d'un run. Transformation
// pure et déterministe des fichiers de `fixtures/legacy-app` :
//
// - TRAPS.md, Dockerfile et access-log/ sont laissés de côté ;
// - les commentaires qui portent BENCH_MARKER sont retirés ;
// - dossiers.json est réduit aux dossiers qu'aucune réservation ne cite, sans
//   la clé `reservations` ;
// - le paquet Java `fr.migrabench.legacy` devient `fr.mairie.dossiers`, et
//   toute autre mention du nom du banc devient `dossiers`, chemins compris.
//
// Ce qui n'est pas un commentaire (code, textes, valeurs) n'est jamais
// retouché, hors le renommage et le jeu de données.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { sha256 } from "../shared/digest.ts";

// Dossier du legacy, depuis la racine du dépôt.
export const LEGACY_DIR_FROM_ROOT = "fixtures/legacy-app";

// Marqueur d'un commentaire du legacy destiné au banc.
export const BENCH_MARKER = "[banc]";

export interface SourceFile {
  // Chemin relatif au dossier du legacy, séparé par des `/`.
  path: string;
  content: string;
}

export interface Comment {
  text: string;
  // Position du premier caractère, et de celui qui suit le commentaire.
  start: number;
  end: number;
}

const EXCLUDED = [/^TRAPS\.md$/, /^Dockerfile$/, /^access-log\//];

const DATASET = "src/main/resources/dossiers.json";

/** Vrai si ce fichier du legacy n'entre pas dans la copie. */
export function isExcluded(path: string): boolean {
  return EXCLUDED.some((pattern) => pattern.test(path));
}

// Dans l'ordre : le plus précis d'abord.
const RENAMES: readonly (readonly [string, string])[] = [
  ["fr.migrabench.legacy", "fr.mairie.dossiers"],
  ["fr/migrabench/legacy", "fr/mairie/dossiers"],
  ["fr.migrabench", "fr.mairie"],
  ["migrabench", "dossiers"],
];

/** Commentaires du fichier, dans l'ordre, selon la syntaxe de son extension. */
export function commentsOf(path: string, text: string): Comment[] {
  if (path.endsWith(".java")) return javaComments(text);
  if (path.endsWith(".jsp")) return delimitedComments(text, [["<%--", "--%>"], ["<!--", "-->"]]);
  if (path.endsWith(".xml")) return delimitedComments(text, [["<!--", "-->"]]);
  if (path.endsWith(".properties")) return propertiesComments(text);
  if (path.endsWith(".json")) return [];
  throw new Error(`No comment syntax known for ${path}`);
}

/** Le texte sans ses commentaires marqués, ni les lignes qu'ils laissent vides. */
export function stripBenchComments(path: string, text: string): string {
  const marked = commentsOf(path, text).filter((comment) => comment.text.includes(BENCH_MARKER));
  let result = text;
  for (const { start, end } of marked.reverse()) {
    const lineStart = result.lastIndexOf("\n", start - 1) + 1;
    const newline = result.indexOf("\n", end);
    const lineEnd = newline === -1 ? result.length : newline;
    const before = result.slice(lineStart, start);
    const after = result.slice(end, lineEnd);
    if (before.trim() === "" && after.trim() === "") {
      // La ligne entière part, avec un seul saut de ligne.
      result = newline === -1
        ? result.slice(0, Math.max(0, lineStart - 1)) + result.slice(lineEnd)
        : result.slice(0, lineStart) + result.slice(lineEnd + 1);
    } else if (after.trim() === "") {
      result = result.slice(0, start - (before.length - before.trimEnd().length)) + result.slice(end);
    } else {
      result = result.slice(0, start) + result.slice(end);
    }
  }
  return result;
}

/** dossiers.json réduit aux dossiers non réservés, sans `reservations`, un dossier par ligne. */
export function filterDataset(json: string): string {
  const dataset = JSON.parse(json) as { dossiers: Record<string, unknown>[]; reservations: Record<string, string[]> };
  const reserved = new Set(Object.values(dataset.reservations).flat());
  const lines = dataset.dossiers
    .filter((dossier) => !reserved.has(dossier.number as string))
    .map((dossier) => `    { ${Object.entries(dossier).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(", ")} }`);
  const body = lines.length === 0 ? "" : `${lines.join(",\n")}\n`;
  return `{\n  "dossiers": [\n${body}  ]\n}\n`;
}

/** La copie expurgée de ces fichiers du legacy, dans le même ordre. */
export function expurgate(files: readonly SourceFile[]): SourceFile[] {
  return files
    .filter((file) => !isExcluded(file.path))
    .map((file) => {
      const stripped = stripBenchComments(file.path, file.content);
      const content = file.path === DATASET ? filterDataset(stripped) : stripped;
      return { path: rename(file.path), content: rename(content) };
    });
}

function rename(text: string): string {
  return RENAMES.reduce((renamed, [from, to]) => renamed.replaceAll(from, to), text);
}

function javaComments(text: string): Comment[] {
  const comments: Comment[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' || char === "'") {
      index = endOfLiteral(text, index, char);
    } else if (char === "/" && next === "/") {
      const newline = text.indexOf("\n", index);
      const end = newline === -1 ? text.length : newline;
      comments.push({ text: text.slice(index, end), start: index, end });
      index = end;
    } else if (char === "/" && next === "*") {
      const close = text.indexOf("*/", index + 2);
      if (close === -1) throw new Error("Unterminated Java block comment");
      comments.push({ text: text.slice(index, close + 2), start: index, end: close + 2 });
      index = close + 2;
    } else {
      index += 1;
    }
  }
  return comments;
}

// Position qui suit le littéral Java ouvert à `start` par `quote`.
function endOfLiteral(text: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < text.length && text[index] !== quote && text[index] !== "\n") {
    index += text[index] === "\\" ? 2 : 1;
  }
  return index + 1;
}

function delimitedComments(text: string, delimiters: readonly (readonly [string, string])[]): Comment[] {
  const comments: Comment[] = [];
  let index = 0;
  for (;;) {
    const found = delimiters
      .map(([open, close]) => ({ open, close, start: text.indexOf(open, index) }))
      .filter((match) => match.start !== -1)
      .sort((a, b) => a.start - b.start)[0];
    if (found === undefined) return comments;
    const close = text.indexOf(found.close, found.start + found.open.length);
    if (close === -1) throw new Error(`Unterminated comment ${found.open}`);
    const end = close + found.close.length;
    comments.push({ text: text.slice(found.start, end), start: found.start, end });
    index = end;
  }
}

function propertiesComments(text: string): Comment[] {
  const comments: Comment[] = [];
  let lineStart = 0;
  for (const line of text.split("\n")) {
    const indent = line.length - line.trimStart().length;
    if (line.trimStart().startsWith("#") || line.trimStart().startsWith("!")) {
      comments.push({ text: line.slice(indent), start: lineStart + indent, end: lineStart + line.length });
    }
    lineStart += line.length + 1;
  }
  return comments;
}

// Mots qui parlent du banc dans un commentaire du legacy, en mots entiers,
// sans tenir compte de la casse : un tel commentaire doit porter BENCH_MARKER.
// « porte » est aussi un verbe : le legacy n'écrit pas « qui porte ce numéro ».
const BENCH_WORDS =
  /(?<![\p{L}\p{N}_])(pi[eè]ges?|traps?|xss|t[ée]moins?|oracles?|sc[ée]narios?|portes?|bancs?|candidats?|seam|adr|glossary|migrabench)(?![\p{L}\p{N}_])/iu;

/** Commentaires qui parlent du banc sans porter le marqueur. */
export function unmarkedBenchComments(path: string, text: string): Comment[] {
  return commentsOf(path, text).filter((comment) => !comment.text.includes(BENCH_MARKER) && BENCH_WORDS.test(comment.text));
}

/**
 * Fichiers du legacy suivis par Git, lus dans l'arbre de travail : un fichier
 * non suivi (un `target/` de Maven, par exemple) n'entre jamais dans la copie.
 */
export function readLegacyFiles(root: string): SourceFile[] {
  const listed = execFileSync("git", ["ls-files", "-z", "--", LEGACY_DIR_FROM_ROOT], { cwd: root, encoding: "utf8" });
  return listed
    .split("\0")
    .filter((path) => path !== "")
    .sort()
    .map((path) => ({ path: path.slice(LEGACY_DIR_FROM_ROOT.length + 1), content: readFileSync(join(root, path), "utf8") }));
}

/**
 * Raison de refuser ce répertoire de travail de l'agent (procédure du
 * candidat d'essai, étape 1) : il doit être hors du dépôt et hors de `$HOME`,
 * pour que l'agent n'y trouve ni le banc ni la configuration de l'utilisateur.
 */
export function workDirRefusal(dest: string, { root, home }: { root: string; home: string }): string | undefined {
  for (const [name, place] of [["the repository", root], ["the home directory", home]] as const) {
    const path = relative(place, dest);
    if (path === "" || (!path.startsWith("..") && !isAbsolute(path))) return `${dest} must be outside ${name} (${place})`;
  }
  return undefined;
}

/** Empreinte de la copie : chemins et contenus, quel que soit l'ordre des fichiers. */
export function copyDigest(files: readonly SourceFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sha256(JSON.stringify(sorted.map((file) => [file.path, file.content])));
}
