// Génère le `tomcat-users.xml` du legacy à partir du fichier des utilisateurs
// (ADR 0003). Exécuté pendant le build Docker du legacy :
//   node --experimental-strip-types generate-tomcat-users.ts <users.json> <tomcat-users.xml>
import { readFileSync, writeFileSync } from "node:fs";
import { parseUsers, type User } from "./users.ts";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toTomcatUsersXml(users: User[]): string {
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

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: generate-tomcat-users.ts <users.json> <tomcat-users.xml>");
  process.exit(2);
}
writeFileSync(output, toTomcatUsersXml(parseUsers(readFileSync(input, "utf8"))));
