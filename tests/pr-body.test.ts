// Retrait du code d'un corps de PR (#54), partagé par les deux contrôles du
// job « Fiche de formation » : comme GitHub, un mot-clé, un nombre ou un SHA
// écrit dans du code ne compte pas.
import { describe, expect, it } from "vitest";
import { stripCode } from "../scripts/pr-body.ts";

describe("stripCode", () => {
  it("removes fenced blocks, closed or not, with ``` or ~~~, and keeps the line count", () => {
    const body = ["avant", "```text", "Closes #1", "```", "entre", "~~~~", "Closes #2", "~~~~", "après", "```", "Closes #3"].join("\n");
    expect(stripCode(body).split("\n")).toEqual(["avant", "", "", "", "entre", "", "", "", "après", "", ""]);
  });

  it("removes inline code with one or more backticks", () => {
    expect(stripCode("a `Closes #1` b ``x ` y`` c")).toEqual("a   b   c");
  });

  it("removes inline code that spans two lines and keeps the line count", () => {
    expect(stripCode("- [x] `foo\n- [x] 12` bar").split("\n")).toEqual(["- [x]  ", " bar"]);
  });

  it("keeps the content of the inline code a caller chooses to keep", () => {
    expect(stripCode("commit `62bd7cd`, sortie `143 passed`", (code) => code === "62bd7cd")).toEqual("commit 62bd7cd, sortie  ");
  });
});
