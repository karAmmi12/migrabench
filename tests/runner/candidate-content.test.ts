// Contenu mesuré du candidat (spec de l'étape 3, « Exécution du candidat » et
// « Contenu de measure.json ») : ce que la copie emporte, et son empreinte.
import { describe, expect, it } from "vitest";
import { contentDigest, isCopied, isFetchedWith } from "../../runner/candidate-content.ts";

describe("isCopied", () => {
  it("copies the candidate's own files", () => {
    expect(isCopied("candidate.json")).toBe(true);
    expect(isCopied("server/index.js")).toBe(true);
    expect(isCopied("src/build/helpers.ts")).toBe(true);
  });

  it("leaves out node_modules at any depth", () => {
    expect(isCopied("node_modules")).toBe(false);
    expect(isCopied("node_modules/react/index.js")).toBe(false);
    expect(isCopied("server/node_modules/x.js")).toBe(false);
  });

  it("leaves out build artifacts already present at the root", () => {
    expect(isCopied("dist")).toBe(false);
    expect(isCopied("dist/assets/index.js")).toBe(false);
    expect(isCopied("build/index.html")).toBe(false);
  });
});

describe("contentDigest", () => {
  it("hashes the sorted list of paths and their digests", () => {
    // printf '%s  %s\n' bbbb candidate.json aaaa server.js | shasum -a 256
    expect(
      contentDigest([
        { path: "server.js", sha256: "aaaa" },
        { path: "candidate.json", sha256: "bbbb" },
      ]),
    ).toBe("sha256:87aac424436da1fd13f7e61e3c67f2481dffdd204fafe50814c886948ffd3f20");
  });

  it("changes when a single file changes", () => {
    const before = contentDigest([{ path: "server.js", sha256: "aaaa" }]);
    expect(contentDigest([{ path: "server.js", sha256: "aaab" }])).not.toBe(before);
  });
});

describe("isFetchedWith", () => {
  it("leaves out the candidate's root .npmrc, so that it cannot steer the only step with network access", () => {
    expect(isFetchedWith(".npmrc")).toBe(false);
  });

  it("keeps every other copied file, local dependencies included", () => {
    expect(isFetchedWith("package.json")).toBe(true);
    expect(isFetchedWith("package-lock.json")).toBe(true);
    expect(isFetchedWith("packages/local-dep/.npmrc")).toBe(true);
  });
});
