# Betting Syndicate Workflow

Use the `Betting Syndicate Demo` budget to test this pattern.

## Core model

- Every place that can hold syndicate cash is an account.
- Partner-held personal money that still belongs to the syndicate is an account.
- Each bookmaker or exchange wallet is its own account.
- Moving money between holders or bookmaker wallets is always a transfer.
- Only economic events get categories: settled betting result, provider cost, fees, capital in, capital out.

## Suggested workflow

1. Record new member money as an inflow to the account currently holding it, categorized to `Partner Contributions`.
2. When cash moves from a partner float to a bookmaker or to the central pool, enter a transfer, not an expense.
3. Record bookmaker activity at settlement level in `Betting P&L`.
4. Record SaaS and data costs in `GCP`, `Sportmonks`, `Proxies & Tooling`, and `Bank Charges`.
5. Reconcile every tracked account to the real wallet or bank balance at least weekly.
6. When profit actually leaves the syndicate, categorize it to `Member Draws`. If it is still syndicate money in a partner account, keep it as a transfer.

## Why this works in Actual

- You keep one ledger for all cash locations.
- Provider spend is budgetable month to month.
- Bookmaker balances are easy to reconcile.
- Partner capital and real distributions stay separate from internal cash movements.

## Demo structure

- Accounts starting with `Syndicate -` are the seeded syndicate accounts.
- Category groups starting with `Syndicate` are the custom operating groups.
- Schedules show recurring provider costs.
- Rules auto-categorize common provider and bookmaker settlement payees.
