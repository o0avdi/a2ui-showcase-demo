import type { ProviderId } from '../../shared/contract.ts';
import type { Config } from '../config.ts';
import { GeminiProvider } from './gemini.ts';
import { OpenAiCompatibleProvider } from './openai-compatible.ts';
import { SampleProvider, type Sample } from './sample.ts';
import type { ModelProvider } from './types.ts';

export type Providers = Record<ProviderId, ModelProvider>;

export function createProviders(config: Config, samples: Sample[]): Providers {
  return {
    gemini: new GeminiProvider(config.gemini),
    local: new OpenAiCompatibleProvider(config.local),
    sample: new SampleProvider(samples),
  };
}
