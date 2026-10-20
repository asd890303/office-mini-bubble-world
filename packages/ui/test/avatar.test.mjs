import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as Core from '../../../games/bubble-island/game-core.js';

const src = fs.readFileSync(new URL('../avatar.js', import.meta.url), 'utf8');
const grab = name => { const m = src.match(new RegExp(`export const ${name} = ([\\s\\S]*?);\\n`)); assert.ok(m, name); return new Function(`return ${m[1]}`)(); };

import * as Kart from '../../../games/kart-island/kart-core.js';
import * as Artillery from '../../../games/artillery/artillery-core.js';

test('avatar options match all three game cores (colors, ears, eyes, body, blush)', () => {
  for (const C of [Core, Kart, Artillery]) {
    assert.deepEqual(grab('COLORS'), C.COLORS);
    assert.deepEqual(grab('EARS'), C.EARS);
    assert.deepEqual(grab('EYES'), C.EYES);
    assert.deepEqual(grab('BODIES'), C.BODIES);
    assert.deepEqual(grab('BLUSHES'), C.BLUSHES);
  }
});
