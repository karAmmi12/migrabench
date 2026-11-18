// Seam B : lecture statique du jeu de données, sans démarrer le legacy.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Dossier {
  number: string;
  status: string;
}

interface Dataset {
  dossiers: Dossier[];
  reservations: Record<string, string[]>;
}

const dataset: Dataset = JSON.parse(
  readFileSync(
    new URL("../../fixtures/legacy-app/src/main/resources/dossiers.json", import.meta.url),
    "utf8",
  ),
);

describe("dataset", () => {
  it("has unique numbers formatted as D- followed by four digits", () => {
    const numbers = dataset.dossiers.map((dossier) => dossier.number);

    expect(numbers.length).toBeGreaterThan(0);
    for (const number of numbers) expect(number).toMatch(/^D-\d{4}$/);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("shares dossiers D-0001 to D-0030 in read, covering the three statuses", () => {
    const shared = dataset.dossiers.filter((dossier) => !isReservedNumber(dossier.number));

    expect(shared.map((dossier) => dossier.number)).toEqual(
      Array.from({ length: 30 }, (_, index) => `D-${String(index + 1).padStart(4, "0")}`),
    );
    expect(new Set(shared.map((dossier) => dossier.status))).toEqual(
      new Set(["BROUILLON", "EN_INSTRUCTION", "REMIS"]),
    );
  });

  it("reserves dossiers from D-0101, each one to a single scenario or gate", () => {
    const reserved = dataset.dossiers
      .map((dossier) => dossier.number)
      .filter(isReservedNumber);
    const owners = (number: string) =>
      Object.keys(dataset.reservations).filter((name) =>
        dataset.reservations[name]?.includes(number),
      );

    expect(reserved[0]).toBe("D-0101");
    for (const number of reserved) expect({ number, owners: owners(number) }).toEqual({
      number,
      owners: [expect.any(String)],
    });
  });

  it("reserves only dossiers that exist in the reserved range", () => {
    const reserved = new Set(dataset.dossiers.map((dossier) => dossier.number).filter(isReservedNumber));

    for (const number of Object.values(dataset.reservations).flat()) {
      expect(reserved).toContain(number);
    }
  });
});

function isReservedNumber(number: string): boolean {
  return number >= "D-0101";
}
