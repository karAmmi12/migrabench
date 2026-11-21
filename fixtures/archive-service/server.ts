// Service d'archivage simulé (spec de l'étape 1) : un fichier, une route.
// Il délivre l'accusé de remise d'un dossier. Le lien « Accusé de remise » de
// l'écran 3 du legacy y mène, avec la valeur témoin en clair (TRAPS.md).
// Node 22, sans dépendance : lancé par `node --experimental-strip-types`.
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = 8090;
const ROUTE = "/accuse-de-remise";

// Valeur témoin fournie par le banc, la même que celle du legacy. Sans elle,
// le service refuse de démarrer, comme le legacy sans FROZEN_DATE.
const ARCHIVE_TOKEN = process.env.ARCHIVE_TOKEN;
if (!ARCHIVE_TOKEN) {
  console.error("ARCHIVE_TOKEN is not set: the archive service cannot start");
  process.exit(1);
}

// Sel de la référence d'archivage, fourni par le banc pour une exécution
// complète de l'oracle. Sans lui, le service tire le sien et ne le révèle pas :
// la pile reste utilisable, seule la référence ne peut pas être vérifiée.
const ARCHIVE_SALT = process.env.ARCHIVE_SALT || randomBytes(32).toString("hex");

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://archive");
  if (request.method !== "GET" || url.pathname !== ROUTE) {
    response.writeHead(404).end();
    return;
  }

  if (url.searchParams.get("jeton") !== ARCHIVE_TOKEN) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=UTF-8" }).end("Jeton refusé\n");
    return;
  }

  const number = url.searchParams.get("numero") ?? "";
  response.writeHead(200, { "Content-Type": "text/html; charset=UTF-8" });
  response.end(receipt(number));
});

function receipt(number: string): string {
  const title = `Accusé de remise du dossier ${escapeHtml(number)}`;
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body><h1>${title}</h1>
<p>Référence d'archivage : ${archiveReference(number)}</p>
<p>Le dossier a été reçu par le service d'archivage.</p></body>
</html>
`;
}

// HMAC-SHA256 du numéro, le sel pris comme texte pour clé : 12 premiers
// caractères hexadécimaux, en majuscules (spec de l'étape 2).
function archiveReference(number: string): string {
  return createHmac("sha256", ARCHIVE_SALT).update(number).digest("hex").slice(0, 12).toUpperCase();
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

server.listen(PORT, () => console.log(`Archive service listening on ${PORT}`));
