// Seam B : lecture statique du jeu de données, sans démarrer le legacy.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";

interface Dossier {
  number: string;
  status: string;
  filedOn: string;
  submittedOn?: string;
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

// Horloge figée transmise par le banc au legacy, lue dans le .env que lit
// aussi docker compose. Les dates ISO aaaa-mm-jj se comparent comme des chaînes.
const FROZEN_DATE = frozenDateOf(
  parseEnv(readFileSync(new URL("../../.env", import.meta.url), "utf8")),
);

function frozenDateOf(env: NodeJS.Dict<string>): string {
  const date = env.FROZEN_DATE;
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`FROZEN_DATE in .env is not an ISO date (yyyy-mm-dd): ${date}`);
  }
  return date;
}

describe("dataset", () => {
  it("has unique numbers formatted as D- followed by four digits", () => {
    const numbers = dataset.dossiers.map((dossier) => dossier.number);

    expect(numbers.length).toBeGreaterThan(0);
    for (const number of numbers) expect(number).toMatch(/^D-\d{4}$/);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("shares dossiers D-0001 to D-0030 read-only, covering the three statuses", () => {
    const shared = dataset.dossiers.filter((dossier) => !isReservedNumber(dossier.number));

    expect(shared.map((dossier) => dossier.number)).toEqual(
      Array.from({ length: 30 }, (_, index) => `D-${String(index + 1).padStart(4, "0")}`),
    );
    expect(new Set(shared.map((dossier) => dossier.status))).toEqual(
      new Set(["BROUILLON", "EN_INSTRUCTION", "REMIS"]),
    );
  });

  it("starts reserved dossiers at D-0101", () => {
    const reserved = dataset.dossiers.map((dossier) => dossier.number).filter(isReservedNumber);

    expect(reserved).toContain("D-0101");
    for (const number of reserved) expect(sequenceOf(number)).toBeGreaterThanOrEqual(101);
  });

  it("assigns each reserved dossier to exactly one scenario or gate", () => {
    const reserved = dataset.dossiers.map((dossier) => dossier.number).filter(isReservedNumber);

    for (const number of reserved) {
      const owners = Object.keys(dataset.reservations).filter((name) =>
        dataset.reservations[name]?.includes(number),
      );
      expect(owners, `owners of ${number}`).toHaveLength(1);
    }
  });

  it("gives a submission date to REMIS dossiers, and to them only", () => {
    for (const dossier of dataset.dossiers) {
      expect(dossier.submittedOn !== undefined, `submission date of ${dossier.number}`).toBe(
        dossier.status === "REMIS",
      );
    }
  });

  it("dates filings and submissions on or before the frozen clock, submissions after filings", () => {
    for (const dossier of dataset.dossiers) {
      expect(dossier.filedOn <= FROZEN_DATE, `filing date of ${dossier.number}`).toBe(true);
      if (dossier.submittedOn === undefined) continue;
      expect(dossier.submittedOn >= dossier.filedOn, `submission date of ${dossier.number}`).toBe(true);
      expect(dossier.submittedOn <= FROZEN_DATE, `submission date of ${dossier.number}`).toBe(true);
    }
  });

  it("reserves D-0116, REMIS with a submission date, to scenario:sheet-ctrl-s-remis alone", () => {
    const dossier = dataset.dossiers.find((entry) => entry.number === "D-0116");

    expect(dossier?.status).toBe("REMIS");
    expect(dossier?.submittedOn).toBeDefined();
    expect(dataset.reservations["scenario:sheet-ctrl-s-remis"]).toEqual(["D-0116"]);
  });

  it("reserves only dossiers that exist in the reserved range", () => {
    const reserved = new Set(dataset.dossiers.map((dossier) => dossier.number).filter(isReservedNumber));

    for (const number of Object.values(dataset.reservations).flat()) {
      expect(reserved).toContain(number);
    }
  });
});

// Les dossiers partagés vont jusqu'à D-0030 ; tout numéro au-delà est réservé.
function isReservedNumber(number: string): boolean {
  return sequenceOf(number) > 30;
}

function sequenceOf(number: string): number {
  return Number(number.slice("D-".length));
}
