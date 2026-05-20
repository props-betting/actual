export function normalizeConfiguredServerUrl(url: string | null | undefined) {
  if (!url) {
    return url ?? null;
  }

  try {
    const parsedUrl = new URL(url);

    // Always drop search/hash because they are never part of the sync-server base URL.
    parsedUrl.search = '';
    parsedUrl.hash = '';

    // For hosted web deployments on the same origin, users often paste the full
    // current page URL (for example `/error` or `/login`). That breaks Actual's
    // sync-server path construction, so collapse same-origin URLs back to the
    // bare origin.
    if (
      typeof window !== 'undefined' &&
      parsedUrl.origin === window.location.origin
    ) {
      return parsedUrl.origin;
    }

    return parsedUrl.toString().replace(/\/+$/, '');
  } catch {
    return url;
  }
}
