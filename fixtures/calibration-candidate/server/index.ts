// Candidat d'étalonnage (spec de l'étape 3, « Candidat d'étalonnage ») : la
// couche serveur d'un vrai candidat (ADR 0003), sans dépendance. Elle
// authentifie en BASIC à partir de USERS_FILE, relaie /api/ vers l'API interne
// (LEGACY_API_URL) et sert le front construit par Vite. Elle n'a pas à réussir
// l'oracle : elle sert à mesurer le coût d'une construction et d'un démarrage.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";

interface User {
  username: string;
  password: string;
  role: string;
}

const port = Number(process.env.PORT);
const apiUrl = process.env.LEGACY_API_URL ?? "";
const users = JSON.parse(readFileSync(process.env.USERS_FILE ?? "", "utf8")) as User[];
const clientDir = join(import.meta.dirname, "..", "client");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

function authenticated(request: IncomingMessage): User | undefined {
  const [scheme, encoded] = (request.headers.authorization ?? "").split(" ");
  if (scheme !== "Basic" || encoded === undefined) return undefined;
  const decoded = Buffer.from(encoded, "base64").toString();
  return users.find((user) => `${user.username}:${user.password}` === decoded);
}

async function relay(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const answer = await fetch(`${apiUrl}${request.url}`, {
    method: request.method,
    headers: { "content-type": request.headers["content-type"] ?? "application/json" },
    ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }),
  });
  response.writeHead(answer.status, { "content-type": answer.headers.get("content-type") ?? "application/json" });
  response.end(Buffer.from(await answer.arrayBuffer()));
}

async function serveFront(url: string, response: ServerResponse): Promise<void> {
  const path = normalize(url.split("?")[0] ?? "/").replace(/^(\.\.[/\\])+/, "");
  const file = join(clientDir, path === "/" ? "index.html" : path);
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(200, { "content-type": TYPES[".html"]! });
    response.end(await readFile(join(clientDir, "index.html")));
  }
}

createServer((request, response) => {
  if (authenticated(request) === undefined) {
    response.writeHead(401, { "www-authenticate": 'Basic realm="migrabench"' });
    response.end();
    return;
  }
  const handled = (request.url ?? "/").startsWith("/api/") ? relay(request, response) : serveFront(request.url ?? "/", response);
  handled.catch(() => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
}).listen(port, () => console.log(`calibration candidate listening on :${port}`));
