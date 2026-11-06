import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from '../dev/fixtures.mjs';
import { createHost } from '../host.js';

function harness() {
    const cards = fixtures(), requests = [], events = [], generations = [];
    const ctx = { characters: cards, characterId: undefined, chat: [{ mes: 'PRIVATE CHAT' }], extensionSettings: {}, getRequestHeaders: () => ({ 'X-CSRF-Token': 'fixture' }), saveSettingsDebounced() {}, getOneCharacter: async () => {}, selectCharacterById: async id => { ctx.characterId = id; }, eventTypes: { CHARACTER_EDITED: 'edit' }, eventSource: { emit: async (...args) => events.push(args) }, generateRaw: async args => { generations.push(args); return '{"summary":"test","types":["悬疑"]}'; } };
    const main = { isGenerating: () => false, printCharacters: async () => {}, deleteCharacter: async (ids, options) => { requests.push({ delete: ids, options }); cards.splice(cards.findIndex(card => card.avatar === ids[0]), 1); return true; } };
    const fetcher = async (path, options) => {
        const body = JSON.parse(options.body); requests.push({ path, body, headers: options.headers });
        if (path.endsWith('/get') && path.includes('characters')) return new Response(JSON.stringify(cards.find(card => card.avatar === body.avatar_url)));
        if (path.endsWith('/all')) return new Response(JSON.stringify(cards));
        if (path.endsWith('/merge-attributes')) return new Response('OK');
        if (path.endsWith('/chats')) return new Response('{"error":true}');
        if (path === '/api/worldinfo/get') return new Response('{"entries":{}}');
        if (path === '/api/chats/get') return new Response('[{"chat_metadata":{}},{"mes":"old message"}]');
        throw Error('Unexpected path ' + path);
    };
    const host = createHost({ getContext: () => ctx, fetcher, loadModule: async path => path === '/script.js' ? main : { world_info: { charLore: [{ name: 'fixture-1', extraBooks: ['extra'] }] } } });
    return { host, cards, requests, ctx, main, events, generations };
}
test('host uses authenticated read-only card and history requests without selecting a character', async () => {
    const { host, requests, ctx, cards } = harness(); const card = await host.getCard(cards[0].avatar); await host.chat(card, '初遇.jsonl');
    assert.equal(ctx.characterId, undefined); assert.equal(requests[0].headers['X-CSRF-Token'], 'fixture'); assert.equal(requests[1].body.file_name, '初遇');
});
test('save performs optimistic reread and sends only intended patch', async () => {
    const { host, requests, cards, events } = harness(); const result = await host.saveCard(cards[0], { first_mes: 'new opening' });
    assert.equal(requests[0].path, '/api/characters/get'); assert.equal(requests[1].path, '/api/characters/merge-attributes'); assert.deepEqual(Object.keys(requests[1].body.data), ['first_mes']); assert.equal(result.card.data.extensions.arbitrary_plugin.keep, true); assert.equal(events[0][0], 'edit');
});
test('successful save with a failed UI refresh remains a successful save with warning', async () => {
    const { host, ctx, cards } = harness(); ctx.getOneCharacter = async () => { throw Error('offline'); };
    const result = await host.saveCard(cards[0], { first_mes: 'new' }); assert.equal(result.card.data.first_mes, 'new'); assert.match(result.warning, /已保存/);
});
test('delete defaults to preserving chats and verifies each result after partial host success', async () => {
    const { host, cards, requests } = harness(); const ids = cards.slice(0, 2).map(card => card.avatar);
    const result = await host.deleteCards(ids); assert.deepEqual(requests[0].options, { deleteChats: false }); assert.deepEqual(result.deleted, [ids[0]]); assert.deepEqual(result.remaining, [ids[1]]);
});
test('generation blocks edit, deletion and character switching', async () => {
    const { host, cards, main, requests } = harness(); main.isGenerating = () => true;
    await assert.rejects(host.saveCard(cards[0], { first_mes: 'new' }), /等待/); await assert.rejects(host.deleteCards([cards[0].avatar]), /等待/); await assert.rejects(host.openCard(cards[0].avatar), /等待/); assert.equal(requests.length, 0);
});
test('linked world lookup uses filename identity including extra books', async () => {
    const { host, cards } = harness(); const books = await host.books(cards[0]); assert.deepEqual(books.map(book => book.name), ['雾港档案', 'extra']);
});
test('empty legacy chat list is not an error', async () => { const { host } = harness(); assert.deepEqual(await host.chats('fixture-1.png'), []); });
test('AI classification uses the existing raw generation API and excludes chat', async () => {
    const { host, cards, generations } = harness(); const result = await host.classify(cards[0]); assert.deepEqual(result.result.types, ['悬疑']); assert.equal(generations.length, 1); assert.ok(!generations[0].prompt.includes('PRIVATE CHAT')); assert.equal(generations[0].responseLength, 600);
});
test('read failures propagate instead of silently producing an empty library', async () => {
    const host = createHost({ getContext: () => ({ getRequestHeaders: () => ({}) }), fetcher: async () => new Response('offline', { status: 503 }) });
    await assert.rejects(host.getCard('a.png'), /503/);
});
test('export uses the host download helper including TT failure propagation', async () => {
    const calls = [];
    const host = createHost({ loadModule: async path => { assert.equal(path, '/scripts/utils.js'); return { download: async (...args) => calls.push(args) }; } });
    await host.exportLibrary('library.json', { test: true }); assert.equal(calls[0][0], '{\n  "test": true\n}'); assert.deepEqual(calls[0][3], { throwOnFailure: true });
    const failing = createHost({ loadModule: async () => ({ download: async () => ({ mode: 'failed' }) }) }); await assert.rejects(failing.exportLibrary('a.json', {}), /导出失败/);
});
