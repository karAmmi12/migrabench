// Contrôle du jeton de la pile, commun aux deux passerelles du navigateur du
// banc : la passerelle CDP (#134, cdp-gateway.mjs) et celle du serveur de
// Playwright (#160, playwright-gateway.mjs). Le candidat est sur le réseau
// `default`, comme le service `browser` : il joint leurs ports. Toute requête
// doit donc porter le jeton de la pile (MB_BROWSER_TOKEN, tiré à chaque
// démarrage par le banc) en tête de son chemin, `/<jeton>/…`. Sans jeton dans
// le service, tout est refusé.
//
// Sans dépendance hors de Node : le fichier est monté tel quel dans le
// conteneur, et importé par les tests du banc.
import { timingSafeEqual } from "node:crypto";
import { createConnection, createServer } from "node:net";

// Longueur minimale du jeton : 32 caractères, `openssl rand -hex 16` au moins.
const MIN_TOKEN_LENGTH = 32;
// Taille maximale de l'en-tête d'une requête, au-delà de laquelle elle est refusée.
const MAX_HEAD_BYTES = 16 * 1024;

function sameToken(given, token) {
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Requête d'un porteur du jeton, d'après son en-tête complet (jusqu'à la
 * ligne vide) : sa méthode, son chemin sans `/<jeton>`, et la suite de
 * l'en-tête après la ligne de requête (`headerTail`, depuis son `\r\n`).
 * `undefined` si le jeton manque, est faux, ou si la ligne de requête est mal
 * formée.
 * @param {string} head
 * @param {string | undefined} token
 * @returns {{ method: string, path: string, headerTail: string } | undefined}
 */
export function tokenRequest(head, token) {
  if (token === undefined || token.length < MIN_TOKEN_LENGTH) return undefined;
  const lineEnd = head.indexOf("\r\n");
  if (lineEnd === -1) return undefined;
  const match = /^(GET|POST) \/([^/ ]+)(\/[^ ]*) HTTP\/1\.1$/.exec(head.slice(0, lineEnd));
  if (match === null) return undefined;
  const [, method, given, path] = match;
  if (!sameToken(given, token)) return undefined;
  return { method, path, headerTail: head.slice(lineEnd) };
}

/** Réponse HTTP complète, puis fermeture de la connexion. */
export function respond(socket, status, body) {
  const text = body === undefined ? "" : JSON.stringify(body);
  socket.end(`HTTP/1.1 ${status}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`);
}

/**
 * Relaie une connexion acceptée vers `port` de la boucle locale, avec l'en-tête
 * réécrit `head` et ce qui a déjà été reçu après l'en-tête d'origine. Seule la
 * première requête de la connexion est contrôlée : la suite (keep-alive, ou
 * les trames du WebSocket) est relayée telle quelle, à qui a déjà donné le
 * jeton.
 */
export function relayTo(socket, port, head, body) {
  const upstream = createConnection({ host: "127.0.0.1", port });
  const teardown = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on("error", teardown);
  socket.on("close", teardown);
  upstream.write(Buffer.concat([Buffer.from(head, "latin1"), body]));
  socket.pipe(upstream).pipe(socket);
  socket.resume();
}

/**
 * Serveur qui lit l'en-tête de chaque requête avant d'en faire quoi que ce
 * soit : `onHead(socket, head, body)` reçoit l'en-tête complet et ce qui le
 * suit, la connexion en pause. Un en-tête trop long est refusé.
 * @param {(socket: import("node:net").Socket, head: string, body: Buffer) => void} onHead
 */
export function headServer(onHead) {
  return createServer((socket) => {
    let buffered = Buffer.alloc(0);
    socket.on("error", () => socket.destroy());
    const onData = (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf("\r\n\r\n");
      if (end === -1) {
        if (buffered.length > MAX_HEAD_BYTES) {
          socket.off("data", onData);
          respond(socket, "431 Request Header Fields Too Large");
        }
        return;
      }
      socket.off("data", onData);
      socket.pause();
      onHead(socket, buffered.subarray(0, end + 4).toString("latin1"), buffered.subarray(end + 4));
    };
    socket.on("data", onData);
  });
}
