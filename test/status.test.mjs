import test from 'node:test';
import assert from 'node:assert/strict';
import { exitCodeForStatus } from '../src/status.mjs';

test('uses distinct exit codes for verified and unverified completion', () => {
  assert.equal(exitCodeForStatus('success'), 0);
  assert.equal(exitCodeForStatus('completed-unverified'), 2);
  assert.equal(exitCodeForStatus('blocked'), 3);
  assert.equal(exitCodeForStatus('effect-unknown'), 4);
  assert.equal(exitCodeForStatus('limit'), 5);
  assert.equal(exitCodeForStatus('error'), 1);
});
