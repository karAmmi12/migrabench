import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';

export type Role = 'agent' | 'instructeur';
export interface User { username: string; role: Role }

interface StoredUser extends User { digest: Buffer }

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

export function loadUsers(file: string): StoredUser[] {
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('USERS_FILE doit contenir un tableau JSON');
  const users: StoredUser[] = [];
  for (const entry of raw) {
    const { username, password, role } = (entry ?? {}) as Record<string, unknown>;
    // Comme le web.xml actuel : seuls les rôles agent et instructeur ont accès.
    if (typeof username !== 'string' || typeof password !== 'string') continue;
    if (role !== 'agent' && role !== 'instructeur') continue;
    users.push({ username, role, digest: digest(password) });
  }
  return users;
}

declare module 'express-serve-static-core' {
  interface Request { user?: User }
}

/** Authentification HTTP BASIC (realm « dossiers »), sans écran de connexion. */
export function basicAuth(users: StoredUser[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = authenticate(users, req.headers.authorization);
    if (!user) {
      res.set('WWW-Authenticate', 'Basic realm="dossiers", charset="UTF-8"').status(401).type('text/plain').send('Authentification requise');
      return;
    }
    req.user = user;
    next();
  };
}

function authenticate(users: StoredUser[], header: string | undefined): User | null {
  const match = /^Basic +([A-Za-z0-9+/=_-]+)$/i.exec(header ?? '');
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return null;
  const username = decoded.slice(0, colon);
  const wanted = digest(decoded.slice(colon + 1));
  let found: User | null = null;
  for (const u of users) {
    // Pas de sortie anticipée : la durée ne dépend pas de l'utilisateur trouvé.
    if (u.username === username && timingSafeEqual(u.digest, wanted)) found = { username: u.username, role: u.role };
  }
  return found;
}
