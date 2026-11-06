// Workspace integration check against the user's unchanged MIT-licensed helper.
import assert from 'node:assert/strict';
import { installTransport } from '../../SillyTavern-OpenCode-Go/transport.js';
import { prepareOpenCodePayload, OPENCODE_GO_URL } from '../opencode.js';
const received = [];
const target = { fetch: async (path, init) => { received.push({ path, body: JSON.parse(init.body) }); return Response.json({ ok: true }); } };
const dispose = installTransport(target, { origin: 'http://localhost', snapshot: () => ({ enabled: true, sessionId: 'ses_st_existing', parseYaml: JSON.parse }) });
const initial = { chat_completion_source: 'custom', custom_url: OPENCODE_GO_URL, secret_id: 'library-secret', model: 'fixture' };
for (const operation of ['status', 'generate']) await target.fetch(`/api/backends/chat-completions/${operation}`, { method: 'POST', body: JSON.stringify(prepareOpenCodePayload(initial, operation, 'ses_cl_library')) });
assert.equal(received[0].body.custom_url, 'https://opencode.ai/inference/v1');
assert.equal(received[1].body.custom_url, OPENCODE_GO_URL);
assert.equal(received[1].body.secret_id, 'library-secret');
assert.equal(Object.keys(JSON.parse(received[1].body.custom_include_headers)).filter(key => key.toLowerCase() === 'x-opencode-session').length, 1);
assert.equal(initial.custom_include_headers, undefined);
dispose();
console.log('OpenCode Go 0.2.0 coexistence: catalog, billing path, credential ID and unique headers passed.');
