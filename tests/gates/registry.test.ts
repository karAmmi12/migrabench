// Registre des portes (spec de l'étape 4, « Registre, contexte et ordre ») :
// ordre fixe, issue `errored` et son `stage` posé par le runner selon la
// partie qui a levé l'erreur, délai de chaque porte et de la phase.
import { describe, expect, it } from "vitest";
import { type GateContext, StackIncident } from "../../gates/context.ts";
import { checkGateOrder, type Gate, GATES, gatesOf, runGates, ToolMissing } from "../../gates/registry.ts";
import { type GateResult, judged, measured } from "../../gates/result.ts";

// Le contexte n'est pas lu par les portes de test.
const CONTEXT = {} as GateContext;

function gate(overrides: Partial<Gate>): Gate {
  return {
    name: "test",
    group: "files",
    results: { only: "judged" },
    timeoutMs: 1_000,
    examine: async () => [judged({ gate: "test", name: "only", examined: 1, passed: true })],
    ...overrides,
  };
}

const never = () => new Promise<never>(() => {});

describe("registry order", () => {
  it("is files, browser that reads, writes, then relay", () => {
    expect(() => checkGateOrder(GATES)).not.toThrow();
    expect(GATES.at(-1)?.name).toBe("relay");
  });

  // Témoin : un registre dans le désordre est refusé.
  it("refuses a gate of an earlier group after a later one", () => {
    const gates = [gate({ name: "writer", group: "writes" }), gate({ name: "reader", group: "browser-read" })];
    expect(() => checkGateOrder(gates)).toThrow("Gate reader (browser-read) comes after gate writer (writes)");
  });

  it("refuses two gates with the same name", () => {
    expect(() => checkGateOrder([gate({}), gate({})])).toThrow("Gate test is registered twice");
  });

  it("runs the relay in the closing, every other gate in the gates phase", () => {
    const gates = [gate({ name: "a", group: "files" }), gate({ name: "b", group: "writes" }), gate({ name: "relay", group: "relay" })];
    expect(gatesOf(gates, "gates").map(({ name }) => name)).toEqual(["a", "b"]);
    expect(gatesOf(gates, "closing").map(({ name }) => name)).toEqual(["relay"]);
  });
});

