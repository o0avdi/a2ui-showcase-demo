/**
 * The one interface every model backend implements.
 *
 * A provider turns a system prompt and a short conversation into text. It
 * knows nothing about A2UI: prompting, parsing and validation happen in
 * `server/agent.ts`, the same way for every provider.
 */

import type { InferenceFormat, ProviderId, ProviderStatus, TurnInput, TurnSource } from '../../shared/contract.ts';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GenerateRequest {
  system: string;
  messages: ChatMessage[];
  /** The turn being answered. Live providers ignore it; the sample provider selects by it. */
  input: TurnInput;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  model: string;
}

export interface ModelProvider {
  readonly id: ProviderId;
  readonly source: TurnSource;
  /** The inference format this provider's model is prompted in and answers in. */
  readonly format: InferenceFormat;
  /** True when the provider is asked for raw JSON, so the prompt must not ask for tags or prose. */
  readonly jsonMode: boolean;
  status(): Promise<ProviderStatus>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

/** A failure to get any output from a provider, as opposed to getting invalid output. */
export class ProviderError extends Error {
  readonly code: 'provider_unavailable' | 'provider_error';

  constructor(code: 'provider_unavailable' | 'provider_error', message: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}
