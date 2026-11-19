export interface BudgetCategory {
  id: string;
  name: string;
  spent: number;
  budget: number;
  transactions: string[];
}

export interface BudgetScenario {
  fundBalance: number;
  expenseCost: number;
}

export interface CoverageResult {
  covered: boolean;
  fundBalance: number;
  expenseCost: number;
  /** Positive remaining balance when covered; 0 when short. */
  remaining: number;
  /** Positive shortfall when not covered; 0 when covered. */
  shortfall: number;
  summary: string;
}

export interface BudgetContext {
  categories: BudgetCategory[];
  scenario: BudgetScenario;
  coverage?: CoverageResult;
  selectedCategoryId?: string;
}

export const INITIAL_BUDGET_CATEGORIES: BudgetCategory[] = [
  { id: 'groceries', name: 'Groceries', spent: 340, budget: 400, transactions: ['Nov 12 · Groceries · $85'] },
  {
    id: 'dining_out',
    name: 'Dining out',
    spent: 285,
    budget: 250,
    transactions: ['Nov 12 · Takeout · $42', 'Nov 10 · Dinner · $68', 'Nov 08 · Coffee · $15'],
  },
  { id: 'transport', name: 'Transport', spent: 120, budget: 200, transactions: ['Nov 09 · Fuel · $45'] },
  { id: 'other', name: 'Other spending', spent: 1035, budget: 1550, transactions: ['Nov 01 · Rent · $1,000'] },
];

export const INITIAL_SCENARIO: BudgetScenario = {
  fundBalance: 3000,
  expenseCost: 1200,
};

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export const formatMoney = (amount: number): string => dollars.format(amount);

export function parseDollarAmount(value: unknown, fallback: number): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value.trim()))) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1e9 ? parsed : fallback;
}

export function calculateCoverage(fundBalance: number, expenseCost: number): CoverageResult {
  const diff = (Math.round(fundBalance * 100) - Math.round(expenseCost * 100)) / 100;
  const covered = diff >= 0;
  const remaining = covered ? diff : 0;
  const shortfall = covered ? 0 : -diff;
  const summary = covered
    ? `${formatMoney(remaining)} left in your emergency fund after the repair.`
    : `${formatMoney(shortfall)} short of covering the repair.`;

  return { covered, fundBalance, expenseCost, remaining, shortfall, summary };
}

export function createInitialBudgetContext(): BudgetContext {
  return {
    categories: INITIAL_BUDGET_CATEGORIES.map((c) => ({ ...c, transactions: [...c.transactions] })),
    scenario: { ...INITIAL_SCENARIO },
    coverage: calculateCoverage(INITIAL_SCENARIO.fundBalance, INITIAL_SCENARIO.expenseCost),
  };
}