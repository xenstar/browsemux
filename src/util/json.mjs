import { BrowsemuxError } from '../errors.mjs';

export function parseJsonOutput(output) {
  const text = String(output ?? '').trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const starts = [text.indexOf('{'), text.indexOf('[')].filter((index) => index >= 0);
    if (!starts.length) {
      throw new BrowsemuxError('Command output did not contain JSON', {
        code: 'INVALID_JSON',
        details: { output: text.slice(0, 500) },
      });
    }
    const start = Math.min(...starts);
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (end <= start) {
      throw new BrowsemuxError('Command output contained incomplete JSON', {
        code: 'INVALID_JSON',
        details: { output: text.slice(0, 500) },
      });
    }
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (cause) {
      throw new BrowsemuxError('Command returned invalid JSON', {
        code: 'INVALID_JSON',
        cause,
        details: { output: text.slice(0, 500) },
      });
    }
  }
}

export function parseJsonOption(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (cause) {
    throw new BrowsemuxError(`${name} must be valid JSON`, {
      code: 'INVALID_JSON_OPTION',
      cause,
    });
  }
}
