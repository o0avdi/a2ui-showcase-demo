import { describe, expect, it, vi } from 'vitest';

import { registry } from '../../src/a2ui/registry.ts';
import { Showcase } from '../../src/app/showcase.ts';
import type { StatusResponse, TurnRequest, TurnResponse } from '../../shared/contract.ts';
import registration from '../../samples/01-workshop-registration.json';

const BASIC_ID = registry.catalogs[0]!.id;

const STATUS: StatusResponse = {
  providers: [{ id: 'sample', label: 'Sample', source: 'sample', available: true, format: 'json', detail: '' }],
  defaultProvider: 'sample',
  samples: [],
  catalogIds: [BASIC_ID],
};

const success = (messages: unknown[]): TurnResponse => ({
  ok: true,
  source: 'sample',
  provider: 'sample',
  model: 'prerecorded',
  format: 'json',
  text: 'Here it is.',
  messages,
  attempts: [{ rawOutput: '...' }],
  elapsedMs: 3,
});
const failure: TurnResponse = {
  ok: false,
  provider: 'sample',
  error: { code: 'invalid_output', message: 'Not valid A2UI.' },
  attempts: [{ rawOutput: 'x', error: { kind: 'validation', message: 'bad', issues: [{ message: 'bad' }] } }],
  elapsedMs: 3,
};

function setup(...replies: TurnResponse[]) {
  const requestTurn = vi.fn(async (_request: TurnRequest) => replies.shift() ?? failure);
  const showcase = new Showcase({ catalogs: registry.catalogs, fetchStatus: async () => STATUS, requestTurn });
  const settled = () => vi.waitFor(() => expect(showcase.getState().busy).toBe(false));
  return { showcase, requestTurn, settled };
}

describe('the showcase loop', () => {
  it('sends a prompt with the renderer capabilities and stages the validated interface', async () => {
    const { showcase, requestTurn, settled } = setup(success(registration.messages));

    showcase.submitPrompt(`  ${registration.prompt}  `, 'workshop-registration');
    expect(showcase.getState().busy).toBe('prompt');
    await settled();

    expect(requestTurn).toHaveBeenCalledWith({
      provider: 'sample',
      input: { kind: 'prompt', text: registration.prompt, sampleId: 'workshop-registration' },
      capabilities: { '1.0': { supportedCatalogIds: [BASIC_ID] } },
    });
    const state = showcase.getState();
    expect(state.active!.rendered.surfaces).toHaveLength(1);
    expect(state.rendererIssues).toEqual([]);
    expect(state.conversation.map((entry) => entry.kind)).toEqual(['user', 'assistant']);
    expect(state.dataModel).toMatchObject({ form: { name: '' } });
  });

  it('keeps the data model current as bound values change', async () => {
    const { showcase, settled } = setup(success(registration.messages));
    showcase.submitPrompt(registration.prompt);
    await settled();

    showcase.getState().active!.rendered.surfaces[0]!.dataModel.set('/form/name', 'Ada');
    expect(showcase.getState().dataModel).toMatchObject({ form: { name: 'Ada' } });
  });

  it('sends an action back with the turn that drew its surface, and stages the reply', async () => {
    const confirmation = registration.actions.submit_registration.messages;
    const { showcase, requestTurn, settled } = setup(success(registration.messages), success(confirmation));
    showcase.submitPrompt(registration.prompt, 'workshop-registration');
    await settled();
    const form = showcase.getState().active!;

    await form.rendered.surfaces[0]!.dispatchAction(
      { event: { name: 'submit_registration', context: { name: 'Ada' } } },
      'submit',
    );
    await settled();

    const request = requestTurn.mock.calls[1]![0];
    expect(request.input).toMatchObject({
      kind: 'action',
      action: { name: 'submit_registration', sourceComponentId: 'submit', context: { name: 'Ada' } },
      prior: { prompt: registration.prompt, sampleId: 'workshop-registration', messages: registration.messages },
    });
    const state = showcase.getState();
    expect(state.active!.id).not.toBe(form.id);
    expect(state.active!.response.messages).toBe(confirmation);
    expect(state.conversation.map((entry) => entry.kind)).toEqual(['user', 'assistant', 'action', 'assistant']);
    expect(state.events.some((event) => event.kind === 'action')).toBe(true);
  });

  it('shows a failed turn and leaves the previous interface on stage', async () => {
    const { showcase, settled } = setup(success(registration.messages), failure);
    showcase.submitPrompt(registration.prompt);
    await settled();
    const staged = showcase.getState().active;

    showcase.submitPrompt('Something else');
    await settled();

    const state = showcase.getState();
    expect(state.active).toBe(staged);
    expect(state.lastResponse).toBe(failure);
    expect(state.conversation.at(-1)).toMatchObject({ kind: 'error', failure });
  });

  it('never stages messages the renderer refuses', async () => {
    const bad = [{ version: '1.0', createSurface: { surfaceId: 'main', catalogId: BASIC_ID, components: [{ id: 'root', component: 'Carousel' }] } }];
    const { showcase, settled } = setup(success(bad));
    showcase.submitPrompt('A carousel');
    await settled();

    const state = showcase.getState();
    expect(state.active).toBeNull();
    expect(state.rendererIssues[0]!.message).toContain("Unknown component type 'Carousel'");
  });

  it('ignores empty prompts and prompts sent while a turn is running', async () => {
    const { showcase, requestTurn, settled } = setup(success(registration.messages));
    showcase.submitPrompt('   ');
    expect(requestTurn).not.toHaveBeenCalled();

    showcase.submitPrompt('first');
    showcase.submitPrompt('second');
    await settled();
    expect(requestTurn).toHaveBeenCalledTimes(1);
  });

  it('starts on the server default provider, keeps a later choice, and reports a server that is down', async () => {
    const { showcase } = setup();
    await showcase.loadStatus();
    expect(showcase.getState()).toMatchObject({ provider: 'sample', status: STATUS, statusError: '' });

    showcase.setProvider('local');
    await showcase.loadStatus();
    expect(showcase.getState().provider).toBe('local');

    const unusableDefault = new Showcase({
      catalogs: registry.catalogs,
      fetchStatus: async () => ({ ...STATUS, defaultProvider: 'gemini' }),
      requestTurn: async () => failure,
    });
    await unusableDefault.loadStatus();
    expect(unusableDefault.getState().provider).toBe('sample');

    const down = new Showcase({
      catalogs: registry.catalogs,
      fetchStatus: async () => {
        throw new Error('Cannot reach the demo server.');
      },
      requestTurn: async () => failure,
    });
    await down.loadStatus();
    expect(down.getState().statusError).toBe('Cannot reach the demo server.');
  });

  it('clears the conversation and the stage on reset', async () => {
    const { showcase, settled } = setup(success(registration.messages));
    showcase.submitPrompt(registration.prompt);
    await settled();

    showcase.reset();
    expect(showcase.getState()).toMatchObject({ active: null, conversation: [], events: [], dataModel: {} });
  });
});
