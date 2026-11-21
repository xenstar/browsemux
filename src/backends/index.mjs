import { BrowsemuxError } from '../errors.mjs';
import { AgentBrowserBackend } from './agent-browser.mjs';
import { BskBackend, BskCli } from './bsk.mjs';

export { AgentBrowserBackend, BskBackend, BskCli };

export function createBackend(name, options = {}) {
  switch (String(name).toLowerCase()) {
    case 'agent-browser':
    case 'agent':
      return new AgentBrowserBackend(options);
    case 'bsk':
    case 'tencent':
      return new BskBackend({
        ...options,
        cli: options.cli ?? new BskCli({
          command: options.bskCommand,
          defaultTimeoutMs: options.timeoutMs,
        }),
      });
    default:
      throw new BrowsemuxError(`Unsupported browser backend: ${name}`, {
        code: 'UNSUPPORTED_BACKEND',
      });
  }
}
