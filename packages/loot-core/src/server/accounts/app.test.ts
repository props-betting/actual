// @ts-strict-ignore
import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';

import { app } from './app';

const closeAccountHandler = app.handlers['account-close'];

beforeEach(async () => {
  await global.emptyDatabase()();
  await loadMappings();
});

describe('account-close', () => {
  it('recreates a missing transfer payee before forcing an account closed', async () => {
    await db.insertAccount({ id: 'checking', name: 'Checking' });
    await db.insertTransaction({
      id: 'txn-1',
      account: 'checking',
      amount: 5000,
      date: '2026-05-20',
      payee: null,
      cleared: true,
    });

    await expect(
      closeAccountHandler({
        id: 'checking',
        forced: true,
      }),
    ).resolves.toBeUndefined();

    expect(
      await db.first('SELECT id FROM accounts WHERE id = ? AND tombstone = 0', [
        'checking',
      ]),
    ).toBeNull();
  });
});
