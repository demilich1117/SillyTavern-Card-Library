import { makeRecord, mapLimit } from './core.js';

const CACHE_FORMAT = 1; // Bump when persisted card / preview semantics change.

// Chat statistics change independently of card content and must not evict full cards.
export function cardRevision(card) {
    const { chat, date_last_chat, chat_size, fav, ...content } = card;
    return JSON.stringify(content);
}

export class LibraryIndex {
    constructor(host, renderPreview, { batchSize = 24, concurrency = 3, yieldBatch = () => new Promise(resolve => setTimeout(resolve, 0)), storage } = {}) {
        this.host = host; this.renderPreview = renderPreview;
        this.batchSize = batchSize; this.concurrency = concurrency; this.yieldBatch = yieldBatch;
        this.records = new Map(); this.cache = new Map(); this.dirty = new Set(); this.version = 0;
        this.storage = storage; this.storageTail = Promise.resolve(); this.storageError = ''; this.storageFailed = false;
        this.pendingWrites = new Map();
    }
    cancel() { this.version++; }
    storeOperation(action) {
        const task = this.storageTail.then(async () => {
            if (this.storageFailed) return;
            try {
                if (this.storage === undefined) this.storage = this.host.cacheStore?.() || null;
                if (this.storage) return await action(this.storage);
            } catch (error) {
                this.storageFailed = true;
                this.storageError = `本地缓存暂不可用，仍可在本页浏览。${error?.message || String(error)}`;
            }
        });
        this.storageTail = task.then(() => undefined); return task;
    }
    async flushPersistence() {
        const entries = [];
        for (const [id, cached] of this.pendingWrites) {
            if (this.cache.get(id) !== cached || typeof cached.previewKey !== 'string') continue;
            // Persist original card content and processed text, not duplicated search
            // fields, settings, credentials, chat history or linked-world snapshots.
            entries.push({ id, format: CACHE_FORMAT, card: cached.card, sourceKey: cached.sourceKey,
                stamp: cached.stamp || null, previewKey: cached.previewKey, previewText: cached.previewText });
        }
        this.pendingWrites.clear();
        if (entries.length) await this.storeOperation(store => store.write(entries));
        else await this.storageTail;
    }
    async clearPersistent() {
        this.cancel(); this.cache.clear(); this.pendingWrites.clear(); this.dirty.clear();
        await this.storageTail; this.storageFailed = false; this.storageError = '';
        await this.storeOperation(store => store.clear());
    }
    remove(id) {
        this.cache.delete(id); this.records.delete(id); this.dirty.delete(id); this.pendingWrites.delete(id);
        this.storeOperation(store => store.remove([id]));
    }
    invalidateCard(id) {
        if (!id) {
            for (const key of this.records.keys()) this.dirty.add(key);
            this.cache.clear(); this.pendingWrites.clear(); this.storeOperation(store => store.clear()); return;
        }
        this.cache.delete(id); this.dirty.add(id); this.pendingWrites.delete(id);
        this.storeOperation(store => store.remove([id]));
    }
    invalidateWorld(name) {
        for (const cached of this.cache.values()) {
            if (!name || cached.books?.some(book => book.name === name)) {
                delete cached.booksKey; delete cached.books; delete cached.record;
            }
        }
    }
    seed(card, source = card) {
        this.cache.set(card.avatar, { card: { ...card }, sourceKey: this.sourceKey(source) });
        this.storeOperation(store => store.remove([card.avatar]));
        this.dirty.delete(card.avatar); this.records.set(card.avatar, makeRecord(card));
    }
    sourceKey(card) { const value = cardRevision(card); return this.host.contentKey?.(value) || value; }
    async build(sources, { includeWorld = false, force = false, signal, onProgress = () => {} } = {}) {
        const version = ++this.version, active = () => version === this.version && !signal?.aborted;
        const ids = new Set(sources.map(card => card.avatar));
        // The host can briefly expose an empty list during startup. It is not
        // proof that every saved card was deleted. Explicit delete events still
        // remove their entries, and the next nonempty list prunes missing IDs.
        if (ids.size) { for (const id of new Set([...this.records.keys(), ...this.cache.keys(), ...this.dirty])) if (!ids.has(id)) this.remove(id); }
        else this.records.clear();
        if (force) { this.invalidateCard(); this.records.clear(); }
        // Even full-card hosts should not normalize every long body before the first yield.
        for (const card of sources) if (!this.records.has(card.avatar)) {
            const data = card.data || card;
            this.records.set(card.avatar, makeRecord({ avatar: card.avatar, shallow: true,
                name: data.name || card.name, creator: data.creator, tags: data.tags,
                date_last_chat: card.date_last_chat, create_date: card.create_date }));
        }
        const progress = { total: sources.length, completed: 0, reused: 0, restored: 0, batch: 0, batches: Math.ceil(sources.length / this.batchSize), errors: [] };
        onProgress({ ...progress });
        if (ids.size) await this.storeOperation(store => store.prune([...ids]));
        let previewKey;
        try { previewKey = await this.host.previewRevision(); }
        catch { previewKey = Symbol('retry-preview'); }
        if (!active()) return { ...progress, cancelled: true };
        for (let start = 0; start < sources.length && active(); start += this.batchSize) {
            progress.batch++;
            const batch = sources.slice(start, start + this.batchSize);
            if (!force) {
                const missing = batch.map(card => card.avatar).filter(id => !this.cache.has(id) && !this.dirty.has(id));
                const saved = missing.length ? await this.storeOperation(store => store.read(missing)) : null;
                if (!active()) break;
                for (const id of missing) {
                    const row = saved?.get(id);
                    if (row?.format === CACHE_FORMAT && row.card?.avatar === id && row.card.data && typeof row.sourceKey === 'string' && typeof row.previewKey === 'string' && typeof row.previewText === 'string') {
                        this.cache.set(id, { ...row, fromDisk: true });
                    }
                }
            }
            await mapLimit(batch, this.concurrency, async source => {
                if (!active()) return;
                const id = source.avatar, sourceKey = this.sourceKey(source); let changed = false;
                try {
                    let cached = this.cache.get(id);
                    const shallow = source.shallow || !source.data;
                    let stamp = cached?.stamp || null;
                    if (shallow && this.storage && !this.storageFailed && (!cached || cached.fromDisk || cached.sourceKey !== sourceKey)) {
                        stamp = await this.host.cardStamp?.(source, signal) || null;
                        if (!active()) return;
                    }
                    const diskValid = !cached?.fromDisk || !shallow || (stamp && stamp === cached.stamp);
                    if (!cached || cached.sourceKey !== sourceKey || !diskValid) {
                        const card = force || this.dirty.has(id) || source.shallow || !source.data
                            ? await this.host.getCard(id, signal) : source;
                        if (!active()) return;
                        cached = { card: { ...card }, sourceKey, stamp };
                        this.cache.set(id, cached); this.dirty.delete(id); changed = true;
                    }
                    if (cached.fromDisk) { progress.restored++; delete cached.fromDisk; }
                    // Keep recent-chat sorting current without repeating content requests.
                    for (const key of ['date_last_chat', 'chat_size', 'chat', 'fav']) if (Object.hasOwn(source, key)) cached.card[key] = source[key];
                    if (cached.previewKey !== previewKey) {
                        const opening = await this.host.opening(cached.card);
                        if (!active()) return;
                        cached.previewText = this.renderPreview(opening.processed) || '此开场为前端界面，可打开开场白预览。';
                        cached.previewKey = previewKey; delete cached.record; changed = true;
                    }
                    if (changed) this.pendingWrites.set(id, cached);
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
            await this.flushPersistence();
            if (!active()) break;
            onProgress({ ...progress, batchComplete: true });
            if (start + this.batchSize < sources.length) await this.yieldBatch();
        }
        await this.flushPersistence();
        return { ...progress, cancelled: !active() };
    }
}
