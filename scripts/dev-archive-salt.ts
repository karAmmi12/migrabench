// Sel de développement de la référence d'archivage : tiré par
// `npm run stack:up`, qui démarre la pile avec, et relu par `npm test` quand
// le shell n'a pas d'ARCHIVE_SALT. Il ne sert jamais à une exécution mesurée :
// `npm run oracle` tire le sien et recrée la pile avec (README).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Hors de Git (.gitignore), jamais dans .env, que lit aussi le legacy.
export const DEV_SALT_FILE_FROM_ROOT = ".dev-archive-salt";
export const DEV_SALT_FILE = fileURLToPath(new URL(`../${DEV_SALT_FILE_FROM_ROOT}`, import.meta.url));

/** Sel de la pile : ARCHIVE_SALT du shell d'abord, puis le sel de développement. */
export function resolveArchiveSalt(env: NodeJS.Dict<string>, devSalt: string | undefined): string {
  const salt = env.ARCHIVE_SALT || devSalt?.trim();
  if (!salt) {
    throw new Error(
      `No archive salt: run \`npm run stack:up\`, or start the stack and the tests with the same ARCHIVE_SALT (README)`,
    );
  }
  // Les tests du seam A cherchent aussi le sel décodé en base64 : il doit être hexadécimal.
  if (!/^(?:[0-9a-f]{2})+$/i.test(salt)) throw new Error("The archive salt must be hexadecimal (openssl rand -hex 32)");
  return salt;
}

/**
 * Vérifie que la pile tourne avec le sel de `npm test`. Après `npm run oracle`,
 * qui recrée la pile avec le sel de l'exécution, .dev-archive-salt garde
 * l'ancien sel : sans ce message, l'écart ne se voit que dans un HMAC (#46).
 * Le message ne cite aucun des deux sels.
 */
export function checkStackSalt(stackSalt: string | undefined, knownSalt: string): void {
  if (stackSalt !== knownSalt) {
    throw new Error(
      "The stack does not run with the archive salt of npm test: rerun `npm run stack:up` " +
        "(after `npm run oracle`, the stack keeps the salt of the oracle execution), " +
        "or start the stack and the tests with the same ARCHIVE_SALT (README)",
    );
  }
}

/** Contenu du fichier du sel de développement, ou undefined s'il n'existe pas. */
export function readDevSalt(): string | undefined {
  try {
    return readFileSync(DEV_SALT_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
