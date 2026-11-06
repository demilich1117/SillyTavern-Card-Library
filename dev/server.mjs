import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtures } from './fixtures.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
let cards = fixtures();
let secrets = [{ id: 'native-secret', active: true, label: '原生连接' }];
const counts = { requests: [], ai: 0 };
const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const send = (value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
    try {
        if (url.pathname.startsWith('/api/')) {
            let raw = ''; for await (const chunk of request) raw += chunk;
            const body = JSON.parse(raw || '{}'); counts.requests.push({ path: url.pathname, body: url.pathname === '/api/secrets/write' ? { ...body, value: '[redacted]' } : body });
            if (url.pathname === '/api/secrets/read') return send({ api_key_custom: secrets });
            if (url.pathname === '/api/secrets/write') { const id = `fixture-secret-${secrets.length}`; secrets.forEach(item => item.active = false); secrets.push({ id, active: true, label: body.label }); return send({ id }); }
            if (url.pathname === '/api/secrets/rotate') { secrets.forEach(item => item.active = item.id === body.id); return send({ ok: true }); }
            if (url.pathname === '/api/backends/chat-completions/status') return send({ data: [{ id: 'fixture-model' }, { id: 'fixture-model-2' }] });
            if (url.pathname === '/api/backends/chat-completions/generate') { counts.ai++; return send({ choices: [{ message: { content: '{"summary":"来自额外 API 的概括。","types":["额外 API"]}' } }] }); }
            const card = cards.find(card => card.avatar === body.avatar_url || card.avatar === body.avatar);
            if (url.pathname === '/api/characters/all') return send(cards);
            if (url.pathname === '/api/characters/get') return card ? send(card) : send({ error: 'not found' }, 404);
            if (url.pathname === '/api/characters/merge-attributes') {
                if (!card) return send({ error: 'not found' }, 404);
                const { data, ...fields } = body; Object.assign(card, fields); Object.assign(card.data, data); return send({ ok: true });
            }
            if (url.pathname === '/api/characters/delete') { cards = cards.filter(item => item.avatar !== body.avatar_url); return send({ ok: true }); }
            if (url.pathname === '/api/characters/chats') return send([{ file_name: '初遇.jsonl', chat_items: 125, mes: '我们会在下一次潮汐到来之前，再见吗？', last_mes: '2026-11-06' }]);
            if (url.pathname === '/api/chats/get') return send([{ user_name: '你', character_name: card?.name, chat_metadata: { fixture: true } }, ...Array.from({ length: 125 }, (_, i) => ({ name: i % 2 ? card?.name : '你', is_user: i % 2 === 0, mes: i === 0 ? '最早的一条消息，暗号是琥珀钥匙。' : `这是第 ${i + 1} 条故事记录。海风穿过街道，书页被轻轻翻动。` }))]);
            if (url.pathname === '/api/worldinfo/get') return send({ entries: { 3: { comment: body.name, key: ['灯塔'], content: '档案记载：紫色鲸鱼曾经出现在近海。', disable: false } } });
            if (url.pathname === '/api/test-state') return send({ cards, counts });
            if (url.pathname === '/api/test-reset') { cards = fixtures(); counts.requests = []; counts.ai = 0; return send({ ok: true }); }
            return send({ error: 'unknown path' }, 404);
        }
        if (url.pathname === '/script.js') {
            response.writeHead(200, { 'Content-Type': 'text/javascript' });
            response.end('export const isGenerating = () => false; export const printCharacters = async () => {}; export const deleteCharacter = (...args) => window.demoDelete(...args);'); return;
        }
        if (url.pathname === '/scripts/world-info.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end('export const world_info = {charLore:[{name:"fixture-1",extraBooks:["雾港补遗"]}]};'); return; }
        if (url.pathname === '/scripts/extensions/regex/engine.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(await readFile(resolve(root, 'dev/regex-fixture.js'))); return; }
        if (url.pathname === '/scripts/secrets.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end('export async function readSecretState() {}'); return; }
        if (url.pathname === '/scripts/utils.js') {
            response.writeHead(200, { 'Content-Type': 'text/javascript' });
            response.end('export function download(content, name, type) { const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }'); return;
        }
        if (url.pathname === '/avatar.svg') {
            response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
            const palettes = [['#647a80','#dce4dc'], ['#5e7156','#d3dabd'], ['#8b6659','#ebc9ad'], ['#706d78','#d9d2d2']]; const colors = palettes[Number(url.searchParams.get('i')) % 4];
            response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" viewBox="0 0 240 300"><rect width="240" height="300" fill="${colors[0]}"/><circle cx="120" cy="110" r="50" fill="${colors[1]}"/><path d="M20 300c5-140 195-140 200 0" fill="${colors[1]}"/><path d="M62 110c-5-110 130-110 116 0l-26-44-59 30z" fill="${colors[0]}" opacity=".7"/></svg>`); return;
        }
        const relative = url.pathname === '/' ? 'dev/index.html' : decodeURIComponent(url.pathname).slice(1);
        const path = resolve(root, relative);
        if (!path.startsWith(root + sep) || relative.startsWith('.') || path.includes(`${sep}.git${sep}`)) return send({}, 403);
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
        response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }); response.end(await readFile(path));
    } catch (error) { if (!response.headersSent) send({ error: error.message }, 500); else response.end(); }
});
const port = Number(process.env.CARD_LIBRARY_PORT || 18787);
server.listen(port, '127.0.0.1', () => console.log(`Card Library fixture harness: http://127.0.0.1:${port}`));
