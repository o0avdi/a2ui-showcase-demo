import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Agent, loadCatalogConfigs } from './agent.ts';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createProviders } from './providers/index.ts';
import { loadSamples } from './providers/sample.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = loadConfig();

const providers = createProviders(config, loadSamples(join(root, 'samples')));
const agent = new Agent(loadCatalogConfigs(join(root, 'catalogs')), providers, config.maxAttempts);
const app = createApp({
  agent,
  providers,
  defaultProvider: config.defaultProvider,
  staticDir: join(root, 'dist'),
});

app.listen(config.port, config.host, async () => {
  console.log(`[server] http://${config.host}:${config.port}`);
  console.log(`[server] catalogs: ${agent.catalogIds.join(', ')}`);
  for (const provider of Object.values(providers)) {
    const status = await provider.status();
    const state = status.available ? 'ready' : 'off';
    console.log(`[server] ${status.label.padEnd(22)} ${state.padEnd(6)} ${status.model ?? ''} ${status.detail}`);
  }
});
