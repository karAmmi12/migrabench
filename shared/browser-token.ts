// Jeton du navigateur du banc (#134, décision de Karim du 27/11) : tiré à
// chaque démarrage de la pile et passé au service `browser` par
// l'environnement du shell (MB_BROWSER_TOKEN de docker-compose.yml). Son
// relais CDP refuse toute requête qui ne le porte pas : le candidat, sur le
// même réseau, ne joint pas le Chromium qui le juge.
//
// Une mesure tire le sien et le donne à ses portes. `npm run stack:up` écrit
// le sien dans .dev-browser-token, que relisent les tests ; la CI le passe par
// l'environnement.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BROWSER_TOKEN_ENV = "MB_BROWSER_TOKEN";

// Hors de Git (.gitignore), jamais dans .env, que lit aussi le candidat.
export const DEV_BROWSER_TOKEN_FILE_FROM_ROOT = ".dev-browser-token";
export const DEV_BROWSER_TOKEN_FILE = fileURLToPath(new URL(`../${DEV_BROWSER_TOKEN_FILE_FROM_ROOT}`, import.meta.url));

export function newBrowserToken(): string {
  return randomBytes(32).toString("hex");
}

/** Jeton de la pile pour les tests : MB_BROWSER_TOKEN du shell d'abord, puis celui de `npm run stack:up`. */
export function resolveBrowserToken(env: NodeJS.Dict<string>, devToken: string | undefined): string {
  const token = env[BROWSER_TOKEN_ENV] || devToken?.trim();
  if (!token) throw new Error(`No browser token: run \`npm run stack:up\`, or start the stack and the tests with the same ${BROWSER_TOKEN_ENV}`);
  return token;
}

/** Contenu de .dev-browser-token, ou undefined s'il n'existe pas. */
export function readDevBrowserToken(): string | undefined {
  try {
    return readFileSync(DEV_BROWSER_TOKEN_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
