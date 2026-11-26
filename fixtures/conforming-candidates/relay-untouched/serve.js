// Répond 200 à la première requête, puis coupe chaque connexion suivante
// sans réponse.
import { createServer } from "node:http";

export function serve(port, name) {
  let answered = false;
  createServer((request, response) => {
    if (answered) {
      request.socket.destroy();
      return;
    }
    answered = true;
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ready\n");
  }).listen(port, () => console.log(`${name} listening on :${port}`));
}
