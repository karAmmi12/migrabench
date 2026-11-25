// Fin de `npm run oracle` (#52) : la dernière ligne rappelle que la pile tourne
// avec le sel de cette exécution, et qu'il faut relancer `npm run stack:up`
// avant `npm test`. Elle ne cite aucun sel.
import { describe, expect, it } from "vitest";
import { closingLines } from "../../oracle/closing-lines.ts";
import { MEASURES, readMeasure } from "../real-fixtures.ts";

// Résumé de l'oracle de la vraie mesure comptée du candidat de référence
// (exécution 45624689673, tests/fixtures/ci45624689673/PROVENANCE.md).
const summary = readMeasure(MEASURES.reference).oracle.summary!;

describe("closingLines", () => {
  it("ends with the reminder to run `npm run stack:up` before `npm test`", () => {
    const lines = closingLines({ resultFile: "results/oracle.json", summary, saltImposed: false });

    expect(lines.at(-1)).toBe(
      "The stack now runs with this oracle execution's salt: run `npm run stack:up` before `npm test`.",
    );
  });

  it("keeps the reminder last on a diagnostic run, and never cites the salt", () => {
    const lines = closingLines({ resultFile: "results/oracle.json", summary, saltImposed: true });

    expect(lines).toContain("Salt imposed: diagnostic run, not a measurement.");
    expect(lines.at(-1)).toMatch(/npm run stack:up/);
    // closingLines ne reçoit pas le sel : aucune ligne ne peut porter de valeur hexadécimale.
    expect(lines.join("\n")).not.toMatch(/[0-9a-f]{16,}/);
  });

  it("reports the result file and the summary before the reminder", () => {
    const lines = closingLines({ resultFile: "results/oracle.json", summary, saltImposed: false });

    expect(lines.slice(0, -1)).toEqual([
      "Result: results/oracle.json",
      "Scenarios: 38, passed: 38, failed: 0, unreached: 0",
    ]);
  });
});
