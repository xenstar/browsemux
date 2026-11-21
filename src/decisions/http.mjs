import { BrowsemuxError } from '../errors.mjs';

export async function postJson({
  url,
  apiKey,
  body,
  headers = {},
  timeoutMs = 30_000,
  fetchImpl = fetch,
  signal,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (cause) {
      throw new BrowsemuxError(`Decision API returned invalid JSON (${response.status})`, {
        code: 'INVALID_DECISION_RESPONSE',
        cause,
        details: { body: text.slice(0, 500) },
      });
    }
    if (!response.ok) {
      throw new BrowsemuxError(
        `Decision API ${response.status}: ${payload.error?.message ?? text.slice(0, 300)}`,
        {
          code: 'DECISION_HTTP_ERROR',
          details: {
            status: response.status,
            requestId: response.headers.get('x-request-id') ?? undefined,
          },
        },
      );
    }
    return { payload, headers: response.headers };
  } catch (error) {
    if (error.name === 'AbortError') {
      if (signal?.aborted) {
        throw new BrowsemuxError('Decision request cancelled', { code: 'ABORT_ERR', cause: error });
      }
      throw new BrowsemuxError(`Decision API timed out after ${timeoutMs}ms`, {
        code: 'DECISION_TIMEOUT',
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
