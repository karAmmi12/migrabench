// Les messages attendus par les scénarios de la fiche sont le texte exact de
// ApplicationResources.properties du legacy (spec de l'étape 2, F7 à F10).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHEET_MESSAGES } from "../../oracle/messages.ts";

// Fichier .properties lu par Java 8 : une clé=valeur par ligne, \uXXXX décodés.
function legacyMessages(): Map<string, string> {
  const text = readFileSync(
    new URL("../../fixtures/legacy-app/src/main/resources/fr/migrabench/legacy/ApplicationResources.properties", import.meta.url),
    "latin1",
  );
  const messages = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    const value = line.slice(separator + 1).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    messages.set(line.slice(0, separator), value);
  }
  return messages;
}

describe("SHEET_MESSAGES", () => {
  it.each([
    ["applicantRequired", "errors.sheet.applicant.required"],
    ["applicantMaxlength", "errors.sheet.applicant.maxlength"],
    ["subjectRequired", "errors.sheet.subject.required"],
    ["subjectMaxlength", "errors.sheet.subject.maxlength"],
  ] as const)("%s is the exact text of %s", (name, key) => {
    expect(SHEET_MESSAGES[name]).toBe(legacyMessages().get(key));
  });
});
