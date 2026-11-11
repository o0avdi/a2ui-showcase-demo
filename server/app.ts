/**
 * The HTTP surface: two JSON routes, and the built web app when it exists.
 *
 *   GET  /api/status   which providers can be used right now, and the samples
 *   POST /api/turn     one prompt or one action in, validated A2UI out
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import express, { type ErrorRequestHandler, type Express } from 'express';

import type { ProviderId, StatusResponse, TurnInput, TurnRequest } from '../shared/contract.ts';
import type { Agent } from './agent.ts';
import type { Providers } from './providers/index.ts';
import type { SampleProvider } from './providers/sample.ts';

const MAX_PROMPT_LENGTH = 4_000;

export interface AppOptions {
  agent: Agent;
  providers: Providers;
  defaultProvider: ProviderId;
  /** The built web app, served when present so `npm start` is a whole deployment. */
  staticDir?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Returns the request, or a sentence saying what is wrong with it. */
export function parseTurnRequest(body: unknown, providers: Providers): TurnRequest | string {
  if (!isRecord(body)) return 'The request body must be a JSON object.';
  const { provider, input, capabilities } = body;
  if (typeof provider !== 'string' || !Object.hasOwn(providers, provider)) {
    return `Unknown provider. Use one of: ${Object.keys(providers).join(', ')}.`;
  }
  if (!isRecord(capabilities)) return 'Renderer capabilities are required.';
  if (!isRecord(input)) return 'An input is required.';

  if (input.kind === 'prompt') {
    if (typeof input.text !== 'string' || !input.text.trim()) return 'The prompt is empty.';
    if (input.text.length > MAX_PROMPT_LENGTH) return `The prompt is longer than ${MAX_PROMPT_LENGTH} characters.`;
  } else if (input.kind === 'action') {
    const { action, prior } = input;
    if (!isRecord(action) || typeof action.name !== 'string' || !isRecord(action.context)) {
      return 'The action must have a name and a context.';
    }
    if (!isRecord(prior) || typeof prior.prompt !== 'string' || !Array.isArray(prior.messages)) {
      return 'An action must come with the turn that produced its surface.';
    }
  } else {
    return 'The input kind must be "prompt" or "action".';
  }
  return { provider: provider as ProviderId, input: input as TurnInput, capabilities };
}

export function createApp({ agent, providers, defaultProvider, staticDir }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/status', async (_request, response) => {
    const status: StatusResponse = {
      providers: await Promise.all(Object.values(providers).map((provider) => provider.status())),
      defaultProvider,
      samples: (providers.sample as SampleProvider).summaries(),
      catalogIds: agent.catalogIds,
    };
    response.json(status);
  });

  app.post('/api/turn', async (request, response) => {
    const parsed = parseTurnRequest(request.body, providers);
    if (typeof parsed === 'string') {
      response.status(400).json({
        ok: false,
        provider: 'sample',
        error: { code: 'bad_request', message: parsed },
        attempts: [],
        elapsedMs: 0,
      });
      return;
    }
    // Stop paying for a generation nobody is waiting for.
    const abort = new AbortController();
    response.on('close', () => {
      if (!response.writableEnded) abort.abort();
    });
    // A turn that fails is still a well-formed answer: the body says what
    // happened, and the browser shows it. Only a malformed request is a 4xx.
    response.json(await agent.runTurn(parsed, abort.signal));
  });

  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api\/).*/, (_request, response) => response.sendFile(join(staticDir, 'index.html')));
  }

  const onError: ErrorRequestHandler = (error, _request, response, _next) => {
    const badJson = error instanceof SyntaxError;
    if (!badJson) console.error('[server] unexpected error:', error);
    response.status(badJson ? 400 : 500).json({
      ok: false,
      provider: 'sample',
      error: {
        code: badJson ? 'bad_request' : 'provider_error',
        message: badJson ? 'The request body is not valid JSON.' : 'The server hit an unexpected error. See its log.',
      },
      attempts: [],
      elapsedMs: 0,
    });
  };
  app.use(onError);

  return app;
}
