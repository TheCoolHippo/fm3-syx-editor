// Reads the FM3 System + FC backup without FM3-Edit or Fractal-Bot, byte format of a Fractal-Bot .syx.
// The request (function 0x43) is the one Fractal-Bot sends, captured with USBPcap on 2026-11-06.
// Read-only. FM3-Edit must be closed (it holds COM7).
// Usage: node pullsystem.mjs <out.syx> [port]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const ROOT = process.env.LOCALAPPDATA.split(String.fromCharCode(92)).join('/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/';
const { SerialPort } = createRequire(ROOT)(ROOT + 'serialport');

const [out, path = process.env.FM3_PORT || 'COM7'] = process.argv.slice(2);
if (!out) { console.error('usage: pullsystem.mjs <out.syx> [port]'); process.exit(2); }

const HEAD = [0xf0, 0x00, 0x01, 0x74, 0x11];
const REQUEST = Buffer.from([...HEAD, 0x43, 0x57, 0xf7]);
const BLOCKS = 64, BLOCK_LEN = 3082, MARK_LEN = 11;
const TOTAL = MARK_LEN + BLOCKS * BLOCK_LEN + MARK_LEN;

const port = new SerialPort({ path, baudRate: 115200 });
await new Promise((ok, fail) => port.on('open', ok).on('error', fail));

const chunks = []; let size = 0, end = -1, timer;
const done = new Promise((ok, fail) => {
  timer = setTimeout(() => fail(new Error(`timeout after ${size} bytes`)), 8000);
  port.on('data', d => {
    chunks.push(d); size += d.length;
    const all = Buffer.concat(chunks);
    const i = all.indexOf(Buffer.from([...HEAD, 0x53]));
    if (i >= 0 && all.length >= i + MARK_LEN) { end = i + MARK_LEN; ok(all); }
  });
});
port.write(REQUEST);
let all;
try { all = await done; } finally { clearTimeout(timer); port.close(); }

// Other traffic may be mixed in on the port: keep only the 0x51 / 0x52 / 0x53 messages.
const parts = []; let n = 0, bad = 0;
for (let i = all.indexOf(0xf0); i >= 0 && i < end; i = all.indexOf(0xf0, i + 1)) {
  const stop = all.indexOf(0xf7, i); if (stop < 0) break;
  const m = all.subarray(i, stop + 1); const fn = m[5];
  if (m.subarray(0, 5).equals(Buffer.from(HEAD)) && fn >= 0x51 && fn <= 0x53) {
    let x = 0; for (let k = 0; k < m.length - 2; k++) x ^= m[k];
    if ((x & 0x7f) !== m[m.length - 2]) bad++;
    parts.push(m); if (fn === 0x52) n++;
  }
  i = stop;
}
const file = Buffer.concat(parts);
if (bad || n !== BLOCKS || file.length !== TOTAL) {
  console.error(`incomplete: ${n}/${BLOCKS} blocks, ${file.length}/${TOTAL} bytes, ${bad} bad checksums. Nothing written.`);
  process.exit(1);
}
writeFileSync(out, file);
console.log(`saved ${out}: ${file.length} bytes, ${n} blocks, checksums ok`);
