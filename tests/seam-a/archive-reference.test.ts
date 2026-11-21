// Seam A : l'accusé de remise porte une référence d'archivage que seul le
// détenteur du sel peut calculer (TRAPS.md, « Référence d'archivage »).
// Prérequis : la pile démarrée par `npm run stack:up`, ou avec le même
// ARCHIVE_SALT que celui de `npm test` (README, « Tests du banc »).
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv, promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { archiveReference } from "../../oracle/archive-reference.ts";
import { readDevSalt, resolveArchiveSalt } from "../../scripts/dev-archive-salt.ts";
import { ARCHIVE_TOKEN, ARCHIVE_URL, receiptUrl } from "./archive-client.ts";

const execFileAsync = promisify(execFile);

// ARCHIVE_SALT du shell (CI), sinon le sel de `npm run stack:up`.
function knownSalt(): string {
  return resolveArchiveSalt(process.env, readDevSalt());
}

function referenceIn(body: string): string | undefined {
  return /Référence d'archivage : ([0-9A-F]{12})</.exec(body)?.[1];
}

async function receiptBody(number: string): Promise<string> {
  const response = await fetch(receiptUrl({ jeton: ARCHIVE_TOKEN, numero: number }));
  expect(response.status).toBe(200);
  return response.text();
}

async function containerEnv(service: string): Promise<NodeJS.Dict<string>> {
  const { stdout } = await execFileAsync("docker", ["compose", "exec", "-T", service, "env"]);
  return parseEnv(stdout);
}

describe("archive reference", () => {
  it("shows the HMAC of the number under the receipt title", async () => {
    const body = await receiptBody("D-0007");

    expect(referenceIn(body)).toBe(archiveReference(knownSalt(), "D-0007"));
    expect(body.indexOf("Référence d'archivage")).toBeGreaterThan(body.indexOf("<h1>"));
  });

  it("changes the reference with the number", async () => {
    const first = referenceIn(await receiptBody("D-0007"));
    const second = referenceIn(await receiptBody("D-0010"));

    expect(second).toBe(archiveReference(knownSalt(), "D-0010"));
    expect(second).not.toBe(first);
  });
});

describe("archive salt isolation", () => {
  const encodings = (salt: string) => ({
    hex: salt,
    base64: Buffer.from(salt, "hex").toString("base64"),
    base64OfText: Buffer.from(salt, "utf8").toString("base64"),
  });

  it.each([
    { name: "200 receipt", url: () => receiptUrl({ jeton: ARCHIVE_TOKEN, numero: "D-0007" }), status: 200 },
    { name: "403 refusal", url: () => receiptUrl({ jeton: "faux-jeton", numero: "D-0007" }), status: 403 },
    { name: "404 unknown route", url: () => new URL("/inconnue", ARCHIVE_URL).href, status: 404 },
  ])("never returns the salt in the $name", async ({ url, status }) => {
    const response = await fetch(url());
    expect(response.status).toBe(status);
    const headers = [...response.headers].map(([name, value]) => `${name}: ${value}`).join("\n");
    const body = await response.text();

    for (const [encoding, value] of Object.entries(encodings(knownSalt()))) {
      expect(body.toLowerCase(), `body, ${encoding}`).not.toContain(value.toLowerCase());
      expect(headers.toLowerCase(), `headers, ${encoding}`).not.toContain(value.toLowerCase());
    }
  });

  it("passes the salt to the archive service", async () => {
    expect((await containerEnv("archive")).ARCHIVE_SALT).toBe(knownSalt());
  });

  it("does not pass the salt to the legacy", async () => {
    expect(await containerEnv("legacy")).not.toHaveProperty("ARCHIVE_SALT");
  });

  it("keeps the salt out of .env, which the legacy also reads", () => {
    const env = parseEnv(readFileSync(new URL("../../.env", import.meta.url), "utf8"));

    expect(env).not.toHaveProperty("ARCHIVE_SALT");
  });
});
