// Test-only copy of the running ST's compiled rendering libraries. Never packaged.
import { writeFile, mkdir } from 'node:fs/promises';
const base = new URL(process.argv[2] || 'http://127.0.0.1:8000');
const response = await fetch(new URL('/lib.js', base));
if (!response.ok) throw Error(`Rendering library download failed: ${response.status}`);
await mkdir(new URL('../references/', import.meta.url), { recursive: true });
await writeFile(new URL('../references/st-lib.js', import.meta.url), await response.text());
console.log('Fixture rendering libraries prepared from the specified ST instance.');
