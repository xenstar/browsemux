import { BrowsemuxError } from '../errors.mjs';
import {
  DecisionsApiProvider,
  DECISION_ENDPOINTS,
  DECISION_MODELS,
} from './decisions-api.mjs';
import { OpenAICompatibleProvider } from './openai-compatible.mjs';

export {
  DecisionsApiProvider,
  DECISION_ENDPOINTS,
  DECISION_MODELS,
  OpenAICompatibleProvider,
};

export function createDecisionProvider(name, options = {}) {
  switch (String(name).toLowerCase()) {
    case 'typesafe':
    case 'jev':
      return new DecisionsApiProvider({
        ...options,
        protocol: 'typesafe',
        endpoint: options.endpoint ?? DECISION_ENDPOINTS.typesafe,
        model: options.model ?? DECISION_MODELS.typesafe,
      });
    case 'openrouter-decisions':
    case 'openrouter':
      return new DecisionsApiProvider({
        ...options,
        protocol: 'openrouter',
        endpoint: options.endpoint ?? DECISION_ENDPOINTS.openrouter,
        model: options.model ?? DECISION_MODELS.openrouter,
      });
    case 'openai':
    case 'openai-compatible':
      return new OpenAICompatibleProvider(options);
    default:
      throw new BrowsemuxError(`Unsupported decision provider: ${name}`, {
        code: 'UNSUPPORTED_PROVIDER',
      });
  }
}
