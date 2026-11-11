# Adding a catalog

A catalog has two halves that live in different places:

| Half | Where | Who writes it |
| --- | --- | --- |
| The **document**: what an agent may ask for, as JSON Schema | `catalogs/<name>/catalog.json` | Generated (for Material UI, by the Storybook exporter). Never edited by hand. |
| The **implementation**: how this app draws it | `src/a2ui/implementations/<name>.tsx` | Us |

The server reads the document to prompt the model and validate its reply. The
web app reads the same file and joins it to the implementation. Neither side
has a second copy of the schema.

## Steps

1. Copy the exported catalog to `catalogs/<name>/catalog.json`. Do not modify it.
   If it does not load, fix the exporter, not the file.
2. Write the implementation. Each component is a React view that receives props
   the SDK has already resolved:

   ```tsx
   // src/a2ui/implementations/mui.tsx
   import Button from '@mui/material/Button';
   import type { CatalogImplementation, ComponentView } from '../catalogs.ts';

   const MuiButton: ComponentView = ({ props, buildChild }) => (
     <Button variant={props.variant} onClick={() => props.action?.()}>
       {props.child ? buildChild(props.child) : props.label}
     </Button>
   );

   export const muiImplementation: CatalogImplementation = {
     catalogId: 'the catalogId declared in the document',
     components: { Button: MuiButton /* one entry per component in the document */ },
     functions: {},
   };
   ```

3. Add it to the list in `src/a2ui/implementations/index.ts`.
4. Restart `npm run dev`. The Inspector's **Components** tab shows the catalog,
   and its **Issues** tab says why if it did not load.

## What a view receives

The SDK's generic binder (`createComponentImplementation` in `@a2ui/react`)
resolves a component's properties before the view renders. We add no
transformation of our own.

| In the A2UI message | In `props` |
| --- | --- |
| A literal, e.g. `"label": "Save"` | The literal |
| A binding, e.g. `"value": {"@path": "/form/name"}` | The current value, re-rendered when it changes |
| A bound input | The value, plus a setter beside it (`value` and `setValue`) |
| A function call, e.g. `{"@call": "formatString", ...}` | The function's result |
| `"action": {"event": {...}}` | A function. Call it to send the action, with its context resolved |
| `"checks": [...]` | `isValid` and `validationErrors` |
| A child id (`"child": "label"`) or list of ids | The id(s). Draw each with `buildChild(id)` |

Child references are the one thing a view must handle itself: A2UI components
are a flat list that refer to each other by id, so React children are produced
by calling `buildChild`.

## Rules the loader enforces

- **Everything advertised is implemented.** A document that lists a component
  or function with no implementation is not offered to the agent at all. The
  Issues tab names each missing entry.
- **Catalog identity is the `catalogId`.** An implementation is only ever used
  for the catalog whose id it declares.
- **Name collisions are per catalog.** Two catalogs can both define `Button`;
  each is looked up only inside its own implementation, so the Basic Catalog's
  `Button` is never silently used for another catalog's.
- **Duplicate ids are refused.** Two files declaring one `catalogId`: the first
  is used, the second is reported. Two implementations for one id is a startup error.

`tests/web/catalogs.test.ts` and `tests/web/renderer.test.tsx` exercise all of
this with a small fixture catalog (`tests/fixtures/demo-catalog.json`).

## Upgrading the A2UI SDK

`catalogs/basic/catalog.json` is the document the **installed** SDK implements,
written by `npm run catalog:sync`. It is not copied from the A2UI repository,
whose `main` branch can be ahead of the published packages. After changing the
`@a2ui/*` versions, run `npm run catalog:sync` and then `npm test`; a test fails
if the file and the SDK disagree.
