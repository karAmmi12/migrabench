// Modèle du fichier des utilisateurs (`fixtures/users.json`, ADR 0003) :
// deux utilisateurs fixes, un agent et un instructeur.

export const ROLES = ["agent", "instructeur"] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  username: string;
  password: string;
  role: Role;
}

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
