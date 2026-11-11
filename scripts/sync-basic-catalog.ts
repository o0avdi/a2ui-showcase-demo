/**
 * Writes catalogs/basic/catalog.json from the installed SDK.
 *
 * The Basic Catalog document must be the one the installed renderer
 * implements, not whatever the A2UI repository holds today: the two differ
 * between releases. Run this after upgrading `@a2ui/web_core`.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'catalogs', 'basic', 'catalog.json');
writeFileSync(target, `${JSON.stringify(basicCatalog.toJson(), null, 2)}\n`);
console.log(`Wrote ${target} (${basicCatalog.components.size} components, ${basicCatalog.functions.size} functions).`);
