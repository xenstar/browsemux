import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installBrowsemuxSkill,
  resolveSkillTargets,
  skillSourcePath,
} from '../src/skills.mjs';

test('skill metadata and routing contract are present', async () => {
  const source = await readFile(join(skillSourcePath(), 'SKILL.md'), 'utf8');
  assert.match(source, /^---\nname: browsemux\n/m);
  assert.match(source, /description: .*Browsemux/);
  assert.match(source, /Use `browsemux run` as the default browser execution path/);
  assert.match(source, /takes precedence over a vendor browser skill/);
  assert.match(source, /Do not reproduce that workflow by issuing raw `agent-browser` or `bsk`/);
  assert.match(source, /taking screenshots, PDFs, videos, traces, or visual comparisons/);
  assert.ok(source.split('\n').length < 500);
});

test('resolves project and user skill targets for all harnesses', () => {
  const cwd = 'G:\\work\\project';
  const project = resolveSkillTargets({
    harnesses: 'codex,opencode',
    scope: 'project',
    cwd,
  });
  assert.deepEqual(project.map((entry) => entry.target), [
    join(cwd, '.codex', 'skills', 'browsemux'),
    join(cwd, '.opencode', 'skills', 'browsemux'),
  ]);

  const user = resolveSkillTargets({
    harnesses: 'all',
    scope: 'user',
    env: {
      HOME: 'C:\\Users\\test',
      LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
    },
    home: 'C:\\Users\\test',
    platformName: 'win32',
  });
  assert.equal(user.length, 6);
  assert.ok(user.some((entry) => entry.target.endsWith(join('hermes', 'skills', 'browsemux'))));
});

test('installs the portable skill and rejects a conflicting copy without force', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'browsemux-skill-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const home = join(root, 'home');
  await mkdir(source, { recursive: true });
  await writeFile(join(source, 'SKILL.md'), 'skill body\n', 'utf8');

  const first = await installBrowsemuxSkill({
    harnesses: 'agents',
    source,
    home,
    env: {},
  });
  assert.equal(first.installed[0].action, 'installed');
  assert.equal(
    await readFile(join(home, '.agents', 'skills', 'browsemux', 'SKILL.md'), 'utf8'),
    'skill body\n',
  );

  const unchanged = await installBrowsemuxSkill({
    harnesses: 'agents',
    source,
    home,
    env: {},
  });
  assert.equal(unchanged.installed[0].action, 'unchanged');

  await writeFile(join(source, 'SKILL.md'), 'changed\n', 'utf8');
  await assert.rejects(
    installBrowsemuxSkill({ harnesses: 'agents', source, home, env: {} }),
    (error) => error.code === 'SKILL_ALREADY_EXISTS',
  );

  const replaced = await installBrowsemuxSkill({
    harnesses: 'agents',
    source,
    home,
    env: {},
    force: true,
  });
  assert.equal(replaced.installed[0].action, 'replaced');
});
