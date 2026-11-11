import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Agent, loadCatalogConfigs, toTaggedResponse } from '../../server/agent.ts';
import { parseTurnRequest } from '../../server/app.ts';
import type { Providers } from '../../server/providers/index.ts';
import { loadSamples, SampleProvider } from '../../server/providers/sample.ts';
import {
  ProviderError,
  type GenerateRequest,
  type GenerateResult,
  type ModelProvider,
} from '../../server/providers/types.ts';
import type { InferenceFormat, TurnRequest } from '../../shared/contract.ts';

const root = join(import.meta.dirname, '..', '..');
const catalogs = loadCatalogConfigs(join(root, 'catalogs'));
const samples = loadSamples(join(root, 'samples'));
const CATALOG_ID = catalogs[0]!.catalog.id;
const capabilities = { '1.0': { supportedCatalogIds: [CATALOG_ID] } };

const surface = (components: unknown[]) => [
  { version: '1.0', createSurface: { surfaceId: 'main', catalogId: CATALOG_ID, components } },
];
const VALID = surface([{ id: 'root', component: 'Text', text: 'Hello' }]);
const UNKNOWN_COMPONENT = surface([{ id: 'root', component: 'Carousel', text: 'Hello' }]);
const INVALID_PROPERTY = surface([{ id: 'root', component: 'Text', text: 'Hello', colour: 'red' }]);
const tagged = (messages: unknown) => `Here you go.\n<a2ui-json>${JSON.stringify(messages)}</a2ui-json>`;

/** A live provider that returns scripted replies and records what it was sent. */
class ScriptedProvider implements ModelProvider {
  readonly id = 'local';
  readonly source = 'live';
  readonly jsonMode = false;
  readonly requests: GenerateRequest[] = [];

  constructor(
    private readonly replies: Array<string | Error>,
    readonly format: InferenceFormat = 'json',
  ) {}

  async status() {
    return { id: this.id, label: 'Scripted', source: this.source, available: true, format: this.format, detail: '' } as const;
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    this.requests.push({ ...request, messages: [...request.messages] });
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error('The test scripted too few replies.');
    if (reply instanceof Error) throw reply;
    return { text: reply, model: 'scripted-model' };
  }
}

function agentWith(local: ModelProvider, maxAttempts = 2): Agent {
  const sample = new SampleProvider(samples);
  return new Agent(catalogs, { gemini: local, local, sample } as Providers, maxAttempts);
}

const promptTurn = (provider: TurnRequest['provider'] = 'local'): TurnRequest => ({
  provider,
  input: { kind: 'prompt', text: 'Say hello' },
  capabilities,
});

describe('catalog loading on the server', () => {
  it('loads the Basic Catalog from catalogs/', () => {
    expect(catalogs.map((config) => config.catalog.id)).toEqual([
      'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
    ]);
    expect(catalogs[0]!.catalog.components.has('Button')).toBe(true);
  });

  it('refuses two catalog files that declare the same id', () => {
    const directory = mkdtempSync(join(tmpdir(), 'a2ui-catalogs-'));
    const document = JSON.stringify(catalogs[0]!.catalog.toJson());
    for (const name of ['one', 'two']) {
      mkdirSync(join(directory, name));
      writeFileSync(join(directory, name, 'catalog.json'), document);
    }
    expect(() => loadCatalogConfigs(directory)).toThrow(/both declare the id/);
  });
});

