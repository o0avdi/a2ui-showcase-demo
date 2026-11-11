/**
 * The HTTP contract between the web app and the server.
 *
 * This is the only file both sides import. A2UI payloads cross it untouched:
 * `messages` are A2UI v1.0 agent-to-renderer messages, `action` is the v1.0
 * renderer-to-agent action, and `capabilities` is what the SDK's
 * `MessageProcessor.getRendererCapabilities` returns. Nothing here redefines
 * the protocol.
 */

export type ProviderId = 'gemini' | 'local' | 'sample';

/**
 * How the model writes A2UI. `json` is the wire format itself; `express` is
 * the SDK's compact shorthand, which the SDK compiles to the same messages.
 */
export type InferenceFormat = 'json' | 'express';

/** Whether a turn came from a model or from a prerecorded file. */
export type TurnSource = 'live' | 'sample';

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  source: TurnSource;
  /** False when required configuration is missing or the endpoint is unreachable. */
  available: boolean;
  model?: string;
  format: InferenceFormat;
  /** Why it is unavailable, or where it is pointed. Never contains secrets. */
  detail: string;
}

export interface SampleSummary {
  id: string;
  title: string;
  prompt: string;
}

export interface StatusResponse {
  providers: ProviderStatus[];
  defaultProvider: ProviderId;
  samples: SampleSummary[];
  /** Ids of the catalogs the server can prompt a model with. */
  catalogIds: string[];
}

/** A2UI v1.0 `action`, as the SDK's action listener reports it. */
export interface A2uiAction {
  name: string;
  surfaceId: string;
  sourceComponentId: string;
  timestamp: string;
  context: Record<string, unknown>;
  [key: string]: unknown;
}

/** The turn that produced the surface an action came from. */
export interface PriorTurn {
  prompt: string;
  messages: unknown[];
  sampleId?: string;
}

export type TurnInput =
  | { kind: 'prompt'; text: string; sampleId?: string }
  | { kind: 'action'; action: A2uiAction; prior: PriorTurn };

export interface TurnRequest {
  provider: ProviderId;
  input: TurnInput;
  /** `MessageProcessor.getRendererCapabilities({ versions: ['1.0'] })`. */
  capabilities: unknown;
}

export interface ValidationIssue {
  message: string;
  /** JSON Pointer into the offending component, when the SDK reports one. */
  path?: string;
  surfaceId?: string;
}

/** One request to a provider and what became of its output. */
export interface Attempt {
  rawOutput: string;
  /** Absent when the output parsed and validated. */
  error?: { kind: 'parse' | 'validation' | 'empty'; message: string; issues: ValidationIssue[] };
}

export type TurnErrorCode =
  | 'bad_request'
  | 'provider_unavailable'
  | 'provider_error'
  | 'invalid_output'
  | 'unsupported_catalog';

export interface TurnSuccess {
  ok: true;
  source: TurnSource;
  provider: ProviderId;
  model: string;
  format: InferenceFormat;
  /** Anything the model said outside its A2UI blocks. */
  text: string;
  messages: unknown[];
  attempts: Attempt[];
  elapsedMs: number;
}

export interface TurnFailure {
  ok: false;
  provider: ProviderId;
  model?: string;
  error: { code: TurnErrorCode; message: string };
  attempts: Attempt[];
  elapsedMs: number;
}

export type TurnResponse = TurnSuccess | TurnFailure;
