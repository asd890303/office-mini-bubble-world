import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRows } from '../keyhelp.js';

test('key help rows: [X] becomes a key cap, other text is escaped', () => {
  assert.equal(renderRows(['[A][D] 左右移動']), '<div><kbd>A</kbd><kbd>D</kbd> 左右移動</div>');
  assert.equal(renderRows(['<b>[空白]</b> 跳']), '<div>&lt;b&gt;<kbd>空白</kbd>&lt;/b&gt; 跳</div>');
  assert.equal(renderRows(['a', 'b']), '<div>a</div><div>b</div>');
});