describe('a turn', () => {
  it('accepts valid A2UI and returns the messages with the text around them', async () => {
    const provider = new ScriptedProvider([tagged(VALID)]);
    const result = await agentWith(provider).runTurn(promptTurn());

    expect(result).toMatchObject({
      ok: true,
      source: 'live',
      model: 'scripted-model',
      format: 'json',
      text: 'Here you go.',
      messages: VALID,
    });
    expect(result.attempts).toHaveLength(1);
    expect(provider.requests[0]!.system).toContain('A2UI JSON SCHEMA');
    expect(provider.requests[0]!.messages).toEqual([{ role: 'user', text: 'Say hello' }]);
  });

  it.each([
    ['raw JSON', JSON.stringify(VALID)],
    ['a Markdown fence', `Sure.\n\`\`\`json\n${JSON.stringify(VALID, null, 2)}\n\`\`\``],
  ])('accepts the same payload sent as %s', async (_label, reply) => {
    const result = await agentWith(new ScriptedProvider([reply])).runTurn(promptTurn());
    expect(result).toMatchObject({ ok: true, messages: VALID });
  });

  it('rejects an unknown component, tells the model why, and accepts the corrected reply', async () => {
    const provider = new ScriptedProvider([tagged(UNKNOWN_COMPONENT), tagged(VALID)]);
    const result = await agentWith(provider).runTurn(promptTurn());

    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]!.error).toMatchObject({ kind: 'validation' });
    expect(result.attempts[0]!.error!.message).toContain("Unknown component type 'Carousel'");
    const retry = provider.requests[1]!.messages;
    expect(retry).toHaveLength(3);
    expect(retry[2]!.text).toContain("Unknown component type 'Carousel'");
  });

  it('fails safely, with the validator issues, when every reply is invalid', async () => {
    const provider = new ScriptedProvider([tagged(INVALID_PROPERTY), tagged(INVALID_PROPERTY)]);
    const result = await agentWith(provider).runTurn(promptTurn());

    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_output' } });
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[1]!.error!.issues[0]).toMatchObject({
      message: expect.stringContaining("'colour'"),
      path: '/colour',
    });
    expect('messages' in result).toBe(false);
  });

  it.each([
    ['text with no A2UI', 'I cannot build that.', 'empty'],
    ['a block that is not JSON', '<a2ui-json>{not json</a2ui-json>', 'parse'],
    ['a dangling child reference', tagged(surface([{ id: 'root', component: 'Column', children: ['ghost'] }])), 'validation'],
  ])('rejects %s', async (_label, reply, kind) => {
    const result = await agentWith(new ScriptedProvider([reply]), 1).runTurn(promptTurn());
    expect(result.ok).toBe(false);
    expect(result.attempts[0]!.error!.kind).toBe(kind);
  });

  it('reports a provider failure without retrying or inventing output', async () => {
    const provider = new ScriptedProvider([new ProviderError('provider_unavailable', 'Cannot reach the local model.')]);
    const result = await agentWith(provider).runTurn(promptTurn());

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'provider_unavailable', message: 'Cannot reach the local model.' },
      attempts: [],
    });
    expect(provider.requests).toHaveLength(1);
  });

  it('refuses a renderer that supports none of the agent catalogs', async () => {
    const provider = new ScriptedProvider([tagged(VALID)]);
    const result = await agentWith(provider).runTurn({
      ...promptTurn(),
      capabilities: { '1.0': { supportedCatalogIds: ['https://example.test/other.json'] } },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'unsupported_catalog' } });
    expect(provider.requests).toHaveLength(0);
  });

  it('compiles an Express reply to the same wire messages', async () => {
    const provider = new ScriptedProvider(['<a2ui>\nsurface("main")\nroot = Text("Hello")\n</a2ui>'], 'express');
    const result = await agentWith(provider).runTurn(promptTurn());

    expect(result).toMatchObject({ ok: true, format: 'express' });
    expect(provider.requests[0]!.system).toContain('A2UI Express');
    const [message] = (result as { messages: Array<{ createSurface: { catalogId: string; components: unknown[] } }> }).messages;
    expect(message!.createSurface.catalogId).toBe(CATALOG_ID);
    expect(message!.createSurface.components).toEqual([{ id: 'root', component: 'Text', text: 'Hello' }]);
  });

  it('answers an action in the context of the turn that drew its surface', async () => {
    const provider = new ScriptedProvider([tagged(VALID)]);
    const action = { name: 'submit', surfaceId: 'main', sourceComponentId: 'go', timestamp: '2026-11-11T00:00:00Z', context: { name: 'Ada' } };
    const result = await agentWith(provider).runTurn({
      provider: 'local',
      input: { kind: 'action', action, prior: { prompt: 'Make a form', messages: VALID } },
      capabilities,
    });

    expect(result.ok).toBe(true);
    const [first, earlier, latest] = provider.requests[0]!.messages;
    expect(first).toEqual({ role: 'user', text: 'Make a form' });
    expect(earlier!.role).toBe('model');
    expect(earlier!.text).toContain('<a2ui-json>');
    expect(latest!.text).toContain('"name": "submit"');
    expect(latest!.text).toContain('"Ada"');
  });
});

