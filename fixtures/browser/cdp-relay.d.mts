// Types de cdp-relay.mjs, monté tel quel dans le conteneur du navigateur.
import type { Server } from "node:net";

export type Route = { kind: "refused" } | { kind: "launch" } | { kind: "close"; id: string } | { kind: "cdp"; id: string; head: string };

export const CHROMIUM_FLAGS: readonly string[];
export function routeRequest(head: string, token: string | undefined): Route;
export function startCdpRelay(options: { port: number; token: string | undefined; executablePath: string }): { server: Server; closeAll(): void };
