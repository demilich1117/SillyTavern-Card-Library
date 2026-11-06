import { normalizeSettings } from '../core.js';
import libs from '../references/st-lib.js';
const listeners = new Map();
const emit = async (event, ...args) => { for (const handler of listeners.get(event) || []) await handler(...args); };
const post = async (path, body = {}) => { const response = await fetch(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }); return response.json(); };
const fullCards = await post('/api/characters/all');
const cards = fullCards.map(card => ({ avatar: card.avatar, name: card.name, shallow: true, date_last_chat: card.date_last_chat }));
let saved; try { saved = JSON.parse(localStorage.getItem('cl-demo-settings')); } catch {}
const context = {
    characters: cards, characterId: undefined, chat: [], extensionSettings: { card_library: normalizeSettings(saved || { groups: [{ id: 'g-fiction', name: '悬疑与秘密', members: ['fixture-1.png', 'fixture-3.png'] }, { id: 'g-daily', name: '慢慢生活', members: ['fixture-2.png', 'fixture-6.png'] }, { id: 'g-adventure', name: '准备出发', members: ['fixture-4.png', 'fixture-5.png'] }], favorites: ['fixture-1.png', 'fixture-2.png'], theme: 'light' }) },
    saveSettingsDebounced: () => localStorage.setItem('cl-demo-settings', JSON.stringify(context.extensionSettings.card_library)),
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
    getThumbnailUrl: (_, avatar) => `/avatar.svg?i=${Number(avatar.match(/\d+/)?.[0] || 0)}`,
    getOneCharacter: async avatar => { const value = await post('/api/characters/get', { avatar_url: avatar }); const index = cards.findIndex(card => card.avatar === avatar); if (index >= 0) cards[index] = value; },
    selectCharacterById: async id => { context.characterId = id; },
    eventTypes: Object.fromEntries(['CHARACTER_EDITED', 'CHARACTER_DELETED', 'CHARACTER_DUPLICATED', 'CHARACTER_RENAMED', 'CHARACTER_PAGE_LOADED', 'WORLDINFO_UPDATED'].map(key => [key, key])),
    eventSource: { on: (event, handler) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(handler); }, removeListener: (event, handler) => listeners.get(event)?.delete(handler), emit },
    generateRaw: async () => { await new Promise(resolve => setTimeout(resolve, 700)); return JSON.stringify({ summary: '一段围绕旧书店、匿名信件与失踪档案展开的慢热悬疑故事。适合喜欢探索线索、逐步建立信任关系的玩家。', types: ['悬疑', '慢热', '城市探索'] }); },
};
window.demoDelete = async (ids, { deleteChats }) => {
    for (const id of ids) await post('/api/characters/delete', { avatar_url: id, delete_chats: deleteChats });
    const all = await post('/api/characters/all'); cards.splice(0, cards.length, ...all); await emit('CHARACTER_DELETED'); return true;
};
context.name1 = '测试读者';
context.extensionSettings.character_allowed_regex = ['fixture-1.png'];
window.SillyTavern = { getContext: () => context, libs };
if (new URLSearchParams(location.search).has('tt')) window.__TAURITAVERN__ = { ready: Promise.resolve(), api: {} };
window.toastr = { error: (...args) => console.error(...args) };
await import('../index.js');
