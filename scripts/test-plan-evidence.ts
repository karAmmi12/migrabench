// Preuves du plan de test d'une PR (#54) : chaque case cochée (`- [x]`) qui
// contient un nombre cite l'état où il a été obtenu (règle « Une preuve cite
// l'état exact » de CLAUDE.md), un commit réel du dépôt ou un lien de job de
// CI (actions/runs/<id>).
//
// Un SHA est reconnu par l'existence du commit, pas par sa forme (#96). Un
// SHA cité est un jeton de 7 à 40 caractères hexadécimaux dans l'un de ces
// contextes :
// - un code en ligne qui n'est que ce jeton (`6253696`) ;
// - après le mot « commit » ou « SHA » (commit bcccdea) ;
// - dans un lien de commit (…/commit/<sha>, …/commits/<sha>).
// Il ne compte que s'il désigne sans ambiguïté un commit réel du dépôt
// (git rev-parse --verify <sha>^{commit} : un préfixe partagé par un commit et
// un arbre désigne le commit). Un commit inexistant, un SHA abrégé partagé par
// plusieurs commits ou une vérification impossible refusent la case, avec la
// raison. Chaque SHA cité doit désigner un commit, même à côté d'un vrai
// commit ou d'un lien de job de CI : une preuve fausse en partie est
// refusée. Le lien de job de CI n'est pas vérifié. Un nombre (20261121)
// ou un mot (defaced) hors de ces contextes n'est pas un SHA cité ; un SHA
// écrit en prose sans contexte non plus.
//
// Le code est retiré d'abord (stripCode, comme pour la vérification de fiche).
// Seules exceptions, un code en ligne qui n'est qu'un SHA, qu'un lien de
// commit ou qu'un lien de job de CI : c'est ainsi que les PR citent un état.
import { spawnSync } from "node:child_process";
import { stripCode } from "./pr-body.ts";

// Résolution d'un SHA dans le dépôt.
export type ShaResolution = "commit" | "missing" | "ambiguous" | "unavailable";
export type ResolveSha = (sha: string) => ShaResolution;

export interface RefusedLine {
  // La ligne telle qu'écrite dans le corps de la PR.
  line: string;
  reason: string;
}

