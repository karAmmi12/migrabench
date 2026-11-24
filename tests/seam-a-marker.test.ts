// Marqueur du Seam A (spec de l'étape 3, « Journal d'accès ») : tiré par
// `npm test`, enregistré dans le dossier d'état du banc, relu par le runner.
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSeamAMarkers, registerSeamAMarker, SEAM_A_MARKER_MAX_AGE_MS } from "../shared/seam-a-marker.ts";

const tempDir = () => join(mkdtempSync(join(tmpdir(), "mb-seam-a-")), "seam-a-markers");

describe("Seam A marker", () => {
  it("draws a new 32-byte hexadecimal marker at each registration, and the runner reads them all", () => {
    const dir = tempDir();
    const first = registerSeamAMarker(dir);
    const second = registerSeamAMarker(dir);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
    expect(readSeamAMarkers(dir).sort()).toEqual([first, second].sort());
  });

  it("reads no marker when npm test never ran on the machine", () => {
    expect(readSeamAMarkers(tempDir())).toEqual([]);
  });

  it("ignores a file that is not a marker", () => {
    const dir = tempDir();
    const marker = registerSeamAMarker(dir);
    writeFileSync(join(dir, "notes.txt"), "");
    expect(readSeamAMarkers(dir)).toEqual([marker]);
  });

  it("forgets, at the next registration, a marker older than the longest possible measure", () => {
    const dir = tempDir();
    const old = registerSeamAMarker(dir);
    const past = (Date.now() - SEAM_A_MARKER_MAX_AGE_MS - 60_000) / 1000;
    utimesSync(join(dir, old), past, past);
    const recent = registerSeamAMarker(dir);
    expect(readSeamAMarkers(dir)).toEqual([recent]);
  });
});
