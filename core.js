export const SETTINGS_KEY = 'card_library';
export const EDIT_FIELDS = {
    name: '角色名称', description: '角色描述 / 人设', personality: '性格', scenario: '场景',
    first_mes: '主开场白', mes_example: '对话示例', creator_notes: '作者备注',
};
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export const text = value => typeof value === 'string' ? value : '';
export const unique = values => [...new Set(values.filter(x => typeof x === 'string' && x))];
export const normalizeText = value => text(value).normalize('NFKC').toLocaleLowerCase();
export const metaKey = avatar => `card:${avatar}`;

export function normalizeSettings(input) {
    const source = object(input) ? input : {};
    const ids = new Set();
    const groups = (Array.isArray(source.groups) ? source.groups : []).flatMap(group => {
        if (!object(group) || !text(group.id) || ids.has(group.id) || !text(group.name).trim()) return [];
        ids.add(group.id);
        return [{ ...group, name: group.name.trim().slice(0, 60), members: unique(Array.isArray(group.members) ? group.members : []) }];
    });
    return {
        ...source, schemaVersion: 1, groups,
        favorites: unique(Array.isArray(source.favorites) ? source.favorites : []),
        summaries: object(source.summaries) ? structuredClone(source.summaries) : {},
        theme: ['auto', 'light', 'dark'].includes(source.theme) ? source.theme : 'auto',
        view: source.view === 'list' ? 'list' : 'grid',
        ai: normalizeApiConfig(source.ai),
    };
}

// Credentials live in the host vault; only its opaque ID belongs in settings.
export function normalizeApiConfig(value = {}) {
    return { source: value?.source === 'custom' ? 'custom' : 'current', url: text(value?.url).trim(), model: text(value?.model).trim(), secretId: text(value?.secretId) };
}

