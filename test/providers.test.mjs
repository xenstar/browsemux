import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInputs } from '../src/inputs.mjs';
import { DecisionsApiProvider } from '../src/decisions/decisions-api.mjs';
import { OpenAICompatibleProvider } from '../src/decisions/openai-compatible.mjs';

const observation = {
  url: 'https://example.com/',
  title: 'Example',
  snapshot: '- button "Continue"',
  refs: {
    '@e1': { role: 'button', name: 'Continue' },
  },
};

test('Posts a typed Decisions request and parses the selected operation', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(init.body), headers: init.headers };
    return responseJson({
      model: 'typesafe/jev-1.14',
      answers: {
        operation: { choice: 'CLICK', confidence: 0.93 },
        click_target: { choice: '@e1', confidence: 0.9 },
      },
    });
  };
  const provider = new DecisionsApiProvider({
    protocol: 'openrouter',
    apiKey: 'test-key',
    fetchImpl,
  });

  const decision = await provider.decide({
    goal: 'Continue',
    observation,
    inputs: normalizeInputs(),
  });

  assert.equal(captured.url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(captured.body.model, 'typesafe/jev-1.14');
  assert.ok(captured.body.questions.operation);
  assert.equal(decision.proposal.operation, 'CLICK');
  assert.equal(decision.proposal.target, '@e1');
});

test('Posts an OpenAI-compatible proposal request with structured output', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return responseJson({
      id: 'request-1',
      model: 'example/model',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      choices: [{
        message: {
          content: JSON.stringify({
            operation: 'CLICK',
            target: '@e1',
            inputKey: null,
            confidence: 0.82,
          }),
        },
      }],
    });
  };
  const provider = new OpenAICompatibleProvider({
    endpoint: 'https://provider.example/v1/chat/completions',
    apiKey: 'test-key',
    model: 'example/model',
    fetchImpl,
  });

  const decision = await provider.decide({
    goal: 'Continue',
    observation,
    inputs: normalizeInputs(),
  });

  assert.equal(captured.body.response_format.type, 'json_object');
  assert.equal(decision.proposal.operation, 'CLICK');
  assert.equal(decision.proposal.target, '@e1');
  assert.equal(decision.usage.prompt_tokens, 10);
});

function responseJson(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(payload),
  };
}
