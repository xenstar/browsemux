#!/usr/bin/env node
import { helpText, runCli } from '../src/cli.mjs';

const controller = new AbortController();
const abort = () => controller.abort();
process.once('SIGINT', abort);
process.once('SIGTERM', abort);

try {
  const output = await runCli(process.argv.slice(2), { signal: controller.signal });
  if (output.help) {
    process.stdout.write(helpText());
    process.exitCode = 0;
  } else if (output.version) {
    process.stdout.write(`browsemux ${output.version}\n`);
    process.exitCode = 0;
  } else if (output.doctor) {
    process.stdout.write(`${JSON.stringify(output.doctor, null, 2)}\n`);
    process.exitCode = 0;
  } else if (!process.argv.includes('--jsonl')) {
    process.stdout.write(`${JSON.stringify(output.result, null, 2)}\n`);
    process.exitCode = exitCodeFor(output.result.status);
  } else {
    process.exitCode = exitCodeFor(output.result.status);
  }
} catch (error) {
  const diagnostic = diagnosticText(error);
  if (process.argv.includes('--jsonl')) {
    process.stdout.write(`${JSON.stringify({
      type: 'error',
      code: error.code ?? 'BROWSEMUX_ERROR',
      message: error.message,
      diagnostic: diagnostic || undefined,
      details: error.details,
    })}\n`);
  } else {
    process.stderr.write(`browsemux: ${error.message}${diagnostic ? `\n${diagnostic}` : ''}\n`);
  }
  process.exitCode = error.code === 'ABORT_ERR' ? 130 : 1;
} finally {
  process.removeListener('SIGINT', abort);
  process.removeListener('SIGTERM', abort);
}

function exitCodeFor(status) {
  switch (status) {
    case 'success':
    case 'completed-unverified':
      return 0;
    case 'blocked':
      return 3;
    case 'effect-unknown':
      return 4;
    case 'limit':
      return 5;
    default:
      return 1;
  }
}

function diagnosticText(error) {
  const output = error?.details?.stderr || error?.details?.stdout || '';
  const text = String(output).trim();
  return text ? text.slice(0, 1_500) : '';
}
