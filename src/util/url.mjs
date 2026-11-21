import { BrowsemuxError } from '../errors.mjs';

export function validateHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BrowsemuxError('URL must be a non-empty string', { code: 'INVALID_URL' });
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch (cause) {
    throw new BrowsemuxError(`Invalid URL: ${value}`, { code: 'INVALID_URL', cause });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BrowsemuxError('URL must use http or https', { code: 'INVALID_URL' });
  }
  return url.toString();
}