describe("runGates", () => {
  it("returns the results of each gate, in the registry order", async () => {
    const gates = [
      gate({ name: "first", results: { a: "judged" }, examine: async () => [judged({ gate: "first", name: "a", examined: 2, passed: false })] }),
      gate({ name: "second", results: { b: "measured" }, examine: async () => [measured({ gate: "second", name: "b", examined: 3, values: { bytes: 9 } })] }),
    ];
    expect((await runGates(gates, CONTEXT)).map(({ gate, name, outcome }) => [gate, name, outcome])).toEqual([
      ["first", "a", "failed"],
      ["second", "b", "measured"],
    ]);
  });

  // Une porte de test qui n'examine aucun élément.
  it("gives not-evaluable to a gate that examined 0 element", async () => {
    const results = await runGates([gate({ examine: async () => [judged({ gate: "test", name: "only", examined: 0, passed: true })] })], CONTEXT);
    expect(results).toMatchObject([{ outcome: "not-evaluable", examined: 0 }]);
  });

  it("passes what the preparation returned to the examination", async () => {
    const examined = gate({
      prepare: async () => 7,
      examine: async (_context, prepared) => [judged({ gate: "test", name: "only", examined: prepared as number, passed: true })],
    });
    expect(await runGates([examined], CONTEXT)).toMatchObject([{ examined: 7 }]);
  });

  it("gives errored before-candidate, cause exception, to every named result of a gate whose preparation threw", async () => {
    const results = await runGates(
      [gate({ results: { a: "judged", b: "measured" }, prepare: async () => { throw new Error("bench input missing"); } })],
      CONTEXT,
    );
    expect(results).toEqual([
      expect.objectContaining({ name: "a", kind: "judged", outcome: "errored", examined: 0, error: { stage: "before-candidate", cause: "exception", message: "bench input missing" } }),
      expect.objectContaining({ name: "b", kind: "measured", outcome: "errored", examined: 0, error: { stage: "before-candidate", cause: "exception", message: "bench input missing" } }),
    ]);
  });

  it("gives errored on-candidate, cause exception, when the examination threw", async () => {
    const results = await runGates([gate({ examine: async () => { throw new Error("page never loaded"); } })], CONTEXT);
    expect(results).toMatchObject([{ outcome: "errored", error: { stage: "on-candidate", cause: "exception", message: "page never loaded" } }]);
  });

  it("gives cause tool-missing to a missing tool, at the stage where it was found", async () => {
    const before = await runGates([gate({ prepare: async () => { throw new ToolMissing("osv-scanner not found"); } })], CONTEXT);
    const on = await runGates([gate({ examine: async () => { throw new ToolMissing("tsc not found"); } })], CONTEXT);
    expect(before).toMatchObject([{ error: { stage: "before-candidate", cause: "tool-missing", message: "osv-scanner not found" } }]);
    expect(on).toMatchObject([{ error: { stage: "on-candidate", cause: "tool-missing", message: "tsc not found" } }]);
  });

  it("gives cause timeout to a gate past its timeout, at the stage where it was", async () => {
    const before = await runGates([gate({ timeoutMs: 20, prepare: never })], CONTEXT);
    const on = await runGates([gate({ timeoutMs: 20, examine: never })], CONTEXT);
    expect(before).toMatchObject([{ outcome: "errored", error: { stage: "before-candidate", cause: "timeout", message: "Gate test exceeded its timeout of 20 ms" } }]);
    expect(on).toMatchObject([{ outcome: "errored", error: { stage: "on-candidate", cause: "timeout", message: "Gate test exceeded its timeout of 20 ms" } }]);
  });

  it("aborts the signal given to a gate past its timeout", async () => {
    let signal: AbortSignal | undefined;
    await runGates([gate({ timeoutMs: 20, examine: async (context) => { signal = context.signal; return never(); } })], CONTEXT);
    expect(signal?.aborted).toBe(true);
  });

  // Le temps de la phase a été pris par l'examen des portes précédentes, que
  // le candidat a pu ralentir : jamais une erreur avant le candidat.
  it("gives cause timeout on-candidate to a gate reached after the deadline of the phase, without running it", async () => {
    let ran = false;
    const results = await runGates([gate({ examine: async () => { ran = true; return []; } })], CONTEXT, { deadline: Date.now() - 1 });
    expect(ran).toBe(false);
    expect(results).toMatchObject([{ outcome: "errored", error: { stage: "on-candidate", cause: "timeout", message: "Gate test not run: the gates phase exceeded its deadline" } }]);
  });

  it("cuts a gate at the deadline of the phase when it comes before its own timeout", async () => {
    const results = await runGates([gate({ timeoutMs: 60_000, examine: never })], CONTEXT, { deadline: Date.now() + 20 });
    expect(results).toMatchObject([{ error: { stage: "on-candidate", cause: "timeout" } }]);
  });

  // Spec de l'étape 3 : le runner relève l'état de la pile après chaque porte.
  it("calls afterEach after each gate, and stops at its error", async () => {
    const calls: string[] = [];
    const gates = [gate({ name: "a", examine: async () => (calls.push("a"), [judged({ gate: "a", name: "only", examined: 1, passed: true })]) }), gate({ name: "b" })];
    const down = new Error("legacy restarted");
    await expect(runGates(gates, CONTEXT, { afterEach: async (done) => { calls.push(`after ${done.name}`); throw down; } })).rejects.toBe(down);
    expect(calls).toEqual(["a", "after a"]);
  });

  // Un redémarrage du legacy qui échoue est une panne de la pile, jamais une
  // erreur de porte.
  it("lets an incident of the stack through", async () => {
    const incident = new StackIncident("stack-failed-before-candidate", "legacy unhealthy");
    await expect(runGates([gate({ examine: async () => { throw incident; } })], CONTEXT)).rejects.toBe(incident);
  });

  // Une panne de la pile n'efface pas ce que les portes précédentes ont examiné.
  it("keeps the results of the gates already run in the given list when a stack incident is thrown", async () => {
    const results: GateResult[] = [];
    const gates = [
      gate({ name: "first", examine: async () => [judged({ gate: "first", name: "only", examined: 2, passed: false })] }),
      gate({ name: "second", examine: async () => { throw new StackIncident("stack-failed-before-candidate", "legacy unhealthy"); } }),
    ];
    await expect(runGates(gates, CONTEXT, { results })).rejects.toBeInstanceOf(StackIncident);
    expect(results.map(({ gate, outcome }) => [gate, outcome])).toEqual([["first", "failed"]]);
  });

  it("refuses results that do not match the declared named results", async () => {
    const missing = gate({ results: { a: "judged", b: "judged" }, examine: async () => [judged({ gate: "test", name: "a", examined: 1, passed: true })] });
    const wrongKind = gate({ results: { a: "judged" }, examine: async () => [measured({ gate: "test", name: "a", examined: 1 })] });
    const wrongGate = gate({ results: { a: "judged" }, examine: async () => [judged({ gate: "other", name: "a", examined: 1, passed: true })] });
    await expect(runGates([missing], CONTEXT)).rejects.toThrow("Gate test returned a, expected a, b");
    await expect(runGates([wrongKind], CONTEXT)).rejects.toThrow("Gate test returned a as measured, declared judged");
    await expect(runGates([wrongGate], CONTEXT)).rejects.toThrow("Gate test returned a result of gate other");
  });
});
