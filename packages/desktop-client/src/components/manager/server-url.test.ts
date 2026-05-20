import { describe, expect, it, vi } from 'vitest';

import { normalizeConfiguredServerUrl } from './server-url';

describe('normalizeConfiguredServerUrl', () => {
  it('collapses same-origin page URLs back to the bare origin', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'https://props-actual-prod.toweranalytics.co.uk',
      },
    });

    expect(
      normalizeConfiguredServerUrl(
        'https://props-actual-prod.toweranalytics.co.uk/error',
      ),
    ).toBe('https://props-actual-prod.toweranalytics.co.uk');

    vi.unstubAllGlobals();
  });

  it('preserves external subpath deployments while trimming query and hash', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'https://props-actual-prod.toweranalytics.co.uk',
      },
    });

    expect(
      normalizeConfiguredServerUrl(
        'https://sync.example.com/actual?foo=bar#login',
      ),
    ).toBe('https://sync.example.com/actual');

    vi.unstubAllGlobals();
  });
});
