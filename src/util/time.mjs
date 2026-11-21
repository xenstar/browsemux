import { setTimeout as sleep } from 'node:timers/promises';

export { sleep };

export function nowMs() {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

export function elapsed(startedAt) {
  return Math.max(0, nowMs() - startedAt);
}
