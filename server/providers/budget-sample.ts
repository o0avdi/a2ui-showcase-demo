import {
  calculateCoverage,
  formatMoney as money,
  INITIAL_BUDGET_CATEGORIES as categories,
  parseDollarAmount as amount,
} from '../../shared/budget.ts';
import type { Sample } from './sample.ts';

const catalogId = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';

const text = (id: string, value: string) => ({ id, component: 'Text', text: value });
const row = (id: string, children: string[]) => ({ id, component: 'Row', justify: 'spaceBetween', children });
const column = (id: string, children: string[]) => ({ id, component: 'Column', children });
const card = (id: string, child: string) => ({ id, component: 'Card', child });
const path = (field: string) => ({ '@path': '/scenario/' + field });
const scenarioContext = { fundBalance: path('fundBalance'), expenseCost: path('expenseCost') };
const button = (id: string, label: string, name: string, context: Record<string, unknown>) => [
  { id, component: 'Button', child: id + '_label', action: { event: { name, context } } },
  text(id + '_label', label),
];

export function budgetReply(action?: { name: string; context: Record<string, unknown> }) {
  const fundBalance = amount(action?.context.fundBalance, action?.name === 'check_coverage' ? NaN : 3000);
  const expenseCost = amount(action?.context.expenseCost, action?.name === 'check_coverage' ? NaN : 1200);
  const valid = Number.isFinite(fundBalance) && Number.isFinite(expenseCost);
  const category = action?.name === 'select_category'
    ? categories.find(({ id }) => id === action.context.category)
    : undefined;
  const editing = action?.name === 'edit_amounts' || !valid;

  const result = valid
    ? calculateCoverage(fundBalance, expenseCost).summary
    : 'Enter two valid nonnegative dollar amounts.';

  const detailText = category
    ? 'Showing sample transactions for ' + category.name + '.'
    : !valid
      ? 'Enter two valid nonnegative dollar amounts.'
      : editing
        ? 'Enter your balance and estimated repair cost.'
        : result;

  const planned = categories.reduce((total, entry) => total + entry.budget, 0);
  const spent = categories.reduce((total, entry) => total + entry.spent, 0);

  const stats = [
    ['budget', planned, 'Budget'],
    ['spent', spent, 'Spent'],
    ['remaining', planned - spent, 'Remaining'],
  ] as const;

  const details = category
    ? [
        text('detail_title', '### ' + category.name + ' · Recent transactions'),
        ...category.transactions.map((transaction, index) => text('transaction_' + index, transaction)),
        ...button('show_fund', 'Show emergency fund', 'show_emergency_fund', scenarioContext),
      ]
    : editing
      ? [
          text('detail_title', '### Emergency fund · Car repair'),
          { id: 'fund_input', component: 'TextField', variant: 'number', label: 'Emergency fund balance', value: path('fundBalance') },
          { id: 'cost_input', component: 'TextField', variant: 'number', label: 'Estimated repair cost', value: path('expenseCost') },
          ...button('check', 'Check coverage', 'check_coverage', scenarioContext),
          ...(!valid ? [text('input_error', detailText)] : []),
        ]
      : [
          text('detail_title', '### Emergency fund · Car repair'),
          text('fund', 'Emergency fund balance · **' + money(fundBalance) + '**'),
          text('cost', 'Estimated repair cost · **' + money(expenseCost) + '**'),
          text('result', '**' + result + '**'),
          ...button('edit', 'Edit amounts', 'edit_amounts', scenarioContext),
        ];

  const components = [
    column('root', ['title', 'sample_label', 'summary', 'category_card', 'details_card']),
    text('title', '# November budget'),
    text('sample_label', 'Sample data'),
    row('summary', stats.map(([id]) => id)),
    ...stats.flatMap(([id, value, label]) => [
      card(id, id + '_text'),
      text(id + '_text', '**' + money(value) + '**  \n' + label),
    ]),
    card('category_card', 'categories'),
    column('categories', ['headers', ...categories.map(({ id }) => id + '_row')]),
    row('headers', ['category_header', 'spending_header', 'status_header']),
    text('category_header', '**Category**'),
    text('spending_header', '**Spent / Budget**'),
    text('status_header', '**Status**'),
    ...categories.flatMap(({ id, name, spent, budget }) => [
      row(id + '_row', [id, id + '_spending', id + '_status']),
      ...button(id, name, 'select_category', { ...scenarioContext, category: id }),
      text(id + '_spending', money(spent) + ' / ' + money(budget)),
      text(id + '_status', money(Math.abs(budget - spent)) + (spent > budget ? ' over' : ' left')),
    ]),
    card('details_card', 'details'),
    column('details', details.filter(({ id }) => !id.endsWith('_label')).map(({ id }) => id)),
    ...details,
  ];

  return {
    text: detailText,
    messages: [
      {
        version: '1.0',
        createSurface: {
          surfaceId: 'november-budget',
          catalogId,
          components,
          dataModel: {
            scenario: {
              fundBalance: Number.isFinite(fundBalance) ? fundBalance : '',
              expenseCost: Number.isFinite(expenseCost) ? expenseCost : '',
            },
          },
        },
      },
    ],
  };
}

export const budgetSample: Sample = {
  id: 'november-budget',
  title: 'November budget and emergency fund',
  prompt: 'Could my emergency fund cover a $1,200 car repair?',
  ...budgetReply(),
};