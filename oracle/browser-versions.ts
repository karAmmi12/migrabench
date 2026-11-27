// Versions du navigateur et de Playwright, relevées pour les métadonnées de
// l'exécution (spec de l'étape 2, « Résultat JSON »), pour pouvoir rejouer une
// exécution avec les mêmes. Le navigateur est celui du service `browser`
// (#78) : sa version vient de la connexion, et l'image réellement utilisée du
// conteneur, avec sa plateforme. L'empreinte d'une image dépend de la
// plateforme (arm64 en local, amd64 en CI) : `image` est celle de la
// plateforme qui a tourné, `reference` l'index épinglé commun.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { stdoutOf } from "../shared/process.ts";
import { BROWSER_IMAGE, connectBenchBrowser } from "./browser.ts";

export interface BrowserImage {
  // Image épinglée de docker-compose.yml : étiquette et empreinte de l'index.
  reference: string;
  // Identifiant de l'image du conteneur, propre à la plateforme.
  image: string;
  // Plateforme de cette image, par exemple `linux/amd64`.
  platform: string;
}

export interface BrowserVersions {
  // Version du Chromium du service `browser`, lancé comme le lance l'oracle :
  // sans canal, en headless.
  chromium: string;
  // Version de @playwright/test installée, celle qui lance les scénarios.
  playwright: string;
  browserImage: BrowserImage;
}

// `browserToken` : le jeton de la pile en cours (#160).
export async function browserVersions(browserToken: string): Promise<BrowserVersions> {
  const browser = await connectBenchBrowser(browserToken);
  let chromium: string;
  try {
    chromium = browser.version();
  } finally {
    await browser.close();
  }
  return { chromium, playwright: await playwrightVersion(), browserImage: await browserImage() };
}

// Image du conteneur `browser` en cours. Elle doit venir de l'index épinglé :
// sinon, l'exécution n'a pas tourné dans le navigateur figé.
async function browserImage(): Promise<BrowserImage> {
  const container = await stdoutOf("docker", ["compose", "ps", "--quiet", "browser"]);
  if (container === "") throw new Error("No running container for service browser");
  const image = await stdoutOf("docker", ["inspect", "--format", "{{.Image}}", container]);
  const [platform = "", repoDigests = "[]"] = (await stdoutOf("docker", ["image", "inspect", "--format", "{{.Os}}/{{.Architecture}} {{json .RepoDigests}}", image])).split(" ");
  const pinned = BROWSER_IMAGE.replace(/:[^:@/]+@/, "@");
  if (!(JSON.parse(repoDigests) as string[]).includes(pinned)) throw new Error(`Browser image ${image} does not come from ${pinned}: ${repoDigests}`);
  return { reference: BROWSER_IMAGE, image, platform };
}

async function playwrightVersion(): Promise<string> {
  const manifest = createRequire(import.meta.url).resolve("@playwright/test/package.json");
  return (JSON.parse(await readFile(manifest, "utf8")) as { version: string }).version;
}
