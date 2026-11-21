import { BrowsemuxError } from './errors.mjs';
import { validateHttpUrl } from './util/url.mjs';

const INPUT_GROUPS = Object.freeze({
  text: 'text',
  select: 'select',
  keys: 'key',
  key: 'key',
  urls: 'url',
  url: 'url',
});

export function normalizeInputs(value) {
  if (value === undefined || value === null) {
    return { entries: [], byKey: {} };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BrowsemuxError('Inputs must be a JSON object', { code: 'INVALID_INPUTS' });
  }

  const entries = [];
  const byKey = {};
  for (const [groupName, groupValue] of Object.entries(value)) {
    const kind = INPUT_GROUPS[groupName];
    if (!kind) {
      throw new BrowsemuxError(`Unsupported input group: ${groupName}`, {
        code: 'INVALID_INPUTS',
      });
    }
    if (!groupValue || typeof groupValue !== 'object' || Array.isArray(groupValue)) {
      throw new BrowsemuxError(`Input group ${groupName} must be an object`, {
        code: 'INVALID_INPUTS',
      });
    }

    for (const [rawKey, rawEntry] of Object.entries(groupValue)) {
      const key = String(rawKey).trim();
      if (!key) throw new BrowsemuxError('Input keys must not be empty', { code: 'INVALID_INPUTS' });
      if (byKey[key]) {
        throw new BrowsemuxError(`Duplicate input key: ${key}`, { code: 'INVALID_INPUTS' });
      }
      const entry = normalizeEntry(key, kind, rawEntry);
      entries.push(entry);
      byKey[key] = entry;
    }
  }
  return { entries, byKey };
}

function normalizeEntry(key, kind, raw) {
  const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { value: raw };
  const value = object.value;
  if (typeof value !== 'string' || !value.length) {
    throw new BrowsemuxError(`Input ${key} requires a non-empty string value`, {
      code: 'INVALID_INPUTS',
    });
  }
  if (kind === 'url') validateHttpUrl(value);
  return {
    key,
    kind,
    value: kind === 'url' ? validateHttpUrl(value) : value,
    label: String(object.label ?? key),
    secret: Boolean(object.secret),
  };
}

export function inputsForKind(inputs, kind) {
  return inputs?.entries?.filter((entry) => entry.kind === kind) ?? [];
}

export function resolveInput(inputs, entryKey, expectedKind) {
  if (!entryKey) return undefined;
  const entry = inputs?.byKey?.[entryKey];
  if (!entry) {
    throw new BrowsemuxError(`Decision selected unknown input: ${entryKey}`, {
      code: 'UNKNOWN_INPUT',
    });
  }
  if (expectedKind && entry.kind !== expectedKind) {
    throw new BrowsemuxError(`Input ${entryKey} is ${entry.kind}, expected ${expectedKind}`, {
      code: 'INPUT_KIND_MISMATCH',
    });
  }
  return entry;
}

export function publicInputMetadata(inputs, entries = inputs?.entries ?? []) {
  return entries.map((entry) => ({
    key: entry.key,
    kind: entry.kind,
    label: entry.label,
    value: entry.secret ? '[redacted]' : entry.value,
    secret: entry.secret,
  }));
}
