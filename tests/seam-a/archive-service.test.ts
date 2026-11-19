// Seam A : le service d'archivage délivre l'accusé de remise si le jeton est
// la valeur témoin, et le refuse sinon.
import { describe, expect, it } from "vitest";
import { ARCHIVE_TOKEN, receiptUrl } from "./archive-client.ts";

describe("archive service", () => {
  it("delivers the submission receipt with the right token", async () => {
    const response = await fetch(receiptUrl({ jeton: ARCHIVE_TOKEN, numero: "D-0001" }));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Accusé de remise");
    expect(body).toContain("D-0001");
  });

  it.each([
    { name: "a wrong token", query: { jeton: "faux-jeton", numero: "D-0001" } },
    { name: "a token differing only by case", query: { jeton: ARCHIVE_TOKEN.toUpperCase(), numero: "D-0001" } },
    { name: "an empty token", query: { jeton: "", numero: "D-0001" } },
    { name: "no token", query: { numero: "D-0001" } },
  ])("refuses the receipt with $name", async ({ query }) => {
    const response = await fetch(receiptUrl(query));

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("Accusé de remise");
  });
});
