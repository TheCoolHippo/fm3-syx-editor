// FM3 Performance pages (10 controls each), decoded 2026-11-08.
// Both pages share one layout (k = slot 0-9, row 1 = 0-4, row 2 = 5-9), offsets from the page base:
//   enabled flag 0+k (FM3-Edit writes 0, then the control, then 1), block effect id 10+k (Amp 1 = 58, Reverb 1 = 66 ...),
//   parameter id 20+k (same ids as the block's parameters), label line 1 30+16k, line 2 190+16k (one char per word, 0-terminated)
// Global page: system bank, base word 8299; live = block 1, pid = word - 4. Per-preset page: preset record eid 200+1 = 201,
// base = record data start (see fm3syx.mjs perf); live = block 201, pid = offset (edit buffer: save the preset to keep it).
//   node fm3perf.mjs show <sys.syx>                    global page
//   node fm3perf.mjs set <in.syx> <out.syx> <op> ...    global page in a system file (both copies, CRCs fixed)
//   node fm3perf.mjs live global|pp <op> ...          change the running FM3
// ops: slot <1-10> <block: Amp 1 | Reverb 2 | effect id> <param id> [LINE1] [LINE2] | clear <1-10>
import { load, save, newest, COPY } from './fm3fc.mjs';

export const EFFECT_ID = { Input: 37, Output: 42, Comp: 46, GEQ: 50, PEQ: 54, Amp: 58, Cab: 62, Reverb: 66, Delay: 70,
  MultiTap: 74, Chorus: 78, Flanger: 82, Rotary: 86, Phaser: 90, Wah: 94, Formant: 98, 'Vol/Pan': 102, Tremolo: 106,
  Pitch: 110, Filter: 114, Drive: 118, Enhancer: 122, Mixer: 126, Synth: 130, Megatap: 138, Gate: 146, RingMod: 150,
  MultiComp: 154, TenTap: 158, Resonator: 162, Looper: 166, Plex: 178, Send: 182, Return: 186, Multiplexer: 191, MIDI: 190 };
export const GLOBAL_BASE = 8299;
export const blockName = e => { const k = Object.keys(EFFECT_ID).filter(x => e >= EFFECT_ID[x] && e < EFFECT_ID[x] + 4).pop(); return k ? `${k} ${e - EFFECT_ID[k] + 1}` : e ? `eid ${e}` : '-'; };
const eidOf = s => { if (!isNaN(+s)) return +s; const m = s.match(/^(.+?)\s*(\d)?$/); const k = Object.keys(EFFECT_ID).find(x => x.toLowerCase() === m[1].toLowerCase()); if (!k) throw new Error('unknown block ' + s); return EFFECT_ID[k] + (+(m[2] || 1)) - 1; };
const label = (o, t, full) => { const r = []; for (let c = 0; c < (full ? 16 : Math.min(t.length + 1, 16)); c++) r.push([o + c, c < t.length && c < 15 ? t.charCodeAt(c) : 0]); return r; };

// [[offset, value], ...] relative to the page base, in FM3-Edit's order. full = pad labels to 16 words (files).
export function perfOps(a, full = false) {
  const [op, n, ...r] = a, k = n - 1; if (!(k >= 0 && k < 10)) throw new Error('slot 1-10');
  if (op === 'clear') return [[k, 0], [10 + k, 0], [20 + k, 0], ...label(30 + 16 * k, '', true), ...label(190 + 16 * k, '', true)];
  if (op !== 'slot') throw new Error('unknown op ' + op);
  // "Amp 1" may come as two words: join a trailing instance number
  let [blk, pid, l1 = '', l2 = ''] = /^\d$/.test(r[1]) && isNaN(+r[0]) ? [r[0] + ' ' + r[1], ...r.slice(2)] : r;
  return [[k, 0], [10 + k, eidOf(blk)], [20 + k, +pid], ...label(30 + 16 * k, l1, full), ...label(190 + 16 * k, l2, full), [k, 1]];
}
export function perfShow(get) {
  const txt = o => { let s = ''; for (let c = 0; c < 16 && get(o + c); c++) s += String.fromCharCode(get(o + c)); return s; };
  for (let k = 0; k < 10; k++) console.log(`${k + 1}: ${get(k) ? 'on ' : 'off'} (${get(k)}) ${blockName(get(10 + k))} param ${get(20 + k)} "${txt(30 + 16 * k)}" "${txt(190 + 16 * k)}"`);
}

const [cmd, ...a] = process.argv[1] && import.meta.url === new URL('file:///' + process.argv[1].replace(/\\/g, '/')).href ? process.argv.slice(2) : ['lib'];
if (cmd === 'lib') {} else if (cmd === 'show') { const { w } = load(a[0]); const b = newest(w); perfShow(o => w[b + GLOBAL_BASE + o]); }
else if (cmd === 'set') {
  const [inp, outF, ...r] = a; const m = load(inp);
  for (const [o, v] of perfOps(r, true)) for (const base of COPY) m.w[base + GLOBAL_BASE + o] = v;
  save(m, outF); console.log('wrote', outF);
} else if (cmd === 'live') {
  const { send } = await import('./fcset.mjs'); const [page, ...r] = a;
  if (page === 'global') await send(perfOps(r).map(([o, v]) => [GLOBAL_BASE + o - 4, v]), 1);
  else if (page === 'pp') await send(perfOps(r), 201);
  else throw new Error('page: global or pp');
} else console.log('usage: show <sys.syx> | set <in> <out> <op> | live global|pp <op>   (see header)');
