// .nvmrc et engines.node (package.json) désignent la même version de Node
// (#23) : une montée de version ne peut pas oublier l'un des deux.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("node version", () => {
  it("engines.node de package.json est la version exacte de .nvmrc", () => {
    const nvmrc = read(".nvmrc").trim().replace(/^v/, "");
    const pkg = JSON.parse(read("package.json")) as { engines?: { node?: string } };
    expect(pkg.engines?.node).toBe(nvmrc);
  });

  it("package-lock.json reprend engines.node de package.json", () => {
    const pkg = JSON.parse(read("package.json")) as { engines?: { node?: string } };
    const lock = JSON.parse(read("package-lock.json")) as {
      packages: Record<string, { engines?: { node?: string } }>;
    };
    expect(lock.packages[""]?.engines?.node).toBe(pkg.engines?.node);
  });
});
