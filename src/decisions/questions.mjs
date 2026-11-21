import {
  allowedOperations,
  normalizeProposal,
  TARGET_ROLES,
} from '../contracts.mjs';
import { BrowsemuxError } from '../errors.mjs';
import { inputsForKind, publicInputMetadata } from '../inputs.mjs';

const TARGET_HEADS = Object.freeze({
  CLICK: 'click_target',
  TYPE: 'type_target',
  SELECT: 'select_target',
});

const INPUT_HEADS = Object.freeze({
  TYPE: 'type_input',
  SELECT: 'select_input',
  PRESS: 'press_input',
  NAVIGATE: 'navigate_input',
});

export function buildQuestionSet({
  goal,
  observation,
  inputs,
  history = [],
  recovery,
  maxCandidates = 180,
}) {
  const operations = allowedOperations(observation, inputs);
  const selectedRefs = selectRefs(observation.refs, maxCandidates);
  const questions = {
    operation: {
      type: 'choice',
      instructions: 'Choose the next browser operation that makes progress toward the goal without repeating a failed action.',
      criteria: Object.fromEntries(operations.map((operation) => [operation, operationDescription(operation)])),
    },
  };

  for (const [operation, head] of Object.entries(TARGET_HEADS)) {
    if (!operations.includes(operation)) continue;
    const roles = TARGET_ROLES[operation];
    const candidates = Object.entries(selectedRefs)
      .filter(([, details]) => roles.has(String(details.role ?? '').toLowerCase()))
      .map(([ref, details]) => [ref, candidateLabel(details)]);
    if (!candidates.length) continue;
    questions[head] = {
      type: 'choice',
      instructions: targetInstructions(operation),
      criteria: Object.fromEntries([
        ...candidates,
        ['none_of_the_above', 'No current target is appropriate for this operation.'],
      ]),
    };
  }

  addInputQuestion(questions, operations, inputs, 'TYPE', 'text', 'Choose the supplied text value to use for the selected field.');
  addInputQuestion(questions, operations, inputs, 'SELECT', 'select', 'Choose the supplied select value to use for the selected control.');
  addInputQuestion(questions, operations, inputs, 'PRESS', 'key', 'Choose the supplied keyboard key to press.');
  addInputQuestion(questions, operations, inputs, 'NAVIGATE', 'url', 'Choose the supplied destination URL.');

  questions.goal_reached = {
    type: 'noul',
    instructions: 'Estimate whether the current page visibly satisfies the requested goal. Do not assume success from prior actions alone.',
    criteria: {
      true: 'The requested goal is visibly satisfied.',
      false: 'The requested goal is not visibly satisfied.',
    },
  };
  questions.stuck = {
    type: 'noul',
    instructions: 'Estimate whether the browser is stuck and needs a structured handoff instead of another action.',
    criteria: {
      true: 'No safe and useful next action is available.',
      false: 'A safe and useful next action remains available.',
    },
  };

  const state = {
    goal,
    url: observation.url,
    title: observation.title,
    snapshot: observation.snapshot,
    refs: selectedRefs,
    inputs: publicInputMetadata(inputs),
  };
  if (history.length) state.history = history;
  if (recovery) state.recovery = recovery;
  return { operations, questions, state };
}

export function parseDecisionResponse(payload) {
  const answers = extractAnswers(payload);
  const operationAnswer = answers.operation;
  const operation = pickChoice(operationAnswer).toUpperCase();
  if (!operation) {
    throw new BrowsemuxError('Decision response has no operation', {
      code: 'INVALID_DECISION_RESPONSE',
    });
  }

  const targetHead = TARGET_HEADS[operation];
  const targetAnswer = targetHead ? answers[targetHead] : undefined;
  const inputHead = INPUT_HEADS[operation];
  const inputAnswer = inputHead ? answers[inputHead] : undefined;
  const proposal = normalizeProposal({
    operation,
    target: pickChoice(targetAnswer),
    inputKey: pickChoice(inputAnswer),
    confidence: pickProbability(operationAnswer),
  });

  return {
    proposal,
    goalReached: pickNoul(answers.goal_reached),
    stuck: pickNoul(answers.stuck),
    usage: payload?.usage ?? payload?.data?.usage,
    providerMetadata: {
      model: payload?.model ?? payload?.data?.model,
      provider: payload?.provider ?? payload?.data?.provider,
      rawIds: payload?.id ?? payload?.data?.id,
    },
  };
}

