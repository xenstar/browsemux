import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInputs } from '../src/inputs.mjs';
import { buildQuestionSet, parseDecisionResponse } from '../src/decisions/questions.mjs';

const observation = {
  url: 'https://example.com/',
  title: 'Example',
  snapshot: '- button "Continue"\n- textbox "Search"',
  refs: {
    '@e1': { role: 'button', name: 'Continue' },
    '@e2': { role: 'textbox', name: 'Search' },
  },
};

test('builds operation, target, and input questions in one payload', () => {
  const inputs = normalizeInputs({ text: { query: 'Browsemux' } });
  const request = buildQuestionSet({
    goal: 'Search for Browsemux',
    observation,
    inputs,
  });

  assert.ok(request.operations.includes('CLICK'));
  assert.ok(request.operations.includes('TYPE'));
  assert.deepEqual(
    Object.keys(request.questions.click_target.criteria),
    ['@e1', 'none_of_the_above'],
  );
  assert.deepEqual(
    Object.keys(request.questions.type_input.criteria),
    ['query'],
  );
  assert.equal(request.state.snapshot, observation.snapshot);
});

test('parses typed operation, target, input, and probabilities', () => {
  const parsed = parseDecisionResponse({
    model: 'typesafe/jev-1.14',
    usage: { input_tokens: 12 },
    answers: {
      operation: { type: 'choice', choice: 'TYPE', confidence: 0.91, probabilities: { TYPE: 0.91 } },
      type_target: { choice: '@e2', confidence: 0.87 },
      type_input: { choice: 'query', confidence: 0.99 },
      goal_reached: { type: 'noul', noul: 0.12 },
      stuck: { type: 'noul', noul: 0.05 },
    },
  });

  assert.equal(parsed.proposal.operation, 'TYPE');
  assert.equal(parsed.proposal.target, '@e2');
  assert.equal(parsed.proposal.inputKey, 'query');
  assert.equal(parsed.proposal.confidence, 0.91);
  assert.equal(parsed.goalReached, 0.12);
  assert.equal(parsed.stuck, 0.05);
});
