// Modèle du fichier des utilisateurs (`fixtures/users.json`, ADR 0003) :
// deux utilisateurs fixes, un agent et un instructeur.

export const ROLES = ["agent", "instructeur"] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  username: string;
  password: string;
  role: Role;
}

// Tomcat bloque un nom d'utilisateur après 5 échecs consécutifs, 5 minutes par
// défaut (LockOutRealm de server.xml, laissé en place). Les faux identifiants
// (tests du Seam A, oracle) visent donc toujours ce nom, absent de
// fixtures/users.json, jamais l'agent ni l'instructeur : ils ne peuvent pas
// bloquer un compte dont dépendent les autres tests, l'oracle ou les portes.
export const UNKNOWN_USER = { username: "inconnu", password: "inconnu-mb" } as const;

const FIELDS = ["username", "password", "role"] as const satisfies readonly (keyof User)[];

export function parseUsers(json: string): User[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error("Users file must be a JSON array");
  return data.map((entry: unknown, index) => {
    const user = entry as Partial<Record<keyof User, unknown>>;
    for (const field of FIELDS) {
      if (typeof user[field] !== "string" || user[field] === "") {
        throw new Error(`User #${index}: "${field}" must be a non-empty string`);
      }
    }
    if (!(ROLES as readonly unknown[]).includes(user.role)) {
      throw new Error(`User #${index}: "role" must be one of ${ROLES.join(", ")}`);
    }
    return user as User;
  });
}

// Lit le fichier des utilisateurs et vérifie que UNKNOWN_USER n'en fait pas partie.
export function parseUsersWithoutUnknown(json: string): User[] {
  const users = parseUsers(json);
  if (users.some((user) => user.username === UNKNOWN_USER.username)) {
    throw new Error(`${UNKNOWN_USER.username} must not be a user of the users file`);
  }
  return users;
}
