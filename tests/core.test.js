import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from '../dev/fixtures.mjs';
import { normalizeSettings, makeRecord, searchRecord, filterRecords, editPatch, parseClassification, classificationInput, importLibrary, chatMessages, mapLimit } from '../core.js';

test('settings migration preserves unrelated fields and does not share nested state', () => {
    const old = { customFutureOption: true, favorites: ['a.png', 'a.png', null], groups: [{ id: 'g1', name: '  故事  ', members: ['a.png', 'a.png'] }, { id: 'g1', name: 'duplicate', members: [] }] };
    const next = normalizeSettings(old); assert.equal(next.customFutureOption, true); assert.deepEqual(next.favorites, ['a.png']); assert.equal(next.groups.length, 1);
    next.groups[0].members.push('b.png'); assert.equal(old.groups[0].members.length, 2);
    assert.deepEqual(normalizeSettings(next), next);
});
test('same display name never merges avatar identities or grouping', () => {
    const cards = fixtures().map(card => makeRecord(card)); const settings = normalizeSettings({ groups: [{ id: 'one', name: '测试', members: ['fixture-1.png'] }] });
    const result = filterRecords(cards, settings, { group: 'one', query: '雾港来信' }); assert.equal(result.length, 1); assert.equal(result[0].record.id, 'fixture-1.png');
});
test('search reaches descriptions, alternate greetings and embedded worlds', () => {
    const record = makeRecord(fixtures()[0]);
    for (const query of ['第三盏灯', '蓝色风铃', '归航之星']) assert.ok(searchRecord(record, query));
    assert.equal(searchRecord(record, '第三盏灯', 'name'), null); assert.ok(searchRecord(record, '蓝色风铃', 'opening'));
});
test('multi-word search supports normalized case, quoted phrases and cross-field matches', () => {
    const record = makeRecord({ avatar: 'a.png', data: { name: 'ＡＢＣ', description: 'Magic Forest', first_mes: 'Moon light' } });
    assert.ok(searchRecord(record, 'abc "magic forest" moon')); assert.equal(searchRecord(record, 'abc nowhere'), null);
});
test('linked world entries participate when explicitly loaded', () => {
    const record = makeRecord(fixtures()[0], [{ name: '外部书', data: { entries: { 8: { comment: '条目', key: ['天青石'], content: '雨后' } } } }]);
    assert.ok(searchRecord(record, '天青石', 'world')); assert.equal(searchRecord(makeRecord(fixtures()[0]), '天青石'), null);
});
test('edit patch touches only changed allowlisted fields in both card representations', () => {
    const card = fixtures()[0]; const current = structuredClone(card); current.data.extensions.new_plugin = { keep: true };
    const patch = editPatch(card, { description: 'new', first_mes: card.first_mes, extensions: 'BAD' }, current);
    assert.deepEqual(patch, { avatar: card.avatar, description: 'new', data: { description: 'new' } }); assert.equal(current.data.extensions.arbitrary_plugin.keep, true);
});
test('edit refuses a concurrent change to a modified field but allows unrelated changes', () => {
    const card = fixtures()[0]; const changed = structuredClone(card); changed.data.description = 'changed externally';
    assert.throws(() => editPatch(card, { description: 'my draft' }, changed), /其他地方修改/);
    assert.doesNotThrow(() => editPatch(card, { first_mes: 'new opening' }, changed));
    assert.throws(() => editPatch(card, { name: '  ' }, card), /不能为空/);
});
test('AI output is validated without eval and length limited', () => {
    const result = parseClassification('```json\n{"summary":"test","types":["悬疑","悬疑","  慢热  "]}\n```'); assert.deepEqual(result.types, ['悬疑', '慢热']);
    for (const value of ['alert(1)', '{}', '{"summary":"hi","types":[]}', '{"summary":"","types":["x"]}']) assert.throws(() => parseClassification(value));
    assert.equal(parseClassification(JSON.stringify({ summary: 'x'.repeat(900), types: ['ok'] })).summary.length, 800);
});
test('AI input budgets fields and never includes chats or plugin secrets', () => {
    const card = fixtures()[0]; card.data.description = 'd'.repeat(30000); card.chat = 'private-chat';
    const prepared = classificationInput(card); assert.equal(prepared.truncated, true); assert.ok(prepared.input.length <= 16000); assert.ok(!prepared.input.includes('do-not-change')); assert.ok(!prepared.input.includes('private-chat'));
});
test('library import merges named groups without destroying local identities or unrelated settings', () => {
    const current = normalizeSettings({ groups: [{ id: 'g1', name: '日常', members: ['a.png'] }], favorites: ['local.png'], custom: 'keep' });
    const next = importLibrary({ format: 'card-library', version: 1, settings: { groups: [{ id: 'g1', name: '日常', members: ['b.png'] }, { id: 'g2', name: '探索', members: ['c.png'] }], favorites: ['new.png'] } }, current);
    assert.equal(next.groups[0].id, 'g1'); assert.deepEqual(next.groups[0].members, ['a.png', 'b.png']); assert.equal(next.groups.length, 2); assert.equal(next.custom, 'keep'); assert.equal(current.groups[0].members.length, 1);
    assert.throws(() => importLibrary({ format: 'wrong' }, current));
});
test('chat parser excludes header without dropping tool or system messages', () => {
    const messages = chatMessages([{ chat_metadata: {} }, { name: 'user', mes: 'hi', is_user: true }, { role: 'tool', content: 'result' }, { is_system: true, mes: 'notice' }]);
    assert.equal(messages.length, 3); assert.equal(messages[1].content, 'result'); assert.throws(() => chatMessages({}));
});
test('bounded index workers report individual failures and honor cancellation', async () => {
    let concurrent = 0, maximum = 0; const controller = new AbortController();
    const results = await mapLimit([1, 2, 3, 4, 5], 2, async value => { concurrent++; maximum = Math.max(maximum, concurrent); await new Promise(resolve => setTimeout(resolve, 5)); concurrent--; if (value === 3) throw Error('failed'); return value; });
    assert.equal(maximum, 2); assert.equal(results[2].status, 'rejected'); assert.equal(results[4].value, 5);
    controller.abort(); let called = 0; await mapLimit([1, 2], 2, async () => called++, controller.signal); assert.equal(called, 0);
});
