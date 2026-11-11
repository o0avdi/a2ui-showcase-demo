/**
 * Server configuration, read once from the environment.
 *
 * Model endpoints and keys live here and nowhere else: the browser can pick a
 * provider by id but can never supply a URL, a model name or a key.
 */

import type { InferenceFormat, ProviderId } from '../shared/contract.ts';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  format: InferenceFormat;
  /** Ask for raw JSON. Only meaningful with the `json` format. */
  jsonMode: boolean;
}

export interface LocalConfig {
  baseUrl: string;
  model: string;
  format: InferenceFormat;
  apiKey: string;
  timeoutMs: number;
}

export interface Config {
  port: number;
  host: string;
  defaultProvider: ProviderId;
  maxAttempts: number;
  gemini: GeminiConfig | { disabledReason: string };
  local: LocalConfig | { disabledReason: string };
}

type Env = Record<string, string | undefined>;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const PROVIDER_IDS: readonly ProviderId[] = ['gemini', 'local', 'sample'];

const text = (value: string | undefined) => value?.trim() ?? '';
const flag = (value: string | undefined) => text(value).toLowerCase() === 'true';

function format(value: string | undefined, fallback: InferenceFormat): InferenceFormat {
  const requested = text(value).toLowerCase();
  return requested === 'json' || requested === 'express' ? requested : fallback;
}

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function geminiConfig(env: Env): Config['gemini'] {
  const apiKey = text(env.GEMINI_API_KEY);
  if (!apiKey) return { disabledReason: 'Set GEMINI_API_KEY in .env to enable Gemini.' };
  return {
    apiKey,
    model: text(env.GEMINI_MODEL) || 'gemini-3.8-flash',
    format: format(env.GEMINI_FORMAT, 'json'),
    jsonMode: flag(env.GEMINI_JSON_MODE),
  };
}

function localConfig(env: Env): Config['local'] {
  const rawUrl = text(env.LOCAL_LLM_BASE_URL);
  const model = text(env.LOCAL_LLM_MODEL);
  if (!rawUrl || !model) {
    return { disabledReason: 'Set LOCAL_LLM_BASE_URL and LOCAL_LLM_MODEL in .env to enable a local model.' };
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { disabledReason: 'LOCAL_LLM_BASE_URL is not a valid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { disabledReason: 'LOCAL_LLM_BASE_URL must be an http(s) URL.' };
  }
  if (url.username || url.password) {
    return { disabledReason: 'LOCAL_LLM_BASE_URL must not contain credentials; use LOCAL_LLM_API_KEY.' };
  }
  if (!LOOPBACK_HOSTS.has(url.hostname) && !flag(env.LOCAL_LLM_ALLOW_REMOTE)) {
    return {
      disabledReason: `LOCAL_LLM_BASE_URL points at ${url.hostname}, which is not this machine. Set LOCAL_LLM_ALLOW_REMOTE=true to allow it.`,
    };
  }
  return {
    baseUrl: url.href.replace(/\/+$/, ''),
    model,
    // Express by default: its prompt is half the size, which small context windows need.
    format: format(env.LOCAL_LLM_FORMAT, 'express'),
    apiKey: text(env.LOCAL_LLM_API_KEY),
    timeoutMs: integer(env.LOCAL_LLM_TIMEOUT_MS, 180_000, 5_000, 900_000),
  };
}

export function loadConfig(env: Env = process.env): Config {
  const requested = text(env.DEFAULT_PROVIDER) as ProviderId;
  return {
    port: integer(env.PORT, 8787, 1, 65_535),
    host: text(env.HOST) || '127.0.0.1',
    defaultProvider: PROVIDER_IDS.includes(requested) ? requested : 'sample',
    maxAttempts: integer(env.MAX_ATTEMPTS, 2, 1, 4),
    gemini: geminiConfig(env),
    local: localConfig(env),
  };
}
