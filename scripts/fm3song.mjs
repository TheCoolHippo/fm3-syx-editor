// FM3 Setlists / Songs / Sections, in a system backup (pullsystem.mjs) or live (same SETs FM3-Edit sends: block 1, pid = word - 4).
// Offsets inside a system copy (s = song 0-127, k = section 0-5, L = setlist 0-3, n = slot 0-31), decoded 2026-11-08:
//   song name 8694 + 5s, section name 9334 + 5(6s+k)  (10 chars, 2 per word, low byte first, 0-padded)
//   section preset 13174 + 6s+k (preset + 1, 0 = None), section scene 13943 + 6s+k (1-8, 0 = Default)
//   setlist slots 14712 + 32L + n (song number 1-128, 0 = empty; empty slots only at the end), setlist name 14841 + 5L
// Strides past song 1 / section 1 / slot 2 follow the manual's sizes (128 songs x 6 sections, 4 setlists x 32) and the default names.
//   node fm3song.mjs show <sys.syx> [all]                  setlists + songs that differ from the defaults (all: every song)
//   node fm3song.mjs set <in> <out> <op> ...               edit a file (both copies, CRCs fixed); load with sendsys + power cycle
//   node fm3song.mjs live <op> ...                         change the running FM3 now (it saves Setup changes itself)
// ops: song <1-128> <NAME> | sect <song> <1-6> [name=X] [preset=N|none] [scene=1-8|default] | setname <1-4> <NAME>
//      | slots <set 1-4> <song> <song> ...  (fills slots from 1, clears the rest)
import { load, save, newest, COPY } from './fm3fc.mjs';

const SONG = s => 8694 + 5 * s, SECT = (s, k) => 9334 + 5 * (6 * s + k), PRE = (s, k) => 13174 + 6 * s + k,
  SCN = (s, k) => 13943 + 6 * s + k, SLOT = (L, n) => 14712 + 32 * L + n, SETN = L => 14841 + 5 * L;
const text = (w, o) => { let r = ''; for (let i = 0; i < 5; i++) for (const c of [w[o + i] & 255, w[o + i] >> 8]) if (c) r += String.fromCharCode(c); return r; };
const pack = (o, t) => Array.from({ length: 5 }, (_, i) => [o + i, (t.charCodeAt(2 * i) || 0) | (t.charCodeAt(2 * i + 1) || 0) << 8]);

function ops(a) {
  const [op, x, ...r] = a, out = [];
  if (op === 'song') out.push(...pack(SONG(x - 1), r.join(' ').slice(0, 10)));
  else if (op === 'setname') out.push(...pack(SETN(x - 1), r.join(' ').slice(0, 10)));
  else if (op === 'sect') {
    const s = x - 1, k = r[0] - 1;
    for (const kv of r.slice(1)) {
      const [key, v] = [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)];
      if (key === 'name') out.push(...pack(SECT(s, k), v.slice(0, 10)));
      else if (key === 'preset') out.push([PRE(s, k), v === 'none' ? 0 : +v + 1]);
      else if (key === 'scene') out.push([SCN(s, k), v === 'default' ? 0 : +v]);
      else throw new Error('unknown key ' + key);
    }
  } else if (op === 'slots') for (let n = 0; n < 32; n++) out.push([SLOT(x - 1, n), +(r[n] || 0)]);
  else throw new Error('unknown op ' + op);
  return out;
}

const [cmd, ...a] = process.argv.slice(2);
if (cmd === 'show') {
  const { w } = load(a[0]); const b = newest(w), g = o => w[b + o];
  for (let L = 0; L < 4; L++) {
    const sl = []; for (let n = 0; n < 32 && g(SLOT(L, n)); n++) sl.push(g(SLOT(L, n)));
    console.log(`Setlist ${L + 1} "${text(w, b + SETN(L))}": ${sl.length ? sl.map(s => `${s} ${text(w, b + SONG(s - 1))}`).join(' | ') : '(empty)'}`);
  }
  for (let s = 0; s < 128; s++) {
    const secs = [];
    for (let k = 0; k < 6; k++) {
      const p = g(PRE(s, k)), sc = g(SCN(s, k)), nm = text(w, b + SECT(s, k));
      if (p || sc || nm !== `Sect ${k + 1}`) secs.push(`  ${k + 1} "${nm}" preset ${p ? p - 1 : 'none'} scene ${sc || 'default'}`);
    }
    const nm = text(w, b + SONG(s));
    if (a[1] === 'all' || secs.length || nm !== `Song ${String(s + 1).padStart(3, '0')}`) console.log(`Song ${s + 1} "${nm}"\n${secs.join('\n')}`.trimEnd());
  }
} else if (cmd === 'set') {
  const [inp, outF, ...r] = a; const m = load(inp);
  for (const [o, v] of ops(r)) for (const base of COPY) { if (m.w[base + o] !== v) console.log(`word ${base + o}: ${m.w[base + o]} -> ${v}`); m.w[base + o] = v; }
  save(m, outF); console.log('wrote', outF);
} else if (cmd === 'live') {
  const { send } = await import('./fcset.mjs');
  await send(ops(a).map(([o, v]) => [o - 4, v]), 1);
} else console.log('usage: show <sys.syx> [all] | set <in> <out> <op> ... | live <op> ...   (see header)');
