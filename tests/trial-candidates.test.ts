// Candidats d'essai versionnés (ADR 0010, #126) : aucun fichier sous
// fixtures/trial-candidates/ ne contient de chemin personnel, `/Users/` ou
// `/home/` (spec de l'étape 4, « Candidat d'essai »). Le contrôle lit tous les
// fichiers du dossier, versionnés ou non.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../shared/root.ts";

const PERSONAL_PATHS = ["/Users/", "/home/"];

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

// Chaque fichier qui contient un chemin personnel, avec le chemin trouvé.
function scanPersonalPaths(dir: string): { files: number; findings: string[] } {
  const files = filesUnder(dir);
  const findings = files.flatMap((file) => {
    const content = readFileSync(file, "latin1");
    return PERSONAL_PATHS.filter((path) => content.includes(path)).map((path) => `${relative(dir, file)}: ${path}`);
  });
  return { files: files.length, findings };
}

describe("trial candidates", () => {
  it("contain no personal path", () => {
    const { files, findings } = scanPersonalPaths(join(ROOT, "fixtures/trial-candidates"));
    // Un contrôle qui n'a rien lu n'a rien prouvé.
    expect(files).toBeGreaterThan(0);
    expect(findings).toEqual([]);
  });

  it("detects a personal path (witness)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-trial-candidates-"));
    mkdirSync(join(dir, "candidate/src"), { recursive: true });
    writeFileSync(join(dir, "candidate/src/clean.ts"), "export const x = 1;\n");
    writeFileSync(join(dir, "candidate/src/mac.ts"), "const p = '/Users/someone/work';\n");
    writeFileSync(join(dir, "session.jsonl"), '{"cwd":"/home/someone"}\n');
    expect(scanPersonalPaths(dir)).toEqual({ files: 3, findings: ["candidate/src/mac.ts: /Users/", "session.jsonl: /home/"] });
  });
});
