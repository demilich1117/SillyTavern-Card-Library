// IndexedDB is local to this browser / WebView and origin. Each host settings
// profile has its own opaque namespace; card data never enters settings exports.
export class LocalCardCache {
    constructor(namespace, { indexedDB = globalThis.indexedDB } = {}) {
        this.indexedDB = indexedDB;
        this.name = `card-library-cache-${namespace}`;
        this.connection = null;
    }
    open() {
        if (this.connection) return this.connection;
        this.connection = new Promise((resolve, reject) => {
            if (!this.indexedDB) { reject(new Error('当前环境无法使用本地数据库')); return; }
            let settled = false;
            const request = this.indexedDB.open(this.name, 1);
            const fail = error => { if (settled) return; settled = true; clearTimeout(timer); reject(error); };
            const timer = setTimeout(() => fail(new Error('打开本地缓存超时')), 5000);
            request.onupgradeneeded = () => request.result.createObjectStore('cards', { keyPath: 'id' });
            request.onblocked = () => fail(new Error('本地缓存被其他页面占用，请关闭旧页面后重试'));
            request.onerror = () => fail(request.error || new Error('无法打开本地缓存'));
            request.onsuccess = () => {
                const db = request.result;
                if (settled) { db.close(); return; }
                settled = true; clearTimeout(timer);
                db.onversionchange = () => { db.close(); this.connection = null; };
                resolve(db);
            };
        }).catch(error => { this.connection = null; throw error; });
        return this.connection;
    }
    async transaction(mode, action) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('cards', mode), store = transaction.objectStore('cards');
            let value;
            const timer = setTimeout(() => { try { transaction.abort(); } catch {} reject(new Error('本地缓存操作超时')); }, 10000);
            transaction.oncomplete = () => { clearTimeout(timer); resolve(value); };
            transaction.onabort = transaction.onerror = () => { clearTimeout(timer); reject(transaction.error || new Error('本地缓存操作失败')); };
            try { action(store, result => { value = result; }); }
            catch (error) { clearTimeout(timer); try { transaction.abort(); } catch {} reject(error); }
        });
    }
    read(ids) {
        return this.transaction('readonly', (store, done) => {
            const result = new Map(); done(result);
            for (const id of ids) { const request = store.get(id); request.onsuccess = () => { if (request.result) result.set(id, request.result); }; }
        });
    }
    write(entries) { return this.transaction('readwrite', store => { for (const entry of entries) store.put(entry); }); }
    remove(ids) { return this.transaction('readwrite', store => { for (const id of ids) store.delete(id); }); }
    clear() { return this.transaction('readwrite', store => store.clear()); }
    prune(ids) {
        const keep = new Set(ids);
        return this.transaction('readwrite', store => {
            const request = store.openKeyCursor();
            request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (!keep.has(cursor.key)) store.delete(cursor.key); cursor.continue(); };
        });
    }
}
