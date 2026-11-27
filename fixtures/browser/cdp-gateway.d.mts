// Types de cdp-gateway.mjs, monté tel quel dans le conteneur du navigateur.
import type { Server } from "node:net";

export type Route = { kind: "refused" } | { kind: "launch" } | { kind: "close"; id: string } | { kind: "cdp"; id: string; head: string };

export const CHROMIUM_FLAGS: readonly string[];
export function removeProfile(userDataDir: string, remove?: (path: string, options: { recursive: boolean; force: boolean; maxRetries: number; retryDelay: number }) => Promise<void>): Promise<void>;
export function routeRequest(head: string, token: string | undefined): Route;
export function startCdpGateway(options: { port: number; token: string | undefined; executablePath: string }): { server: Server; closeAll(): void };
