// `npm run trial:copy -- <répertoire>` : prépare le répertoire de travail de
// l'agent qui produit un candidat d'essai (ADR 0010, procédure dans
// docs/candidat-essai.md). Y écrit la copie expurgée du legacy sous
// `legacy-app/` et le brief sous `brief.md`. Le prompt n'y est pas : il est
// passé à l'agent par la ligne de commande.
//
// Refuse un répertoire dans le dépôt ou sous $HOME, un répertoire non vide, et
// un arbre de travail modifié sur ce qui fait la copie : la provenance cite le
// commit du banc, qui doit suffire à refaire la même copie.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { copyDigest, expurgate, LEGACY_DIR_FROM_ROOT, readLegacyFiles, workDirRefusal } from "./legacy-copy.ts";
import { ROOT } from "../shared/root.ts";

const KIT_DIR_FROM_ROOT = "fixtures/trial-kit";
const SOURCES = [LEGACY_DIR_FROM_ROOT, KIT_DIR_FROM_ROOT, "scripts/legacy-copy.ts", "scripts/trial-copy.ts"];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [argument] = process.argv.slice(2);
if (argument === undefined) fail("Usage: npm run trial:copy -- <work directory>");

// Chemins réels : /tmp est un lien vers /private/tmp sous macOS.
const absolute = resolve(argument);
const dest = existsSync(dirname(absolute)) ? join(realpathSync(dirname(absolute)), basename(absolute)) : absolute;
const refusal = workDirRefusal(dest, { root: realpathSync(ROOT), home: realpathSync(homedir()) });
if (refusal !== undefined) fail(refusal);
if (existsSync(dest) && readdirSync(dest).length > 0) fail(`${dest} must be empty`);

const dirty = execFileSync("git", ["status", "--porcelain", "--", ...SOURCES], { cwd: ROOT, encoding: "utf8" });
if (dirty !== "") fail(`Commit these changes first, the copy must come from a commit:\n${dirty}`);
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

const copy = expurgate(readLegacyFiles(ROOT));
for (const file of copy) {
  const path = join(dest, "legacy-app", file.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, file.content);
}
writeFileSync(join(dest, "brief.md"), readFileSync(join(ROOT, KIT_DIR_FROM_ROOT, "brief.md")));

console.log(JSON.stringify({ benchCommit: commit, files: copy.length, copyDigest: `sha256:${copyDigest(copy)}`, dest }, null, 2));
