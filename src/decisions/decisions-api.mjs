import { BrowsemuxError } from '../errors.mjs';
import { postJson } from './http.mjs';
import { buildQuestionSet, parseDecisionResponse } from './questions.mjs';

export const DECISION_ENDPOINTS = Object.freeze({
  typesafe: 'https://api.typesafe.ai/v1/systemone',
  openrouter: 'https://openrouter.ai/api/alpha/decisions',
});

export const DECISION_MODELS = Object.freeze({
  typesafe: 'jev-latest',
  openrouter: 'typesafe/jev-1.14',
});

export class DecisionsApiProvider {
  constructor({
    protocol,
    endpoint = DECISION_ENDPOINTS[protocol],
    apiKey,
    model = DECISION_MODELS[protocol],
    headers = {},
    provider = undefined,
    maxSnapshotChars = 18_000,
    maxCandidates = 180,
    timeoutMs = 30_000,
    fetchImpl = fetch,
  } = {}) {
    if (!['typesafe', 'openrouter'].includes(protocol)) {
      throw new BrowsemuxError(`Unsupported Decisions API protocol: ${protocol}`, {
        code: 'INVALID_PROVIDER_CONFIG',
      });
    }
    if (!endpoint || typeof endpoint !== 'string') {
      throw new BrowsemuxError('Decision endpoint must be a non-empty string', {
        code: 'INVALID_PROVIDER_CONFIG',
      });
    }
    if (!model || typeof model !== 'string') {
      throw new BrowsemuxError('Decision model must be a non-empty string', {
        code: 'INVALID_PROVIDER_CONFIG',
      });
    }
    this.name = protocol;
    this.protocol = protocol;
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
    this.headers = headers;
    this.provider = provider;
    this.maxSnapshotChars = maxSnapshotChars;
    this.maxCandidates = maxCandidates;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async decide({
    goal,
    successCriteria,
    observation,
    inputs,
    history,
    recovery,
    signal,
  }) {
    if (!this.apiKey) {
      throw new BrowsemuxError('Decision API key is required', {
        code: 'MISSING_API_KEY',
      });
    }
    const boundedObservation = {
      ...observation,
      snapshot: truncate(observation.snapshot, this.maxSnapshotChars),
    };
    const { state, questions, operations } = buildQuestionSet({
      goal,
      observation: boundedObservation,
      inputs,
      history,
      recovery,
      successCriteria,
      maxCandidates: this.maxCandidates,
    });
    const body = {
      model: this.model,
      state,
      questions,
    };
    if (this.provider && typeof this.provider === 'object') body.provider = this.provider;

    const started = Date.now();
    const { payload } = await postJson({
      url: this.endpoint,
      apiKey: this.apiKey,
      body,
      headers: this.headers,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal,
    });
    const parsed = parseDecisionResponse(payload);
    return {
      ...parsed,
      latencyMs: Date.now() - started,
      providerMetadata: {
        ...parsed.providerMetadata,
        protocol: this.protocol,
        operations,
      },
    };
  }
}

function truncate(value, maxChars) {
  const text = String(value ?? '');
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n[snapshot truncated]`
    : text;
}
