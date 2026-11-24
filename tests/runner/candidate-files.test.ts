// Fichiers du candidat relevés à la préparation (spec de l'étape 3,
// « Exécution du candidat », #68) : un lien symbolique ou un fichier illisible
// est un défaut des fichiers fournis par le candidat, cité ensuite comme
// manquement du contrat. Le relevé ne lève jamais d'erreur pour eux : une
// erreur ferait planter la mesure (code 1), et le candidat échapperait à la mesure.
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { candidateFiles } from "../../runner/candidate-runtime.ts";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function candidate(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "migrabench-files-"));
  temporary.push(dir);
  await writeFile(join(dir, "server.js"), "console.log('ok');\n");
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "app.js"), "export {};\n");
  return dir;
}

describe("candidateFiles", () => {
  it("lists every file with its digest, and no defect, for a clean candidate", async () => {
    const listed = await candidateFiles(await candidate());

    expect(listed.files.map(({ path }) => path).sort()).toEqual(["server.js", "src/app.js"]);
    expect(listed.defects).toEqual([]);
  });

  it("reports a symbolic link as a defect, leaves it out of the files, and does not follow it", async () => {
    const dir = await candidate();
    await symlink("/etc/hosts", join(dir, "src", "link.js"));

    const listed = await candidateFiles(dir);

    expect(listed.files.map(({ path }) => path).sort()).toEqual(["server.js", "src/app.js"]);
    expect(listed.defects).toEqual(["The candidate contains a symbolic link: src/link.js"]);
  });

  it.skipIf(process.getuid?.() === 0)("reports an unreadable file as a defect and leaves it out of the files", async () => {
    const dir = await candidate();
    await writeFile(join(dir, "secret.js"), "x");
    await chmod(join(dir, "secret.js"), 0o000);

    const listed = await candidateFiles(dir);

    expect(listed.files.map(({ path }) => path).sort()).toEqual(["server.js", "src/app.js"]);
    expect(listed.defects).toHaveLength(1);
    expect(listed.defects[0]).toMatch(/^The candidate file cannot be read: secret\.js \(.*EACCES/);
  });
});
