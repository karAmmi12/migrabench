// Constat de démarrage d'un candidat de fixtures/, lu dans le brut `start.log`
// d'une mesure (#66) : le candidat défectueux 5 « sonde d'isolation » doit
// voir chaque tentative refusée ; le candidat de référence doit recevoir les
// cinq variables de démarrage, jamais ARCHIVE_SALT, et écrire dans son
// dossier temporaire.
import { describe, expect, it } from "vitest";
import { probeReportProblems, referenceReportProblems } from "../scripts/start-report.ts";

const REFUSED = [
  { attempt: "write-code", refused: true, detail: "EROFS: read-only file system, open '/candidate/probe-write'" },
  { attempt: "read-docker-socket", refused: true, detail: "ENOENT: no such file or directory, open '/var/run/docker.sock'" },
  { attempt: "reach-internal-api-during-build", refused: true, detail: "getaddrinfo EAI_AGAIN legacy" },
  { attempt: "read-archive-salt", refused: true, detail: "ARCHIVE_SALT is not set" },
  { attempt: "run-as-root", refused: true, detail: "uid 501" },
];

function line(report: unknown, at = "2026-11-24T15:00:00.000000000Z"): string {
  return `${at} migrabench start report ${JSON.stringify(report)}`;
}

function log(...lines: string[]): string {
  return ["2026-11-24T14:59:59.000000000Z isolation probe listening on 8100", ...lines, ""].join("\n");
}

describe("probeReportProblems", () => {
  it("has nothing to report when every attempt of the probe was refused", () => {
    expect(probeReportProblems(log(line({ attempts: REFUSED })))).toEqual([]);
  });

  it("names an attempt that was not refused, with what the probe saw", () => {
    const attempts = REFUSED.map((entry) => (entry.attempt === "run-as-root" ? { attempt: "run-as-root", refused: false, detail: "uid 0" } : entry));

    expect(probeReportProblems(log(line({ attempts })))).toEqual(["Start report 1: run-as-root was not refused: uid 0"]);
  });

  it("names an attempt missing from the report", () => {
    const attempts = REFUSED.filter((entry) => entry.attempt !== "read-docker-socket");

    expect(probeReportProblems(log(line({ attempts })))).toEqual(["Start report 1: read-docker-socket is missing"]);
  });

  it("checks every start of the candidate, one report each", () => {
    const attempts = REFUSED.map((entry) => (entry.attempt === "write-code" ? { ...entry, refused: false, detail: "written" } : entry));

    expect(probeReportProblems(log(line({ attempts: REFUSED }), line({ attempts })))).toEqual(["Start report 2: write-code was not refused: written"]);
  });

  it("refuses a start log without any report", () => {
    expect(probeReportProblems(log())).toEqual(["The start log holds no start report"]);
  });

  it("refuses a report that is not JSON", () => {
    expect(probeReportProblems(log("2026-11-24T15:00:00.000000000Z migrabench start report {attempts"))).toEqual(["Start report 1 is not JSON"]);
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
