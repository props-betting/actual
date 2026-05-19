import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as api from '../packages/api/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const budgetId = 'syndicate-demo';
const budgetName = 'Betting Syndicate Demo';
const budgetDir = path.join(projectRoot, budgetId);
const templateDir = path.join(
  projectRoot,
  'packages/loot-core/src/mocks/files/default-budget-template',
);
const month = '2026-05';

async function resetBudgetFiles() {
  await fs.rm(budgetDir, { recursive: true, force: true });
  await fs.mkdir(budgetDir, { recursive: true });

  await fs.copyFile(
    path.join(templateDir, 'db.sqlite'),
    path.join(budgetDir, 'db.sqlite'),
  );

  const metadata = JSON.parse(
    await fs.readFile(path.join(templateDir, 'metadata.json'), 'utf8'),
  );
  metadata.id = 'Betting-Syndicate-Demo';
  metadata.budgetName = budgetName;
  metadata.budgetVersion = '1.0.0';
  metadata.isCached = true;

  await fs.writeFile(
    path.join(budgetDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2) + '\n',
  );
}

function tx(account, importedId, fields) {
  return {
    account,
    imported_id: importedId,
    ...fields,
  };
}

async function main() {
  await resetBudgetFiles();

  await api.init({ dataDir: projectRoot });
  try {
    await api.loadBudget(budgetId);

    const groups = {
      capitalIn: await api.createCategoryGroup({
        name: 'Syndicate Capital In',
        is_income: true,
      }),
      operations: await api.createCategoryGroup({
        name: 'Syndicate Operations',
      }),
      providers: await api.createCategoryGroup({
        name: 'Syndicate Providers & Infra',
      }),
      admin: await api.createCategoryGroup({
        name: 'Syndicate Admin',
      }),
      distributions: await api.createCategoryGroup({
        name: 'Syndicate Distributions',
      }),
    };

    const categories = {
      partnerContributions: await api.createCategory({
        name: 'Partner Contributions',
        group_id: groups.capitalIn,
      }),
      bettingPnL: await api.createCategory({
        name: 'Betting P&L',
        group_id: groups.operations,
      }),
      bookmakerFees: await api.createCategory({
        name: 'Bookmaker Fees & FX',
        group_id: groups.operations,
      }),
      gcp: await api.createCategory({
        name: 'GCP',
        group_id: groups.providers,
      }),
      sportmonks: await api.createCategory({
        name: 'Sportmonks',
        group_id: groups.providers,
      }),
      proxies: await api.createCategory({
        name: 'Proxies & Tooling',
        group_id: groups.providers,
      }),
      bankCharges: await api.createCategory({
        name: 'Bank Charges',
        group_id: groups.admin,
      }),
      memberDraws: await api.createCategory({
        name: 'Member Draws',
        group_id: groups.distributions,
      }),
    };

    await api.updateNote(
      categories.partnerContributions,
      'Use this when fresh capital enters the syndicate from a member. Movements between tracked personal and betting accounts should be transfers instead.',
    );
    await api.updateNote(
      categories.bettingPnL,
      'Record settled bookmaker profit and loss here. Deposits, withdrawals, and internal top-ups stay as transfers between accounts.',
    );
    await api.updateNote(
      categories.gcp,
      'Infrastructure spend for scrapers, dashboards, automation, and storage.',
    );

    const accounts = {
      ops: await api.createAccount(
        { name: 'Syndicate - Ops Cash', type: 'checking' },
        0,
      ),
      johnFloat: await api.createAccount(
        { name: 'Syndicate - John Personal Float', type: 'checking' },
        0,
      ),
      shaunFloat: await api.createAccount(
        { name: 'Syndicate - Shaun Personal Float', type: 'checking' },
        0,
      ),
      henryFloat: await api.createAccount(
        { name: 'Syndicate - Henry Personal Float', type: 'checking' },
        0,
      ),
      ryanFloat: await api.createAccount(
        { name: 'Syndicate - Ryan Personal Float', type: 'checking' },
        0,
      ),
      johnBetfair: await api.createAccount(
        { name: 'Syndicate - John Betfair', type: 'other' },
        0,
      ),
      dimaBet365: await api.createAccount(
        { name: 'Syndicate - Dima Bet365', type: 'other' },
        0,
      ),
      reeceSmarkets: await api.createAccount(
        { name: 'Syndicate - Reece Smarkets', type: 'other' },
        0,
      ),
      emilyMatchbook: await api.createAccount(
        { name: 'Syndicate - Emily Matchbook', type: 'other' },
        0,
      ),
    };

    await api.updateNote(
      accounts.ops,
      'Central operating wallet. Use this for provider costs, internal top-ups, and profit sweeps back from bookmaker accounts.',
    );
    await api.updateNote(
      accounts.johnFloat,
      'Tracked syndicate cash temporarily sitting in John’s personal banking stack before deployment.',
    );

    const payees = {
      googleCloud: await api.createPayee({ name: 'Google Cloud' }),
      sportmonks: await api.createPayee({ name: 'Sportmonks' }),
      ipRoyal: await api.createPayee({ name: 'IPRoyal' }),
      wiseFees: await api.createPayee({ name: 'Wise Fees' }),
      betfair: await api.createPayee({ name: 'Betfair Settlements' }),
      bet365: await api.createPayee({ name: 'Bet365 Settlements' }),
      smarkets: await api.createPayee({ name: 'Smarkets Settlements' }),
      matchbook: await api.createPayee({ name: 'Matchbook Settlements' }),
    };

    async function createCategorisationRule(payeeId, categoryId) {
      return api.createRule({
        stage: 'pre',
        conditionsOp: 'and',
        conditions: [
          {
            field: 'payee',
            op: 'is',
            value: payeeId,
          },
        ],
        actions: [
          {
            op: 'set',
            field: 'category',
            value: categoryId,
          },
        ],
      });
    }

    await createCategorisationRule(payees.googleCloud, categories.gcp);
    await createCategorisationRule(payees.sportmonks, categories.sportmonks);
    await createCategorisationRule(payees.ipRoyal, categories.proxies);
    await createCategorisationRule(payees.wiseFees, categories.bankCharges);
    await createCategorisationRule(payees.betfair, categories.bettingPnL);
    await createCategorisationRule(payees.bet365, categories.bettingPnL);
    await createCategorisationRule(payees.smarkets, categories.bettingPnL);
    await createCategorisationRule(payees.matchbook, categories.bettingPnL);

    const allPayees = await api.getPayees();
    const transferPayeeByAccount = Object.fromEntries(
      Object.entries(accounts).map(([key, accountId]) => {
        const transferPayee = allPayees.find(
          payee => payee.transfer_acct === accountId,
        );
        if (!transferPayee) {
          throw new Error(`Missing transfer payee for account ${accountId}`);
        }
        return [key, transferPayee.id];
      }),
    );

    await api.importTransactions(accounts.johnFloat, [
      tx(accounts.johnFloat, 'john-contrib-1', {
        date: '2026-05-01',
        amount: 300000,
        payee_name: 'John Capital Contribution',
        category: categories.partnerContributions,
        notes: 'Example of fresh syndicate capital from John.',
      }),
      tx(accounts.johnFloat, 'john-to-betfair-1', {
        date: '2026-05-03',
        amount: -150000,
        payee: transferPayeeByAccount.johnBetfair,
        notes: 'Deploy bankroll from John float to Betfair wallet.',
      }),
      tx(accounts.johnFloat, 'john-to-ops-1', {
        date: '2026-05-03',
        amount: -100000,
        payee: transferPayeeByAccount.ops,
        notes: 'Move spare cash into the central ops wallet.',
      }),
    ]);

    await api.importTransactions(accounts.shaunFloat, [
      tx(accounts.shaunFloat, 'shaun-contrib-1', {
        date: '2026-05-01',
        amount: 250000,
        payee_name: 'Shaun Capital Contribution',
        category: categories.partnerContributions,
      }),
      tx(accounts.shaunFloat, 'shaun-to-ops-1', {
        date: '2026-05-03',
        amount: -120000,
        payee: transferPayeeByAccount.ops,
        notes: 'Funding common top-up pool for non-partner bookmaker accounts.',
      }),
    ]);

    await api.importTransactions(accounts.henryFloat, [
      tx(accounts.henryFloat, 'henry-contrib-1', {
        date: '2026-05-01',
        amount: 150000,
        payee_name: 'Henry Capital Contribution',
        category: categories.partnerContributions,
      }),
    ]);

    await api.importTransactions(accounts.ryanFloat, [
      tx(accounts.ryanFloat, 'ryan-contrib-1', {
        date: '2026-05-01',
        amount: 150000,
        payee_name: 'Ryan Capital Contribution',
        category: categories.partnerContributions,
      }),
      tx(accounts.ryanFloat, 'ryan-iproyal-1', {
        date: '2026-05-09',
        amount: -2500,
        payee_name: 'IPRoyal',
        notes: 'Proxy spend paid personally but still a syndicate operating cost.',
      }),
    ]);

    await api.importTransactions(accounts.ops, [
      tx(accounts.ops, 'ops-to-dima-1', {
        date: '2026-05-04',
        amount: -80000,
        payee: transferPayeeByAccount.dimaBet365,
        notes: 'Top-up to non-partner Bet365 runner account.',
      }),
      tx(accounts.ops, 'ops-to-emily-1', {
        date: '2026-05-04',
        amount: -60000,
        payee: transferPayeeByAccount.emilyMatchbook,
        notes: 'Move trading float to Emily’s Matchbook wallet.',
      }),
      tx(accounts.ops, 'ops-to-reece-1', {
        date: '2026-05-04',
        amount: -40000,
        payee: transferPayeeByAccount.reeceSmarkets,
        notes: 'Allocate exchange bankroll to Reece.',
      }),
      tx(accounts.ops, 'ops-gcp-1', {
        date: '2026-05-06',
        amount: -7214,
        payee_name: 'Google Cloud',
        notes: 'Hosting and job runner costs.',
      }),
      tx(accounts.ops, 'ops-sportmonks-1', {
        date: '2026-05-07',
        amount: -3900,
        payee_name: 'Sportmonks',
        notes: 'Fixture and odds data subscription.',
      }),
      tx(accounts.ops, 'ops-wise-fees-1', {
        date: '2026-05-08',
        amount: -1200,
        payee_name: 'Wise Fees',
        notes: 'Example FX / transfer fee.',
      }),
      tx(accounts.ops, 'ops-draw-1', {
        date: '2026-05-24',
        amount: -25000,
        payee_name: 'May Member Draw',
        category: categories.memberDraws,
        notes: 'Example of profit leaving the syndicate entirely, not moving between tracked holders.',
      }),
    ]);

    await api.importTransactions(accounts.johnBetfair, [
      tx(accounts.johnBetfair, 'betfair-settle-1', {
        date: '2026-05-10',
        amount: 42000,
        payee_name: 'Betfair Settlements',
        notes: 'Weekend football arbs settled green.',
      }),
      tx(accounts.johnBetfair, 'betfair-settle-2', {
        date: '2026-05-12',
        amount: -7000,
        payee_name: 'Betfair Settlements',
        notes: 'Exchange commission and a losing scalp.',
      }),
      tx(accounts.johnBetfair, 'betfair-sweep-1', {
        date: '2026-05-20',
        amount: -50000,
        payee: transferPayeeByAccount.ops,
        notes: 'Sweep part of the balance back to central ops cash.',
      }),
    ]);

    await api.importTransactions(accounts.dimaBet365, [
      tx(accounts.dimaBet365, 'bet365-settle-1', {
        date: '2026-05-13',
        amount: -18000,
        payee_name: 'Bet365 Settlements',
        notes: 'Qualifying loss / promo churn example.',
      }),
    ]);

    await api.importTransactions(accounts.reeceSmarkets, [
      tx(accounts.reeceSmarkets, 'smarkets-settle-1', {
        date: '2026-05-14',
        amount: 9500,
        payee_name: 'Smarkets Settlements',
        notes: 'Tennis scalp net result.',
      }),
    ]);

    await api.importTransactions(accounts.emilyMatchbook, [
      tx(accounts.emilyMatchbook, 'matchbook-settle-1', {
        date: '2026-05-16',
        amount: 31500,
        payee_name: 'Matchbook Settlements',
        notes: 'Horse-trading session settled positive.',
      }),
      tx(accounts.emilyMatchbook, 'matchbook-sweep-1', {
        date: '2026-05-21',
        amount: -30000,
        payee: transferPayeeByAccount.ops,
        notes: 'Move profit back into the common pool.',
      }),
    ]);

    await api.setBudgetAmount(month, categories.gcp, 8000);
    await api.setBudgetCarryover(month, categories.gcp, true);
    await api.setBudgetAmount(month, categories.sportmonks, 4000);
    await api.setBudgetCarryover(month, categories.sportmonks, true);
    await api.setBudgetAmount(month, categories.proxies, 3000);
    await api.setBudgetCarryover(month, categories.proxies, true);
    await api.setBudgetAmount(month, categories.bankCharges, 2000);
    await api.setBudgetCarryover(month, categories.bankCharges, true);

    await api.createSchedule({
      name: 'GCP monthly renewal',
      posts_transaction: false,
      payee: payees.googleCloud,
      account: accounts.ops,
      amount: -7500,
      amountOp: 'is',
      date: {
        frequency: 'monthly',
        interval: 1,
        start: '2026-06-06',
        patterns: [],
        skipWeekend: false,
        weekendSolveMode: 'after',
        endMode: 'never',
      },
    });
    await api.createSchedule({
      name: 'Sportmonks monthly renewal',
      posts_transaction: false,
      payee: payees.sportmonks,
      account: accounts.ops,
      amount: -3900,
      amountOp: 'is',
      date: {
        frequency: 'monthly',
        interval: 1,
        start: '2026-06-07',
        patterns: [],
        skipWeekend: false,
        weekendSolveMode: 'after',
        endMode: 'never',
      },
    });
    await api.createSchedule({
      name: 'IPRoyal monthly renewal',
      posts_transaction: false,
      payee: payees.ipRoyal,
      account: accounts.ryanFloat,
      amount: -2500,
      amountOp: 'is',
      date: {
        frequency: 'monthly',
        interval: 1,
        start: '2026-06-09',
        patterns: [],
        skipWeekend: false,
        weekendSolveMode: 'after',
        endMode: 'never',
      },
    });

    const budgets = await api.getBudgets();
    const budget = budgets.find(item => item.id === budgetId);

    console.log(`Seeded budget: ${budget?.name ?? budgetName}`);
    console.log(`Budget folder: ${budgetDir}`);
    console.log(`Open in app: http://localhost:5006`);
  } finally {
    await api.shutdown();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
