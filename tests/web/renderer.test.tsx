import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { bindCatalog, type CatalogDocument, type ComponentView } from '../../src/a2ui/catalogs.ts';
import { registry } from '../../src/a2ui/registry.ts';
import { componentsOf, dataModelOf, rendererCapabilities, renderTurn } from '../../src/a2ui/renderer.ts';
import { SurfaceView } from '../../src/a2ui/SurfaceView.tsx';
import type { A2uiAction } from '../../shared/contract.ts';
import registration from '../../samples/01-workshop-registration.json';
import demoJson from '../fixtures/demo-catalog.json';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const demoDocument: CatalogDocument = demoJson;
const basicCatalogs = registry.catalogs.map((loaded) => loaded.catalog);
const BASIC_ID = registry.catalogs[0]!.id;

const surfaceOf = (catalogId: string, components: unknown[], dataModel?: unknown) => [
  { version: '1.0', createSurface: { surfaceId: 'main', catalogId, components, ...(dataModel ? { dataModel } : {}) } },
];

const mounted: Array<() => void> = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

async function mount(node: ReactNode): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const reactRoot = createRoot(host);
  mounted.push(() => {
    act(() => reactRoot.unmount());
    host.remove();
  });
  await act(async () => {
    reactRoot.render(node);
  });
  // Lit elements and the SDK's bindings settle on later microtasks.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return host;
}

describe('rendering a turn with the Basic Catalog', () => {
  it('applies valid messages and exposes the surface the inspector reads', () => {
    const turn = renderTurn(basicCatalogs, registration.messages, () => {});

    expect(turn.issues).toEqual([]);
    expect(turn.surfaces.map((surface) => surface.id)).toEqual(['main']);
    const surface = turn.surfaces[0]!;
    expect(surface.catalog.id).toBe(BASIC_ID);
    expect(componentsOf(surface).find((component) => component.id === 'email')).toMatchObject({
      type: 'TextField',
      properties: { label: 'Email', value: { '@path': '/form/email' } },
    });
    expect(dataModelOf(surface)).toEqual({ form: { name: '', email: '', level: ['Beginner'], updates: true } });
  });

  it.each([
    ['an unknown component', [{ id: 'root', component: 'Carousel' }], /Unknown component type 'Carousel'/],
    ['an invalid property', [{ id: 'root', component: 'Text', text: 'Hi', colour: 'red' }], /'colour'/],
    ['a dangling child reference', [{ id: 'root', component: 'Column', children: ['ghost'] }], /ghost/],
  ])('refuses %s', (_label, components, reason) => {
    const turn = renderTurn(basicCatalogs, surfaceOf(BASIC_ID, components), () => {});
    expect(turn.issues).toHaveLength(1);
    expect(turn.issues[0]!.message).toMatch(reason);
  });

  it('refuses a surface for a catalog this renderer does not have', () => {
    const turn = renderTurn(basicCatalogs, surfaceOf(demoDocument.catalogId, [{ id: 'root', component: 'Panel' }]), () => {});
    expect(turn.issues[0]!.message).toMatch(/catalog/i);
    expect(turn.surfaces).toEqual([]);
  });

  it('advertises exactly the catalogs it was given', () => {
    expect(rendererCapabilities(basicCatalogs)).toEqual({ '1.0': { supportedCatalogIds: [BASIC_ID] } });
  });

  it("draws the surface with the SDK's components", async () => {
    const turn = renderTurn(basicCatalogs, registration.messages, () => {});
    const host = await mount(<SurfaceView surface={turn.surfaces[0]!} />);

    expect(host.querySelector('a2ui-card')).not.toBeNull();
    expect(host.querySelectorAll('a2ui-basic-textfield')).toHaveLength(2);
    expect(host.querySelector('a2ui-basic-button')).not.toBeNull();
    expect(host.textContent).toContain('Engineering Workshop Registration');
  });

  it('re-renders bound text when the data model changes', async () => {
    const turn = renderTurn(basicCatalogs, registration.messages, () => {});
    const surface = turn.surfaces[0]!;
    const host = await mount(<SurfaceView surface={surface} />);
    expect(host.textContent).toMatch(/Registering as:\s+\(Beginner\)/);

    await act(async () => {
      surface.dataModel.set('/form/name', 'Ada Lovelace');
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(host.textContent).toContain('Registering as: Ada Lovelace (Beginner)');
  });
});

describe('rendering custom React components for an external catalog', () => {
  const Button: ComponentView = ({ props }) => (
    <button type="button" onClick={() => props.action()}>
      {props.label}
    </button>
  );
  const Panel: ComponentView = ({ props, buildChild }) => (
    <section>
      <h2>{props.title}</h2>
      {(props.children as string[]).map((id) => buildChild(id))}
    </section>
  );
  const catalog = bindCatalog(demoDocument, {
    catalogId: demoDocument.catalogId,
    components: { Button, Panel },
    functions: { shout: ({ value }) => String(value).toUpperCase() },
  });
  const messages = surfaceOf(
    demoDocument.catalogId,
    [
      { id: 'root', component: 'Panel', title: { '@call': 'shout', args: { value: { '@path': '/who' } } }, children: ['go'] },
      { id: 'go', component: 'Button', label: 'Go', action: { event: { name: 'go', context: { who: { '@path': '/who' } } } } },
    ],
    { who: 'ada' },
  );

  it('resolves bindings, functions and children, and forwards an action with its resolved context', async () => {
    const actions: A2uiAction[] = [];
    const turn = renderTurn([catalog], messages, (action) => actions.push(action));
    expect(turn.issues).toEqual([]);

    const host = await mount(<SurfaceView surface={turn.surfaces[0]!} />);
    expect(host.querySelector('h2')!.textContent).toBe('ADA');

    await act(async () => {
      host.querySelector('button')!.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ name: 'go', surfaceId: 'main', sourceComponentId: 'go', context: { who: 'ada' } });
  });

  it("validates against this catalog's Button, not the Basic Catalog's", () => {
    const basicStyleButton = [
      { id: 'root', component: 'Button', child: 'label', action: { event: { name: 'go' } } },
      { id: 'label', component: 'Text', text: 'Go' },
    ];
    const turn = renderTurn([catalog], surfaceOf(demoDocument.catalogId, basicStyleButton), () => {});
    expect(turn.issues.length).toBeGreaterThan(0);
  });
});
