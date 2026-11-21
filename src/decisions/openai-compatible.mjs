import { BrowsemuxError } from '../errors.mjs';
import { postJson } from './http.mjs';
import {
  buildQuestionSet,
  decisionStateSummary,
  parseJsonText,
} from './questions.mjs';

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    operation: {
      type: 'string',
      enum: [
        'CLICK',
        'TYPE',
        'SELECT',
        'PRESS',
        'SCROLL_UP',
        'SCROLL_DOWN',
        'BACK',
        'WAIT',
        'NAVIGATE',
        'DONE',
        'BLOCKED',
      ],
    },
    target: { type: ['string', 'null'] },
    inputKey: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['operation'],
};

export class OpenAICompatibleProvider {
  constructor({
    endpoint = 'https://openrouter.ai/api/v1/chat/completions',
    apiKey,
    model,
    headers = {},
    maxSnapshotChars = 18_000,
    maxCandidates = 180,
    timeoutMs = 30_000,
    structuredOutput = 'json_object',
    provider = undefined,
    fetchImpl = fetch,
  } = {}) {
    if (!model || typeof model !== 'string') {
      throw new BrowsemuxError('OpenAI-compatible provider requires --model', {
        code: 'INVALID_PROVIDER_CONFIG',
      });
    }
    this.name = 'openai-compatible';
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
    this.headers = headers;
    this.maxSnapshotChars = maxSnapshotChars;
    this.maxCandidates = maxCandidates;
    this.timeoutMs = timeoutMs;
    this.structuredOutput = structuredOutput;
    this.provider = provider;
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
      throw new BrowsemuxError('OpenAI-compatible API key is required', {
        code: 'MISSING_API_KEY',
      });
    }
    const { state, questions, operations } = buildQuestionSet({
      goal,
      observation: {
        ...observation,
        snapshot: truncate(observation.snapshot, this.maxSnapshotChars),
      },
      inputs,
      history,
      recovery,
      successCriteria,
      maxCandidates: this.maxCandidates,
    });
    const summary = {
      ...decisionStateSummary(state),
      allowedOperations: operations,
      questionCandidates: Object.fromEntries(
        Object.entries(questions)
          .filter(([, value]) => value.type === 'choice')
          .map(([name, value]) => [name, Object.keys(value.criteria)]),
      ),
    };
    const body = {
      model: this.model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            'You are a typed browser action proposal engine.',
            'Choose exactly one operation from allowedOperations.',
            'For targeted operations choose only a current ref listed under click_target, type_target, or select_target.',
            'For TYPE, SELECT, PRESS, or NAVIGATE choose an inputKey from the matching input question.',
            'Never write code, CSS, XPath, JavaScript, or a URL unless selecting a supplied input key.',
            'DONE means the visible page already satisfies the goal.',
            'BLOCKED means no safe useful operation remains.',
            'Return JSON only: {"operation":"CLICK","target":"@e1","inputKey":null,"confidence":0.9}.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify(summary),
        },
      ],
    };
    if (this.structuredOutput === 'json_object') {
      body.response_format = { type: 'json_object' };
    } else if (this.structuredOutput === 'json_schema') {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'browsemux_proposal',
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      };
    } else if (this.structuredOutput !== 'none') {
      throw new BrowsemuxError(`Unsupported structured output mode: ${this.structuredOutput}`, {
        code: 'INVALID_PROVIDER_CONFIG',
      });
    }
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
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new BrowsemuxError('OpenAI-compatible provider returned no message content', {
        code: 'INVALID_DECISION_RESPONSE',
      });
    }
    const proposal = parseJsonText(content);
    return {
      proposal: {
        operation: String(proposal.operation ?? '').toUpperCase(),
        target: proposal.target ?? null,
        inputKey: proposal.inputKey ?? proposal.input_key ?? null,
        confidence: Number.isFinite(Number(proposal.confidence))
          ? Number(proposal.confidence)
          : undefined,
      },
      goalReached: undefined,
      stuck: undefined,
      usage: payload.usage,
      latencyMs: Date.now() - started,
      providerMetadata: {
        model: payload.model ?? this.model,
        provider: payload.provider,
        requestId: payload.id,
        protocol: 'openai-compatible',
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
