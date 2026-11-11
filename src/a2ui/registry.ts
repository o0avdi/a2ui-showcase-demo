/**
 * The catalogs this build can draw: every `catalogs/<name>/catalog.json`,
 * joined to its implementation. The server reads the same files to prompt and
 * validate, so the two sides cannot describe different catalogs.
 */

import { loadCatalogs, type CatalogRegistry } from './catalogs.ts';
import { implementations } from './implementations/index.ts';

const files = import.meta.glob<unknown>('../../catalogs/*/catalog.json', { eager: true, import: 'default' });

export const registry: CatalogRegistry = loadCatalogs(
  Object.entries(files).map(([path, document]) => ({ source: path.replace(/^(\.\.\/)+/, ''), document })),
  implementations,
);
