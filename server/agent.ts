/**
 * One turn of the agent: prompt a provider, then accept only valid A2UI.
 *
 * The A2UI work is the official agent SDK's (`@a2ui/agent`): it negotiates the
 * catalog against the renderer's capabilities, writes the part of the system
 * prompt that teaches the catalog, parses the reply and validates every message
 * the way a renderer would. This file adds the loop around it: ask, check, and
 * ask once more with the validator's own error when the reply is invalid.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  A2uiCatalogError,
  A2uiError,
  A2uiGenerator,
  A2uiValidationError,
  CatalogConfig,
  DirectJsonFormatFactory,
  ExpressFormatFactory,
  ExpressParseError,
  ParseError,
  type A2uiRequestProcessor,
  type RendererCapabilities,
} from '@a2ui/agent';

import type {
  Attempt,
  InferenceFormat,
  TurnFailure,
  TurnInput,
  TurnRequest,
  TurnResponse,
  ValidationIssue,
} from '../shared/contract.ts';
import { buildRetryMessage, buildSystemPrompt, describeAction } from './prompt.ts';
import type { Providers } from './providers/index.ts';
import { ProviderError, type ChatMessage, type ModelProvider } from './providers/types.ts';

const A2UI_OPEN = '<a2ui-json>';
const A2UI_CLOSE = '</a2ui-json>';
const SURFACE_ID = 'main';

/** Loads every `<directory>/<name>/catalog.json`, refusing two catalogs with one id. */
export function loadCatalogConfigs(directory: string): CatalogConfig[] {
  const configs: CatalogConfig[] = [];
  const seen = new Map<string, string>();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name, 'catalog.json');
    if (!entry.isDirectory() || !existsSync(path)) continue;
    const config = CatalogConfig.fromPath(path);
    const clash = seen.get(config.catalog.id);
    if (clash) {
      throw new Error(`Catalogs "${clash}" and "${entry.name}" both declare the id ${config.catalog.id}.`);
    }
    seen.set(config.catalog.id, entry.name);
    configs.push(config);
  }
  if (configs.length === 0) throw new Error(`No catalog.json found under ${directory}.`);
  return configs;
}

/**
 * Puts a JSON-format reply into the tagged form the SDK's Direct JSON parser reads.
 *
 * Models asked for raw JSON, and models that reach for a Markdown fence, return
 * the same payload without the tags. Only the wrapping is repaired here; the
 * payload is parsed and validated by the SDK either way.
 */
