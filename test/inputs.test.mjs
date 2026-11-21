import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInputs, publicInputMetadata, resolveInput } from '../src/inputs.mjs';

test('normalizes supplied values while redacting secrets from metadata', () => {
  const inputs = normalizeInputs({
    text: {
      query: 'OpenRouter',
      password: { value: 'secret-value', secret: true, label: 'Password' },
    },
    keys: {
      submit: 'Enter',
    },
  });

  assert.equal(inputs.entries.length, 3);
  assert.equal(resolveInput(inputs, 'submit', 'key').value, 'Enter');
  assert.deepEqual(publicInputMetadata(inputs, [inputs.byKey.password]), [{
    key: 'password',
    kind: 'text',
    label: 'Password',
    value: '[redacted]',
    secret: true,
  }]);
});

test('rejects duplicate keys across input groups', () => {
  assert.throws(() => normalizeInputs({
    text: { value: 'one' },
    select: { value: 'two' },
  }), (error) => error.code === 'INVALID_INPUTS');
});

test('rejects non-http navigation input', () => {
  assert.throws(() => normalizeInputs({
    urls: { unsafe: 'javascript:alert(1)' },
  }), (error) => error.code === 'INVALID_URL');
});