export function validateApiConfig(value) {
    const config = normalizeApiConfig(value);
    if (config.source !== 'custom') return config;
    let url;
    try { url = new URL(config.url); } catch { throw new Error('请填写完整的 API 地址，例如 https://example.com/v1。'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API 地址须为 HTTP(S) 地址，不能包含密钥、用户名、查询参数或片段。');
    url.pathname = url.pathname.replace(/\/chat\/completions\/?$/i, '').replace(/\/+$/, '');
    config.url = url.href.replace(/\/$/, '');
    if (!config.model) throw new Error('请填写模型名称。');
    return config;
}

export function exportSettings(settings) {
    const { groups, favorites, summaries, theme, view } = normalizeSettings(settings);
    return { groups, favorites, summaries, theme, view };
}

export function modelNames(response) {
    const rows = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : Array.isArray(response?.data?.data) ? response.data.data : response?.models;
    if (!Array.isArray(rows)) return [];
    return unique(rows.map(row => typeof row === 'string' ? row.trim() : text(row?.id || row?.name).trim())).sort((a, b) => a.localeCompare(b));
}

export function cardData(card) {
    return { ...card, ...(object(card?.data) ? card.data : {}) };
}

export function bookEntries(book) {
    const entries = book?.entries;
    return (Array.isArray(entries) ? entries : object(entries) ? Object.values(entries) : [])
        .filter(object).map((entry, index) => ({
            title: text(entry.comment) || text(entry.name) || `条目 ${index + 1}`,
            keys: unique([...(Array.isArray(entry.keys) ? entry.keys : []), ...(Array.isArray(entry.key) ? entry.key : [])]),
            content: text(entry.content), disabled: entry.enabled === false || entry.disable === true,
        }));
}

export function fieldsOf(card, books = []) {
    const data = cardData(card);
    const fields = Object.entries({ ...EDIT_FIELDS, system_prompt: '系统提示', post_history_instructions: '历史后提示', creator: '作者' })
        .map(([key, label]) => ({ label, text: text(data[key]), kind: key === 'name' ? 'name' : key === 'first_mes' ? 'opening' : 'content' }));
    fields.push({ label: '标签', text: Array.isArray(data.tags) ? data.tags.join(' ') : '', kind: 'content' });
    (Array.isArray(data.alternate_greetings) ? data.alternate_greetings : []).forEach((value, i) => fields.push({ label: `备用开场 ${i + 1}`, text: text(value), kind: 'opening' }));
    for (const book of [{ name: '内嵌世界书', data: data.character_book }, ...books]) {
        for (const entry of bookEntries(book.data)) {
            fields.push({ label: `${book.name} · ${entry.title}`, text: [entry.title, ...entry.keys, entry.content].join('\n'), kind: 'world' });
        }
    }
    return fields.filter(field => field.text).map(field => ({ ...field, folded: normalizeText(field.text) }));
}

export function makeRecord(card, books = []) {
    const data = cardData(card);
    return { id: card.avatar, card, data, name: text(data.name) || card.avatar, books, fields: fieldsOf(card, books) };
}

export function queryTokens(query) {
    return (normalizeText(query).match(/"[^"]+"|\S+/g) || []).map(token => token.replace(/^"|"$/g, '')).filter(Boolean);
}

// Map normalized search matches back to the original graphemes for safe text-node highlighting.
const highlightSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
export function highlightRanges(value, query) {
    const source = text(value), tokens = unique(queryTokens(query));
    if (!source || !tokens.length) return [];
    const starts = [], ends = []; let folded = '', offset = 0;
    const segments = highlightSegmenter ? highlightSegmenter.segment(source) : Array.from(source, segment => ({ segment }));
    for (const { segment } of segments) {
        const part = normalizeText(segment), end = offset + segment.length;
        for (let i = 0; i < part.length; i++) { starts.push(offset); ends.push(end); }
        folded += part; offset = end;
    }
    const ranges = [];
    for (const token of tokens) {
        for (let at = folded.indexOf(token); at !== -1; at = folded.indexOf(token, at + 1)) ranges.push([starts[at], ends[at + token.length - 1]]);
    }
    ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const range of ranges) {
        const last = merged.at(-1);
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push(range);
    }
    return merged;
}

export function searchRecord(record, query, scope = 'all', summary = null) {
    const tokens = queryTokens(query);
    const fields = record.fields.filter(field => scope === 'all' || field.kind === scope);
    if (summary && scope === 'all') fields.push({ label: 'AI 概括', text: `${summary.summary || ''} ${(summary.types || []).join(' ')}`, folded: normalizeText(`${summary.summary || ''} ${(summary.types || []).join(' ')}`) });
    if (!tokens.length) return { label: '开场试读', text: text(record.data.first_mes) || text(record.data.description) || '这张角色卡还没有填写介绍。' };
    if (!tokens.every(token => fields.some(field => field.folded.includes(token)))) return null;
    const field = fields.find(field => field.folded.includes(tokens[0]));
    const position = Math.max(0, field.folded.indexOf(tokens[0]) - 36);
    return { label: field.label, text: `${position ? '…' : ''}${field.text.slice(position, position + 220)}` };
}

export function filterRecords(records, settings, { query = '', group = 'all', scope = 'all', sort = 'name', tag = '' } = {}) {
    const members = settings.groups.find(item => item.id === group)?.members || [];
    const grouped = new Set(settings.groups.flatMap(item => item.members));
    const result = [];
    for (const record of records) {
        if (tag) {
            const types = settings.summaries[metaKey(record.id)]?.types;
            const tags = [...(Array.isArray(record.data.tags) ? record.data.tags : []), ...(Array.isArray(types) ? types : [])];
            if (!tags.some(value => normalizeText(text(value).trim()) === normalizeText(tag.trim()))) continue;
        }
        if (group === 'favorites' && !settings.favorites.includes(record.id)) continue;
        if (group === 'ungrouped' && grouped.has(record.id)) continue;
        if (!['all', 'favorites', 'ungrouped'].includes(group) && !members.includes(record.id)) continue;
        const hit = searchRecord(record, query, scope, settings.summaries[metaKey(record.id)]);
        if (hit) result.push({ record, hit });
    }
    return result.sort((a, b) => {
        if (sort === 'recent') {
            const difference = Number(b.record.card.date_last_chat || 0) - Number(a.record.card.date_last_chat || 0);
            if (difference) return difference;
        }
        if (sort === 'newest') {
            const difference = (Date.parse(b.record.card.create_date) || Number(b.record.card.date_added) || 0) - (Date.parse(a.record.card.create_date) || Number(a.record.card.date_added) || 0);
            if (difference) return difference;
        }
        return a.record.name.localeCompare(b.record.name, 'zh-Hans-CN', { numeric: true });
    });
}

export function editPatch(beforeCard, values, currentCard) {
    const before = cardData(beforeCard), current = cardData(currentCard), changes = {};
    for (const key of Object.keys(EDIT_FIELDS)) {
        if (!Object.hasOwn(values, key) || typeof values[key] !== 'string') continue;
        if (values[key] === text(before[key])) continue;
        if (text(current[key]) !== text(before[key])) throw new Error(`「${EDIT_FIELDS[key]}」已在其他地方修改。请保留草稿，关闭后重新打开编辑。`);
        changes[key] = values[key];
    }
    if (Object.hasOwn(changes, 'name') && (!changes.name.trim() || changes.name.trim() === '.')) throw new Error('角色名称不能为空或只有一个点。');
    return { avatar: beforeCard.avatar, ...changes, data: { ...changes } };
}

export function parseClassification(raw) {
    const clean = text(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let value;
    try { value = JSON.parse(clean); } catch { throw new Error('模型没有返回有效 JSON，请重试。原始回复可在下方查看。'); }
    if (!object(value) || !text(value.summary).trim() || !Array.isArray(value.types)) throw new Error('模型回复缺少 summary 或 types 字段。');
    const types = unique(value.types.map(item => text(item).trim().slice(0, 30))).slice(0, 5);
    if (!types.length) throw new Error('模型没有给出可用的类型。');
    return { summary: value.summary.trim().slice(0, 800), types, createdAt: new Date().toISOString() };
}

export function classificationInput(card, limit = 16000) {
    const data = cardData(card);
    const parts = [
        ['名称', data.name, 500], ['人设', data.description, 6000], ['性格', data.personality, 1500],
        ['场景', data.scenario, 2000], ['开场白', data.first_mes, 3000], ['作者备注', data.creator_notes, 1000],
        ['内嵌世界书', bookEntries(data.character_book).map(entry => `${entry.title}\n${entry.content}`).join('\n'), 2000],
    ];
    const omitted = parts.some(([, value, cap]) => text(value).length > cap);
    const input = parts.map(([label, value, cap]) => `${label}：\n${text(value).slice(0, cap)}`).join('\n\n');
    return { input: input.slice(0, limit), truncated: omitted || input.length > limit };
}

export function importLibrary(raw, current) {
    if (!object(raw) || raw.format !== 'card-library' || raw.version !== 1 || !object(raw.settings)) throw new Error('请选择角色书库导出的 v1 整理数据 JSON。');
    if (!Array.isArray(raw.settings.groups) || raw.settings.groups.length > 1000) throw new Error('分组数据格式无效或过大。');
    const incoming = normalizeSettings(raw.settings), next = normalizeSettings(current);
    for (const group of incoming.groups) {
        // IDs from another library may collide; names are the portable merge key.
        const target = next.groups.find(item => normalizeText(item.name) === normalizeText(group.name));
        if (target) target.members = unique([...target.members, ...group.members]);
        else next.groups.push({ ...group, id: `g-${globalThis.crypto.randomUUID()}` });
    }
    next.favorites = unique([...next.favorites, ...incoming.favorites]);
    for (const [key, value] of Object.entries(incoming.summaries)) {
        if (!key.startsWith('card:') || !object(value)) continue;
        try { next.summaries[key] = parseClassification(JSON.stringify(value)); } catch { /* Ignore invalid optional summaries. */ }
    }
    return next;
}

export function chatMessages(payload) {
    if (!Array.isArray(payload)) throw new Error('聊天记录格式无法识别，或记录已不存在。');
    return payload.filter(message => object(message) && (typeof message.mes === 'string' || typeof message.content === 'string'));
}

export async function mapLimit(items, limit, task, signal) {
    let cursor = 0;
    const results = new Array(items.length);
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length && !signal?.aborted) {
            const index = cursor++;
            try { results[index] = { status: 'fulfilled', value: await task(items[index], index) }; }
            catch (reason) { results[index] = { status: 'rejected', reason }; }
        }
    }));
    return results;
}
