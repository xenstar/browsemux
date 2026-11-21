#!/usr/bin/env node
import { helpText, runCli } from '../src/cli.mjs';
import { exitCodeForStatus } from '../src/status.mjs';

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
    process.exitCode = output.doctor.ready ? 0 : 1;
  } else if (output.skill) {
    process.stdout.write(`${JSON.stringify(output.skill, null, 2)}\n`);
    process.exitCode = 0;
  } else if (!process.argv.includes('--jsonl')) {
    process.stdout.write(`${JSON.stringify(output.result, null, 2)}\n`);
    process.exitCode = exitCodeForStatus(output.result.status);
  } else {
    process.exitCode = exitCodeForStatus(output.result.status);
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

function diagnosticText(error) {
  const output = error?.details?.stderr || error?.details?.stdout || '';
  const text = String(output).trim();
  return text ? text.slice(0, 1_500) : '';
}
