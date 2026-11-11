import { ApiError, GoogleGenAI } from '@google/genai';

import type { InferenceFormat, ProviderStatus } from '../../shared/contract.ts';
import type { GeminiConfig } from '../config.ts';
import { ProviderError, type GenerateRequest, type GenerateResult, type ModelProvider } from './types.ts';

const LABEL = 'Gemini';

export class GeminiProvider implements ModelProvider {
  readonly id = 'gemini';
  readonly source = 'live';
  readonly format: InferenceFormat;
  readonly jsonMode: boolean;
  private readonly client: GoogleGenAI | null;
  private readonly model: string | undefined;
  private readonly disabledReason: string;

  constructor(config: GeminiConfig | { disabledReason: string }) {
    if ('disabledReason' in config) {
      this.client = null;
      this.format = 'json';
      this.jsonMode = false;
      this.disabledReason = config.disabledReason;
      return;
    }
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model;
    this.format = config.format;
    this.jsonMode = config.jsonMode && config.format === 'json';
    this.disabledReason = '';
  }

  async status(): Promise<ProviderStatus> {
    // A configured key is reported as available without spending a request on it;
    // a bad key surfaces as a provider error on the first turn.
    return {
      id: this.id,
      label: LABEL,
      source: this.source,
      available: this.client !== null,
      model: this.model,
      format: this.format,
      detail: this.client ? 'API key configured (verified on first request).' : this.disabledReason,
    };
  }

  async generate({ system, messages, signal }: GenerateRequest): Promise<GenerateResult> {
    if (!this.client || !this.model) throw new ProviderError('provider_unavailable', this.disabledReason);
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: messages.map((message) => ({ role: message.role, parts: [{ text: message.text }] })),
        config: {
          systemInstruction: system,
          temperature: 0.2,
          abortSignal: signal,
          ...(this.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      });
      return { text: response.text ?? '', model: this.model };
    } catch (error) {
      const status = error instanceof ApiError ? ` (HTTP ${error.status})` : '';
      const reason = error instanceof Error ? error.message : String(error);
      throw new ProviderError('provider_error', `Gemini request failed${status}: ${reason}`);
    }
  }
}
