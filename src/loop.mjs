import {
  compactObservation,
  deterministicSuccess,
  executionInput,
  SCHEMA_VERSION,
  semanticSignature,
  validateProposal,
} from './contracts.mjs';
import { BrowsemuxError } from './errors.mjs';
import { elapsed, nowMs } from './util/time.mjs';

export async function runLoop({
  goal,
  browser,
  provider,
  inputs = { entries: [], byKey: {} },
  maxSteps = 12,
  maxRecoveryAttempts = 2,
  repeatLimit = 2,
  historyLimit = 6,
  successCriteria = {},
  initialObservation = null,
  onEvent,
  signal,
} = {}) {
  if (!goal || typeof goal !== 'string') {
    throw new BrowsemuxError('A non-empty goal is required', { code: 'INVALID_GOAL' });
  }
  if (!browser || typeof browser.snapshot !== 'function' || typeof browser.action !== 'function') {
    throw new BrowsemuxError('A browser backend is required', { code: 'INVALID_BACKEND' });
  }
  if (!provider || typeof provider.decide !== 'function') {
    throw new BrowsemuxError('A decision provider is required', { code: 'INVALID_PROVIDER' });
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new BrowsemuxError('maxSteps must be a positive integer', { code: 'INVALID_LIMIT' });
  }

  const startedAt = new Date();
  const totalStarted = nowMs();
  const history = [];
  const signatureCounts = new Map();
  const usage = {};
  const timings = {
    observationMs: 0,
    decisionMs: 0,
    actionMs: 0,
  };
  let observation = initialObservation;
  let needsObservation = !initialObservation;
  let recovery;
  let invalidAttempts = 0;
  let lastExecutedSignature = null;
  let lastExecutedTarget = null;
  let lastActionSourceState = null;
  let lastActionResultState = null;
  let status = 'limit';
  let reasonCode = 'MAX_STEPS';
  let reason;
  let completedAtStep = null;

  try {
    for (let step = 1; step <= maxSteps; step += 1) {
      if (signal?.aborted) throw abortError();

      if (needsObservation) {
        const observeStarted = nowMs();
        observation = await browser.snapshot({ signal });
        timings.observationMs += elapsed(observeStarted);
        needsObservation = false;
        if (lastExecutedSignature && lastActionResultState === null) {
          lastActionResultState = observationIdentity(observation);
        }
        emit(onEvent, {
          type: 'observation',
          step,
          url: observation.url,
          title: observation.title,
          refCount: Object.keys(observation.refs ?? {}).length,
        });
      }

      if (deterministicSuccess(observation, successCriteria)) {
        status = 'success';
        reasonCode = 'VERIFIED_SUCCESS';
        reason = 'Configured success criteria matched the visible page.';
        completedAtStep = step - 1;
        break;
      }

      const decisionStarted = nowMs();
      const decision = await provider.decide({
        goal,
        successCriteria,
        observation,
        inputs,
        history: history.slice(-historyLimit),
        recovery,
        signal,
      });
      timings.decisionMs += decision?.latencyMs ?? elapsed(decisionStarted);
      mergeUsage(usage, decision?.usage);
      emit(onEvent, {
        type: 'decision',
        step,
        operation: decision?.proposal?.operation,
        target: decision?.proposal?.target,
        inputKey: decision?.proposal?.inputKey,
        confidence: decision?.proposal?.confidence,
        latencyMs: decision?.latencyMs,
      });

      const proposedOperation = String(decision?.proposal?.operation ?? '').toUpperCase();
      if (proposedOperation === 'DONE') {
        if (hasSuccessCriteria(successCriteria)) {
          invalidAttempts += 1;
          recovery = {
            reason: 'UNVERIFIED_DONE',
            message: 'The visible page does not match the configured success criteria. Continue with a useful action.',
            attempt: invalidAttempts,
            avoid: recovery?.avoid ?? [],
            avoidRefs: [...new Set(recovery?.avoidRefs ?? [])],
          };
          if (lastExecutedTarget
            && lastActionSourceState === observationIdentity(observation)) {
            recovery.avoidRefs = [...new Set([...recovery.avoidRefs, lastExecutedTarget])];
          }
          history.push(historyEntry({
            step,
            observation,
            operation: 'DONE',
            executed: false,
            reason: 'UNVERIFIED_DONE',
          }));
          emit(onEvent, {
            type: 'validation',
            step,
            accepted: false,
            code: 'UNVERIFIED_DONE',
          });
          if (invalidAttempts > maxRecoveryAttempts) {
            status = 'error';
            reasonCode = 'UNVERIFIED_DONE';
            reason = 'The decision model repeatedly proposed completion without matching the success criteria.';
            completedAtStep = step;
            break;
          }
          continue;
        }
        status = 'completed-unverified';
        reasonCode = 'MODEL_PROPOSED_DONE';
        reason = 'The decision model proposed completion; no deterministic success criteria were supplied.';
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
        reason = 'The decision model reported that no safe useful operation remains.';
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
        recovery = {
          reason: error.code,
          message: error.message,
          attempt: invalidAttempts,
          avoid: recovery?.avoid ?? [],
          avoidRefs: recovery?.avoidRefs ?? [],
        };
        history.push(historyEntry({
          step,
          observation,
          operation: proposedOperation || 'UNKNOWN',
          target: decision?.proposal?.target,
          executed: false,
          reason: error.code,
        }));
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
      const sourceState = observationIdentity(observation);
      if (signature === lastExecutedSignature
        && validated.target === lastExecutedTarget
        && lastActionSourceState === sourceState) {
        recovery = {
          reason: 'NO_OBSERVED_PROGRESS',
          message: 'The same action did not change the current page. Choose a different target or operation.',
          attempt: invalidAttempts + 1,
          avoid: [...new Set([...(recovery?.avoid ?? []), signature])],
          avoidRefs: [...new Set([
            ...(recovery?.avoidRefs ?? []),
            ...(validated.target ? [validated.target] : []),
          ])],
        };
        history.push(historyEntry({
          step,
          observation,
          operation: validated.operation,
          target: validated.target,
          inputKey: validated.inputKey,
          executed: false,
          reason: 'NO_OBSERVED_PROGRESS',
        }));
        emit(onEvent, {
          type: 'validation',
          step,
          accepted: false,
          code: 'NO_OBSERVED_PROGRESS',
        });
        continue;
      }
      const stateSignature = `${observationIdentity(observation)}\n${signature}`;
      const repetitions = signatureCounts.get(stateSignature) ?? 0;
      if (repetitions >= repeatLimit) {
        recovery = {
          reason: 'REPEATED_ACTION',
          message: 'The model selected the same semantic action repeatedly.',
          attempt: repetitions,
          avoid: [...new Set([...(recovery?.avoid ?? []), signature])],
          avoidRefs: [...new Set([
            ...(recovery?.avoidRefs ?? []),
            ...(validated.target ? [validated.target] : []),
          ])],
        };
        history.push(historyEntry({
          step,
          observation,
          operation: validated.operation,
          target: validated.target,
          executed: false,
          reason: 'REPEATED_ACTION',
        }));
        emit(onEvent, {
          type: 'validation',
          step,
          accepted: false,
          code: 'REPEATED_ACTION',
        });
        continue;
      }
      signatureCounts.set(stateSignature, repetitions + 1);
      recovery = undefined;
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
        history.push(historyEntry({
          step,
          observation,
          operation: validated.operation,
          target: validated.target,
          inputKey: validated.inputKey,
          executed: true,
          result: compactActionResult(actionResult),
        }));
        trimHistory(history, historyLimit);
        if (acted?.observation) {
          observation = acted.observation;
          lastExecutedSignature = signature;
          lastExecutedTarget = validated.target ?? null;
          lastActionSourceState = sourceState;
          lastActionResultState = observationIdentity(observation);
          needsObservation = false;
          emit(onEvent, {
            type: 'observation',
            step,
            url: observation.url,
            title: observation.title,
            refCount: Object.keys(observation.refs ?? {}).length,
          });
        } else {
          lastExecutedSignature = signature;
          lastExecutedTarget = validated.target ?? null;
          lastActionSourceState = sourceState;
          lastActionResultState = null;
          needsObservation = true;
        }
        emit(onEvent, {
          type: 'action',
          step,
          operation: validated.operation,
          target: validated.target,
          inputKey: validated.inputKey,
          latencyMs: elapsed(actionStarted),
        });
        if (acted?.observation && deterministicSuccess(observation, successCriteria)) {
          status = 'success';
          reasonCode = 'VERIFIED_SUCCESS';
          reason = 'Configured success criteria matched the visible page.';
          completedAtStep = step;
          break;
        }
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
        trimHistory(history, historyLimit);
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

    if (needsObservation && completedAtStep === null) {
      try {
        observation = await browser.snapshot({ signal });
      } catch {
        // The limit result remains valid even if the final observation cannot be refreshed.
      }
    }
  } catch (error) {
    if (error.code === 'ABORT_ERR' || error.name === 'AbortError') throw error;
    status = 'error';
    reasonCode = error.code ?? 'BROWSEMUX_ERROR';
    reason = error.message;
  }

  const finishedAt = new Date();
  const result = {
    schemaVersion: SCHEMA_VERSION,
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
    actionCount: history.filter((entry) => entry.executed).length,
    observation: observation ? compactObservation(observation) : null,
    history: history.slice(-historyLimit),
  };
  result.handoff = buildHandoff(result, browser);
  emit(onEvent, { type: 'result', result });
  return result;
}

function buildHandoff(result, browser) {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: result.status,
    reasonCode: result.reasonCode,
    goal: result.goal,
    backend: result.backend,
    provider: result.provider,
    finalUrl: result.observation?.url ?? '',
    finalTitle: result.observation?.title ?? '',
    actionCount: result.actionCount,
    durationMs: result.durationMs,
    session: browser.session ?? browser.sessionId ?? null,
    needsVerification: result.status !== 'success',
    lastActions: result.history,
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

function compactActionResult(value) {
  if (!value || typeof value !== 'object') return value;
  return {
    dispatched: value.dispatched,
    effect: value.effect,
    settledUrl: value.settledUrl,
  };
}

function trimHistory(history, limit) {
  const maximum = Math.max(limit * 3, 30);
  if (history.length > maximum) history.splice(0, history.length - maximum);
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

function emit(onEvent, event) {
  if (typeof onEvent === 'function') onEvent(event);
}

function observationIdentity(observation) {
  return [
    String(observation?.url ?? ''),
    String(observation?.title ?? ''),
    String(observation?.snapshot ?? ''),
  ].join('\n');
}

function hasSuccessCriteria(criteria) {
  return Boolean(criteria?.urlContains || criteria?.textContains);
}

function abortError() {
  const error = new BrowsemuxError('Operation cancelled', { code: 'ABORT_ERR' });
  error.name = 'AbortError';
  return error;
}
