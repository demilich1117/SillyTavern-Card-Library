import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightRanges } from '../core.js';

test('search highlighting covers repeated Chinese keywords and quoted phrases', () => {
    assert.deepEqual(highlightRanges('雾港与旧书店，雾港来信', '雾港 "旧书店"'), [[0, 2], [3, 6], [7, 9]]);
});
test('highlight offsets preserve fullwidth text, combining marks and emoji graphemes', () => {
    const source = '📖 ＦＯＯ e\u0301 👩‍💻';
    assert.deepEqual(highlightRanges(source, 'foo é 👩‍💻').map(([a, b]) => source.slice(a, b)), ['ＦＯＯ', 'e\u0301', '👩‍💻']);
});
test('overlapping and adjacent matches merge without nesting', () => {
    assert.deepEqual(highlightRanges('aaaa', 'aa aaa'), [[0, 4]]);
    assert.deepEqual(highlightRanges('雾港来信', '雾港 来信'), [[0, 4]]);
});
test('highlight treats regex and HTML syntax as literal text and ignores empty queries', () => {
    assert.deepEqual(highlightRanges('[a+b] <img>', '[a+b] <img>'), [[0, 5], [6, 11]]);
    assert.deepEqual(highlightRanges('normal', ''), []);
    assert.deepEqual(highlightRanges('normal', 'absent'), []);
});
