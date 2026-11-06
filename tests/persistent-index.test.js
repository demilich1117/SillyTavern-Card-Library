import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryIndex } from '../library-index.js';
import { createHost } from '../host.js';
import { exportSettings } from '../core.js';

function harness(count = 4) {
    const rows = new Map(), calls = { cards: [], previews: [], heads: [] };
    const sources = Array.from({ length: count }, (_, i) => ({ avatar: `${i}.png`, name: `角色 ${i}`, shallow: true }));
    const bodies = new Map(sources.map(card => [card.avatar, { ...card, shallow: false, data: { name: card.name, description: '旧内容', first_mes: '开场' } }]));
    const stamps = new Map(sources.map(card => [card.avatar, 'v1']));
    const storage = {
        read: async ids => new Map(ids.filter(id => rows.has(id)).map(id => [id, structuredClone(rows.get(id))])),
        write: async entries => { for (const row of entries) rows.set(row.id, structuredClone(row)); },
        remove: async ids => { for (const id of ids) rows.delete(id); },
        clear: async () => rows.clear(),
        prune: async ids => { for (const id of rows.keys()) if (!ids.includes(id)) rows.delete(id); },
    };
    const host = {
        previewRevision: async () => 'rules-1',
        cardStamp: async card => { calls.heads.push(card.avatar); return stamps.get(card.avatar); },
        getCard: async id => { calls.cards.push(id); return structuredClone(bodies.get(id)); },
        opening: async card => { calls.previews.push(card.avatar); return { processed: card.data.first_mes }; },
        bookNames: async () => [], books: async () => [],
    };
    const create = () => new LibraryIndex(host, text => text, { storage, yieldBatch: async () => {} });
    return { rows, calls, sources, bodies, stamps, storage, host, create };
}

