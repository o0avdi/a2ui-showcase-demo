/**
 * Any server that speaks the OpenAI chat-completions API: LM Studio, Ollama,
 * llama.cpp, vLLM. Two plain `fetch` calls, so there is no SDK to keep in step
 * with whichever local server is in use.
 */

import type { InferenceFormat, ProviderStatus } from '../../shared/contract.ts';
import type { LocalConfig } from '../config.ts';
import { ProviderError, type GenerateRequest, type GenerateResult, type ModelProvider } from './types.ts';

const LABEL = 'Local model';
const STATUS_TIMEOUT_MS = 1_500;

/** Reasoning models put their scratch work in the reply; it is not part of the answer. */
const stripReasoning = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

const describe = (error: unknown) => {
  if (error instanceof Error && error.name === 'TimeoutError') return 'the request timed out';
  if (error instanceof Error && error.cause instanceof Error) return error.cause.message;
  return error instanceof Error ? error.message : String(error);
};

export class OpenAiCompatibleProvider implements ModelProvider {
  readonly id = 'local';
  readonly source = 'live';
  readonly jsonMode = false;
  readonly format: InferenceFormat;

  constructor(
    private readonly config: LocalConfig | { disabledReason: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.format = 'disabledReason' in config ? 'express' : config.format;
  }

  private headers(config: LocalConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    };
  }

  async status(): Promise<ProviderStatus> {
    const base = { id: this.id, label: LABEL, source: this.source, format: this.format } as const;
    const config = this.config;
    if ('disabledReason' in config) return { ...base, available: false, detail: config.disabledReason };
    const origin = new URL(config.baseUrl).host;
    try {
      const response = await this.fetchImpl(`${config.baseUrl}/models`, {
        headers: this.headers(config),
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { data?: Array<{ id?: string }> };
      const listed = body.data?.some((entry) => entry.id === config.model) ?? false;
      return {
        ...base,
        available: true,
        model: config.model,
        detail: listed
          ? `Connected to ${origin}.`
          : `Connected to ${origin}, but it does not list "${config.model}".`,
      };
    } catch (error) {
      return { ...base, available: false, model: config.model, detail: `Cannot reach ${origin}: ${describe(error)}.` };
    }
  }

  async generate({ system, messages, signal }: GenerateRequest): Promise<GenerateResult> {
    const config = this.config;
    if ('disabledReason' in config) throw new ProviderError('provider_unavailable', config.disabledReason);
    const timeout = AbortSignal.timeout(config.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(config),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          stream: false,
          messages: [
            { role: 'system', content: system },
            ...messages.map((message) => ({
              role: message.role === 'model' ? 'assistant' : 'user',
              content: message.text,
            })),
          ],
        }),
      });
    } catch (error) {
      throw new ProviderError(
        'provider_unavailable',
        `Cannot reach the local model at ${new URL(config.baseUrl).host}: ${describe(error)}.`,
      );
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new ProviderError('provider_error', `The local model returned HTTP ${response.status}. ${detail}`.trim());
    }
    const body = (await response.json().catch(() => null)) as {
      model?: string;
      choices?: Array<{ message?: { content?: unknown } }>;
    } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new ProviderError('provider_error', 'The local model reply had no message content.');
    }
    return { text: stripReasoning(content), model: body?.model ?? config.model };
  }
}
