/**
 * Catalog binding: a catalog document on one side, React on the other.
 *
 * A catalog document (JSON) says what an agent may ask for. A catalog
 * implementation says how this app draws it. `bindCatalog` joins the two into
 * the `Catalog` the SDK's `MessageProcessor` renders with, and refuses to
 * produce one that advertises anything this app cannot draw or evaluate.
 *
 * Nothing here knows about any particular catalog or component library.
 *
 * How a React view receives its props (the SDK's generic binder does this, in
 * `createComponentImplementation`; there is no transformation of our own):
 *   - a bound value (`{"@path": ...}` or a function call) arrives resolved;
 *   - a bound input also gets a setter beside it, such as `setValue`;
 *   - an `action` arrives as a function to call;
 *   - a child reference stays an id, and the view draws it with `buildChild(id)`.
 */

import type { FC } from 'react';
import { createComponentImplementation, type ReactA2uiComponentProps, type ReactCatalogComponent } from '@a2ui/react';
import {
  Catalog,
  createFunctionImplementation,
  type ComponentApi,
  type FunctionApi,
  type FunctionImplementation,
} from '@a2ui/web_core/v1_0';

type AnyRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** As much of a catalog document as this file reads. The SDK validates the rest. */
export interface CatalogDocument {
  catalogId: string;
  title?: string;
  description?: string;
  components: Record<string, unknown>;
  functions?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A React component drawn through the SDK's generic binder. */
export type ComponentView = FC<ReactA2uiComponentProps<AnyRecord>>;

/** A plain function evaluated for a catalog function call. */
export type FunctionBody = (args: AnyRecord) => unknown;

/**
 * How one catalog is drawn. Keyed by catalog id, so two catalogs that both
 * define a `Button` each get their own: a name is only ever looked up inside
 * the implementation registered for that exact catalog.
 */
export interface CatalogImplementation {
  catalogId: string;
  /** Per component name: an SDK implementation, or a React view to bind. */
  components: Record<string, ReactCatalogComponent | ComponentView>;
  /** Per function name: an SDK implementation, or a plain function to bind. */
  functions?: Record<string, FunctionImplementation | FunctionBody>;
}

export type RenderableCatalog = Catalog<ReactCatalogComponent, FunctionImplementation>;

export interface LoadedCatalog {
  id: string;
  title: string;
  /** The file the document came from. */
  source: string;
  document: CatalogDocument;
  catalog: RenderableCatalog;
}

/** Why a catalog document on disk is not offered to the agent. */
export interface CatalogProblem {
  source: string;
  catalogId?: string;
  message: string;
}

export interface CatalogSource {
  source: string;
  document: unknown;
}

export interface CatalogRegistry {
  catalogs: LoadedCatalog[];
  problems: CatalogProblem[];
}

export function isCatalogDocument(value: unknown): value is CatalogDocument {
  const candidate = value as CatalogDocument | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.catalogId === 'string' &&
    candidate.catalogId.length > 0 &&
    typeof candidate.components === 'object' &&
    candidate.components !== null
  );
}

const list = (names: string[]) => names.map((name) => `"${name}"`).join(', ');

/**
 * Joins a catalog document to its implementation.
 *
 * Throws, naming every gap, when the document offers a component or function
 * the implementation lacks: offering the agent something the renderer cannot
 * show is the one mistake a catalog must not make.
 */
export function bindCatalog(document: CatalogDocument, implementation: CatalogImplementation): RenderableCatalog {
  if (implementation.catalogId !== document.catalogId) {
    throw new Error(
      `The implementation is for ${implementation.catalogId}, not for the catalog ${document.catalogId}.`,
    );
  }
  const schemas = Catalog.fromJson(document);

  const missingComponents = [...schemas.components.keys()].filter((name) => !implementation.components[name]);
  const missingFunctions = [...schemas.functions.keys()].filter((name) => !implementation.functions?.[name]);
  if (missingComponents.length || missingFunctions.length) {
    const gaps = [
      missingComponents.length ? `components ${list(missingComponents)}` : '',
      missingFunctions.length ? `functions ${list(missingFunctions)}` : '',
    ].filter(Boolean);
    throw new Error(`No implementation for ${gaps.join(' and ')}.`);
  }

  const components = [...schemas.components.entries()].map(([name, api]) => {
    const renderer = implementation.components[name]!;
    return typeof renderer === 'function' ? createComponentImplementation(api, renderer) : renderer;
  });
  const functions = [...schemas.functions.entries()].map(([name, api]) => {
    const body = implementation.functions![name]!;
    return typeof body === 'function' ? createFunctionImplementation(api, body) : body;
  });

  // `fromJson` types its entries as schemas and `withEntries` keeps that type;
  // the entries handed over are implementations, which this narrows to.
  return (schemas as Catalog<ComponentApi, FunctionApi>).withEntries(
    components,
    functions,
  ) as unknown as RenderableCatalog;
}

/**
 * Binds every catalog document that has an implementation.
 *
 * One bad catalog never takes the app down: it is left out and reported, and
 * the renderer advertises only the catalogs that loaded, so an agent is never
 * prompted with one this app cannot draw.
 */
export function loadCatalogs(sources: CatalogSource[], implementations: CatalogImplementation[]): CatalogRegistry {
  const catalogs: LoadedCatalog[] = [];
  const problems: CatalogProblem[] = [];
  const byId = new Map<string, CatalogImplementation>();
  for (const implementation of implementations) {
    if (byId.has(implementation.catalogId)) {
      throw new Error(`Two implementations are registered for the catalog ${implementation.catalogId}.`);
    }
    byId.set(implementation.catalogId, implementation);
  }

  for (const { source, document } of sources) {
    if (!isCatalogDocument(document)) {
      problems.push({ source, message: 'Not a catalog document: it needs a catalogId and components.' });
      continue;
    }
    const catalogId = document.catalogId;
    const earlier = catalogs.find((loaded) => loaded.id === catalogId);
    if (earlier) {
      problems.push({ source, catalogId, message: `Same catalogId as ${earlier.source}; the first one is used.` });
      continue;
    }
    const implementation = byId.get(catalogId);
    if (!implementation) {
      problems.push({ source, catalogId, message: 'No implementation is registered for this catalogId.' });
      continue;
    }
    try {
      catalogs.push({
        id: catalogId,
        title: document.title ?? catalogId,
        source,
        document,
        catalog: bindCatalog(document, implementation),
      });
    } catch (error) {
      problems.push({ source, catalogId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { catalogs, problems };
}
