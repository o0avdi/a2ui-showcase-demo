/**
 * Every catalog this app can draw. To support a new catalog:
 *
 *   1. put its document at `catalogs/<name>/catalog.json`, unmodified;
 *   2. write its implementation in this folder (see `basic.ts`, and
 *      `docs/adding-a-catalog.md` for React views);
 *   3. add it to this list.
 */

import type { CatalogImplementation } from '../catalogs.ts';
import { basicImplementation } from './basic.ts';

export const implementations: CatalogImplementation[] = [basicImplementation];
