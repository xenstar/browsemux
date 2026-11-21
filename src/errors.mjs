export class BrowsemuxError extends Error {
  constructor(message, { code = 'BROWSEMUX_ERROR', cause, details } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'BrowsemuxError';
    this.code = code;
    this.details = details;
  }
}

export function errorResult(error) {
  return {
    code: error?.code ?? 'BROWSEMUX_ERROR',
    message: error?.message ?? String(error),
    details: error?.details,
  };
}
