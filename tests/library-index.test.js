import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryIndex } from '../library-index.js';
import { filterRecords, makeRecord, normalizeSettings } from '../core.js';

function harness(count = 8) {
    const sources = Array.from({ length: count }, (_, i) => ({ avatar: `${i}.png`, name: `角色 ${i}`, shallow: true, date_last_chat: i }));
    const calls = { cards: [], books: [], previews: [], active: 0, max: 0, yields: 0 }, failures = new Set();
    let revision = 'one';
    const host = {
        previewRevision: async () => revision,
        getCard: async id => {
            calls.cards.push(id); calls.active++; calls.max = Math.max(calls.max, calls.active);
            try { await new Promise(resolve => setTimeout(resolve, 1)); if (failures.has(id)) throw new Error('请求超时'); return { avatar: id, name: id, data: { name: id, first_mes: `开场 ${id}`, tags: ['悬疑'] } }; }
            finally { calls.active--; }
        },
        bookNames: async card => [`世界-${card.avatar}`],
        books: async card => { calls.books.push(card.avatar); return [{ name: `世界-${card.avatar}`, data: { entries: [{ content: '旧港口' }] } }]; },
        opening: async card => { calls.previews.push(card.avatar); return { processed: `${revision} ${card.data.first_mes}` }; },
    };
    const index = new LibraryIndex(host, value => value, { yieldBatch: async () => { calls.yields++; } });
    return { index, sources, host, calls, failures, changeRegex: () => revision = 'two' };
}
test('reopening a shallow library reuses full cards, world data and rendered excerpts', async () => {
    const { index, sources, calls } = harness();
    await index.build(sources, { includeWorld: true }); const before = structuredClone(calls);
    const result = await index.build(sources, { includeWorld: true });
    assert.equal(result.reused, 8); assert.deepEqual(calls.cards, before.cards); assert.deepEqual(calls.books, before.books); assert.deepEqual(calls.previews, before.previews);
});
test('world scope toggles reuse cards and already loaded books; regex changes only rebuild previews', async () => {
    const { index, sources, calls, changeRegex } = harness();
    await index.build(sources); await index.build(sources, { includeWorld: true }); await index.build(sources); await index.build(sources, { includeWorld: true });
    assert.equal(calls.cards.length, 8); assert.equal(calls.books.length, 8); assert.equal(calls.previews.length, 8);
    changeRegex(); await index.build(sources, { includeWorld: true });
    assert.equal(calls.cards.length, 8); assert.equal(calls.books.length, 8); assert.equal(calls.previews.length, 16);
    assert.match(index.records.get('0.png').previewText, /^two /);
});
test('editing one card or world updates only the affected cache', async () => {
    const { index, sources, calls } = harness(); await index.build(sources, { includeWorld: true });
    index.invalidateCard('2.png'); await index.build(sources, { includeWorld: true });
    assert.equal(calls.cards.length, 9); assert.equal(calls.cards.at(-1), '2.png'); assert.equal(calls.previews.length, 9);
    index.invalidateWorld('世界-4.png'); await index.build(sources, { includeWorld: true });
    assert.equal(calls.cards.length, 9); assert.equal(calls.previews.length, 9); assert.equal(calls.books.length, 10); assert.equal(calls.books.at(-1), '4.png');
});
test('source changes, new cards, deletion and recent chat metadata remain current', async () => {
    const { index, sources, calls } = harness(); await index.build(sources);
    sources[0].date_last_chat = 999; await index.build(sources);
    assert.equal(calls.cards.length, 8); assert.equal(index.records.get('0.png').card.date_last_chat, 999);
    sources[1].name = '改名'; sources.push({ avatar: 'new.png', shallow: true }); sources.splice(2, 1);
    await index.build(sources); assert.equal(calls.cards.length, 10); assert.equal(index.records.has('2.png'), false); assert.equal(index.cache.has('2.png'), false);
});
test('1000 cards are processed in 24-card batches with at most three reads in flight', async () => {
    const { index, sources, calls, failures } = harness(1000); failures.add('25.png'); const progress = [];
    const result = await index.build(sources, { onProgress: state => { if (state.batchComplete) progress.push(state.completed); } });
    assert.equal(result.completed, 1000); assert.equal(result.errors.length, 1); assert.equal(calls.max, 3); assert.equal(calls.yields, 41);
    assert.equal(progress.length, 42); assert.equal(progress[0], 24); assert.equal(progress.at(-1), 1000); assert.ok(index.records.get('999.png').previewText);
    failures.clear(); const retry = await index.build(sources);
    assert.equal(retry.errors.length, 0); assert.equal(calls.cards.length, 1001); assert.equal(calls.cards.at(-1), '25.png');
});
test('closing during indexing retains completed work and resumes only unfinished cards', async () => {
    const { index, sources, calls } = harness(70); const controller = new AbortController();
    const partial = await index.build(sources, { signal: controller.signal, onProgress: state => { if (state.batchComplete && state.completed === 24) controller.abort(); } });
    assert.equal(partial.cancelled, true); assert.equal(calls.cards.length, 24);
    const result = await index.build(sources); assert.equal(result.errors.length, 0); assert.equal(calls.cards.length, 70); assert.equal(result.reused, 24);
});
test('full-card hosts also defer long-body indexing until each batch', async () => {
    const { index, sources, calls } = harness(30);
    for (const source of sources) { source.shallow = false; source.data = { name: source.name, description: '长人设内容。'.repeat(5000), first_mes: '测试开场' }; }
    let sawInitial = false, sawFirstBatch = false;
    await index.build(sources, { onProgress: progress => {
        if (progress.completed === 0) { sawInitial = true; assert.equal(index.records.get('29.png').data.description, undefined); }
        if (progress.batchComplete && progress.completed === 24) { sawFirstBatch = true; assert.equal(index.records.get('29.png').data.description, undefined); assert.equal(index.records.get('0.png').data.description, sources[0].data.description); }
    } });
    assert.ok(sawInitial && sawFirstBatch); assert.equal(calls.cards.length, 0); assert.equal(index.records.get('29.png').data.description, sources[29].data.description);
});
test('late cancelled requests cannot overwrite a new run; manual refresh bypasses every cached card', async () => {
    const { index, sources, host, calls } = harness(1); let finish;
    const normal = host.getCard;
    host.getCard = () => new Promise(resolve => finish = resolve);
    const first = index.build(sources); await new Promise(resolve => setTimeout(resolve, 0)); index.cancel(); host.getCard = normal;
    await index.build(sources); finish({ avatar: '0.png', data: { name: '过期结果', first_mes: '过期' } }); await first;
    assert.notEqual(index.records.get('0.png').name, '过期结果');
    await index.build(sources, { force: true }); assert.equal(calls.cards.length, 2);
});
test('linked-world failures keep card data and retry without reading that card again', async () => {
    const { index, sources, host, calls } = harness(1); const books = host.books; host.books = async () => { throw Error('world timeout'); };
    const result = await index.build(sources, { includeWorld: true }); assert.equal(result.errors.length, 1); assert.ok(index.records.get('0.png').previewText);
    host.books = books; await index.build(sources, { includeWorld: true }); assert.equal(calls.cards.length, 1); assert.equal(calls.previews.length, 1);
});
test('tag filtering matches exact normalized AI or card tags, not words in descriptions', () => {
    const cards = [
        makeRecord({ avatar: 'native', data: { name: '原标签', tags: [' 悬疑 ', 'ＡＢＣ'] } }),
        makeRecord({ avatar: 'ai', data: { name: 'AI 类型' } }),
        makeRecord({ avatar: 'substring', data: { name: '别的题材', tags: ['悬疑惊悚'], description: '包含悬疑二字' } }),
    ];
    const settings = normalizeSettings({ summaries: { 'card:ai': { types: ['悬疑'] } } });
    assert.deepEqual(filterRecords(cards, settings, { tag: '悬疑' }).map(item => item.record.id).sort(), ['ai', 'native']);
    assert.deepEqual(filterRecords(cards, settings, { tag: 'abc' }).map(item => item.record.id), ['native']);
    assert.equal(filterRecords(cards, settings, { tag: '悬疑', query: '原标签' }).length, 1);
});