// Case cochée d'une liste à puces (-, *, +) ou numérotée (1., 1)).
const CHECKED_BOX = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[[xX]\][ \t]/;
const HEX_TOKEN = "[0-9a-fA-F]{7,40}";
const SHA_ALONE = new RegExp(`^${HEX_TOKEN}$`);
// Chemin d'un lien de commit : …/commit/<sha>, ou …/commits/<sha> dans une PR.
const COMMIT_PATH = `\\/commits?\\/(${HEX_TOKEN})`;
const COMMIT_LINK_ALONE = new RegExp(`^(?:https?:\\/\\/\\S*)?${COMMIT_PATH}$`);
// Les SHA cités dans la prose : après « commit » ou « SHA », ou dans un lien de commit.
const CITED_SHA = new RegExp(`(?<![\\w-])(?:commit|sha)\\s+(${HEX_TOKEN})(?![\\w-])|${COMMIT_PATH}(?![\\w-])`, "gi");
// Un lien de job de CI, et un code en ligne qui n'est que ce lien.
const CI_RUN = /actions\/runs\/\d+/;
const CI_RUN_ALONE = /^(?:https?:\/\/\S*\/)?actions\/runs\/\d+\S*$/;
// Un nombre isolé (143, 14/14, 2,5) : R2, D-0999, v22 ou #41 sont des identifiants.
const NUMBER = /(?<![\w.,/#-])\d+(?:[.,/]\d+)*(?![\w-])/;

const NO_STATE = "aucun état cité (SHA d'un commit du dépôt ou lien de job de CI actions/runs/<id>)";

// Cases cochées chiffrées refusées, telles qu'écrites, avec la raison.
export function refusedLines(body: string, resolveSha: ResolveSha = resolveShaWithGit()): RefusedLine[] {
  const lines = body.split(/\r?\n/);
  const prose = stripCode(body, proseOfCode).split(/\r?\n/);
  const refused: RefusedLine[] = [];
  lines.forEach((line, index) => {
    const text = prose[index] ?? "";
    if (!CHECKED_BOX.test(text)) return;
    // Le numéro de l'élément de liste n'est pas un nombre mesuré.
    const content = text.replace(CHECKED_BOX, "");
    if (!NUMBER.test(content)) return;
    const reason = refusal(content, resolveSha);
    if (reason !== undefined) refused.push({ line, reason });
  });
  return refused;
}

// Un code en ligne qui n'est qu'un SHA devient « SHA <jeton> », un SHA cité
// dans la prose ; un lien de commit ou de job de CI reste tel quel.
function proseOfCode(code: string): string | undefined {
  if (SHA_ALONE.test(code)) return `SHA ${code}`;
  if (COMMIT_LINK_ALONE.test(code) || CI_RUN_ALONE.test(code)) return code;
  return undefined;
}

// undefined si la ligne cite un état et que chacun de ses SHA désigne un
// commit réel, la raison du refus sinon.
function refusal(prose: string, resolveSha: ResolveSha): string | undefined {
  const citedShas = new Set([...prose.matchAll(CITED_SHA)].map((match) => (match[1] ?? match[2]!).toLowerCase()));
  if (citedShas.size === 0 && !CI_RUN.test(prose)) return NO_STATE;
  const reasons: string[] = [];
  for (const sha of citedShas) {
    const resolution = resolveSha(sha);
    if (resolution !== "commit") reasons.push(`${sha} : ${REASONS[resolution]}`);
  }
  return reasons.length > 0 ? reasons.join(" ; ") : undefined;
}

const REASONS: Record<Exclude<ShaResolution, "commit">, string> = {
  missing: "ce commit n'existe pas dans le dépôt",
  ambiguous: "SHA abrégé ambigu, il désigne plusieurs commits du dépôt",
  unavailable:
    "vérification impossible (Git absent, hors d'un dépôt ou historique incomplet : il faut fetch-depth: 0 et npm run fetch:pull-heads)",
};

// Résolution par le Git du dépôt de cwd. L'historique doit être complet : un
// clone superficiel rend « unavailable », jamais « missing ». Les commits d'une
// PR fusionnée en squash ne sont joignables que par la tête de leur PR
// (npm run fetch:pull-heads).
export function resolveShaWithGit(cwd: string = process.cwd()): ResolveSha {
  let completeHistory: boolean | undefined;
  return (sha) => {
    completeHistory ??= git(cwd, ["rev-parse", "--is-shallow-repository"])?.stdout.trim() === "false";
    if (!completeHistory) return "unavailable";
    const commit = git(cwd, ["rev-parse", "--verify", "--quiet", `${sha}^{commit}`]);
    if (commit === undefined) return "unavailable";
    if (commit.status === 0) return "commit";
    // Échec : le SHA abrégé désigne-t-il plusieurs commits, ou aucun ? Un
    // arbre ou un fichier qui partage le préfixe ne compte pas.
    const objects = git(cwd, ["rev-parse", `--disambiguate=${sha}`]);
    if (objects === undefined || objects.status !== 0) return "unavailable";
    const types = git(cwd, ["cat-file", "--batch-check=%(objecttype)"], objects.stdout);
    if (types === undefined || types.status !== 0) return "unavailable";
    return types.stdout.split("\n").filter((type) => type === "commit").length > 1 ? "ambiguous" : "missing";
  };
}

// undefined si Git ne s'est pas lancé ou a échoué autrement que par un refus (code 0 ou 1).
function git(cwd: string, args: string[], input?: string): { status: number; stdout: string } | undefined {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", input });
  if (result.error !== undefined || result.status === null || result.status > 1) return undefined;
  return { status: result.status, stdout: result.stdout };
}
