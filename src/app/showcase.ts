/**
 * The app's state and the one loop that changes it:
 *
 *   prompt or action -> server turn -> validated A2UI -> renderer -> stage
 *
 * The panels read `ShowcaseState` and call the methods here; none of them talk
 * to the server or the A2UI SDK directly. It is a plain class behind
 * `useSyncExternalStore` so an action raised by the SDK, outside React, always
 * sees current state.
 */

import {
  calculateCoverage,
  createInitialBudgetContext,
  parseDollarAmount,
  type A2uiAction,
  type BudgetContext,
  type PriorTurn,
  type ProviderId,
  type StatusResponse,
  type TurnFailure,
  type TurnInput,
  type TurnRequest,
  type TurnResponse,
  type TurnSuccess,
  type ValidationIssue,
} from '../../shared/contract.ts';
import type { LoadedCatalog } from '../a2ui/catalogs.ts';
import { dataModelOf, rendererCapabilities, renderTurn, type RenderedTurn } from '../a2ui/renderer.ts';

export type ConversationEntry =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'action'; action: A2uiAction }
  | { id: number; kind: 'assistant'; response: TurnSuccess }
  | { id: number; kind: 'error'; failure: TurnFailure };

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

export interface LogEvent {
  id: number;
  at: string;
  kind: 'prompt' | 'response' | 'action' | 'error';
  title: string;
  detail?: unknown;
}

/** The interface on stage, and everything needed to answer an action from it. */
export interface ActiveTurn {
  /** Unique per staged turn, so React remounts the surface for a new renderer. */
  id: number;
  prior: PriorTurn;
  response: TurnSuccess;
  rendered: RenderedTurn;
}

export interface ShowcaseState {
  status: StatusResponse | null;
  statusError: string;
  provider: ProviderId;
  /** What the server is working on, if anything. */
  busy: false | 'prompt' | 'action';
  budgetActive: boolean;
  budget: BudgetContext;
  conversation: ConversationEntry[];
  events: LogEvent[];
  active: ActiveTurn | null;
  /** The staged surface's data model, kept current as the user interacts. */
  dataModel: unknown;
  /** The most recent server answer, including a failed one. */
  lastResponse: TurnResponse | null;
  /** Messages the renderer refused after the server accepted them. */
  rendererIssues: ValidationIssue[];
}

export interface ShowcaseDeps {
  catalogs: LoadedCatalog[];
  fetchStatus: () => Promise<StatusResponse>;
  requestTurn: (request: TurnRequest) => Promise<TurnResponse>;
}

const INITIAL: ShowcaseState = {
  status: null,
  statusError: '',
  provider: 'sample',
  busy: false,
  budget: createInitialBudgetContext(),
  budgetActive: false,
  conversation: [],
  events: [],
  active: null,
  dataModel: {},
  lastResponse: null,
  rendererIssues: [],
};

export class Showcase {
  private state = INITIAL;
  private readonly listeners = new Set<() => void>();
  private readonly capabilities: unknown;
  private nextId = 1;
  private stopWatchingData: (() => void) | null = null;

  constructor(private readonly deps: ShowcaseDeps) {
    this.capabilities = rendererCapabilities(deps.catalogs.map((loaded) => loaded.catalog));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): ShowcaseState => this.state;

  async loadStatus(): Promise<void> {
    try {
      const status = await this.deps.fetchStatus();
      const usable = status.providers.some((entry) => entry.id === status.defaultProvider && entry.available);
      const provider = this.state.status ? this.state.provider : usable ? status.defaultProvider : 'sample';
      this.update({ status, statusError: '', provider });
    } catch (error) {
      this.update({ statusError: error instanceof Error ? error.message : String(error) });
    }
  }

  setProvider(provider: ProviderId): void {
    this.update({ provider });
  }

  submitPrompt(text: string, sampleId?: string): void {
    const prompt = text.trim();
    if (!prompt || this.state.busy) return;
    const activeSampleId = sampleId ?? this.state.active?.prior.sampleId;
    const isBudgetTurn =
      this.state.budgetActive ||
      activeSampleId === 'november-budget' ||
      /\b(budget|emergency fund|car repair)\b/i.test(prompt);
    if (isBudgetTurn && !this.state.budgetActive) {
      this.update({ budgetActive: true });
    }
    this.say({ kind: 'user', text: prompt });
    this.log('prompt', 'Prompt sent', { prompt, provider: this.state.provider });
    void this.run(
      { kind: 'prompt', text: prompt, ...(activeSampleId ? { sampleId: activeSampleId } : {}) },
      { prompt, sampleId: activeSampleId },
    );
  }

