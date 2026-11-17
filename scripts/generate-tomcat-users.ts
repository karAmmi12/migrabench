// Génère le `tomcat-users.xml` du legacy à partir du fichier des utilisateurs
// (ADR 0003). Exécuté pendant le build Docker du legacy :
//   node --experimental-strip-types generate-tomcat-users.ts <users.json> <tomcat-users.xml>
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface User {
  username: string;
  password: string;
  role: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function parseUsers(json: string): User[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error("Users file must be a JSON array");
  return data.map((entry: unknown, index) => {
    const user = entry as Partial<Record<keyof User, unknown>>;
    for (const field of ["username", "password", "role"] as const) {
      if (typeof user[field] !== "string" || user[field] === "") {
        throw new Error(`User #${index}: "${field}" must be a non-empty string`);
      }
    }
    return user as User;
  });
}

export function toTomcatUsersXml(users: User[]): string {
  const roles = [...new Set(users.map((user) => user.role))];
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!-- Généré depuis fixtures/users.json : ne pas modifier à la main. -->",
    '<tomcat-users xmlns="http://tomcat.apache.org/xml" version="1.0">',
    ...roles.map((role) => `  <role rolename="${escapeXml(role)}"/>`),
    ...users.map(
      (user) =>
        `  <user username="${escapeXml(user.username)}" password="${escapeXml(user.password)}" roles="${escapeXml(user.role)}"/>`,
    ),
    "</tomcat-users>",
    "",
  ];
  return lines.join("\n");
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("Usage: generate-tomcat-users.ts <users.json> <tomcat-users.xml>");
    process.exit(2);
  }
  writeFileSync(output, toTomcatUsersXml(parseUsers(readFileSync(input, "utf8"))));
}