export function decisionStateSummary(state) {
  return {
    goal: state.goal,
    url: state.url,
    title: state.title,
    snapshot: state.snapshot,
    candidates: state.refs,
    inputs: state.inputs,
    history: state.history,
    recovery: state.recovery,
  };
}

function addInputQuestion(questions, operations, inputs, operation, kind, instructions) {
  if (!operations.includes(operation)) return;
  const entries = inputsForKind(inputs, kind);
  if (!entries.length) return;
  questions[INPUT_HEADS[operation]] = {
    type: 'choice',
    instructions,
    criteria: Object.fromEntries(entries.map((entry) => [
      entry.key,
      `${entry.label} (${entry.kind}${entry.secret ? ', secret' : ''})`,
    ])),
  };
}

function selectRefs(refs, maxCandidates) {
  const entries = Object.entries(refs ?? {});
  if (entries.length <= maxCandidates) return Object.fromEntries(entries);
  const interactiveRoles = new Set(Object.values(TARGET_ROLES).flatMap((roles) => [...roles]));
  const interactive = entries.filter(([, details]) =>
    interactiveRoles.has(String(details?.role ?? '').toLowerCase()));
  const selected = [
    ...entries.slice(0, Math.min(40, maxCandidates)),
    ...interactive.slice(0, Math.max(0, maxCandidates - 40)),
  ];
  return Object.fromEntries(new Map(selected).entries());
}

function candidateLabel(details) {
  return [details.role, details.name].filter(Boolean).join(' / ') || 'unnamed target';
}

function operationDescription(operation) {
  switch (operation) {
    case 'CLICK':
      return 'Click one current visible control or link.';
    case 'TYPE':
      return 'Fill one current text field using a supplied value.';
    case 'SELECT':
      return 'Select one value in a current dropdown or listbox using a supplied value.';
    case 'PRESS':
      return 'Press a supplied keyboard key.';
    case 'SCROLL_UP':
      return 'Scroll the page upward.';
    case 'SCROLL_DOWN':
      return 'Scroll the page downward.';
    case 'BACK':
      return 'Navigate back one page.';
    case 'WAIT':
      return 'Wait briefly for the page to change.';
    case 'NAVIGATE':
      return 'Open a supplied destination URL.';
    case 'DONE':
      return 'The visible page already satisfies the goal.';
    case 'BLOCKED':
      return 'No safe next action can make progress.';
    default:
      return operation;
  }
}

function targetInstructions(operation) {
  if (operation === 'CLICK') {
    return 'Choose the exact current control needed for the next step. Prefer menu, filter, field, or navigation controls over incidental content.';
  }
  if (operation === 'TYPE') return 'Choose the current editable field that should receive the selected value.';
  return 'Choose the current dropdown or listbox that should receive the selected value.';
}

function extractAnswers(payload) {
  let value = payload?.answers
    ?? payload?.decision
    ?? payload?.result
    ?? payload?.output
    ?? payload?.data?.answers
    ?? payload?.data?.decision
    ?? payload?.data
    ?? payload;
  if (Array.isArray(value) && value.every((item) => item && typeof item === 'object' && item.name)) {
    value = Object.fromEntries(value.map((item) => [
      item.name,
      item.answer ?? item.value ?? item,
    ]));
  }
  if (Array.isArray(value)) value = value[0];
  if (typeof value === 'string') {
    value = parseJsonText(value);
  }
  if (value?.message?.content) return extractAnswers(value.message.content);
  if (Array.isArray(value?.choices) && value.choices[0]) {
    return extractAnswers(value.choices[0].message?.content ?? value.choices[0]);
  }
  if (!value || typeof value !== 'object') {
    throw new BrowsemuxError('Decision response did not contain answers', {
      code: 'INVALID_DECISION_RESPONSE',
    });
  }
  return value;
}

export function parseJsonText(value) {
  const text = String(value).replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new BrowsemuxError('Decision response content is not valid JSON', {
      code: 'INVALID_DECISION_RESPONSE',
      cause,
    });
  }
}

function pickChoice(value) {
  if (typeof value === 'string') return value;
  return String(
    value?.choice
    ?? value?.value
    ?? value?.selected
    ?? value?.name
    ?? '',
  );
}

function pickProbability(value) {
  const number = Number(value?.probability ?? value?.confidence);
  return Number.isFinite(number) ? number : undefined;
}

function pickNoul(value) {
  if (typeof value === 'number') return value;
  const number = Number(value?.noul ?? value?.value);
  return Number.isFinite(number) ? number : undefined;
}
