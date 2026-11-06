import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openCodeEndpoint, openCodeSession, prepareOpenCodePayload, OPENCODE_GO_URL } from '../opencode.js';
import { createHost } from '../host.js';
import { normalizeSettings } from '../core.js';

const sha256 = value => createHash('sha256').update(value).digest('hex');
test('OpenCode recognition is restricted to official endpoints and preserves billing path', () => {
    for (const url of ['https://opencode.ai.evil.test/inference/go/openai/v1', 'http://opencode.ai/inference/go/openai/v1', 'https://opencode.ai/inference/go/openai/v1?key=x', 'https://user@opencode.ai/inference/go/openai/v1', 'https://opencode.ai/inference/go/anthropic/v1']) assert.equal(openCodeEndpoint(url), null);
    assert.equal(openCodeEndpoint(`${OPENCODE_GO_URL}/chat/completions/chat/completions/`).baseUrl, OPENCODE_GO_URL);
    const input = { chat_completion_source: 'custom', custom_url: OPENCODE_GO_URL, secret_id: 'own-key', model: 'model' };
    const generated = prepareOpenCodePayload(input, 'generate', 'ses_test');
    assert.equal(generated.custom_url, OPENCODE_GO_URL); assert.equal(generated.secret_id, 'own-key'); assert.equal(input.custom_include_headers, undefined);
    assert.equal(prepareOpenCodePayload(input, 'status', 'ses_test').custom_url, 'https://opencode.ai/inference/v1');
    const payg = { ...input, custom_url: 'https://opencode.ai/inference/openai/v1' };
    assert.equal(prepareOpenCodePayload(payg, 'generate', 'ses_test').custom_url, payg.custom_url);
    assert.equal(prepareOpenCodePayload({ ...input, custom_url: 'https://opencode.ai/zen/go/v1' }, 'status', 'ses_test').custom_url, 'https://opencode.ai/zen/go/v1');
});

test('OpenCode session is stable for a chat and contains no raw identities', () => {
    const ctx = { characters: [{ avatar: 'private-character.png' }], characterId: 0, chatId: 'private-chat' };
    const id = openCodeSession(ctx, 'namespace', sha256);
    assert.equal(id, openCodeSession(ctx, 'namespace', sha256)); assert.match(id, /^ses_cl_[a-f0-9]{32}$/);
    assert.notEqual(id, openCodeSession({ ...ctx, chatId: 'another' }, 'namespace', sha256));
    assert.notEqual(id, openCodeSession({ ...ctx, groupId: 'group' }, 'namespace', sha256));
    assert.notEqual(id, openCodeSession(ctx, 'other-namespace', sha256));
});

test('extra API model and generation requests work without external Go plugin and use the same stable header', async () => {
    const requests = [], card = { avatar: 'card.png', data: { name: '测试', description: 'test' } };
    const ctx = { characters: [card], characterId: 0, chatId: 'chat', extensionSettings: { card_library: normalizeSettings({ ai: { source: 'custom', url: OPENCODE_GO_URL, model: 'test-model', secretId: 'own-key' } }) }, getRequestHeaders: () => ({}), saveSettingsDebounced() {} };
    const host = createHost({ getContext: () => ctx, getLibs: () => ({ sha256 }), loadModule: async () => ({ isGenerating: () => false }), fetcher: async (path, options) => {
        const body = JSON.parse(options.body); requests.push({ path, body });
        if (path.endsWith('/read')) return Response.json({ api_key_custom: [{ id: 'own-key' }] });
        if (path.endsWith('/status')) return Response.json({ data: [{ id: 'test-model' }] });
        return Response.json({ choices: [{ message: { content: '{"summary":"saved","types":["测试"]}' } }] });
    } });
    await host.apiModels(host.settings().ai); await host.classify(card);
    const status = requests.find(r => r.path.endsWith('/status')).body, generate = requests.find(r => r.path.endsWith('/generate')).body;
    assert.equal(status.custom_url, 'https://opencode.ai/inference/v1'); assert.equal(generate.custom_url, OPENCODE_GO_URL);
    const headers = JSON.parse(generate.custom_include_headers);
    assert.equal(headers['x-opencode-session'], JSON.parse(status.custom_include_headers)['x-opencode-session']);
    assert.equal(headers['User-Agent'], 'SillyTavern-Card-Library/0.5.0');
    assert.equal(generate.secret_id, 'own-key'); assert.equal(ctx.extensionSettings.card_library.summaries['card:card.png'].summary, 'saved');
});
