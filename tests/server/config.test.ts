import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../server/config.ts';

describe('server configuration', () => {
  it('starts in sample mode with both live providers off when nothing is set', () => {
    const config = loadConfig({});
    expect(config.defaultProvider).toBe('sample');
    expect(config.host).toBe('127.0.0.1');
    expect(config.gemini).toHaveProperty('disabledReason');
    expect(config.local).toHaveProperty('disabledReason');
  });

  it('enables Gemini from a key, writing JSON by default', () => {
    const config = loadConfig({ GEMINI_API_KEY: ' key ', GEMINI_MODEL: 'some-model' });
    expect(config.gemini).toEqual({ apiKey: 'key', model: 'some-model', format: 'json', jsonMode: false });
  });

  it('enables a local endpoint on this machine, writing Express by default', () => {
    const config = loadConfig({ LOCAL_LLM_BASE_URL: 'http://localhost:1234/v1/', LOCAL_LLM_MODEL: 'm' });
    expect(config.local).toMatchObject({ baseUrl: 'http://localhost:1234/v1', model: 'm', format: 'express' });
  });

  it.each([
    ['a remote host', 'http://10.0.0.5:1234/v1', /not this machine/],
    ['a non-http scheme', 'file:///etc/passwd', /http\(s\)/],
    ['embedded credentials', 'http://user:pass@localhost:1234/v1', /credentials/],
    ['something that is not a URL', 'localhost', /not a valid URL/],
  ])('refuses a local endpoint with %s', (_label, url, reason) => {
    const { local } = loadConfig({ LOCAL_LLM_BASE_URL: url, LOCAL_LLM_MODEL: 'm' });
    expect(local).toHaveProperty('disabledReason');
    expect((local as { disabledReason: string }).disabledReason).toMatch(reason);
  });

  it('allows a remote local endpoint only when asked to', () => {
    const { local } = loadConfig({
      LOCAL_LLM_BASE_URL: 'http://10.0.0.5:1234/v1',
      LOCAL_LLM_MODEL: 'm',
      LOCAL_LLM_ALLOW_REMOTE: 'true',
    });
    expect(local).toMatchObject({ baseUrl: 'http://10.0.0.5:1234/v1' });
  });

  it('ignores an unknown default provider and clamps the attempt limit', () => {
    const config = loadConfig({ DEFAULT_PROVIDER: 'gpt', MAX_ATTEMPTS: '99' });
    expect(config.defaultProvider).toBe('sample');
    expect(config.maxAttempts).toBe(4);
  });
});
