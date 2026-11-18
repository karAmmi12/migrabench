// Modèle du fichier des utilisateurs, sans démarrer le legacy.
import { describe, expect, it } from "vitest";
import { parseUsers } from "../scripts/users.ts";

describe("users file", () => {
  it("refuses an unknown role", () => {
    const json = JSON.stringify([{ username: "chef", password: "chef-mb", role: "admin" }]);

    expect(() => parseUsers(json)).toThrow('User #0: "role" must be one of agent, instructeur');
  });
});
