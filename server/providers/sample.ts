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
import { budgetReply, budgetSample } from './budget-sample.ts';
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
  const recorded = readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(directory, file), 'utf8')) as Sample);
  return [...recorded, budgetSample];
}

const asResponseText = (reply: SampleReply, messages = reply.messages) =>
  `${reply.text}\n<a2ui-json>${JSON.stringify(messages)}</a2ui-json>`;

function parseBudgetPromptUpdate(text: string, current?: { fundBalance: number; expenseCost: number }) {
  const numbers = [...text.matchAll(/\$?\s*(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  if (numbers.length === 0) return null;

  let fundBalance = current?.fundBalance ?? 3000;
  let expenseCost = current?.expenseCost ?? 1200;

  if (/\b(repair|cost|expense|car)\b/i.test(text) && !/\b(emergency|fund|balance)\b/i.test(text)) {
    expenseCost = numbers[0];
  } else if (/\b(emergency|fund|balance)\b/i.test(text) && !/\b(repair|cost|expense|car)\b/i.test(text)) {
    fundBalance = numbers[0];
  } else if (numbers.length >= 2) {
    [fundBalance, expenseCost] = numbers;
  } else {
    fundBalance = numbers[0];
  }

  return budgetReply({ name: 'check_coverage', context: { fundBalance, expenseCost } });
}

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
      detail: `${this.samples.length} sample interfaces. No model is called.`,
    };
  }

  async generate({ input, budgetContext }: GenerateRequest): Promise<GenerateResult> {
    const model = 'prerecorded';
    if (input.kind === 'prompt') {
      const exactMatch = this.samples.find((sample) => sample.prompt === input.text);
      const activeSample = this.samples.find((sample) => sample.id === input.sampleId);
      const sample = exactMatch ?? activeSample ?? this.samples[0];
      if (!sample) throw new ProviderError('provider_unavailable', 'No sample files were found.');

      if (exactMatch || (activeSample && input.text === activeSample.prompt)) {
        return { text: asResponseText(sample), model };
      }

      if (sample.id === budgetSample.id && this.samples.includes(budgetSample)) {
        const updated = parseBudgetPromptUpdate(input.text, budgetContext?.scenario);
        if (updated) return { text: asResponseText(updated), model };
      }

      // Never let a recording pass as an answer to a prompt it was not made for,
      // while keeping the currently active sample on stage instead of overwriting it.
      const text = `Sample mode cannot generate from a new prompt, so this stays on "${sample.title}". Use the buttons on stage or choose a model to generate from your own words.`;
      return { text: asResponseText({ ...sample, text }), model };
    }

    const { action, prior } = input;
    if (
      prior.sampleId === budgetSample.id &&
      this.samples.includes(budgetSample) &&
      ['select_category', 'edit_amounts', 'check_coverage', 'show_emergency_fund'].includes(action.name)
    ) {
      return { text: asResponseText(budgetReply(action)), model };
    }
    const reply = this.samples.find((sample) => sample.id === prior.sampleId)?.actions?.[action.name];
    if (!reply) {
      throw new ProviderError(
        'provider_error',
        `Sample mode has no prerecorded reply to the "${action.name}" action. Connect a model to answer it.`,
      );
    }
    const surfaceId = reply.messages.find((message) => message.createSurface)?.createSurface.surfaceId;
    const withContext = [
      ...reply.messages,
      { version: '1.0', updateDataModel: { surfaceId, path: ACTION_CONTEXT_PATH, value: action.context } },
    ];
    return { text: asResponseText(reply, withContext), model };
  }
}