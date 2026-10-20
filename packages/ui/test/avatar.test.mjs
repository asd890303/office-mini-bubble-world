import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as Core from '../../../games/bubble-island/game-core.js';

const src = fs.readFileSync(new URL('../avatar.js', import.meta.url), 'utf8');
const grab = name => { const m = src.match(new RegExp(`export const ${name} = ([\\s\\S]*?);\\n`)); assert.ok(m, name); return new Function(`return ${m[1]}`)(); };

test('avatar options match the game core (colors and ears)', () => {
  assert.deepEqual(grab('COLORS'), Core.COLORS);
  assert.deepEqual(grab('EARS'), Core.EARS);
});
