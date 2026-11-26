// Navigateur du banc (#78) : service `browser` de docker-compose.yml, dans
// l'image officielle de Playwright épinglée par empreinte. Chromium et ses
// dépendances système sont ceux de l'image ; le serveur de Playwright est le
// playwright-core du dépôt, monté en lecture seule, à la version de
// @playwright/test (tests/browser-image-sync.test.ts).
//
// Relais local : le navigateur voit le legacy, le service d'archivage et le
// candidat aux mêmes adresses que depuis l'hôte (`127.0.0.1` et `localhost`),
// ce qui garde `BASE_URL`, les URL des HAR, le contexte sûr et le lien
// « Accusé de remise » du legacy, écrit en dur sur `localhost:8090`. Seuls ces
// trois ports sont relayés. Le service est sur le réseau `default` seul : il
// ne joint pas l'API interne (ADR 0004).
import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";

const ROUTES = [
  [8080, "legacy", 8080],
  [8090, "archive", 8090],
  [8100, "candidate", 8100],
];
for (const [local, host, port] of ROUTES) {
  for (const address of ["127.0.0.1", "::1"]) {
    createServer((socket) => {
      const upstream = createConnection({ host, port });
      const close = () => {
        socket.destroy();
        upstream.destroy();
      };
      socket.on("error", close);
      upstream.on("error", close);
      socket.pipe(upstream).pipe(socket);
    }).listen(local, address);
  }
}

const server = spawn(process.execPath, ["/opt/playwright-core/cli.js", "run-server", "--port", "3000", "--host", "0.0.0.0"], { stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
