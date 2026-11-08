// FM3 footswitch layouts inside a system backup (.syx from pullsystem.mjs / Fractal-Bot). Work in progress.
// The system bank holds two copies (words 0.. and 32768..), each: w0 0x1008, w1 0xAA55, w2 CRC-CCITT(init 0xAA55)
// over bytes 8..8+w3, w3 = data length. The FM3 writes the older copy and bumps the counter at copy+14874;
// edits go to both copies so either one is valid.
// Switch index i = layout*12 + view*3 + switch (all 0-based; layout 8 = Master Layout). Offsets inside a copy:
//   1370 + 32*L      layout name (one char per word)
//   Tap:  category 1658+i, function 1766+i, label mode 1874+i, params 1982+6i, custom text 3623+11i
//   Hold: category 2630+i, function 2738+i, label mode 2846+i, params 2954+6i, custom text 4811+11i (verified 2026-11-08)
//   colour 6000+i (0 default, 1 red ...)
// Params word 0 = preset / scene / block / layout number (1-based except blocks); Effect: [block, channel 0-3];
// Hold View or Bank Inc/Dec: [step (65535 = -1), wrap, lower, upper]. Function codes = FM3-Edit menu order.
// Categories: 0 Unassigned, 1 Bank, 2 Preset, 3 Scene, 4 Effect, 5 Utility, 6 Layout, 7 Control Switch, 8 Looper,
// 9 Per-Preset, 10 View, 11 Setlist, 12 Song, 13 Song Section.
//   node fm3fc.mjs show <file> [layout 1-9]
//   node fm3fc.mjs set <in> <out> <layout 1-9> <view 1-4> <switch 1-3> key=value ...   keys: tap tapfunc label param text hold holdfunc holdlabel holdparam holdtext color (param=Wah 1 accepted)
import { readFileSync, writeFileSync } from 'node:fs';
import { CAT, FUNC, BLOCK } from './fcmap.mjs';
import { pathToFileURL } from 'node:url';

export const COPY = [0, 32768];
const STANDIN = ['FM3 SW1 Tip', 'FM3 SW1 Ring', 'FM3 SW2 Tip', 'FM3 SW2 Ring', 'FC1 SW1', 'FC1 SW2', 'FC1 SW3', 'FC1 SW4', 'FC2 SW1', 'FC2 SW2', 'FC2 SW3', 'FC2 SW4'];
const FIELD = { tap: i => 1658 + i, tapfunc: i => 1766 + i, label: i => 1874 + i, param: i => 1982 + 6 * i,
  hold: i => 2630 + i, holdfunc: i => 2738 + i, holdlabel: i => 2846 + i, holdparam: i => 2954 + 6 * i, color: i => 6000 + i };
const TEXT = { text: i => 3623 + 11 * i, holdtext: i => 4811 + 11 * i };

