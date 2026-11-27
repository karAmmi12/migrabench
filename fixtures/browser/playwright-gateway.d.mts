// Types de playwright-gateway.mjs, monté tel quel dans le conteneur du navigateur.
import type { Server } from "node:net";

export type PlaywrightRoute = { kind: "refused" } | { kind: "playwright"; head: string };

export function routePlaywrightRequest(head: string, token: string | undefined): PlaywrightRoute;
export function startPlaywrightGateway(options: { port: number; token: string | undefined; serverPort: number }): Server;
