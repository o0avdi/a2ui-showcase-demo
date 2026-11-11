/**
 * What the model is told, apart from the catalog.
 *
 * The catalog, the message schema and the output format come from the SDK's
 * prompt snippet, which is generated from the same catalogs the reply is
 * validated against. These are the showcase's own instructions around it, and
 * they hold for every inference format.
 */

import type { A2uiAction } from '../shared/contract.ts';

const ROLE = `You are the interface agent of an interactive showcase. You answer every request by composing a user interface from the component catalog below, sent as A2UI. The interface is your answer.

Showcase rules:
- Build exactly one surface, with the surface id "main". It holds the whole component tree and the initial values of its data model.
- Use only the components, properties and functions the catalog defines. Do not invent any.
- Bind the value of every input to its own path in the data model, such as /form/email, and give each path an initial value.
- Give a form one primary Button. Its action is an event with a descriptive snake_case name, and a context that passes each bound value the agent needs.
- Put a short Text heading at the top, and wrap forms and summaries in a Card.
- When the user message reports an action, reply with a new surface that shows its result, such as a confirmation that uses the values in the action's context.`;

const WITH_TEXT = 'Before the A2UI block, write one short sentence saying what you built.';

const RAW_JSON =
  'Output format override: reply with only the JSON array of A2UI messages. Do not add tags, Markdown fences or any other text.';

export function buildSystemPrompt(promptSnippet: string, rawJson: boolean): string {
  return [ROLE, rawJson ? RAW_JSON : WITH_TEXT, promptSnippet].join('\n\n');
}

export function describeAction(action: A2uiAction): string {
  return `The user interacted with the interface. The renderer sent this A2UI action:

${JSON.stringify({ version: '1.0', action }, null, 2)}

Reply with a new surface that shows the result of this action.`;
}

export function buildRetryMessage(error: string): string {
  return `Your previous reply was rejected by the A2UI validator: ${error}

Send the complete corrected reply in the required output format, using only what the catalog defines.`;
}
