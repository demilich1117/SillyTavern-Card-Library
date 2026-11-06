import { makeRecord, mapLimit } from './core.js';

// Chat statistics change independently of card content and must not evict full cards.
export function cardRevision(card) {
    const { chat, date_last_chat, chat_size, fav, ...content } = card;
    return JSON.stringify(content);
}

export class LibraryIndex {
    constructor(host, renderPreview, { batchSize = 24, concurrency = 3, yieldBatch = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
        this.host = host; this.renderPreview = renderPreview;
        this.batchSize = batchSize; this.concurrency = concurrency; this.yieldBatch = yieldBatch;
        this.records = new Map(); this.cache = new Map(); this.dirty = new Set(); this.version = 0;
    }
    cancel() { this.version++; }
    remove(id) { this.cache.delete(id); this.records.delete(id); this.dirty.delete(id); }
    invalidateCard(id) {
        if (!id) { for (const key of this.records.keys()) this.dirty.add(key); this.cache.clear(); return; }
        this.cache.delete(id); this.dirty.add(id);
    }
    invalidateWorld(name) {
        for (const cached of this.cache.values()) {
            if (!name || cached.books?.some(book => book.name === name)) {
                delete cached.booksKey; delete cached.books; delete cached.record;
            }
        }
    }
    seed(card, source = card) {
        this.cache.set(card.avatar, { card: { ...card }, sourceKey: cardRevision(source) });
        this.dirty.delete(card.avatar); this.records.set(card.avatar, makeRecord(card));
    }
    async build(sources, { includeWorld = false, force = false, signal, onProgress = () => {} } = {}) {
        const version = ++this.version, active = () => version === this.version && !signal?.aborted;
        const ids = new Set(sources.map(card => card.avatar));
        for (const id of new Set([...this.records.keys(), ...this.cache.keys(), ...this.dirty])) if (!ids.has(id)) this.remove(id);
        if (force) { this.invalidateCard(); this.records.clear(); }
        // Even full-card hosts should not normalize every long body before the first yield.
        for (const card of sources) if (!this.records.has(card.avatar)) {
            const data = card.data || card;
            this.records.set(card.avatar, makeRecord({ avatar: card.avatar, shallow: true,
                name: data.name || card.name, creator: data.creator, tags: data.tags,
                date_last_chat: card.date_last_chat, create_date: card.create_date }));
        }
        const progress = { total: sources.length, completed: 0, reused: 0, batch: 0, batches: Math.ceil(sources.length / this.batchSize), errors: [] };
        onProgress({ ...progress });
        let previewKey;
        try { previewKey = await this.host.previewRevision(); }
        catch { previewKey = Symbol('retry-preview'); }
        if (!active()) return { ...progress, cancelled: true };
        for (let start = 0; start < sources.length && active(); start += this.batchSize) {
            progress.batch++;
            await mapLimit(sources.slice(start, start + this.batchSize), this.concurrency, async source => {
                if (!active()) return;
                const id = source.avatar, sourceKey = cardRevision(source); let changed = false;
                try {
                    let cached = this.cache.get(id);
                    if (!cached || cached.sourceKey !== sourceKey) {
                        const card = force || this.dirty.has(id) || source.shallow || !source.data
                            ? await this.host.getCard(id, signal) : source;
                        if (!active()) return;
                        cached = { card: { ...card }, sourceKey };
                        this.cache.set(id, cached); this.dirty.delete(id); changed = true;
                    }
                    // Keep recent-chat sorting current without repeating content requests.
                    for (const key of ['date_last_chat', 'chat_size', 'chat', 'fav']) if (Object.hasOwn(source, key)) cached.card[key] = source[key];
                    if (cached.previewKey !== previewKey) {
                        const opening = await this.host.opening(cached.card);
                        if (!active()) return;
                        cached.previewText = this.renderPreview(opening.processed) || '此开场为前端界面，可打开开场白预览。';
                        cached.previewKey = previewKey; delete cached.record; changed = true;
                    }
                    // Publish useful card content even if a linked world later fails.
                    if (!cached.record) {
                        const partial = makeRecord(cached.card); partial.previewText = cached.previewText;
                        this.records.set(id, partial);
                    }
                    if (includeWorld) {
                        const booksKey = JSON.stringify(await this.host.bookNames(cached.card));
                        if (!active()) return;
                        if (cached.booksKey !== booksKey) {
                            const books = await this.host.books(cached.card, signal);
                            if (!active()) return;
                            cached.books = books; cached.booksKey = booksKey; delete cached.record; changed = true;
                        }
                    }
                    if (!cached.record || cached.worldMode !== includeWorld) {
                        cached.record = makeRecord(cached.card, includeWorld ? cached.books || [] : []);
                        cached.record.previewText = cached.previewText; cached.worldMode = includeWorld;
                    }
                    if (!active()) return;
                    this.records.set(id, cached.record);
                    if (!changed) progress.reused++;
                } catch (error) {
                    if (active()) progress.errors.push({ id, name: source.name || id, message: error?.message || String(error) });
                } finally { if (active()) { progress.completed++; onProgress({ ...progress }); } }
            }, signal);
            if (!active()) break;
            onProgress({ ...progress, batchComplete: true });
            if (start + this.batchSize < sources.length) await this.yieldBatch();
        }
        return { ...progress, cancelled: !active() };
    }
}
