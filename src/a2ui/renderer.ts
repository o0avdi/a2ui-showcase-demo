/**
 * One rendered turn, held by the SDK.
 *
 * A `MessageProcessor` from `@a2ui/web_core` owns the surfaces, data model,
 * bindings, checks and actions. This file only feeds it a turn's messages and
 * reads back what the inspector shows. Each turn gets a new processor: a turn
 * is a complete interface, and a new processor is a clean renderer for it.
 */

import type { ReactCatalogComponent } from '@a2ui/react';
import {
  MessageProcessor,
  STRICT_VALIDATION,
  type ActionPayload,
  type RendererErrorMessage,
  type SurfaceModel,
} from '@a2ui/web_core/v1_0';

import type { ValidationIssue } from '../../shared/contract.ts';
import type { RenderableCatalog } from './catalogs.ts';

export type Surface = SurfaceModel<ReactCatalogComponent>;

export interface RenderedComponent {
  id: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface RenderedTurn {
  processor: MessageProcessor<ReactCatalogComponent>;
  surfaces: Surface[];
  /** Messages the renderer refused. A turn with any is not shown. */
  issues: ValidationIssue[];
}

const toIssue = ({ error }: RendererErrorMessage): ValidationIssue => ({
  message: error.message,
  ...('path' in error && typeof error.path === 'string' ? { path: error.path } : {}),
  ...(error.surfaceId ? { surfaceId: error.surfaceId } : {}),
});

/** What this renderer can draw, in the form an A2UI agent negotiates against. */
export function rendererCapabilities(catalogs: RenderableCatalog[]): unknown {
  const processor = new MessageProcessor<ReactCatalogComponent>(catalogs);
  try {
    return processor.getRendererCapabilities({ versions: ['1.0'] });
  } finally {
    processor.dispose();
  }
}

/**
 * Applies a turn's messages to a new processor.
 *
 * Validation is strict: an unknown component, an invalid property, a dangling
 * child reference or a missing root rejects the message. The server has
 * already checked the same things, so an issue here means the two disagree.
 */
export function renderTurn(
  catalogs: RenderableCatalog[],
  messages: unknown[],
  onAction: (action: ActionPayload) => void,
): RenderedTurn {
  const processor = new MessageProcessor<ReactCatalogComponent>(catalogs, onAction, {
    validationConfig: STRICT_VALIDATION,
  });
  const issues = processor.processMessagesWithErrors(messages).map(toIssue);
  return { processor, surfaces: [...processor.getSurfaces().values()], issues };
}

export function componentsOf(surface: Surface): RenderedComponent[] {
  return [...surface.componentsModel.getAll().values()].map((component) => ({
    id: component.id,
    type: component.type,
    properties: component.properties,
  }));
}

/** A surface's data model as plain JSON, detached from the live store. */
export function dataModelOf(surface: Surface): unknown {
  return structuredClone(surface.dataModel.get('/') ?? {});
}