export function frames(b) { const fr = []; let s = 0; for (let i = 0; i < b.length; i++) if (b[i] === 0xf7) { fr.push(b.subarray(s, i + 1)); s = i + 1; } return fr; }
export function load(file) {
  const b = readFileSync(file); const fr = frames(b);
  if (fr[0][5] !== 0x51 || fr.at(-1)[5] !== 0x53) throw new Error('not an FM3 system backup');
  const ch = fr.filter(f => f[5] === 0x52); const w = new Uint16Array(ch.length * 1024);
  ch.forEach((f, k) => { for (let i = 0; i < 1024; i++) { const o = 8 + i * 3; w[k * 1024 + i] = (f[o] | f[o + 1] << 7 | f[o + 2] << 14) & 0xffff; } });
  return { fr, w };
}
export function crc(w, base) {
  const bytes = new Uint8Array(w.buffer, w.byteOffset + (base + 4) * 2, w[base + 3]); let c = 0xaa55;
  for (const x of bytes) { c ^= x << 8; for (let i = 0; i < 8; i++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
  return c;
}
export function save(m, out) {
  for (const base of COPY) m.w[base + 2] = crc(m.w, base);
  const parts = m.fr.map(f => Uint8Array.from(f)); let k = 0;
  for (const f of parts) {
    if (f[5] === 0x52) { for (let i = 0; i < 1024; i++) { const v = m.w[k * 1024 + i], o = 8 + i * 3; f[o] = v & 0x7f; f[o + 1] = (v >> 7) & 0x7f; f[o + 2] = (v >> 14) & 3; } k++; }
    if (f[5] === 0x53) { const x = m.w.reduce((a, v) => a ^ v, 0); f[6] = x & 0x7f; f[7] = (x >> 7) & 0x7f; f[8] = (x >> 14) & 3; }
    let c = 0; for (let i = 0; i < f.length - 2; i++) c ^= f[i]; f[f.length - 2] = c & 0x7f;
  }
  writeFileSync(out, Buffer.concat(parts.map(p => Buffer.from(p))));
}
export const newest = w => (w[32768 + 14874] > w[14874] ? 32768 : 0);
const name = (w, b, L) => String.fromCharCode(...[...w.slice(b + 1370 + 32 * L, b + 1370 + 32 * L + 16)].filter(c => c >= 32 && c < 127));

const [cmd, ...a] = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href ? process.argv.slice(2) : ['lib'];
if (cmd === 'lib') {} else if (cmd === 'show') {
  const { w } = load(a[0]); const b = newest(w);
  console.log(`newest copy at ${b} (counters ${w[14874]} / ${w[32768 + 14874]}), crc ${[0, 32768].map(x => w[x + 2] === crc(w, x) ? 'OK' : 'BAD').join(' ')}`);
  for (let L = 0; L < 9; L++) {
    if (a[1] && +a[1] !== L + 1) continue;
    console.log(`Layout ${L + 1} ${name(w, b, L)}`);
    for (let v = 0; v < 4; v++) for (let s = 0; s < 3; s++) {
      const i = L * 12 + v * 3 + s, g = f => w[b + FIELD[f](i)];
      if (!g('tap') && !g('hold')) continue;
      const ps = f => [...w.slice(b + FIELD[f](i), b + FIELD[f](i) + 6)].join(',');
      const fn = (c, f) => (FUNC[CAT[c]] || [])[f] ?? f;
      const txt = f => String.fromCharCode(...[...w.slice(b + TEXT[f](i), b + TEXT[f](i) + 10)].filter(c => c >= 32 && c < 127));
      const blk = g('tap') === 4 ? ` [${BLOCK[w[b + FIELD.param(i)]]}]` : '';
      console.log(`  V${v + 1} S${s + 1}: tap ${CAT[g('tap')] ?? g('tap')}/${fn(g('tap'), g('tapfunc'))} p=${ps('param')}${blk} label ${g('label')}${txt('text') ? ' "' + txt('text') + '"' : ''} | hold ${CAT[g('hold')] ?? g('hold')}/${fn(g('hold'), g('holdfunc'))} p=${ps('holdparam')} | color ${g('color')}`);
    }
  }
  if (!a[1]) {
    // Stand-In switches: layout 7394+r, switch 7406+r (0-based, 65535 none; live value -1). Ring colours per category 6108+c.
    STANDIN.forEach((n, r) => { const L = w[b + 7394 + r], S = w[b + 7406 + r]; if (L !== 65535) console.log(`Stand-In ${n}: Layout ${L + 1} switch ${S + 1}`); });
    console.log('Ring colours: ' + CAT.map((c, k) => `${c} ${w[b + 6108 + k]}`).join(', '));
  }
} else if (cmd === 'set') {
  const [inp, out, L, V, S, ...kv] = a; const m = load(inp); const i = (L - 1) * 12 + (V - 1) * 3 + (S - 1);
  for (const p of kv) {
    const [k, v] = p.split('=');
    if (TEXT[k]) { for (const base of COPY) for (let c = 0; c < 11; c++) m.w[base + TEXT[k](i) + c] = c < 10 && c < v.length ? v.charCodeAt(c) : 0; console.log(`${k} = "${v.slice(0, 10)}"`); continue; }
    if (!FIELD[k]) throw new Error('unknown key ' + k);
    const val = !isNaN(+v) ? +v : (k === 'param' ? BLOCK : CAT).findIndex(c => c.toLowerCase() === v.toLowerCase()); if (val < 0) throw new Error('bad value ' + v);
    for (const base of COPY) { const at = base + FIELD[k](i); console.log(`word ${at}: ${m.w[at]} -> ${val}`); m.w[at] = val; }
  }
  save(m, out); console.log('wrote', out);
} else console.log('usage: show <file> [layout] | set <in> <out> <layout> <view> <switch> key=value ...');
