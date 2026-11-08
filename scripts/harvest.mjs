// Build defaults/<eid>.bin: the record the FM3 itself writes for a freshly placed block (true defaults).
// For each batch: place blocks live in free cells of the working buffer, store into the scratch slot,
// pull it, cut each record (from its eid word to the next record), clear the cells.
// Usage: node harvest.mjs <scratchSlot> <restore.syx>   (scratch slot gets overwritten; restore file pushed back at the end)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const ROOT = (process.env.MCP_MIDI_ROOT || (process.env.LOCALAPPDATA || '').replace(/\\/g, '/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/');
const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const g = await import('file:///' + ROOT + 'fractal-midi/dist/gen3/axe-fx-iii/index.js');
const codec = await import('file:///' + ROOT + 'fractal-midi/dist/gen3/axe-fx-iii/setParam.js');
const dump = await import('file:///' + ROOT + '@mcp-midi-control/fractal-gen3/dist/presetDump.js');
const huff = await import('file:///' + ROOT + '@mcp-midi-control/fractal-gen3/dist/presetHuffman.js');
const { SerialPort } = createRequire(ROOT)(ROOT + 'serialport');
const FM3 = 0x11, DIR = HERE, NODE = process.execPath, TMP = process.env.TEMP + '/harvest.syx';
const [slot, restore] = [+process.argv[2], process.argv[3]];
import { PROTECTED, PORT, neighbour } from './local.mjs';
if (PROTECTED.includes(slot)) throw new Error('protected slot ' + slot);
const EIDS = (process.argv[4] ? process.argv[4].split(",").map(Number) : [46, 50, 54, 58, 62, 66, 70, 74, 78, 82, 86, 90, 94, 98, 102, 106, 110, 114, 118, 122, 126, 130, 138, 146, 150, 154, 158, 162, 166, 178, 182, 186, 191]);
const CELLS = [[4, 9], [4, 10], [4, 11], [4, 12], [1, 9], [1, 10], [1, 11], [1, 12]].slice(0, +(process.env.BATCH || 8));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function withPort(fn) { const p = new SerialPort({ path: PORT, baudRate: 115200 }); await new Promise((a, b) => p.on('open', a).on('error', b)); try { await fn(p); } finally { await new Promise(r => p.close(r)); } }
const cellMsg = (p, row, col, eid) => { const c = { row, col, rows: 4 }; p.write(Buffer.from(codec.buildSelectCell(c, FM3))); return sleep(40).then(() => { p.write(Buffer.from(codec.buildSetGridCell({ ...c, blockId: eid }, FM3))); return sleep(250); }); };
function records(body) {
  const u = o => body[o] | body[o + 1] << 8; const out = [];
  let o = -1; for (let x = 0x200; x < body.length - 200; x += 2) if (u(x + 30) === 25 && u(x + 32) === 1 && u(x + 126) === 25 && u(x + 128) === 1) { o = x; break; }
  while (o > 0 && o + 34 < body.length && u(o + 30) && u(o + 32)) { const n = (23 + u(o + 30) * u(o + 32)) * 2; out.push({ eid: u(o - 12), start: o - 12, end: o - 12 + n }); o += n; }
  return out;
}
await withPort(async p => { p.write(Buffer.from(g.buildSwitchPresetSysEx(slot, FM3))); await sleep(1200); });
const todo = EIDS.filter(e => !existsSync(`${DIR}defaults/${e}.bin`));
for (let i = 0; i < todo.length; i += CELLS.length) {
  const batch = todo.slice(i, i + CELLS.length);
  await withPort(async p => {
    for (let k = 0; k < batch.length; k++) await cellMsg(p, ...CELLS[k], batch[k]);
    p.write(Buffer.from(g.buildStorePreset(slot, FM3))); await sleep(1500);
  });
  execFileSync(NODE, [DIR + 'fm3syx.mjs', 'pull', String(slot), TMP]);
  const body = huff.decodeRawPatch(dump.parsePresetDump(new Uint8Array(readFileSync(TMP))).chunkPayloads).body;
  for (const e of batch) { const r = records(body).find(x => x.eid === e);
    if (r) { writeFileSync(`${DIR}defaults/${e}.bin`, body.slice(r.start, r.end)); console.log('eid', e, (r.end - r.start), 'bytes'); } else console.log('eid', e, 'NOT FOUND (refused?)'); }
  await withPort(async p => { for (let k = 0; k < batch.length; k++) await cellMsg(p, ...CELLS[k], 0); });
}
if (restore) { execFileSync(NODE, [DIR + 'fm3syx.mjs', 'push', restore, '--yes']); await sleep(500);
  await withPort(async p => { p.write(Buffer.from(g.buildSwitchPresetSysEx(neighbour(slot), FM3))); await sleep(800); p.write(Buffer.from(g.buildSwitchPresetSysEx(slot, FM3))); await sleep(800); }); }
console.log('done');