describe('prerecorded samples', () => {
  const agent = agentWith(new ScriptedProvider([]));

  it.each(samples.map((sample) => [sample.id, sample] as const))('%s is valid A2UI for the catalog', async (_id, sample) => {
    const result = await agent.runTurn({
      provider: 'sample',
      input: { kind: 'prompt', text: sample.prompt, sampleId: sample.id },
      capabilities,
    });
    expect(result).toMatchObject({ ok: true, source: 'sample', model: 'prerecorded', messages: sample.messages });

    for (const name of Object.keys(sample.actions ?? {})) {
      const reply = await agent.runTurn({
        provider: 'sample',
        input: {
          kind: 'action',
          action: { name, surfaceId: 'main', sourceComponentId: 'submit', timestamp: '2026-11-11T00:00:00Z', context: { name: 'Ada' } },
          prior: { prompt: sample.prompt, messages: sample.messages, sampleId: sample.id },
        },
        capabilities,
      });
      expect(reply, `reply to ${name}`).toMatchObject({ ok: true, source: 'sample' });
    }
  });
});

describe('wrapping repair', () => {
  it('leaves tagged replies and plain prose alone', () => {
    expect(toTaggedResponse('<a2ui-json>[]</a2ui-json>')).toBe('<a2ui-json>[]</a2ui-json>');
    expect(toTaggedResponse('Just words.')).toBe('Just words.');
  });
});

describe('request validation', () => {
  const providers = { gemini: {}, local: {}, sample: {} } as unknown as Providers;

  it('accepts a prompt turn and an action turn', () => {
    expect(parseTurnRequest(promptTurn(), providers)).toMatchObject({ provider: 'local' });
    expect(
      parseTurnRequest(
        {
          provider: 'sample',
          capabilities,
          input: { kind: 'action', action: { name: 'go', context: {} }, prior: { prompt: 'p', messages: [] } },
        },
        providers,
      ),
    ).toMatchObject({ provider: 'sample' });
  });

  it.each([
    ['a non-object body', 'nope', /JSON object/],
    ['an unknown provider', { ...promptTurn(), provider: 'gpt' }, /Unknown provider/],
    ['an inherited property as provider', { ...promptTurn(), provider: 'constructor' }, /Unknown provider/],
    ['missing capabilities', { ...promptTurn(), capabilities: undefined }, /capabilities/],
    ['an empty prompt', { ...promptTurn(), input: { kind: 'prompt', text: '  ' } }, /empty/],
    ['an oversized prompt', { ...promptTurn(), input: { kind: 'prompt', text: 'x'.repeat(4001) } }, /longer than/],
    ['an action without its prior turn', { ...promptTurn(), input: { kind: 'action', action: { name: 'go', context: {} } } }, /turn that produced/],
    ['an unknown input kind', { ...promptTurn(), input: { kind: 'other' } }, /"prompt" or "action"/],
  ])('rejects %s', (_label, body, reason) => {
    expect(parseTurnRequest(body, providers)).toMatch(reason);
  });
});
