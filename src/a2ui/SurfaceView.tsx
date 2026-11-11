/**
 * One surface on screen, drawn by `@a2ui/react`.
 *
 * Markdown is supplied here because A2UI's `Text` is Markdown (a heading is
 * `## Title`); the renderer is the SDK's own, which sanitizes its output.
 */

import { renderMarkdown } from '@a2ui/markdown-it';
import { A2uiSurface, MarkdownContext } from '@a2ui/react';

import type { Surface } from './renderer.ts';

export function SurfaceView({ surface }: { surface: Surface }) {
  return (
    <MarkdownContext.Provider value={renderMarkdown}>
      <div className="a2ui-stage" data-surface-id={surface.id}>
        <A2uiSurface surface={surface} />
      </div>
    </MarkdownContext.Provider>
  );
}