  /** Clears the conversation and the stage. Provider and status are kept. */
  reset(): void {
    if (this.state.busy) return;
    this.stage(null);
    this.update({
      conversation: [],
      events: [],
      lastResponse: null,
      rendererIssues: [],
      budget: createInitialBudgetContext(),
      budgetActive: false,
    });
  }

  dispose(): void {
    this.stage(null);
    this.listeners.clear();
  }

  /** An action raised by a component, delivered by the SDK's action pipeline. */
  private handleAction(action: A2uiAction): void {
    this.log('action', `Action "${action.name}" from ${action.sourceComponentId}`, action);
    const { active, busy } = this.state;
    if (!active || busy) return;

    const fundBalance = parseDollarAmount(action.context.fundBalance, this.state.budget.scenario.fundBalance);
    const expenseCost = parseDollarAmount(action.context.expenseCost, this.state.budget.scenario.expenseCost);
    const selectedCategoryId =
      action.name === 'select_category' && typeof action.context.category === 'string'
        ? action.context.category
        : action.name === 'show_emergency_fund'
          ? undefined
          : this.state.budget.selectedCategoryId;

    this.update({
      budget: {
        ...this.state.budget,
        scenario: { fundBalance, expenseCost },
        coverage: calculateCoverage(fundBalance, expenseCost),
        selectedCategoryId,
      },
    });

    this.say({ kind: 'action', action });
    void this.run({ kind: 'action', action, prior: active.prior }, active.prior);
  }

  private async run(input: TurnInput, origin: Pick<PriorTurn, 'prompt' | 'sampleId'>): Promise<void> {
    this.update({ busy: input.kind });
    const response = await this.deps.requestTurn({
      provider: this.state.provider,
      input,
      capabilities: this.capabilities,
      ...(this.state.budgetActive ? { budgetContext: this.state.budget } : {}),
    });

    if (!response.ok) {
      this.say({ kind: 'error', failure: response });
      this.log('error', response.error.message, response);
      this.update({ busy: false, lastResponse: response });
      return;
    }

    const rendered = renderTurn(
      this.deps.catalogs.map((loaded) => loaded.catalog),
      response.messages,
      (action) => this.handleAction(action),
    );
    this.say({ kind: 'assistant', response });
    this.log('response', `${response.messages.length} A2UI message(s) from ${response.model}`, {
      source: response.source,
      attempts: response.attempts.length,
      elapsedMs: response.elapsedMs,
    });
    for (const issue of rendered.issues) this.log('error', `Renderer rejected a message: ${issue.message}`, issue);

    if (rendered.issues.length > 0) {
      rendered.processor.dispose();
      this.update({ busy: false, lastResponse: response, rendererIssues: rendered.issues });
      return;
    }
    this.stage({ id: this.nextId++, prior: { ...origin, messages: response.messages }, response, rendered });
    this.update({ busy: false, lastResponse: response, rendererIssues: [] });
  }

  /** Swaps the staged turn, releasing the previous renderer. */
  private stage(next: ActiveTurn | null): void {
    this.stopWatchingData?.();
    this.stopWatchingData = null;
    this.state.active?.rendered.processor.dispose();

    const surface = next?.rendered.surfaces[0];
    if (surface) {
      const syncFromModel = () => {
        const model = dataModelOf(surface);
        this.update({ dataModel: model });
        const scenario = (model as { scenario?: Record<string, unknown> })?.scenario;
        if (scenario) {
          const fundBalance = parseDollarAmount(scenario.fundBalance, this.state.budget.scenario.fundBalance);
          const expenseCost = parseDollarAmount(scenario.expenseCost, this.state.budget.scenario.expenseCost);
          this.update({
            budget: {
              ...this.state.budget,
              scenario: { fundBalance, expenseCost },
              coverage: calculateCoverage(fundBalance, expenseCost),
            },
          });
        }
      };
      const subscription = surface.dataModel.subscribe('/', syncFromModel);
      this.stopWatchingData = () => subscription.unsubscribe();
    }
    this.update({ active: next, dataModel: surface ? dataModelOf(surface) : {} });
  }

  private say(entry: WithoutId<ConversationEntry>): void {
    const withId = { ...entry, id: this.nextId++ } as ConversationEntry;
    this.update({ conversation: [...this.state.conversation, withId] });
  }

  private log(kind: LogEvent['kind'], title: string, detail?: unknown): void {
    const event: LogEvent = { id: this.nextId++, at: new Date().toISOString(), kind, title, detail };
    this.update({ events: [event, ...this.state.events].slice(0, 200) });
  }

  private update(patch: Partial<ShowcaseState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}