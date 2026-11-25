// Option `abort` de `spawnCommand` (#112) : un signal d'abandon arrête la
// commande par SIGKILL, même si elle ignore SIGTERM, et son code est rendu
// comme celui d'une commande en échec.
import { describe, expect, it } from "vitest";
import { spawnCommand } from "../shared/process.ts";

// Commande qui ignore SIGTERM et ne finit pas d'elle-même dans le test.
const STUBBORN = ["-c", "trap '' TERM INT; exec sleep 30"];

describe("spawnCommand abort", () => {
  it("kills a running command when the signal aborts, even if it ignores SIGTERM", async () => {
    const abort = new AbortController();
    const startedAt = Date.now();
    const run = spawnCommand("sh", STUBBORN, { allowFailure: true, abort: abort.signal });
    setTimeout(() => abort.abort(), 200);
    const { code } = await run;
    expect(code).toBe(1);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  }, 10_000);

  it("kills the command at once when the signal has already aborted", async () => {
    const startedAt = Date.now();
    const { code } = await spawnCommand("sh", STUBBORN, { allowFailure: true, abort: AbortSignal.abort() });
    expect(code).toBe(1);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  }, 10_000);

  it("rejects an aborted command without allowFailure", async () => {
    await expect(spawnCommand("sh", STUBBORN, { abort: AbortSignal.abort() })).rejects.toThrow("sh -c");
  }, 10_000);

  it("lets a command run to its end while the signal has not aborted", async () => {
    const { code, stdout } = await spawnCommand("sh", ["-c", "echo done"], { abort: new AbortController().signal });
    expect({ code, stdout }).toEqual({ code: 0, stdout: "done\n" });
  });
});
