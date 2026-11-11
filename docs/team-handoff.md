# Team handoff

Three people, three areas, one shared contract. Each area is a folder, so two
branches rarely touch the same file.

| Area | Owner | Folders |
| --- | --- | --- |
| Catalogs, renderer integration, contract, review | Omar | `src/a2ui/`, `catalogs/`, `shared/`, `docs/` |
| Interface, Material UI components, styling, UX | Audrey | `src/panels/`, `src/theme.ts`, `src/styles.css`, `src/app/App.tsx`, `src/a2ui/implementations/` (MUI views) |
| Models, agent behavior, state, actions, errors | Matangi | `server/`, `samples/`, `src/app/showcase.ts`, `src/app/api.ts` |

## The interfaces between areas

These are the seams. Change one only with the other owner's review.

- **`shared/contract.ts`** (Omar): the HTTP contract. `TurnRequest` in,
  `TurnResponse` out, `StatusResponse` for the provider list. The server and the
  web app both compile against it.
- **`ShowcaseState` in `src/app/showcase.ts`** (Matangi): everything the panels
  can display. Panels read this state and call `submitPrompt`, `setProvider`
  and `reset`. They never call the server or the A2UI SDK.
- **`ModelProvider` in `server/providers/types.ts`** (Matangi): one method,
  `generate({ system, messages }) -> { text, model }`. A provider knows nothing
  about A2UI.
- **`CatalogImplementation` in `src/a2ui/catalogs.ts`** (Omar): what Audrey
  writes to draw a catalog with Material UI. See `docs/adding-a-catalog.md`.

## Getting started

```bash
git clone <repo> && cd a2ui-showcase-demo
npm install
cp .env.example .env      # optional: sample mode needs no configuration
npm run dev               # http://localhost:5173
npm run check             # typecheck + tests + build, before every push
```

Work on a branch per task (`audrey/…`, `matangi/…`), open a pull request, and
ask Omar for review.

## Audrey: first tasks

Works against: `ShowcaseState` (read only), `CatalogImplementation`.

1. Run the app in sample mode, try all three examples, and note what looks or
   feels wrong at 1440, 1100 and 420 pixels wide.
2. Polish the three panels in `src/panels/`. Candidates: a dark theme through
   `theme.ts` (the generated content follows the CSS variables in `styles.css`),
   a copy button on the JSON views, keyboard focus order, empty and error states.
3. Prepare Material UI views for the exported catalog: start
   `src/a2ui/implementations/mui.tsx` with `Button`, `TextField`, `Checkbox`,
   `Card` and `Typography`, following `docs/adding-a-catalog.md`. Until the real
   catalog arrives, develop against the test fixture pattern in
   `tests/web/renderer.test.tsx`; do not hand-write a Material UI catalog document.
4. For Nov 20: a component gallery view that draws every component of the
   active catalog from a sample message.

## Matangi: first tasks

Works against: `ModelProvider`, `TurnRequest`/`TurnResponse`, `ShowcaseState` (owner).

1. Put a Gemini key in `.env` and run the registration prompt. This path has
   **not been run yet** (no key was available). Record the result, and tune the
   rules in `server/prompt.ts` if replies are rejected.
2. Local models: the two small models tried so far did not produce a usable
   form (see README, "What has been verified"). Try a larger model with at
   least a 16K context, and try pruning the catalog offered to local models with
   the SDK's `ComponentPruningTransformer` in `server/agent.ts`.
3. Action turns with a live model: fill in the form, press the button, and check
   the model's confirmation uses the submitted values.
4. Streaming: `@a2ui/agent` can parse a reply as it arrives
   (`processor.openStream()`), which would let the stage paint while the model
   is still writing. This changes `POST /api/turn` to a stream, so agree the
   contract change with Omar first.
5. Add a sample per scenario you want to be safe at the showcase
   (`samples/NN-name.json`); `npm test` validates every sample against the catalog.

## Omar: first tasks

1. Review this baseline and decide whether to commit it as is.
2. When the exporter produces a Material UI catalog, drop it in
   `catalogs/mui/catalog.json` and run the app: the Issues tab lists every
   component that still needs a view. The exporter's current golden output
   (`test/golden/govbanner.catalog.json`, one component) was checked once by
   hand: unmodified, it loaded as a catalog schema, bound to a stub view that
   draws nothing, and its messages validated. Rendering it through a real React
   view has not been tested, and no test in this repository covers that file.
3. Check the exporter against the **published** SDK, not the A2UI repository's
   `main`: they currently disagree (for example `checks` in `@a2ui/web_core`
   0.15.0 against `@checks` on `main`).
4. Decide the multi-catalog experience: one catalog per surface chosen by the
   model, or a catalog picker in the conversation panel.
