import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { readConfig } from './config.js';

const here = dirname(fileURLToPath(import.meta.url));
const config = readConfig(process.env, join(here, '..', 'client'));
createApp(config).listen(config.port, () => console.log(`Écoute sur le port ${config.port}`));
