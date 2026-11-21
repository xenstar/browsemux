import {
  allowedOperations,
  deterministicSuccess,
  executionInput,
  semanticSignature,
  validateProposal,
} from '../src/contracts.mjs';
import { BrowsemuxError, errorResult } from '../src/errors.mjs';
import { publicInputMetadata } from '../src/inputs.mjs';
import { postJson } from '../src/decisions/http.mjs';
import { parseJsonText } from '../src/decisions/questions.mjs';
import { elapsed, nowMs } from '../src/util/time.mjs';

const SYSTEM_PROMPT = [
  'You are the planning loop of an agent harness controlling a browser.',
  'Each turn, choose exactly one operation from the current allowedOperations.',
  'For CLICK, TYPE, or SELECT, use only a ref from the current observation.',
  'For TYPE, SELECT, PRESS, or NAVIGATE, choose a supplied inputKey with the matching kind.',
  'The tool returns a fresh observation after each action. Never assume that an action succeeded without checking it.',
  'Use DONE only when the visible page satisfies the goal. Use BLOCKED when no safe useful action remains.',
  'Never write code, CSS, XPath, JavaScript, or invent a value.',
  'Return JSON only: {"operation":"CLICK","target":"@e1","inputKey":null,"confidence":0.9}.',
].join(' ');

export class DirectChatModel {
  constructor({
    endpoint = 'https://openrouter.ai/api/v1/chat/completions',
    apiKey,
    model,
    headers = {},
    timeoutMs = 30_000,
    fetchImpl = fetch,
  } = {}) {
    if (!model || typeof model !== 'string') {
      throw new BrowsemuxError('Direct benchmark model requires a model slug', {
        code: 'INVALID_PROVIDER_CONFIG',
      });
    }
    this.name = `direct:${model}`;
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
    this.headers = headers;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async decide({ messages, signal }) {
    const started = nowMs();
    const { payload } = await postJson({
      url: this.endpoint,
      apiKey: this.apiKey,
      body: {
        model: this.model,
        temperature: 0,
        messages,
        response_format: { type: 'json_object' },
      },
      headers: this.headers,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal,
    });
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new BrowsemuxError('Direct benchmark model returned no message content', {
        code: 'INVALID_DECISION_RESPONSE',
      });
    }
    const parsed = parseJsonText(content);
    return {
      content,
      proposal: {
        operation: String(parsed.operation ?? parsed.action ?? '').toUpperCase(),
        target: parsed.target ?? parsed.ref ?? null,
        inputKey: parsed.inputKey ?? parsed.input_key ?? null,
        confidence: Number.isFinite(Number(parsed.confidence))
          ? Number(parsed.confidence)
          : undefined,
      },
      usage: payload.usage,
      latencyMs: elapsed(started),
      requestChars: JSON.stringify(messages).length,
      response: {
        model: payload.model ?? this.model,
        provider: payload.provider,
        requestId: payload.id,
      },
    };
  }
}

