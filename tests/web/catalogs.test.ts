import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1';
import { describe, expect, it } from 'vitest';

import { bindCatalog, loadCatalogs, type CatalogDocument, type CatalogImplementation } from '../../src/a2ui/catalogs.ts';
import { basicImplementation } from '../../src/a2ui/implementations/basic.ts';
import { registry } from '../../src/a2ui/registry.ts';
import basicJson from '../../catalogs/basic/catalog.json';
import demoJson from '../fixtures/demo-catalog.json';

const basicDocument: CatalogDocument = basicJson;
const demoDocument: CatalogDocument = demoJson;

const demoImplementation: CatalogImplementation = {
  catalogId: demoDocument.catalogId,
  components: { Button: () => null, Panel: () => null },
  functions: { shout: ({ value }) => String(value).toUpperCase() },
};

describe('the Basic Catalog document', () => {
  it('is the document the installed SDK implements (run "npm run catalog:sync" after an SDK upgrade)', () => {
    expect(basicDocument).toEqual(basicCatalog.toJson());
  });

  it('declares A2UI v1.0', () => {
    expect(basicDocument.protocolVersion).toBe('1.0');
    expect(basicDocument.catalogId).toBe('https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json');
  });
});

describe('the catalogs this build draws', () => {
  it('loads every catalog file with nothing left unimplemented', () => {
    expect(registry.problems).toEqual([]);
    expect(registry.catalogs.map((loaded) => loaded.id)).toEqual([basicDocument.catalogId]);
    expect(registry.catalogs[0]!.source).toBe('catalogs/basic/catalog.json');
  });

  it("draws every Basic Catalog component and function with the SDK's own implementation", () => {
    const { catalog } = registry.catalogs[0]!;
    expect([...catalog.components.keys()].sort()).toEqual(Object.keys(basicDocument.components).sort());
    expect([...catalog.functions.keys()].sort()).toEqual(Object.keys(basicDocument.functions!).sort());
    for (const [name, implementation] of catalog.components) {
      expect(implementation, name).toBe(basicCatalog.components.get(name));
    }
  });
});

describe('binding an externally supplied catalog', () => {
  it('binds React views and plain functions to the document schemas', () => {
    const catalog = bindCatalog(demoDocument, demoImplementation);
    expect(catalog.id).toBe(demoDocument.catalogId);
    expect([...catalog.components.keys()]).toEqual(['Button', 'Panel']);
    expect(catalog.components.get('Panel')).toHaveProperty('render');
    expect(catalog.functions.get('shout')).toHaveProperty('execute');
  });

  it('refuses a catalog that advertises anything without an implementation, naming each gap', () => {
    const partial: CatalogImplementation = { catalogId: demoDocument.catalogId, components: { Button: () => null } };
    expect(() => bindCatalog(demoDocument, partial)).toThrow(
      'No implementation for components "Panel" and functions "shout".',
    );
  });

  it('refuses an implementation written for a different catalog', () => {
    expect(() => bindCatalog(demoDocument, basicImplementation)).toThrow(/not for the catalog/);
  });

  it('keeps a component name that two catalogs share separate per catalog', () => {
    const { catalogs, problems } = loadCatalogs(
      [
        { source: 'basic', document: basicDocument },
        { source: 'demo', document: demoDocument },
      ],
      [basicImplementation, demoImplementation],
    );
    expect(problems).toEqual([]);
    const [basic, demo] = catalogs.map((loaded) => loaded.catalog.components.get('Button'));
    expect(basic).toBe(basicCatalog.components.get('Button'));
    expect(demo).not.toBe(basic);
    expect(demo).toHaveProperty('render');
  });
});

describe('loading catalog files', () => {
  const load = (sources: Array<{ source: string; document: unknown }>, implementations = [basicImplementation]) =>
    loadCatalogs(sources, implementations);

  it('leaves out, and reports, a catalog with no registered implementation', () => {
    const { catalogs, problems } = load([
      { source: 'catalogs/basic/catalog.json', document: basicDocument },
      { source: 'catalogs/demo/catalog.json', document: demoDocument },
    ]);
    expect(catalogs.map((loaded) => loaded.id)).toEqual([basicDocument.catalogId]);
    expect(problems).toEqual([
      {
        source: 'catalogs/demo/catalog.json',
        catalogId: demoDocument.catalogId,
        message: 'No implementation is registered for this catalogId.',
      },
    ]);
  });

  it('reports an incomplete implementation instead of offering the catalog', () => {
    const partial: CatalogImplementation = { ...demoImplementation, components: { Panel: () => null } };
    const { catalogs, problems } = load([{ source: 'demo', document: demoDocument }], [partial]);
    expect(catalogs).toEqual([]);
    expect(problems[0]!.message).toBe('No implementation for components "Button".');
  });

  it('reports a second file with the same catalogId and keeps the first', () => {
    const { catalogs, problems } = load([
      { source: 'a/catalog.json', document: basicDocument },
      { source: 'b/catalog.json', document: basicDocument },
    ]);
    expect(catalogs).toHaveLength(1);
    expect(problems[0]).toMatchObject({ source: 'b/catalog.json', message: expect.stringContaining('a/catalog.json') });
  });

  it('reports a file that is not a catalog document', () => {
    const { problems } = load([{ source: 'x.json', document: { hello: 'world' } }]);
    expect(problems[0]!.message).toMatch(/Not a catalog document/);
  });

  it('refuses two implementations for one catalog', () => {
    expect(() => load([], [basicImplementation, basicImplementation])).toThrow(/Two implementations/);
  });
});