test('new page restores disk cards without body reads; same-size changes use file ETag', async () => {
    const h = harness(); await h.create().build(h.sources);
    const reopened = await h.create().build(h.sources);
    assert.equal(reopened.restored, 4); assert.equal(h.calls.cards.length, 4); assert.equal(h.calls.previews.length, 4); assert.equal(h.calls.heads.length, 8);
    h.bodies.get('1.png').data.description = '新内容'; h.stamps.set('1.png', 'v2');
    const index = h.create(); await index.build(h.sources);
    assert.equal(h.calls.cards.length, 5); assert.equal(h.calls.cards.at(-1), '1.png'); assert.equal(index.records.get('1.png').data.description, '新内容');
    assert.ok(!('record' in h.rows.get('1.png')) && !('books' in h.rows.get('1.png')));
});
test('full host cards compare body content without additional file metadata requests', async () => {
    const h = harness(1), sources = [...h.bodies.values()]; await h.create().build(sources); await h.create().build(sources);
    assert.equal(h.calls.cards.length, 0); assert.equal(h.calls.heads.length, 0); assert.equal(h.calls.previews.length, 1);
    sources[0].data.first_mes = '新场'; const index = h.create(); await index.build(sources);
    assert.equal(index.records.get('0.png').previewText, '新场'); assert.equal(h.calls.previews.length, 2);
});
test('partial batches survive a new instance; only unfinished cards are fetched', async () => {
    const h = harness(70), controller = new AbortController();
    await h.create().build(h.sources, { signal: controller.signal, onProgress: progress => { if (progress.batchComplete && progress.completed === 24) controller.abort(); } });
    assert.equal(h.rows.size, 24);
    await h.create().build(h.sources); assert.equal(h.calls.cards.length, 70); assert.equal(h.rows.size, 70);
});
test('edit events before opening invalidate saved cards, while deleted rows are pruned', async () => {
    const h = harness(); await h.create().build(h.sources);
    const index = h.create(); index.invalidateCard('2.png');
    await index.build(h.sources.slice(0, 3));
    assert.equal(h.calls.cards.length, 5); assert.equal(h.calls.cards.at(-1), '2.png'); assert.equal(h.rows.has('3.png'), false);
});
test('cache schema mismatch and malformed rows are rebuilt independently', async () => {
    const h = harness(); await h.create().build(h.sources);
    h.rows.get('0.png').format = 0; h.rows.get('1.png').card.avatar = 'different.png';
    await h.create().build(h.sources); assert.equal(h.calls.cards.length, 6); assert.equal(h.rows.get('0.png').format, 1); assert.equal(h.rows.get('1.png').card.avatar, '1.png');
});
test('a temporarily empty host list during startup does not erase the disk cache', async () => {
    const h = harness(); await h.create().build(h.sources);
    const index = h.create(); await index.build([]); assert.equal(h.rows.size, 4);
    const result = await index.build(h.sources); assert.equal(result.restored, 4); assert.equal(h.calls.cards.length, 4);
});
test('missing ETags never turn shallow metadata into proof of unchanged body', async () => {
    const h = harness(1); h.stamps.set('0.png', null);
    const first = h.create(); await first.build(h.sources); await first.build(h.sources); assert.equal(h.calls.cards.length, 1);
    h.bodies.get('0.png').data.description = '新内容'; const next = h.create(); await next.build(h.sources);
    assert.equal(h.calls.cards.length, 2); assert.equal(next.records.get('0.png').data.description, '新内容');
});
test('a failed metadata check remains retryable and does not silently validate stale data', async () => {
    const h = harness(); await h.create().build(h.sources); const normal = h.host.cardStamp;
    h.host.cardStamp = async card => { if (card.avatar === '1.png') throw Error('metadata timeout'); return normal(card); };
    const index = h.create(); const failed = await index.build(h.sources); assert.equal(failed.errors.length, 1);
    h.host.cardStamp = normal; const retry = await index.build(h.sources); assert.equal(retry.errors.length, 0); assert.equal(retry.restored, 1); assert.equal(h.calls.cards.length, 4);
});
test('storage failure degrades to memory cache with an explicit warning and allows reset', async () => {
    const h = harness(), write = h.storage.write; h.storage.write = async () => { throw new Error('QuotaExceededError'); };
    const index = h.create(); const result = await index.build(h.sources);
    assert.equal(result.errors.length, 0); assert.equal(index.records.size, 4); assert.match(index.storageError, /QuotaExceededError/);
    await index.build(h.sources); assert.equal(h.calls.cards.length, 4);
    h.storage.write = write; await index.clearPersistent(); await index.build(h.sources);
    assert.equal(h.rows.size, 4); assert.equal(index.storageError, '');
});
test('local cache namespaces belong to settings profiles and never enter library exports', () => {
    const a = { extensionSettings: {}, saveSettingsDebounced() {} }, b = { extensionSettings: {}, saveSettingsDebounced() {} };
    const first = createHost({ getContext: () => a }), second = createHost({ getContext: () => b });
    const store = first.cacheStore(); assert.equal(first.cacheStore().name, store.name); assert.notEqual(second.cacheStore().name, store.name);
    assert.equal(exportSettings(first.settings()).cacheNamespace, undefined);
});
test('host checks encoded character paths with HEAD and refuses weak timestamp-only validation', async () => {
    const calls = [];
    const host = createHost({ fetcher: async (path, options) => { calls.push({ path, options }); return new Response(null, { headers: { ETag: '"v1"' } }); } });
    assert.equal(await host.cardStamp({ avatar: '名字 #?.png' }), '"v1"');
    assert.equal(calls[0].path, '/characters/%E5%90%8D%E5%AD%97%20%23%3F.png'); assert.equal(calls[0].options.method, 'HEAD'); assert.equal(calls[0].options.cache, 'no-store');
    const unsupported = createHost({ fetcher: async () => new Response(null, { headers: { 'Last-Modified': new Date().toUTCString() } }) });
    assert.equal(await unsupported.cardStamp({ avatar: 'a.png' }), null);
    const broken = createHost({ fetcher: async () => new Response(null, { status: 503 }) });
    await assert.rejects(broken.cardStamp({ avatar: 'a.png' }), /503/);
});