export async function runDirectHarness({
  goal,
  browser,
  provider,
  inputs = { entries: [], byKey: {} },
  maxSteps = 12,
  maxRecoveryAttempts = 2,
  repeatLimit = 2,
  historyLimit = 6,
  maxSnapshotChars = 18_000,
  successCriteria = {},
  initialObservation,
  onEvent,
  signal,
} = {}) {
  if (!goal || typeof goal !== 'string') {
    throw new BrowsemuxError('A non-empty goal is required', { code: 'INVALID_GOAL' });
  }
  if (!initialObservation) {
    throw new BrowsemuxError('Direct harness requires an initial observation', {
      code: 'MISSING_OBSERVATION',
    });
  }
  if (!browser || typeof browser.action !== 'function' || typeof browser.snapshot !== 'function') {
    throw new BrowsemuxError('A browser backend is required', { code: 'INVALID_BACKEND' });
  }
  if (!provider || typeof provider.decide !== 'function') {
    throw new BrowsemuxError('A direct model provider is required', { code: 'INVALID_PROVIDER' });
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new BrowsemuxError('maxSteps must be a positive integer', { code: 'INVALID_LIMIT' });
  }

  const startedAt = new Date();
  const totalStarted = nowMs();
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        type: 'browser_task',
        goal,
        successCriteria,
        inputs: publicInputMetadata(inputs),
        observation: modelObservation(initialObservation, inputs, maxSnapshotChars),
      }),
    },
  ];
  const history = [];
  const signatureCounts = new Map();
  const timings = {
    observationMs: 0,
    decisionMs: 0,
    actionMs: 0,
  };
  const usage = {};
  let observation = initialObservation;
  let invalidAttempts = 0;
  let modelCalls = 0;
  let requestChars = 0;
  let status = 'limit';
  let reasonCode = 'MAX_STEPS';
  let reason;
  let completedAtStep = null;

  try {
    for (let step = 1; step <= maxSteps; step += 1) {
      if (signal?.aborted) throw abortError();
      if (deterministicSuccess(observation, successCriteria)) {
        status = 'success';
        reasonCode = 'VERIFIED_SUCCESS';
        reason = 'Configured success criteria matched the visible page.';
        completedAtStep = step - 1;
        break;
      }

      const decisionStarted = nowMs();
      const decision = await provider.decide({ messages, signal });
      modelCalls += 1;
      timings.decisionMs += decision?.latencyMs ?? elapsed(decisionStarted);
      requestChars += Number(decision?.requestChars) || 0;
      mergeUsage(usage, decision?.usage);
      emit(onEvent, {
        type: 'decision',
        step,
        operation: decision?.proposal?.operation,
        target: decision?.proposal?.target,
        inputKey: decision?.proposal?.inputKey,
        latencyMs: decision?.latencyMs,
      });

      messages.push({ role: 'assistant', content: decision.content });
      const proposedOperation = decision?.proposal?.operation ?? '';
      if (proposedOperation === 'DONE') {
        if (hasSuccessCriteria(successCriteria)) {
          invalidAttempts += 1;
          history.push(historyEntry({
            step,
            observation,
            operation: 'DONE',
            executed: false,
            reason: 'UNVERIFIED_DONE',
          }));
          messages.push({
            role: 'user',
            content: JSON.stringify({
              type: 'tool_error',
              code: 'UNVERIFIED_DONE',
              message: 'The visible page does not match the configured success criteria. Continue with a useful action.',
              observation: modelObservation(observation, inputs, maxSnapshotChars),
            }),
          });
          emit(onEvent, {
            type: 'validation',
            step,
            accepted: false,
            code: 'UNVERIFIED_DONE',
          });
          if (invalidAttempts > maxRecoveryAttempts) {
            status = 'error';
            reasonCode = 'UNVERIFIED_DONE';
            reason = 'The harness model repeatedly proposed completion without matching the success criteria.';
            completedAtStep = step;
            break;
          }
          continue;
        }
        status = 'completed-unverified';
        reasonCode = 'MODEL_PROPOSED_DONE';
        reason = 'The harness model proposed completion without a deterministic match.';
        completedAtStep = step;
        history.push(historyEntry({
          step,
          observation,
          operation: 'DONE',
          executed: false,
          reason: reasonCode,
        }));
        break;
      }
      if (proposedOperation === 'BLOCKED') {
        status = 'blocked';
        reasonCode = 'MODEL_REPORTED_BLOCKED';
        reason = 'The harness model reported that no safe useful operation remains.';
        completedAtStep = step;
        history.push(historyEntry({
          step,
          observation,
          operation: 'BLOCKED',
          executed: false,
          reason: reasonCode,
        }));
        break;
      }

      let validated;
      try {
        validated = validateProposal(decision.proposal, observation, inputs);
      } catch (error) {
        invalidAttempts += 1;
        history.push(historyEntry({
          step,
          observation,
          operation: proposedOperation || 'UNKNOWN',
          target: decision?.proposal?.target,
          executed: false,
          reason: error.code,
          error: error.message,
        }));
        messages.push({
          role: 'user',
          content: JSON.stringify({
            type: 'tool_error',
            code: error.code,
            message: error.message,
            observation: modelObservation(observation, inputs, maxSnapshotChars),
          }),
        });
        emit(onEvent, {
          type: 'validation',
          step,
          accepted: false,
          code: error.code,
          message: error.message,
        });
        if (invalidAttempts > maxRecoveryAttempts) {
          status = 'error';
          reasonCode = 'PROPOSAL_REJECTED';
          reason = `Decision proposals were rejected ${invalidAttempts} times: ${error.message}`;
          completedAtStep = step;
          break;
        }
        continue;
      }

      invalidAttempts = 0;
      const signature = semanticSignature(validated, observation);
      const repetitions = signatureCounts.get(signature) ?? 0;
      if (repetitions >= repeatLimit) {
        history.push(historyEntry({
          step,
          observation,
          operation: validated.operation,
          target: validated.target,
          executed: false,
          reason: 'REPEATED_ACTION',
        }));
        messages.push({
          role: 'user',
          content: JSON.stringify({
            type: 'tool_error',
            code: 'REPEATED_ACTION',
            message: 'Choose a different action because this semantic action already repeated.',
            observation: modelObservation(observation, inputs, maxSnapshotChars),
          }),
        });
        emit(onEvent, { type: 'validation', step, accepted: false, code: 'REPEATED_ACTION' });
        continue;
      }
      signatureCounts.set(signature, repetitions + 1);
      emit(onEvent, {
        type: 'validation',
        step,
        accepted: true,
        operation: validated.operation,
        target: validated.target,
        inputKey: validated.inputKey,
      });

      const actionStarted = nowMs();
      try {
        const actionOptions = { ...executionInput(validated), signal };
        const acted = typeof browser.actAndObserve === 'function'
          ? await browser.actAndObserve(validated.operation, actionOptions)
          : null;
        const actionResult = acted?.observation
          ? acted.actionResult
          : await browser.action(validated.operation, actionOptions);
        timings.actionMs += elapsed(actionStarted);
        if (acted?.observation) {
          observation = acted.observation;
        } else {
          const observeStarted = nowMs();
          observation = await browser.snapshot({ signal });
          timings.observationMs += elapsed(observeStarted);
        }
        history.push(historyEntry({
          step,
          observation,
          operation: validated.operation,
          target: validated.target,
          inputKey: validated.inputKey,
          executed: true,
          result: {
            dispatched: actionResult?.dispatched,
            effect: actionResult?.effect,
            settledUrl: actionResult?.settledUrl,
          },
        }));
        messages.push({
          role: 'user',
          content: JSON.stringify({
            type: 'tool_result',
            step,
            action: {
              operation: validated.operation,
              target: validated.target,
              inputKey: validated.inputKey,
            },
            observation: modelObservation(observation, inputs, maxSnapshotChars),
          }),
        });
        emit(onEvent, {
          type: 'action',
          step,
          operation: validated.operation,
          target: validated.target,
          inputKey: validated.inputKey,
          latencyMs: elapsed(actionStarted),
        });
      } catch (error) {
        timings.actionMs += elapsed(actionStarted);
        history.push(historyEntry({
          step,
          observation,
          operation: validated.operation,
          target: validated.target,
          inputKey: validated.inputKey,
          executed: false,
          reason: error.code ?? 'ACTION_ERROR',
          error: error.message,
        }));
        if (error.code === 'EFFECT_UNKNOWN' || error.effectState === 'unknown') {
          status = 'effect-unknown';
          reasonCode = 'EFFECT_UNKNOWN';
          reason = error.message;
          completedAtStep = step;
          break;
        }
        throw error;
      }
    }
  } catch (error) {
    if (error.code === 'ABORT_ERR' || error.name === 'AbortError') throw error;
    status = 'error';
    reasonCode = error.code ?? 'DIRECT_HARNESS_ERROR';
    reason = error.message;
    emit(onEvent, {
      type: 'error',
      code: reasonCode,
      diagnostic: errorResult(error),
    });
  }

  const finishedAt = new Date();
  return {
    schemaVersion: '1',
    arm: 'direct',
    status,
    reasonCode,
    reason,
    goal,
    backend: browser.name ?? 'unknown',
    provider: provider.name ?? 'unknown',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: elapsed(totalStarted),
    completedAtStep,
    timings,
    usage,
    modelCalls,
    requestChars,
    actionCount: history.filter((entry) => entry.executed).length,
    observation: observation ? {
      url: observation.url,
      title: observation.title,
      snapshot: String(observation.snapshot ?? '').slice(0, 4_000),
      refCount: Object.keys(observation.refs ?? {}).length,
    } : null,
    history: history.slice(-historyLimit),
  };
}

