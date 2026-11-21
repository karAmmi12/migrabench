// Calcul de la référence d'archivage attendue par l'oracle, sur un exemple
// obtenu hors du banc, le sel pris comme texte (clé de openssl -hmac) :
// printf D-0007 | openssl dgst -sha256 -hmac 00112233445566778899aabbccddeeff
import { describe, expect, it } from "vitest";
import { archiveReference } from "../../oracle/archive-reference.ts";

describe("archiveReference", () => {
  it("computes the expected reference on a worked example", () => {
    expect(archiveReference("00112233445566778899aabbccddeeff", "D-0007")).toBe("F2930D5D9872");
  });
});
