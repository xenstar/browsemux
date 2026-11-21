import { BrowsemuxError } from './errors.mjs';
import { inputsForKind, resolveInput } from './inputs.mjs';
import { validateHttpUrl } from './util/url.mjs';

export const SCHEMA_VERSION = '1';

export const OPERATIONS = Object.freeze([
  'CLICK',
  'TYPE',
  'SELECT',
  'PRESS',
  'SCROLL_UP',
  'SCROLL_DOWN',
  'BACK',
  'WAIT',
  'NAVIGATE',
  'DONE',
  'BLOCKED',
]);

export const TARGET_ROLES = Object.freeze({
  CLICK: new Set([
    'button',
    'link',
    'menuitem',
    'option',
    'tab',
    'checkbox',
    'radio',
    'switch',
    'treeitem',
  ]),
  TYPE: new Set(['textbox', 'combobox', 'searchbox']),
  SELECT: new Set(['combobox', 'listbox', 'select']),
});

const INPUT_KIND = Object.freeze({
  TYPE: 'text',
  SELECT: 'select',
  PRESS: 'key',
  NAVIGATE: 'url',
});

export function allowedOperations(observation, inputs, { allowBlocked = true } = {}) {
  const result = ['CLICK', 'SCROLL_UP', 'SCROLL_DOWN', 'BACK', 'WAIT', 'DONE'];
  if (inputsForKind(inputs, 'text').length) result.splice(1, 0, 'TYPE');
  if (inputsForKind(inputs, 'select').length) result.splice(2, 0, 'SELECT');
  if (inputsForKind(inputs, 'key').length) result.push('PRESS');
  if (inputsForKind(inputs, 'url').length) result.push('NAVIGATE');
  if (allowBlocked) result.push('BLOCKED');

  if (!Object.values(observation?.refs ?? {}).some((details) =>
    TARGET_ROLES.CLICK.has(role(details)))) {
    remove(result, 'CLICK');
  }
  return [...new Set(result)];
}

export function validateProposal(proposal, observation, inputs) {
  if (!proposal || typeof proposal !== 'object') {
    throw invalidProposal('Decision provider returned no proposal');
  }
  const operation = String(proposal.operation ?? '').toUpperCase();
  if (!OPERATIONS.includes(operation)) {
    throw invalidProposal(`Unsupported operation: ${proposal.operation}`);
  }

  if (['DONE', 'BLOCKED', 'SCROLL_UP', 'SCROLL_DOWN', 'BACK', 'WAIT'].includes(operation)) {
    return { operation, target: null, inputKey: null };
  }

  if (operation === 'NAVIGATE') {
    const input = resolveInput(inputs, proposal.inputKey, 'url');
    if (!input) throw invalidProposal('NAVIGATE requires a selected URL input');
    return { operation, target: null, inputKey: input.key, input };
  }

  if (operation === 'PRESS') {
    const input = resolveInput(inputs, proposal.inputKey, 'key');
    if (!input) throw invalidProposal('PRESS requires a selected key input');
    return { operation, target: null, inputKey: input.key, input };
  }

  const target = String(proposal.target ?? '');
  if (!target || target === 'none_of_the_above') {
    throw invalidProposal(`${operation} requires an observed target`, 'STALE_TARGET');
  }
  const details = observation?.refs?.[target];
  if (!details) {
    throw invalidProposal(`Target ${target} is not in the latest snapshot`, 'STALE_TARGET');
  }
  const targetRole = role(details);
  if (!TARGET_ROLES[operation]?.has(targetRole)) {
    throw invalidProposal(
      `Target ${target} has role ${targetRole || 'unknown'}, which is invalid for ${operation}`,
      'INVALID_TARGET_ROLE',
    );
  }

  if (INPUT_KIND[operation]) {
    const input = resolveInput(inputs, proposal.inputKey, INPUT_KIND[operation]);
    if (!input) throw invalidProposal(`${operation} requires a selected ${INPUT_KIND[operation]} input`);
    if (operation === 'NAVIGATE') validateHttpUrl(input.value);
    return { operation, target, inputKey: input.key, input, targetDetails: details };
  }

  return { operation, target, inputKey: null, targetDetails: details };
}

export function executionInput(validated) {
  return {
    target: validated.target ?? undefined,
    value: validated.input?.value,
  };
}

export function semanticSignature(validated, observation) {
  const details = validated.target ? observation.refs?.[validated.target] : undefined;
  const targetIdentity = details
    ? `${role(details)}:${String(details.name ?? '').trim().toLowerCase()}`
    : validated.target ?? '';
  const inputIdentity = validated.input
    ? `${validated.input.kind}:${validated.input.key}`
    : '';
  return [validated.operation, targetIdentity, inputIdentity].join('|');
}

export function normalizeProposal(value) {
  const operation = String(value?.operation ?? value?.action ?? '').toUpperCase();
  return {
    operation,
    target: value?.target ?? value?.ref ?? null,
    inputKey: value?.inputKey ?? value?.input_key ?? null,
    confidence: finiteProbability(value?.confidence),
    reasonCode: value?.reasonCode ?? value?.reason_code ?? null,
  };
}

export function deterministicSuccess(observation, criteria = {}) {
  const checks = [];
  if (criteria.urlContains) {
    checks.push(String(observation?.url ?? '').includes(criteria.urlContains));
  }
  if (criteria.textContains) {
    checks.push(String(observation?.snapshot ?? '').includes(criteria.textContains));
  }
  return checks.length > 0 && checks.every(Boolean);
}

export function compactObservation(observation, maxChars = 4_000) {
  const snapshot = String(observation?.snapshot ?? '');
  return {
    url: String(observation?.url ?? ''),
    title: String(observation?.title ?? ''),
    snapshot: snapshot.length > maxChars
      ? `${snapshot.slice(0, maxChars)}\n[snapshot truncated]`
      : snapshot,
    refCount: Object.keys(observation?.refs ?? {}).length,
  };
}

function role(details) {
  return String(details?.role ?? '').toLowerCase();
}

function remove(items, value) {
  const index = items.indexOf(value);
  if (index >= 0) items.splice(index, 1);
}

function invalidProposal(message, code = 'INVALID_PROPOSAL') {
  return new BrowsemuxError(message, { code });
}

function finiteProbability(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : undefined;
}
