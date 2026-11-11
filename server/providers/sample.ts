/**
 * Sample mode: prerecorded A2UI, replayed from `samples/*.json`.
 *
 * No model is involved, and every reply says so. The text this returns goes
 * through the same parser and validator as model output, so a sample that no
 * longer fits its catalog fails the way a bad model reply would.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ProviderStatus, SampleSummary } from '../../shared/contract.ts';
import { ProviderError, type GenerateRequest, type GenerateResult, type ModelProvider } from './types.ts';

interface SampleReply {
  text: string;
  messages: Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface Sample extends SampleReply, SampleSummary {
  /** Prerecorded replies to this sample's own actions, by action name. */
  actions?: Record<string, SampleReply>;
}

/** Where a replayed action reply finds the values the user submitted. */
const ACTION_CONTEXT_PATH = '/action';

export function loadSamples(directory: string): Sample[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(directory, file), 'utf8')) as Sample);
}

const asResponseText = (reply: SampleReply, messages = reply.messages) =>
  `${reply.text}\n<a2ui-json>${JSON.stringify(messages)}</a2ui-json>`;

export class SampleProvider implements ModelProvider {
  readonly id = 'sample';
  readonly source = 'sample';
  readonly format = 'json';
  readonly jsonMode = false;

  constructor(private readonly samples: Sample[]) {}

  summaries(): SampleSummary[] {
    return this.samples.map(({ id, title, prompt }) => ({ id, title, prompt }));
  }

  async status(): Promise<ProviderStatus> {
    return {
      id: this.id,
      label: 'Sample (prerecorded)',
      source: this.source,
      available: this.samples.length > 0,
      format: this.format,
      detail: `${this.samples.length} prerecorded interfaces. No model is called.`,
    };
  }

  async generate({ input }: GenerateRequest): Promise<GenerateResult> {
    const model = 'prerecorded';
    if (input.kind === 'prompt') {
      const recorded =
        this.samples.find((sample) => sample.id === input.sampleId) ??
        this.samples.find((sample) => sample.prompt === input.text);
      const sample = recorded ?? this.samples[0];
      if (!sample) throw new ProviderError('provider_unavailable', 'No sample files were found.');
      if (recorded) return { text: asResponseText(sample), model };
      // Never let a recording pass as an answer to a prompt it was not made for.
      const text = `Sample mode cannot generate from a new prompt, so this is the prerecorded "${sample.title}". Choose a model to generate from your own words.`;
      return { text: asResponseText({ ...sample, text }), model };
    }

    const { action, prior } = input;
    const reply = this.samples.find((sample) => sample.id === prior.sampleId)?.actions?.[action.name];
    if (!reply) {
      throw new ProviderError(
        'provider_error',
        `Sample mode has no prerecorded reply to the "${action.name}" action. Connect a model to answer it.`,
      );
    }
    // The one thing a recording cannot contain is what this user typed, so the
    // action's context is handed to the reply's data model for it to bind to.
    const surfaceId = reply.messages.find((message) => message.createSurface)?.createSurface.surfaceId;
    const withContext = [
      ...reply.messages,
      { version: '1.0', updateDataModel: { surfaceId, path: ACTION_CONTEXT_PATH, value: action.context } },
    ];
    return { text: asResponseText(reply, withContext), model };
  }
}
