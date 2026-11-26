export interface Config {
  port: number;
  legacyApiUrl: string;
  archiveUrl: string | null;
  archiveToken: string | null;
  usersFile: string;
  clientDir: string;
}

export function readConfig(env: NodeJS.ProcessEnv, clientDir: string): Config {
  const need = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
    return value;
  };
  return {
    port: Number(env.PORT ?? 3000),
    legacyApiUrl: need('LEGACY_API_URL').replace(/\/+$/, ''),
    archiveUrl: env.ARCHIVE_URL ? env.ARCHIVE_URL.replace(/\/+$/, '') : null,
    archiveToken: env.ARCHIVE_TOKEN || null,
    usersFile: need('USERS_FILE'),
    clientDir,
  };
}
