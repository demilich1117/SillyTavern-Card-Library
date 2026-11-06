// Endpoint/session handling adapted from SillyTavern-OpenCode-Go 0.2.0 (MIT).
// Copyright (c) 2026 demilich1117. See THIRD_PARTY_NOTICES.md.
export const OPENCODE_GO_URL = 'https://opencode.ai/inference/go/openai/v1';

export function openCodeEndpoint(raw) {
    let url;
    try { url = new URL(raw); } catch { return null; }
    if (url.protocol !== 'https:' || url.hostname !== 'opencode.ai' || url.port || url.username || url.password || url.search || url.hash) return null;
    const path = url.pathname.replace(/\/+$/, '').replace(/(?:\/chat\/completions)+$/, '');
    const plans = new Map([['/inference/go/openai/v1', 'go'], ['/inference/openai/v1', 'payg'], ['/zen/go/v1', 'go-legacy'], ['/zen/v1', 'payg-legacy']]);
    return plans.has(path) ? { baseUrl: `https://opencode.ai${path}`, plan: plans.get(path) } : null;
}

export function openCodeSession(context, namespace, hash) {
    if (typeof hash !== 'function') throw new Error('宿主缺少 OpenCode 会话摘要组件，请检查酒馆版本。');
    const chat = context.chatId;
    const group = context.groupId;
    const avatar = context.characters?.[context.characterId]?.avatar;
    const identity = chat == null || chat === '' ? 'connection-test' : group != null && group !== '' ? ['group', String(group), String(chat)] : avatar ? ['character', avatar, String(chat)] : 'connection-test';
    return `ses_cl_${hash(JSON.stringify([namespace, identity])).slice(0, 32)}`;
}

export function prepareOpenCodePayload(payload, operation, sessionId) {
    const endpoint = payload?.chat_completion_source === 'custom' && openCodeEndpoint(payload.custom_url);
    if (!endpoint) return payload;
    return {
        ...payload,
        custom_url: operation === 'status' && !endpoint.plan.endsWith('legacy') ? 'https://opencode.ai/inference/v1' : endpoint.baseUrl,
        custom_include_headers: JSON.stringify({ 'x-opencode-session': sessionId, 'User-Agent': 'SillyTavern-Card-Library/0.4.0' }),
    };
}
