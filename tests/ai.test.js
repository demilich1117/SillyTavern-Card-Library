import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../host.js';
import { normalizeSettings, validateApiConfig, modelNames, exportSettings, importLibrary, metaKey } from '../core.js';

const card = { avatar: 'a.png', name: '测试角色', data: { name: '测试角色', description: '测试资料' } };
function harness() {
    const requests = [], ctx = { characters: [card], extensionSettings: { card_library: normalizeSettings() }, getRequestHeaders: () => ({}), saveSettingsDebounced: () => saved++, generateRaw: async () => '{"summary":"自动保存的概括","types":["奇幻"]}' };
    let saved = 0, secrets = [{ id: 'original', active: true }], response = '{"summary":"额外 API 的概括","types":["冒险"]}';
    const host = createHost({ getContext: () => ctx, loadModule: async () => ({ isGenerating: () => false, readSecretState: async () => {} }), fetcher: async (path, options) => {
        const body = JSON.parse(options.body); requests.push({ path, body });
        if (path.endsWith('/secrets/read')) return Response.json({ api_key_custom: secrets });
        if (path.endsWith('/secrets/write')) { secrets.forEach(s => s.active = false); secrets.push({ id: 'library', active: true }); return Response.json({ id: 'library' }); }
        if (path.endsWith('/secrets/rotate')) { secrets.forEach(s => s.active = s.id === body.id); return new Response(null, { status: 204 }); }
        if (path.endsWith('/status')) return Response.json({ data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-a' }] });
        if (path.endsWith('/generate')) return Response.json({ choices: [{ message: { content: response } }] });
        throw Error('unexpected request');
    } });
    return { host, ctx, requests, get saved() { return saved; }, secrets, setResponse: value => response = value };
}

test('API config rejects credential-bearing URLs and normalizes full completion addresses', () => {
    for (const url of ['ftp://test', 'https://user:pass@host/v1', 'https://host/v1?key=secret', 'invalid']) assert.throws(() => validateApiConfig({ source: 'custom', url, model: 'model' }));
    assert.equal(validateApiConfig({ source: 'custom', url: 'https://host/v1/chat/completions/', model: ' model ' }).url, 'https://host/v1');
    assert.throws(() => validateApiConfig({ source: 'custom', url: 'https://host', model: '' }), /模型/);
});

test('extra API stores key in host vault, restores native active key and excludes connectivity from exports', async () => {
    const h = harness();
    await h.host.saveApiConfig({ source: 'custom', url: 'https://example.test/v1', model: 'demo' }, { newKey: 'not-a-real-key' });
    assert.equal(h.secrets.find(s => s.active).id, 'original');
    assert.equal(h.host.settings().ai.secretId, 'library');
    assert.ok(!JSON.stringify(h.host.settings()).includes('not-a-real-key'));
    assert.ok(!('ai' in exportSettings(h.host.settings())));
    assert.equal(h.requests.filter(r => r.path.endsWith('/generate')).length, 0);
    const imported = importLibrary({ format: 'card-library', version: 1, settings: { groups: [], ai: { source: 'custom', secretId: 'foreign' } } }, h.host.settings());
    assert.equal(imported.ai.secretId, 'library');
});

test('custom requests use explicit URL, model and secret ID, and successful result autosaves', async () => {
    const h = harness(); await h.host.saveApiConfig({ source: 'custom', url: 'https://example.test/v1', model: 'demo' }, { newKey: 'key' });
    h.ctx.generateRaw = () => { throw Error('must not use native connection'); };
    const { result } = await h.host.classify(card);
    const payload = h.requests.find(r => r.path.endsWith('/generate')).body;
    assert.equal(payload.secret_id, 'library'); assert.equal(payload.custom_url, 'https://example.test/v1'); assert.equal(payload.model, 'demo'); assert.equal(payload.stream, false);
    assert.ok(!JSON.stringify(payload).includes('Bearer'));
    assert.deepEqual(h.host.settings().summaries[metaKey(card.avatar)], result);
});

test('empty key has its own vault identity and never falls back to the native active key', async () => {
    const h = harness(); await h.host.saveApiConfig({ source: 'custom', url: 'http://localhost:5000/v1', model: 'demo' }, { clearKey: true });
    assert.equal(h.requests.find(r => r.path.endsWith('/secrets/write')).body.value, '');
    assert.equal(h.host.settings().ai.secretId, 'library'); assert.equal(h.secrets.find(s => s.active).id, 'original');
});

test('missing selected secret aborts before generation instead of using another key', async () => {
    const h = harness(); h.host.settings().ai = { source: 'custom', url: 'https://example.test/v1', model: 'demo', secretId: 'deleted' };
    await assert.rejects(h.host.classify(card), /已被移除/);
    assert.ok(!h.requests.some(r => r.path.endsWith('/generate')));
});

test('autosave survives UI-independent pending generation and preserves intervening settings changes', async () => {
    const h = harness(); let finish, started;
    const waitForStart = new Promise(resolve => started = resolve);
    h.ctx.generateRaw = () => { started(); return new Promise(resolve => finish = resolve); };
    const pending = h.host.classify(card); await waitForStart;
    h.host.saveSettings({ ...h.host.settings(), favorites: ['b.png'] });
    finish('{"summary":"完成后自动保存","types":["日常"]}');
    await pending;
    assert.equal(h.host.settings().summaries[metaKey(card.avatar)].summary, '完成后自动保存');
    assert.deepEqual(h.host.settings().favorites, ['b.png']); assert.equal(h.saved, 2);
});

test('failed output parsing preserves the previous saved result', async () => {
    const h = harness(); await h.host.classify(card);
    h.ctx.generateRaw = async () => 'not JSON';
    await assert.rejects(h.host.classify(card));
    assert.equal(h.host.settings().summaries[metaKey(card.avatar)].summary, '自动保存的概括');
});

test('autosave does not attach a result to an avatar deleted during a request', async () => {
    const h = harness(); h.ctx.generateRaw = async () => { h.ctx.characters = []; return '{"summary":"late","types":["日常"]}'; };
    await assert.rejects(h.host.classify(card), /已移除/); assert.equal(h.saved, 0);
});

test('pulling models prepares a vault key without activating a half-filled library connection', async () => {
    const h = harness();
    const prepared = await h.host.prepareApiConfig({ source: 'custom', url: 'https://example.test/v1', model: '' }, { newKey: 'dummy' });
    assert.equal(h.host.settings().ai.source, 'current'); assert.equal(h.saved, 0);
    const models = await h.host.apiModels(prepared.config);
    assert.deepEqual(models, ['model-a', 'model-b']);
    const payload = h.requests.find(r => r.path.endsWith('/status')).body;
    assert.equal(payload.secret_id, 'library'); assert.equal(payload.custom_url, 'https://example.test/v1');
    await h.host.saveApiConfig({ ...prepared.config, model: models[0] });
    assert.equal(h.requests.filter(r => r.path.endsWith('/secrets/write')).length, 1);
    assert.equal(h.host.settings().ai.model, 'model-a');
});

test('model catalog normalization accepts ST/TT shapes and ignores invalid entries', () => {
    assert.deepEqual(modelNames({ data: { data: [{ id: 'b' }, {}, { id: 'a' }, { id: 'a' }] } }), ['a', 'b']);
    assert.deepEqual(modelNames({ data: { unknown: true } }), []);
});
