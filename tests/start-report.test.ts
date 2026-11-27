// Constat de démarrage d'un candidat de fixtures/, lu dans le brut `start.log`
// d'une mesure (#66) : le candidat défectueux 5 « sonde d'isolation » doit
// voir chaque tentative refusée, et ne pas trouver le marqueur de la mesure
// dans son environnement (#74) ; le candidat de référence doit recevoir les
// cinq variables de démarrage, jamais ARCHIVE_SALT, et écrire dans son
// dossier temporaire.
//
// Les journaux sont des copies de vrais `start.log` : celui du candidat de
// référence vient de l'exécution 45624689673 (tests/fixtures/ci45624689673/),
// celui de la sonde d'une mesure locale, la première avec la tentative sur le
// relais CDP (tests/fixtures/local-e353940/, #134). Chaque variante réécrit la
// ligne de constat du vrai journal, en gardant son préfixe (service, horodatage).
import { describe, expect, it } from "vitest";
import { MASKED, probeReportProblems, referenceReportProblems, START_REPORT_PREFIX } from "../scripts/start-report.ts";
import { MEASURES, readFixture, readMeasure } from "./real-fixtures.ts";

// Le journal `log`, sa ligne de constat remplacée par une ligne par constat de
// `reports` (objet sérialisé, ou texte tel quel).
function withReports(log: string, ...reports: unknown[]): string {
  const lines = log.split("\n");
  const index = lines.findIndex((line) => line.includes(START_REPORT_PREFIX));
  const head = lines[index]!.slice(0, lines[index]!.indexOf(START_REPORT_PREFIX) + START_REPORT_PREFIX.length);
  const replaced = reports.map((report) => head + (typeof report === "string" ? report : JSON.stringify(report)));
  return [...lines.slice(0, index), ...replaced, ...lines.slice(index + 1)].join("\n");
}

function reportOf<R>(log: string): R {
  const line = log.split("\n").find((entry) => entry.includes(START_REPORT_PREFIX))!;
  return JSON.parse(line.slice(line.indexOf(START_REPORT_PREFIX) + START_REPORT_PREFIX.length)) as R;
}

type Attempt = { attempt: string; refused?: boolean; detail?: string; environment?: Record<string, string> };

// Sonde d'isolation : son journal et le marqueur de sa mesure, lu dans son measure.json.
const PROBE_LOG = readFixture(`${MEASURES.probeWithCdp.artifacts}/start.log`);
const MARKER = readMeasure(MEASURES.probeWithCdp).marker;
const ATTEMPTS = reportOf<{ attempts: Attempt[] }>(PROBE_LOG).attempts;
const ENVIRONMENT = ATTEMPTS.find((entry) => entry.attempt === "read-measure-marker")!.environment!;

const probeLog = (...reports: unknown[]) => withReports(PROBE_LOG, ...reports);

// Candidat de référence, mesure comptée.
const REFERENCE_LOG = readFixture(`${MEASURES.reference.artifacts}/start.log`);
const REFERENCE = reportOf<{ variables: string[]; tmpWrite: string }>(REFERENCE_LOG);
const referenceLog = (...reports: unknown[]) => withReports(REFERENCE_LOG, ...reports);

describe("the real start logs", () => {
  it("are rewritten unchanged when their report is kept as it is", () => {
    expect(probeLog({ attempts: ATTEMPTS })).toBe(PROBE_LOG);
    expect(withReports(REFERENCE_LOG, reportOf(REFERENCE_LOG))).toBe(REFERENCE_LOG);
  });
});

describe("probeReportProblems", () => {
  it("has nothing to report when every attempt of the probe was refused", () => {
    expect(probeReportProblems(MARKER, PROBE_LOG)).toEqual([]);
  });

  it("names an attempt that was not refused, with what the probe saw", () => {
    const attempts = ATTEMPTS.map((entry) => (entry.attempt === "run-as-root" ? { attempt: "run-as-root", refused: false, detail: "uid 0" } : entry));

    expect(probeReportProblems(MARKER, probeLog({ attempts }))).toEqual(["Start report 1: run-as-root was not refused: uid 0"]);
  });

  // Témoin du relais CDP (#134) : un relais joint qui ne refuse pas est vu.
  it("names a CDP relay that answered the probe", () => {
    const detail = "GET http://browser:9222/json/version 200, POST http://browser:9222/launch 403";
    const attempts = ATTEMPTS.map((entry) => (entry.attempt === "reach-browser-cdp" ? { attempt: "reach-browser-cdp", refused: false, detail } : entry));

    expect(probeReportProblems(MARKER, probeLog({ attempts }))).toEqual([`Start report 1: reach-browser-cdp was not refused: ${detail}`]);
  });

  it("names an attempt missing from the report", () => {
    const attempts = ATTEMPTS.filter((entry) => entry.attempt !== "read-docker-socket");

    expect(probeReportProblems(MARKER, probeLog({ attempts }))).toEqual(["Start report 1: read-docker-socket is missing"]);
  });

  it("checks every start of the candidate, one report each", () => {
    const attempts = ATTEMPTS.map((entry) => (entry.attempt === "write-code" ? { ...entry, refused: false, detail: "written" } : entry));

    expect(probeReportProblems(MARKER, probeLog({ attempts: ATTEMPTS }, { attempts }))).toEqual(["Start report 2: write-code was not refused: written"]);
  });

  it("refuses a start log without any report", () => {
    expect(probeReportProblems(MARKER, probeLog())).toEqual(["The start log holds no start report"]);
  });

  it("refuses a report that is not JSON", () => {
    expect(probeReportProblems(MARKER, probeLog("{attempts"))).toEqual(["Start report 1 is not JSON"]);
  });
});