function modelObservation(observation, inputs, maxSnapshotChars) {
  return {
    url: observation.url,
    title: observation.title,
    snapshot: truncate(observation.snapshot, maxSnapshotChars),
    refs: observation.refs,
    allowedOperations: allowedOperations(observation, inputs),
  };
}

function historyEntry({
  step,
  observation,
  operation,
  target = null,
  inputKey = null,
  executed,
  reason = null,
  result,
  error,
}) {
  return {
    step,
    operation,
    target,
    inputKey,
    url: observation?.url ?? '',
    executed,
    reason,
    result,
    error,
  };
}

function mergeUsage(target, usage) {
  if (!usage || typeof usage !== 'object') return;
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      target[key] = (target[key] ?? 0) + value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] ??= {};
      mergeUsage(target[key], value);
    }
  }
}

function truncate(value, maxChars) {
  const text = String(value ?? '');
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n[snapshot truncated]`
    : text;
}

function hasSuccessCriteria(criteria) {
  return Boolean(criteria?.urlContains || criteria?.textContains);
}

function emit(onEvent, event) {
  if (typeof onEvent === 'function') onEvent(event);
}

function abortError() {
  const error = new BrowsemuxError('Operation cancelled', { code: 'ABORT_ERR' });
  error.name = 'AbortError';
  return error;
}
