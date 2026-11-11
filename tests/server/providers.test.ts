import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { TurnInput } from '../../shared/contract.ts';
import { GeminiProvider } from '../../server/providers/gemini.ts';
import { OpenAiCompatibleProvider } from '../../server/providers/openai-compatible.ts';
import { loadSamples, SampleProvider } from '../../server/providers/sample.ts';
import { ProviderError } from '../../server/providers/types.ts';

const LOCAL = { baseUrl: 'http://localhost:1234/v1', model: 'test-model', format: 'express', apiKey: '', timeoutMs: 5_000 } as const;
const PROMPT: TurnInput = { kind: 'prompt', text: 'a form' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('OpenAI-compatible provider', () => {
  it('sends a chat-completions request and returns the reply text', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json({ model: 'test-model-q4', choices: [{ message: { content: '<think>plan</think>\nHello' } }] }),
    );
    const provider = new OpenAiCompatibleProvider({ ...LOCAL, apiKey: 'secret' }, fetchMock as typeof fetch);

    const result = await provider.generate({
      system: 'SYSTEM',
      messages: [
        { role: 'user', text: 'one' },
        { role: 'model', text: 'two' },
      ],
      input: PROMPT,
    });

    expect(result).toEqual({ text: 'Hello', model: 'test-model-q4' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:1234/v1/chat/completions');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('test-model');
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYSTEM' },
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
    ]);
  });

  it('reports an unreachable endpoint as unavailable instead of throwing something else', async () => {
    const refuse = vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:1234') });
    });
    const provider = new OpenAiCompatibleProvider(LOCAL, refuse as unknown as typeof fetch);

    await expect(provider.generate({ system: '', messages: [], input: PROMPT })).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'provider_unavailable',
      message: expect.stringContaining('ECONNREFUSED'),
    });
    const status = await provider.status();
    expect(status.available).toBe(false);
    expect(status.detail).toContain('Cannot reach localhost:1234');
  });

  it('reports an HTTP error and a reply without content as provider errors', async () => {
    const tooLong = new OpenAiCompatibleProvider(LOCAL, (async () => json({ error: 'context too long' }, 400)) as typeof fetch);
    await expect(tooLong.generate({ system: '', messages: [], input: PROMPT })).rejects.toMatchObject({
      code: 'provider_error',
      message: expect.stringContaining('HTTP 400'),
    });
    const empty = new OpenAiCompatibleProvider(LOCAL, (async () => json({ choices: [] })) as typeof fetch);
    await expect(empty.generate({ system: '', messages: [], input: PROMPT })).rejects.toBeInstanceOf(ProviderError);
  });

  it('says whether the endpoint lists the configured model', async () => {
    const listed = new OpenAiCompatibleProvider(LOCAL, (async () => json({ data: [{ id: 'test-model' }] })) as typeof fetch);
    expect(await listed.status()).toMatchObject({ available: true, model: 'test-model', format: 'express' });
    const other = new OpenAiCompatibleProvider(LOCAL, (async () => json({ data: [{ id: 'other' }] })) as typeof fetch);
    expect((await other.status()).detail).toContain('does not list "test-model"');
  });

  it('is unavailable, with the reason, when it is not configured', async () => {
    const provider = new OpenAiCompatibleProvider({ disabledReason: 'Set LOCAL_LLM_BASE_URL.' });
    expect(await provider.status()).toMatchObject({ available: false, detail: 'Set LOCAL_LLM_BASE_URL.' });
    await expect(provider.generate({ system: '', messages: [], input: PROMPT })).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
  });
});

describe('Gemini provider', () => {
  it('is unavailable without a key and never calls the network', async () => {
    const provider = new GeminiProvider({ disabledReason: 'Set GEMINI_API_KEY.' });
    expect(await provider.status()).toMatchObject({ available: false, detail: 'Set GEMINI_API_KEY.' });
    await expect(provider.generate({ system: '', messages: [], input: PROMPT })).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
  });

  it('reports the configured model and only uses raw-JSON mode with the JSON format', async () => {
    const provider = new GeminiProvider({ apiKey: 'k', model: 'gemini-test', format: 'express', jsonMode: true });
    expect(await provider.status()).toMatchObject({ available: true, model: 'gemini-test', format: 'express' });
    expect(provider.jsonMode).toBe(false);
  });
});

describe('sample provider', () => {
  const samples = loadSamples(join(import.meta.dirname, '..', '..', 'samples'));
  const provider = new SampleProvider(samples);
  const registration = samples.find((sample) => sample.id === 'workshop-registration')!;

  it('labels itself as prerecorded', async () => {
    expect(provider.source).toBe('sample');
    expect(await provider.status()).toMatchObject({ available: true, label: 'Sample (prerecorded)' });
    expect(provider.summaries()[0]).toEqual({
      id: registration.id,
      title: registration.title,
      prompt: registration.prompt,
    });
  });

  it('replays the requested sample, and the first one for a prompt it has no recording of', async () => {
    const byId = await provider.generate({ system: '', messages: [], input: { ...PROMPT, sampleId: 'workshop-agenda' } });
    expect(byId.text).toContain('Workshop Agenda');
    const exact = await provider.generate({ system: '', messages: [], input: { kind: 'prompt', text: registration.prompt } });
    expect(exact.text.startsWith(registration.text)).toBe(true);

    const fallback = await provider.generate({ system: '', messages: [], input: PROMPT });
    expect(fallback.text).toContain('Engineering Workshop Registration');
    expect(fallback.text).toMatch(/^Sample mode cannot generate from a new prompt/);
    expect(fallback.model).toBe('prerecorded');
  });

  it("hands an action's context to the recorded reply's data model", async () => {
    const { text } = await provider.generate({
      system: '',
      messages: [],
      input: {
        kind: 'action',
        action: { name: 'submit_registration', surfaceId: 'main', sourceComponentId: 'submit', timestamp: '', context: { name: 'Ada' } },
        prior: { prompt: registration.prompt, messages: registration.messages, sampleId: registration.id },
      },
    });
    const messages = JSON.parse(text.slice(text.indexOf('<a2ui-json>') + 11, text.indexOf('</a2ui-json>')));
    expect(messages.at(-1)).toEqual({
      version: '1.0',
      updateDataModel: { surfaceId: 'main', path: '/action', value: { name: 'Ada' } },
    });
  });

  it('refuses an action it has no recording for', async () => {
    await expect(
      provider.generate({
        system: '',
        messages: [],
        input: {
          kind: 'action',
          action: { name: 'unknown_action', surfaceId: 'main', sourceComponentId: 'x', timestamp: '', context: {} },
          prior: { prompt: 'p', messages: [], sampleId: registration.id },
        },
      }),
    ).rejects.toMatchObject({ code: 'provider_error', message: expect.stringContaining('unknown_action') });
  });
});