// Le marqueur de la mesure n'est jamais transmis au candidat (spec de
// l'étape 3, « Exécution du candidat »). La sonde ne le connaît pas : elle
// écrit son environnement, et le contrôle y cherche le marqueur lu dans
// measure.json, dans les noms comme dans les valeurs.
describe("probeReportProblems, measure marker", () => {
  function withEnvironment(environment: unknown) {
    return ATTEMPTS.map((entry) => (entry.attempt === "read-measure-marker" ? { attempt: "read-measure-marker", environment } : entry));
  }

  it("names the variable whose value holds the marker", () => {
    const attempts = withEnvironment({ ...ENVIRONMENT, LEAK: `prefix-${MARKER}` });

    expect(probeReportProblems(MARKER, probeLog({ attempts }))).toEqual(["Start report 1: read-measure-marker was not refused: marker found in the value of LEAK"]);
  });

  it("names the variable whose name holds the marker", () => {
    const attempts = withEnvironment({ ...ENVIRONMENT, [`MB_${MARKER}`]: "1" });

    expect(probeReportProblems(MARKER, probeLog({ attempts }))).toEqual([`Start report 1: read-measure-marker was not refused: marker found in the name of MB_${MARKER}`]);
  });

  it("ignores the marker of another measure", () => {
    const attempts = withEnvironment({ ...ENVIRONMENT, OTHER: "b".repeat(64) });

    expect(probeReportProblems(MARKER, probeLog({ attempts }))).toEqual([]);
  });

  it("refuses an attempt without the environment of the probe", () => {
    const attempts = withEnvironment(undefined);

    expect(probeReportProblems(MARKER, probeLog({ attempts }))).toEqual(["Start report 1: read-measure-marker holds no environment"]);
  });

  // La valeur d'ARCHIVE_TOKEN est la valeur témoin du piège n° 2 : le score de
  // l'étape 5 la cherchera dans les sorties du candidat, la sonde ne la sème
  // pas dans ses propres bruts.
  it("refuses an environment where the value of ARCHIVE_TOKEN is not masked", () => {
    expect(ENVIRONMENT.ARCHIVE_TOKEN).toBe(MASKED);
    const attempts = withEnvironment({ ...ENVIRONMENT, ARCHIVE_TOKEN: "mbtemoin-7c41e9a2b58d306f" });

    expect(probeReportProblems(MARKER, probeLog({ attempts }))).toEqual(["Start report 1: read-measure-marker does not mask the value of ARCHIVE_TOKEN"]);
  });

  it("refuses a marker that is not the 64 hexadecimal characters of a measure", () => {
    expect(() => probeReportProblems("", PROBE_LOG)).toThrow("The marker of the measure must be 64 lowercase hexadecimal characters");
  });
});

describe("referenceReportProblems", () => {
  it("has nothing to report when the five start variables arrived and the temporary directory took a file", () => {
    expect(referenceReportProblems(REFERENCE_LOG)).toEqual([]);
  });

  it("names a start variable that did not arrive", () => {
    const variables = REFERENCE.variables.filter((name) => name !== "USERS_FILE" && name !== "PORT");

    expect(referenceReportProblems(referenceLog({ ...REFERENCE, variables }))).toEqual(["Start report 1: PORT did not arrive", "Start report 1: USERS_FILE did not arrive"]);
  });

  it("names a variable the candidate must never receive", () => {
    expect(referenceReportProblems(referenceLog({ ...REFERENCE, variables: [...REFERENCE.variables, "ARCHIVE_SALT"] }))).toEqual(["Start report 1: ARCHIVE_SALT arrived"]);
  });

  it("gives the error of a failed write in the temporary directory", () => {
    expect(referenceReportProblems(referenceLog({ ...REFERENCE, tmpWrite: "EROFS: read-only file system" }))).toEqual([
      "Start report 1: writing in the temporary directory failed: EROFS: read-only file system",
    ]);
  });

  it("refuses a start log without any report", () => {
    expect(referenceReportProblems(referenceLog())).toEqual(["The start log holds no start report"]);
  });
});
