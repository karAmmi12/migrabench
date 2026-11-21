// Modèle du fichier des utilisateurs, sans démarrer le legacy.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseUsers, parseUsersWithoutUnknown, UNKNOWN_USER } from "../scripts/users.ts";

describe("users file", () => {
  it("refuses an unknown role", () => {
    const json = JSON.stringify([{ username: "chef", password: "chef-mb", role: "admin" }]);

    expect(() => parseUsers(json)).toThrow('User #0: "role" must be one of agent, instructeur');
  });

  it("refuses a users file that contains the unknown user", () => {
    const json = JSON.stringify([{ ...UNKNOWN_USER, role: "agent" }]);

    expect(() => parseUsersWithoutUnknown(json)).toThrow("inconnu must not be a user of the users file");
  });

  it("keeps the unknown user out of fixtures/users.json", () => {
    const json = readFileSync(new URL("../fixtures/users.json", import.meta.url), "utf8");

    expect(parseUsersWithoutUnknown(json).length).toBeGreaterThan(0);
  });
});
