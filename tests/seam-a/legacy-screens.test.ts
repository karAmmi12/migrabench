// Seam A : chaque écran du legacy répond aux deux rôles et refuse une
// requête sans identifiants. Les comportements fins des écrans relèvent de
// l'oracle (spec de l'étape 1, « Décisions de test »).
import { describe, expect, it } from "vitest";
import { ROLES } from "../../scripts/users.ts";
import { basicAuthHeader, LEGACY_URL, userWithRole } from "./legacy-client.ts";

// Dossier partagé en lecture : ces tests ne font que des GET.
const SCREENS = [
  { name: "dossier sheet", path: "/fiche.do?number=D-0001", title: "Fiche dossier" },
] as const;

describe.each(SCREENS)("$name screen", ({ path, title }) => {
  it.each(ROLES)("answers the %s", async (role) => {
    const response = await fetch(`${LEGACY_URL}${path}`, {
      headers: { Authorization: basicAuthHeader(userWithRole(role)) },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(title);
  });

  it("refuses a request without credentials", async () => {
    const response = await fetch(`${LEGACY_URL}${path}`, { redirect: "manual" });

    expect(response.status).toBe(401);
  });
});
