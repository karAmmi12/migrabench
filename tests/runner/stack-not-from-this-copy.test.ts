// Mesure dont les images de la pile ont été construites depuis une autre copie
// du dépôt (#102) : invalide, `stack-not-from-this-copy`, dès la préparation,
// avant tout code du candidat et sans toucher à la pile.
//
// Sans la pile : un faux `docker`, placé en tête du PATH, remplace Docker. Il
// construit l'image d'exécution pour rien, donne un nombre de CPU, et rend
// pour les images de la pile un label étranger à cette copie. Tout autre appel
// échoue. Il note chaque appel.
//
// Le verrou du banc est pris dans un XDG_STATE_HOME temporaire (#92), comme
// dans tests/runner/bench-lock-tools.test.ts : `npm test` tient le réel.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "../../runner/paths.ts";
import { ARTIFACTS_DIR_FROM_ROOT, ROOT } from "../../shared/root.ts";

const FOREIGN = `sha256:${"0".repeat(64)}`;
const STATE_HOME = mkdtempSync(join(tmpdir(), "mb-state-"));
const stubDir = mkdtempSync(join(tmpdir(), "mb-docker-stub-"));
const stubLog = join(stubDir, "calls.log");
writeFileSync(
  join(stubDir, "docker"),
  `#!/bin/sh
echo "$*" >> "${stubLog}"
case "$*" in
  "build "*) exit 0 ;;
  "info "*) echo 8; exit 0 ;;
  "image inspect "*migrabench-runtime) echo "sha256:${"r".repeat(64)}"; exit 0 ;;
  "image inspect "*migrabench-legacy|"image inspect "*migrabench-archive)
    echo '{"image":"sha256:${"a".repeat(64)}","labels":{"org.migrabench.context-digest":"${FOREIGN}"}}'; exit 0 ;;
esac
echo "docker stub: unexpected call" >&2
exit 97
`,
);
chmodSync(join(stubDir, "docker"), 0o755);

function entries(): string[] {
  return [DIAGNOSTIC_DIR_FROM_ROOT, ARTIFACTS_DIR_FROM_ROOT].flatMap((dir) =>
    existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).map((name) => join(dir, name)) : [],
  );
}

const before = entries();

afterAll(() => {
  for (const entry of entries()) if (!before.includes(entry)) rmSync(join(ROOT, entry), { recursive: true, force: true });
  rmSync(STATE_HOME, { recursive: true, force: true });
  rmSync(stubDir, { recursive: true, force: true });
});

describe("measure on a stack built from another copy of the repository", { timeout: 60_000 }, () => {
  it("is invalid, stack-not-from-this-copy, from the preparation, before any candidate code and without touching the stack", () => {
    const { ORACLE_SALT: _oracleSalt, ...inherited } = process.env;
    const { status } = spawnSync(process.execPath, ["runner/cli.ts", "measure", "--candidate", "fixtures/reference-candidate"], {
      cwd: ROOT,
      env: { ...inherited, PATH: `${stubDir}:${process.env.PATH}`, XDG_STATE_HOME: STATE_HOME },
      encoding: "utf8",
    });

    expect(status).toBe(3);
    const written = entries().filter((entry) => !before.includes(entry) && entry.startsWith(DIAGNOSTIC_DIR_FROM_ROOT));
    expect(written).toHaveLength(1);
    const measure = JSON.parse(readFileSync(join(ROOT, written[0]!, "measure.json"), "utf8"));
    expect(measure.verdict).toMatchObject({ category: "invalid", reason: "stack-not-from-this-copy" });
    expect(measure.verdict.evidence).toContain(`legacy image sha256:${"a".repeat(64)} carries ${FOREIGN}, this copy gives sha256:`);
    expect(measure.verdict.evidence).toContain("npm run stack:up");
    expect(measure.phases.map(({ name, outcome }: { name: string; outcome: string }) => `${name}:${outcome}`)).toEqual([
      "preparation:stack-not-from-this-copy",
      "contract:not-run",
      "build:not-run",
      "start:not-run",
      "oracle:not-run",
      "gates:not-run",
      "closing:ok",
    ]);
    // Ni conteneur lancé (candidat ou construction), ni pile recréée.
    const calls = readFileSync(stubLog, "utf8").trim().split("\n");
    expect(calls.filter((call) => /^(run|compose|create|start) /.test(call))).toEqual([]);
  });
});
