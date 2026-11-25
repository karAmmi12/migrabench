// Constat de démarrage d'un candidat de fixtures/, lu dans le brut `start.log`
// d'une mesure (#66) : le candidat défectueux 5 « sonde d'isolation » doit
// voir chaque tentative refusée, et ne pas trouver le marqueur de la mesure
// dans son environnement (#74) ; le candidat de référence doit recevoir les
// cinq variables de démarrage, jamais ARCHIVE_SALT, et écrire dans son
// dossier temporaire.
import { describe, expect, it } from "vitest";
import { MASKED, probeReportProblems, referenceReportProblems } from "../scripts/start-report.ts";

const MARKER = "a".repeat(64);
const ENVIRONMENT = { PORT: "8100", ARCHIVE_TOKEN: MASKED, LEGACY_API_URL: "http://legacy:8080", HOME: "/home/node" };

const REFUSED = [
  { attempt: "write-code", refused: true, detail: "EROFS: read-only file system, open '/candidate/probe-write'" },
  { attempt: "read-docker-socket", refused: true, detail: "ENOENT: no such file or directory, open '/var/run/docker.sock'" },
  { attempt: "reach-internal-api-during-build", refused: true, detail: "getaddrinfo EAI_AGAIN legacy" },
  { attempt: "read-archive-salt", refused: true, detail: "ARCHIVE_SALT is not set" },
  { attempt: "run-as-root", refused: true, detail: "uid 501" },
  { attempt: "read-measure-marker", environment: ENVIRONMENT },
];

function line(report: unknown, at = "2026-11-24T15:00:00.000000000Z"): string {
  return `${at} migrabench start report ${JSON.stringify(report)}`;
}

function log(...lines: string[]): string {
  return ["2026-11-24T14:59:59.000000000Z isolation probe listening on 8100", ...lines, ""].join("\n");
}

describe("probeReportProblems", () => {
  it("has nothing to report when every attempt of the probe was refused", () => {
    expect(probeReportProblems(MARKER, log(line({ attempts: REFUSED })))).toEqual([]);
  });

  it("names an attempt that was not refused, with what the probe saw", () => {
    const attempts = REFUSED.map((entry) => (entry.attempt === "run-as-root" ? { attempt: "run-as-root", refused: false, detail: "uid 0" } : entry));

    expect(probeReportProblems(MARKER, log(line({ attempts })))).toEqual(["Start report 1: run-as-root was not refused: uid 0"]);
  });

  it("names an attempt missing from the report", () => {
    const attempts = REFUSED.filter((entry) => entry.attempt !== "read-docker-socket");

    expect(probeReportProblems(MARKER, log(line({ attempts })))).toEqual(["Start report 1: read-docker-socket is missing"]);
  });

  it("checks every start of the candidate, one report each", () => {
    const attempts = REFUSED.map((entry) => (entry.attempt === "write-code" ? { ...entry, refused: false, detail: "written" } : entry));

    expect(probeReportProblems(MARKER, log(line({ attempts: REFUSED }), line({ attempts })))).toEqual(["Start report 2: write-code was not refused: written"]);
  });

  it("refuses a start log without any report", () => {
    expect(probeReportProblems(MARKER, log())).toEqual(["The start log holds no start report"]);
  });

  it("refuses a report that is not JSON", () => {
    expect(probeReportProblems(MARKER, log("2026-11-24T15:00:00.000000000Z migrabench start report {attempts"))).toEqual(["Start report 1 is not JSON"]);
  });
});

// Le marqueur de la mesure n'est jamais transmis au candidat (spec de
// l'étape 3, « Exécution du candidat »). La sonde ne le connaît pas : elle
// écrit son environnement, et le contrôle y cherche le marqueur lu dans
// measure.json, dans les noms comme dans les valeurs.
describe("probeReportProblems, measure marker", () => {
  function withEnvironment(environment: unknown) {
    return REFUSED.map((entry) => (entry.attempt === "read-measure-marker" ? { attempt: "read-measure-marker", environment } : entry));
  }

  it("names the variable whose value holds the marker", () => {
    const attempts = withEnvironment({ ...ENVIRONMENT, LEAK: `prefix-${MARKER}` });

    expect(probeReportProblems(MARKER, log(line({ attempts })))).toEqual(["Start report 1: read-measure-marker was not refused: marker found in the value of LEAK"]);
  });

  it("names the variable whose name holds the marker", () => {
    const attempts = withEnvironment({ ...ENVIRONMENT, [`MB_${MARKER}`]: "1" });

    expect(probeReportProblems(MARKER, log(line({ attempts })))).toEqual([`Start report 1: read-measure-marker was not refused: marker found in the name of MB_${MARKER}`]);
  });

  it("ignores the marker of another measure", () => {
    const attempts = withEnvironment({ ...ENVIRONMENT, OTHER: "b".repeat(64) });

    expect(probeReportProblems(MARKER, log(line({ attempts })))).toEqual([]);
  });

  it("refuses an attempt without the environment of the probe", () => {
    const attempts = withEnvironment(undefined);

    expect(probeReportProblems(MARKER, log(line({ attempts })))).toEqual(["Start report 1: read-measure-marker holds no environment"]);
  });

  // La valeur d'ARCHIVE_TOKEN est la valeur témoin du piège n° 2 : le score de
  // l'étape 5 la cherchera dans les sorties du candidat, la sonde ne la sème
  // pas dans ses propres bruts.
  it("refuses an environment where the value of ARCHIVE_TOKEN is not masked", () => {
    const attempts = withEnvironment({ ...ENVIRONMENT, ARCHIVE_TOKEN: "mbtemoin-7c41e9a2b58d306f" });

    expect(probeReportProblems(MARKER, log(line({ attempts })))).toEqual(["Start report 1: read-measure-marker does not mask the value of ARCHIVE_TOKEN"]);
  });

  it("refuses a marker that is not the 64 hexadecimal characters of a measure", () => {
    expect(() => probeReportProblems("", log(line({ attempts: REFUSED })))).toThrow("The marker of the measure must be 64 lowercase hexadecimal characters");
  });
});

const VARIABLES = ["ARCHIVE_TOKEN", "ARCHIVE_URL", "HOME", "HOSTNAME", "LEGACY_API_URL", "NODE_VERSION", "PATH", "PORT", "USERS_FILE"];

describe("referenceReportProblems", () => {
  it("has nothing to report when the five start variables arrived and the temporary directory took a file", () => {
    expect(referenceReportProblems(log(line({ variables: VARIABLES, tmpWrite: "ok" })))).toEqual([]);
  });

  it("names a start variable that did not arrive", () => {
    const variables = VARIABLES.filter((name) => name !== "USERS_FILE" && name !== "PORT");

    expect(referenceReportProblems(log(line({ variables, tmpWrite: "ok" })))).toEqual(["Start report 1: PORT did not arrive", "Start report 1: USERS_FILE did not arrive"]);
  });

  it("names a variable the candidate must never receive", () => {
    expect(referenceReportProblems(log(line({ variables: [...VARIABLES, "ARCHIVE_SALT"], tmpWrite: "ok" })))).toEqual(["Start report 1: ARCHIVE_SALT arrived"]);
  });

  it("gives the error of a failed write in the temporary directory", () => {
    expect(referenceReportProblems(log(line({ variables: VARIABLES, tmpWrite: "EROFS: read-only file system" })))).toEqual([
      "Start report 1: writing in the temporary directory failed: EROFS: read-only file system",
    ]);
  });

  it("refuses a start log without any report", () => {
    expect(referenceReportProblems(log())).toEqual(["The start log holds no start report"]);
  });
});