export function toTaggedResponse(text: string): string {
  if (text.includes(A2UI_OPEN)) return text;
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text);
  if (fenced?.[1] && /^\s*[[{]/.test(fenced[1])) {
    return text.replace(fenced[0], `${A2UI_OPEN}${fenced[1].trim()}${A2UI_CLOSE}`);
  }
  const trimmed = text.trim();
  return /^[[{]/.test(trimmed) ? `${A2UI_OPEN}${trimmed}${A2UI_CLOSE}` : text;
}

function issuesOf(error: A2uiError): ValidationIssue[] {
  const details: unknown = error instanceof A2uiValidationError ? error.details : undefined;
  if (!Array.isArray(details)) return [{ message: error.message }];
  return details.map((detail: { message?: unknown; path?: unknown; surfaceId?: unknown }) => ({
    message: typeof detail.message === 'string' ? detail.message : error.message,
    ...(typeof detail.path === 'string' ? { path: detail.path } : {}),
    ...(typeof detail.surfaceId === 'string' ? { surfaceId: detail.surfaceId } : {}),
  }));
}

/**
 * The conversation a provider is sent. An action is answered in the context of
 * the turn that drew its surface, replayed in the format the model writes.
 */
function conversationFor(input: TurnInput, processor: A2uiRequestProcessor): ChatMessage[] {
  if (input.kind === 'prompt') return [{ role: 'user', text: input.text }];
  const { parser } = processor;
  const earlier = parser.decompile(input.prior.messages as Parameters<typeof parser.decompile>[0]);
  return [
    { role: 'user', text: input.prior.prompt },
    { role: 'model', text: parser.wrap([{ type: 'a2ui', a2uiRaw: earlier, isFinal: true }]) },
    { role: 'user', text: describeAction(input.action) },
  ];
}

export class Agent {
  /** One generator per inference format, over the same catalogs. */
  private readonly generators: Record<InferenceFormat, A2uiGenerator>;
  readonly catalogIds: string[];

  constructor(
    catalogs: CatalogConfig[],
    private readonly providers: Providers,
    private readonly maxAttempts: number,
  ) {
    this.generators = {
      json: new A2uiGenerator(catalogs, undefined, new DirectJsonFormatFactory()),
      express: new A2uiGenerator(catalogs, undefined, new ExpressFormatFactory({ surfaceId: SURFACE_ID })),
    };
    this.catalogIds = catalogs.map((config) => config.catalog.id);
  }

  async runTurn(request: TurnRequest, signal?: AbortSignal): Promise<TurnResponse> {
    const started = Date.now();
    const provider = this.providers[request.provider];
    const attempts: Attempt[] = [];
    const fail = (code: TurnFailure['error']['code'], message: string, model?: string): TurnFailure => ({
      ok: false,
      provider: request.provider,
      model,
      error: { code, message },
      attempts,
      elapsedMs: Date.now() - started,
    });

    let processor: A2uiRequestProcessor;
    try {
      processor = this.generators[provider.format].createProcessor(request.capabilities as RendererCapabilities);
    } catch (error) {
      if (!(error instanceof A2uiError)) throw error;
      const code = error instanceof A2uiCatalogError ? 'unsupported_catalog' : 'bad_request';
      return fail(code, `The renderer and the agent share no catalog: ${error.message}`);
    }

    const system = buildSystemPrompt(processor.promptSnippet, provider.jsonMode);
    let messages: ChatMessage[];
    try {
      messages = conversationFor(request.input, processor);
    } catch (error) {
      if (!(error instanceof A2uiError)) throw error;
      return fail('bad_request', `The surface this action came from is not valid A2UI: ${error.message}`);
    }
    // A recording is the same on every try, so there is nothing to ask again.
    const limit = provider.source === 'sample' ? 1 : this.maxAttempts;
    let model: string | undefined;

    for (let attempt = 0; attempt < limit; attempt += 1) {
      let rawOutput: string;
      try {
        ({ text: rawOutput, model } = await provider.generate({ system, messages, input: request.input, signal }));
      } catch (error) {
        if (error instanceof ProviderError) return fail(error.code, error.message, model);
        throw error;
      }

      const checked = check(processor, provider.format === 'json' ? toTaggedResponse(rawOutput) : rawOutput);
      attempts.push({ rawOutput, ...('error' in checked ? { error: checked.error } : {}) });
      if (!('error' in checked)) {
        return {
          ok: true,
          source: provider.source,
          provider: request.provider,
          model,
          format: provider.format,
          text: checked.text,
          messages: checked.messages,
          attempts,
          elapsedMs: Date.now() - started,
        };
      }
      messages.push({ role: 'model', text: rawOutput }, { role: 'user', text: buildRetryMessage(checked.error.message) });
    }

    const last = attempts.at(-1)?.error?.message ?? 'no output';
    const tries = attempts.length === 1 ? 'reply was' : `${attempts.length} replies were`;
    return fail('invalid_output', `${labelOf(provider)}'s ${tries} not valid A2UI. Last error: ${last}`, model);
  }
}

const labelOf = (provider: ModelProvider) => (provider.source === 'sample' ? 'The sample' : 'The model');

type Checked =
  | { text: string; messages: unknown[] }
  | { error: NonNullable<Attempt['error']> };

/** Parses and validates one reply against a fresh renderer state. */
function check(processor: A2uiRequestProcessor, reply: string): Checked {
  try {
    const parts = processor.parseResponse(reply);
    const messages = parts.flatMap((part) => (part.type === 'a2ui' ? part.a2ui : []));
    if (messages.length === 0) {
      const message = 'The reply contains no A2UI messages.';
      return { error: { kind: 'empty', message, issues: [{ message }] } };
    }
    const text = parts.flatMap((part) => (part.type === 'text' ? [part.text.trim()] : [])).join('\n\n');
    return { text, messages };
  } catch (error) {
    if (!(error instanceof A2uiError)) throw error;
    return {
      error: {
        kind: error instanceof ParseError || error instanceof ExpressParseError ? 'parse' : 'validation',
        message: error.message,
        issues: issuesOf(error),
      },
    };
  }
}
