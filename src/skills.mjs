import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowsemuxError } from './errors.mjs';

const SKILL_NAME = 'browsemux';
const HARNESSES = ['codex', 'agents', 'claude', 'cursor', 'opencode', 'hermes'];

export function skillSourcePath() {
  return fileURLToPath(new URL('../skills/browsemux', import.meta.url));
}

export function resolveSkillTargets({
  harnesses = 'all',
  scope = 'user',
  cwd = process.cwd(),
  env = process.env,
  home = homedir(),
  platformName = platform(),
} = {}) {
  if (!['user', 'project'].includes(scope)) {
    throw new BrowsemuxError(`Unsupported skill scope: ${scope}`, {
      code: 'INVALID_ARGUMENTS',
    });
  }

  const selected = selectedHarnesses(harnesses);
  const roots = selected.map((harness) => ({
    harness,
    skillsRoot: scope === 'project'
      ? projectSkillRoot(harness, cwd)
      : userSkillRoot(harness, { env, home, platformName }),
  }));
  const seen = new Set();

  return roots
    .filter((entry) => {
      const resolved = resolve(entry.skillsRoot);
      const key = platformName === 'win32' ? resolved.toLowerCase() : resolved;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((entry) => ({
      ...entry,
      target: join(entry.skillsRoot, SKILL_NAME),
    }));
}

export async function installBrowsemuxSkill({
  harnesses = 'all',
  scope = 'user',
  force = false,
  cwd = process.cwd(),
  env = process.env,
  home = homedir(),
  platformName = platform(),
  source = skillSourcePath(),
} = {}) {
  const sourceStat = await stat(source).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    throw new BrowsemuxError(`Browsemux skill source not found: ${source}`, {
      code: 'SKILL_SOURCE_MISSING',
    });
  }

  const targets = resolveSkillTargets({
    harnesses,
    scope,
    cwd,
    env,
    home,
    platformName,
  });
  const plan = [];

  for (const entry of targets) {
    const targetStat = await stat(entry.target).catch(() => null);
    if (targetStat && !force) {
      if (!targetStat.isDirectory()) {
        throw new BrowsemuxError(
          `Skill target is not a directory: ${entry.target}`,
          { code: 'SKILL_ALREADY_EXISTS', details: { target: entry.target } },
        );
      }
      if (await directoriesEqual(source, entry.target)) {
        plan.push({ ...entry, action: 'unchanged' });
        continue;
      }
      throw new BrowsemuxError(
        `Skill already exists at ${entry.target}; rerun with --force to replace it`,
        { code: 'SKILL_ALREADY_EXISTS', details: { target: entry.target } },
      );
    }
    plan.push({ ...entry, action: targetStat ? 'replaced' : 'installed' });
  }

  const installed = [];
  for (const entry of plan) {
    if (entry.action === 'unchanged') {
      installed.push(entry);
      continue;
    }
    if (entry.action === 'replaced') {
      await rm(entry.target, { recursive: true, force: true });
    }
    await mkdir(entry.skillsRoot, { recursive: true });
    await cp(source, entry.target, { recursive: true });
    installed.push(entry);
  }

  return {
    source,
    scope,
    installed,
  };
}

function selectedHarnesses(harnesses) {
  const requested = Array.isArray(harnesses)
    ? harnesses
    : String(harnesses ?? 'all').split(',');
  const normalized = requested
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const selected = normalized.includes('all')
    ? new Set(HARNESSES)
    : new Set(normalized);

  for (const harness of selected) {
    if (!HARNESSES.includes(harness)) {
      throw new BrowsemuxError(`Unsupported harness: ${harness}`, {
        code: 'INVALID_ARGUMENTS',
      });
    }
  }

  if (!selected.size) {
    throw new BrowsemuxError('At least one harness is required', {
      code: 'INVALID_ARGUMENTS',
    });
  }
  return [...selected];
}

function projectSkillRoot(harness, cwd) {
  const root = resolve(cwd);
  switch (harness) {
    case 'codex':
      return join(root, '.codex', 'skills');
    case 'agents':
      return join(root, '.agents', 'skills');
    case 'claude':
      return join(root, '.claude', 'skills');
    case 'cursor':
      return join(root, '.cursor', 'skills');
    case 'opencode':
      return join(root, '.opencode', 'skills');
    case 'hermes':
      return join(root, '.hermes', 'skills');
    default:
      throw new BrowsemuxError(`Unsupported harness: ${harness}`, {
        code: 'INVALID_ARGUMENTS',
      });
  }
}

function userSkillRoot(harness, { env, home, platformName }) {
  switch (harness) {
    case 'codex':
      return join(env.CODEX_HOME || join(home, '.codex'), 'skills');
    case 'agents':
      return join(env.AGENTS_HOME || join(home, '.agents'), 'skills');
    case 'claude':
      return join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'skills');
    case 'cursor':
      return join(env.CURSOR_HOME || join(home, '.cursor'), 'skills');
    case 'opencode':
      return join(
        env.XDG_CONFIG_HOME || join(home, '.config'),
        'opencode',
        'skills',
      );
    case 'hermes': {
      if (env.HERMES_HOME) return join(env.HERMES_HOME, 'skills');
      if (platformName === 'win32' && env.LOCALAPPDATA) {
        return join(env.LOCALAPPDATA, 'hermes', 'skills');
      }
      return join(home, '.hermes', 'skills');
    }
    default:
      throw new BrowsemuxError(`Unsupported harness: ${harness}`, {
        code: 'INVALID_ARGUMENTS',
      });
  }
}

async function directoriesEqual(left, right) {
  const [leftEntries, rightEntries] = await Promise.all([
    readdir(left, { withFileTypes: true }),
    readdir(right, { withFileTypes: true }),
  ]);
  if (leftEntries.length !== rightEntries.length) return false;

  const rightNames = new Map(rightEntries.map((entry) => [entry.name, entry]));
  for (const leftEntry of leftEntries) {
    const rightEntry = rightNames.get(leftEntry.name);
    if (!rightEntry || leftEntry.isDirectory() !== rightEntry.isDirectory()) {
      return false;
    }
    if (leftEntry.isDirectory()) {
      if (!await directoriesEqual(
        join(left, leftEntry.name),
        join(right, rightEntry.name),
      )) {
        return false;
      }
      continue;
    }
    const [leftBody, rightBody] = await Promise.all([
      readFile(join(left, leftEntry.name)),
      readFile(join(right, rightEntry.name)),
    ]);
    if (!leftBody.equals(rightBody)) return false;
  }
  return true;
}
