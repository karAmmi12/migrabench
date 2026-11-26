// L'image du navigateur du banc (#78) suit la version de Playwright du dépôt :
// le serveur de Playwright du service `browser` est le playwright-core du
// dépôt, et ses navigateurs sont ceux de l'image. Une montée de
// @playwright/test ne peut pas oublier l'image, ni l'image se désaccorder de
// docker-compose.yml.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BROWSER_IMAGE } from "../oracle/browser.ts";
import { CANDIDATE_PORT } from "../runner/candidate-runtime.ts";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

// Image épinglée : `mcr.microsoft.com/playwright:v<version>-<base>@sha256:<64>`.
const PINNED = /^mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64}$/;

// Écarts entre l'image et les versions du dépôt : vide quand tout s'accorde.
function browserImageProblems({ image, compose, playwright, playwrightCore }: { image: string; compose: string; playwright: string; playwrightCore: string }): string[] {
  const problems: string[] = [];
  const version = PINNED.exec(image)?.[1];
  if (version === undefined) problems.push(`${image} is not pinned as mcr.microsoft.com/playwright:v<version>-noble@sha256:<digest>`);
  else if (version !== playwright) problems.push(`image tag v${version} differs from @playwright/test ${playwright}`);
  if (playwrightCore !== playwright) problems.push(`playwright-core ${playwrightCore} differs from @playwright/test ${playwright}`);
  const composed = /\n {2}browser:\n(?: {4}#.*\n)* {4}image: (\S+)\n/.exec(compose)?.[1];
  if (composed !== image) problems.push(`docker-compose.yml runs ${composed ?? "no browser image"}, oracle/browser.ts names ${image}`);
  return problems;
}

const lock = JSON.parse(read("package-lock.json")) as { packages: Record<string, { version: string }> };
const REPO = {
  image: BROWSER_IMAGE,
  compose: read("docker-compose.yml"),
  playwright: lock.packages["node_modules/@playwright/test"]!.version,
  playwrightCore: lock.packages["node_modules/playwright-core"]!.version,
};

describe("browser image", () => {
  it("matches @playwright/test, playwright-core and docker-compose.yml", () => {
    expect(browserImageProblems(REPO)).toEqual([]);
  });

  // Témoins : le contrôle sait voir chaque désaccord.
  it("names a tag that differs from @playwright/test", () => {
    expect(browserImageProblems({ ...REPO, playwright: "1.66.0", playwrightCore: "1.66.0" })).toContainEqual(expect.stringContaining("differs from @playwright/test 1.66.0"));
  });

  it("names an image that is not pinned by digest", () => {
    expect(browserImageProblems({ ...REPO, image: "mcr.microsoft.com/playwright:v1.65.1-noble" })).toContainEqual(expect.stringContaining("is not pinned"));
  });

  it("names a docker-compose.yml that runs another image", () => {
    const compose = REPO.compose.replace(BROWSER_IMAGE, `mcr.microsoft.com/playwright:v1.65.1-noble@sha256:${"0".repeat(64)}`);
    expect(browserImageProblems({ ...REPO, compose })).toEqual([expect.stringContaining("docker-compose.yml runs mcr.microsoft.com/playwright:v1.65.1-noble@sha256:000")]);
  });
});

// Le relais local du navigateur suit les ports que le banc impose : celui du
// candidat vient de runner/candidate-runtime.ts.
describe("browser relay", () => {
  it("relays the candidate port the bench imposes, at the same port", () => {
    expect(read("fixtures/browser/server.mjs")).toContain(`[${CANDIDATE_PORT}, "candidate", ${CANDIDATE_PORT}]`);
  });
});
