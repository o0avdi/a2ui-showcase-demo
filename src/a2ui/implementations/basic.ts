/**
 * The official Basic Catalog, drawn by the SDK's own implementations.
 *
 * Nothing is reimplemented: every component and function is taken from
 * `@a2ui/web_core`'s `basicCatalog`, whose components are Web Components that
 * `@a2ui/react` hosts.
 */

import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1';

import type { CatalogImplementation } from '../catalogs.ts';

export const basicImplementation: CatalogImplementation = {
  catalogId: basicCatalog.id,
  components: Object.fromEntries(basicCatalog.components),
  functions: Object.fromEntries(basicCatalog.functions),
};
