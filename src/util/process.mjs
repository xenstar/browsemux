import { spawn } from 'node:child_process';
import { BrowsemuxError } from '../errors.mjs';

export function runProcess(command, args, {
  stdin,
  signal,
  timeoutMs = 30_000,
  windowsHide = true,
  env,
} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const child = spawn(command, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(result);
    };

    const abort = () => {
      child.kill('SIGTERM');
      finish(abortError());
    };

    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new BrowsemuxError(`Command timed out after ${timeoutMs}ms`, {
        code: 'PROCESS_TIMEOUT',
        details: { command, stdout, stderr },
      }));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (cause) => {
      finish(new BrowsemuxError(`Unable to start ${command}: ${cause.message}`, {
        code: cause.code ?? 'PROCESS_START_ERROR',
        cause,
        details: { command, stderr },
      }));
    });
    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        finish(null, { exitCode, stdout, stderr });
        return;
      }
      finish(new BrowsemuxError(`${command} exited with code ${exitCode}`, {
        code: 'PROCESS_EXIT',
        details: { command, exitCode, stdout, stderr },
      }));
    });

    child.stdin.end(stdin ?? '');
  });
}

function abortError() {
  const error = new BrowsemuxError('Operation cancelled', { code: 'ABORT_ERR' });
  error.name = 'AbortError';
  return error;
}
