// Utilisateur des conteneurs du candidat (ADR 0007) : celui qui lance le
// runner, jamais root.
import { describe, expect, it } from "vitest";
import { containerUser } from "../../runner/container-user.ts";

describe("containerUser", () => {
  it("is the uid and gid of the user who runs the measure", () => {
    expect(containerUser(501, 20)).toEqual({ uid: 501, gid: 20 });
    expect(containerUser(1001, 118)).toEqual({ uid: 1001, gid: 118 });
  });

  it("refuses a measure run as root", () => {
    expect(() => containerUser(0, 0)).toThrow(/root/);
  });

  it("refuses a platform without uid and gid", () => {
    expect(() => containerUser(undefined, undefined)).toThrow(/uid/);
  });
});
