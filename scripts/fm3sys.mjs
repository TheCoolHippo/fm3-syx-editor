// FM3 system (global) settings backup editor. The .syx comes from Fractal-Bot "System + FC" backup.
// Container: fn 0x51 header, 64 x fn 0x52 chunks (2-byte index + 1024 words packed 3 bytes/word), fn 0x53 footer.
// Raw = 65536 words: w0 0x1008, w1 0xAA55, w2 CRC-CCITT(poly 0x1021, init 0xAA55) over bytes 8..8+w3, w3 = data
// length in bytes; GLOBAL catalog param p lives at word 4 + p. Footer = XOR of all raw words (3 x 7-bit).
//   node fm3sys.mjs get <file> <PARAM>...          read globals (catalog names, e.g. IN1_SOURCE)
//   node fm3sys.mjs set <in> <out> <PARAM> <raw>... write globals, fix CRC + footer
//   node fm3sys.mjs setword <in> <out> <word> <raw>...  raw word, for MIDI/Remote tables: Bypass 138 + block id, Channel 394 + block id, External n 1305 + n; 128 = none
//   node fm3sys.mjs diff <a> <b>                     list changed globals
//   node fm3sys.mjs check <file>                     verify CRC + footer
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = (process.env.MCP_MIDI_ROOT || (process.env.LOCALAPPDATA || '').split(String.fromCharCode(92)).join('/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/');
const PARAMS = (await import('file:///' + ROOT + 'fractal-midi/dist/gen3/fm3/index.js')).FM3_PARAMS_BY_FAMILY;

function frames(b) { const fr = []; let s = 0; for (let i = 0; i < b.length; i++) if (b[i] === 0xf7) { fr.push(b.subarray(s, i + 1)); s = i + 1; } return fr; }
function load(file) {
  const b = readFileSync(file); const fr = frames(b);
  if (fr[0][5] !== 0x51 || fr.at(-1)[5] !== 0x53) throw new Error('not an FM3 system backup (fn 0x51..0x53)');
  const chunks = fr.filter(f => f[5] === 0x52);
  const w = new Uint16Array(chunks.length * 1024);
  chunks.forEach((f, k) => { for (let i = 0; i < 1024; i++) { const o = 8 + i * 3; w[k * 1024 + i] = (f[o] | f[o + 1] << 7 | f[o + 2] << 14) & 0xffff; } });
  return { b, fr, w };
}
function crc(w) {
  const bytes = new Uint8Array(w.buffer, w.byteOffset + 8, w[3]); let c = 0xaa55;
  for (const x of bytes) { c ^= x << 8; for (let i = 0; i < 8; i++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
  return c;
}
const xorAll = w => w.reduce((a, x) => a ^ x, 0);
function save(m, out) {
  m.w[2] = crc(m.w);
  const parts = m.fr.map(f => Uint8Array.from(f));
  let k = 0;
  for (const f of parts) {
    if (f[5] === 0x52) { for (let i = 0; i < 1024; i++) { const v = m.w[k * 1024 + i], o = 8 + i * 3; f[o] = v & 0x7f; f[o + 1] = (v >> 7) & 0x7f; f[o + 2] = (v >> 14) & 0x03; } k++; }
    if (f[5] === 0x53) { const x = xorAll(m.w); f[6] = x & 0x7f; f[7] = (x >> 7) & 0x7f; f[8] = (x >> 14) & 0x03; }
    let c = 0; for (let i = 0; i < f.length - 2; i++) c ^= f[i]; f[f.length - 2] = c & 0x7f;
  }
  writeFileSync(out, Buffer.concat(parts.map(p => Buffer.from(p))));
}
const P = name => { const n = name.toUpperCase().replace(/^GLOBAL_/, ''); const p = PARAMS.GLOBAL.find(x => x.name === 'GLOBAL_' + n || (x.displayLabel || '').toUpperCase() === n); if (!p) throw new Error('unknown global ' + name); if (p.paramId > 16000) throw new Error(p.name + ' is a UI action, not stored'); return p; };
const [cmd, ...a] = process.argv.slice(2);
if (cmd === 'check') { const m = load(a[0]); const f = m.fr.at(-1); console.log(`crc ${m.w[2] === crc(m.w) ? 'OK' : 'BAD'}  footer ${(f[6] | f[7] << 7 | f[8] << 14) === xorAll(m.w) ? 'OK' : 'BAD'}  data ${m.w[3]} bytes`); }
else if (cmd === 'get') { const m = load(a[0]); for (const n of a.slice(1)) { const p = P(n); console.log(`${p.name} (${p.displayLabel || ''}) = ${m.w[4 + p.paramId]}`); } }
else if (cmd === 'set') { const m = load(a[0]); for (let i = 2; i < a.length; i += 2) { const p = P(a[i]); console.log(`${p.name}: ${m.w[4 + p.paramId]} -> ${+a[i + 1]}`); m.w[4 + p.paramId] = +a[i + 1]; } save(m, a[1]); console.log('wrote', a[1]); }
else if (cmd === 'setword') { const m = load(a[0]); for (let i = 2; i < a.length; i += 2) { const w = +a[i]; console.log(`word ${w}: ${m.w[w]} -> ${+a[i + 1]}`); m.w[w] = +a[i + 1]; } save(m, a[1]); }
else if (cmd === 'diff') { const A = load(a[0]), B = load(a[1]); for (let i = 4; i < A.w.length; i++) if (A.w[i] !== B.w[i]) { const p = PARAMS.GLOBAL.find(x => x.paramId === i - 4); console.log(`word ${i} ${p ? p.name : '?'}: ${A.w[i]} -> ${B.w[i]}`); } }
else console.log('get <file> <PARAM>... | set <in> <out> <PARAM> <raw>... | diff <a> <b> | check <file>');
