// FM3 preset .syx editor: pull a stored preset, read/edit it offline, push it back.
// Usage: node fm3syx.mjs <command> ...   (run with no args for help)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const ROOT = (process.env.MCP_MIDI_ROOT || (process.env.LOCALAPPDATA || '').replace(/\\/g, '/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/');
const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const NM = 'file:///' + ROOT;
const dump = await import(NM + '@mcp-midi-control/fractal-gen3/dist/presetDump.js');
const huff = await import(NM + '@mcp-midi-control/fractal-gen3/dist/presetHuffman.js');
const bodyMod = await import(NM + '@mcp-midi-control/fractal-gen3/dist/presetBody.js');
const author = await import(NM + '@mcp-midi-control/fractal-gen3/dist/presetAuthor.js');
const gen3 = await import(NM + 'fractal-midi/dist/gen3/axe-fx-iii/index.js');
const PARAMS = (await import(NM + 'fractal-midi/dist/gen3/fm3/index.js')).FM3_PARAMS_BY_FAMILY;

import { PROTECTED, PORT } from './local.mjs';
const FM3 = 0x11;
const CALIB = process.env.FM3_CALIB || HERE + 'calib.json';
// Decoded block name -> FM3 param family. Block header: word -1 = scene-1 channel, 0..6 = scenes 2-8
// channel, 7..14 = scene 1-8 bypass (1 = bypassed), 15 = cols, 16 = rows; then from word 17 the
// per-channel arrays (cols words each) indexed by paramId, i.e. word = params_offset + (ch*cols + paramId - 6).
const FAMILY = { Amp: 'DISTORT', Cab: 'CABINET', Comp: 'COMP', Delay: 'DELAY', Flanger: 'FLANGER', Drive: 'FUZZ',
  'Vol/Pan': 'VOLUME', PEQ: 'PEQ', GEQ: 'GEQ', Pitch: 'PITCH', Phaser: 'PHASER', Reverb: 'REVERB', Wah: 'WAH',
  Chorus: 'CHORUS', Filter: 'FILTER', Gate: 'GATE', Rotary: 'ROTARY', Tremolo: 'TREMOLO', MultiTap: 'MULTITAP',
  Plex: 'PLEX', Megatap: 'MEGATAP', Enhancer: 'ENHANCER', Formant: 'FORMANT', Synth: 'SYNTH', Input: 'INPUT', Output: 'OUTPUT', Control: 'CONTROLLERS' };
// Units whose raw 0..65534 maps linearly onto displayMin..displayMax (checked against known values).
// Others (ms, Hz, semitones...) are shown with "?" until calib.json has points for them.
const LINEAR = ['percent', 'bipolar_percent', 'knob_0_10'];
// Grid effect ids (instance 1; instance n = id + n - 1). Shunt n = 1023 + n.
const EFFECT_ID = { Input: 37, Output: 42, Comp: 46, GEQ: 50, PEQ: 54, Amp: 58, Cab: 62, Reverb: 66, Delay: 70,
  MultiTap: 74, Chorus: 78, Flanger: 82, Rotary: 86, Phaser: 90, Wah: 94, Formant: 98, 'Vol/Pan': 102, Tremolo: 106,
  Pitch: 110, Filter: 114, Drive: 118, Enhancer: 122, Mixer: 126, Synth: 130, Megatap: 138, Gate: 146, RingMod: 150,
  MultiComp: 154, TenTap: 158, Resonator: 162, Looper: 166, Plex: 178, Send: 182, Return: 186, Multiplexer: 191, MIDI: 190 };
const GRID_BASE = 0x104, GRID_ROWS = 4, GRID_COLS = 12;
const cellOff = (row, col) => GRID_BASE + ((col - 1) * GRID_ROWS + (row - 1)) * 4; // 1-based row/col, 2 words: eid, from-rows mask
function effectId(what) {
  const w = what.toLowerCase();
  if (w === 'empty' || w === 'none') return 0;
  if (w.startsWith('eid:')) return +w.slice(4);
  const sh = w.match(/^shunt#?(\d*)$/); if (sh) return 1023 + (+sh[1] || 1);
  const [name, nth = '1'] = what.split('#');
  const k = Object.keys(EFFECT_ID).find(x => x.toLowerCase() === name.toLowerCase());
  if (!k) throw new Error(`unknown block ${what} (have: ${Object.keys(EFFECT_ID).join(', ')}, Shunt, empty)`);
  return EFFECT_ID[k] + +nth - 1;
}

// ---------- file model ----------
function load(file) {
  const bytes = new Uint8Array(readFileSync(file));
  const parsed = dump.parsePresetDump(bytes);
  const patch = huff.decodeRawPatch(parsed.chunkPayloads);
  const body = patch.body.slice();
  const dec = bodyMod.decodeGen3Body(body, parsed.modelId);
  relabel(dec);
  // The Controllers menu (tempo, LFOs, ADSRs, sequencer, envelope, scene controllers, manual knobs) is a
  // 4-channel record of family CONTROLLERS (eid 2, 130 params) right after the grid table.
  if ((body[0x1c4] | body[0x1c5] << 8) === 2 && (body[0x1c4 + 42] | body[0x1c4 + 43] << 8) === 130)
    dec.blocks.unshift({ block: 'Control', cols: 130, rows: body[0x1c4 + 44] | body[0x1c4 + 45] << 8, offset: 0x1c4 + 12, params_offset: 0x1c4 + 12 + 46 });
  return { file, bytes, parsed, patch, body, dec, dv: new DataView(body.buffer, body.byteOffset, body.byteLength),
    slot: (bytes[6] << 7) | bytes[7], name: dump.extractPresetName(parsed) };
}
// The codec names chain records by their size only (e.g. it calls Input "Vol/Pan" and Output "PEQ").
// Re-check each record against the FM3 catalog: record cols = highest paramId + 1 of its family,
// and prefer a family that is actually on the grid.
const FAM_COLS = {}; for (const [k, v] of Object.entries(PARAMS)) { const n = Math.max(...v.filter(x => x.paramId < 16000).map(x => x.paramId)) + 1; (FAM_COLS[n] ??= []).push(k); }
const NAME_OF = Object.fromEntries(Object.entries(FAMILY).map(([n, f]) => [f, n]));
function relabel(dec) {
  const onGrid = new Set((dec.grid || []).map(g => Object.keys(EFFECT_ID).find(k => g.effect_id >= EFFECT_ID[k] && g.effect_id < EFFECT_ID[k] + 4)).filter(Boolean).map(n => FAMILY[n]));
  for (const b of dec.blocks || []) {
    const cand = FAM_COLS[b.cols] || [];
    if (cand.includes(FAMILY[b.block]) && (cand.length === 1 || onGrid.has(FAMILY[b.block]))) continue;
    const pick = cand.find(f => onGrid.has(f)) || (cand.length === 1 && cand[0]);
    if (pick && NAME_OF[pick]) { b.codecName = b.block; b.block = NAME_OF[pick]; delete b.channels; delete b.type; }
  }
}
// ---------- modifiers: 32 MOD records (25x1) at the start of the block chain ----------
const MOD_SOURCES = { 0: 'none', 1: 'LFO 1A', 2: 'LFO 1B', 3: 'LFO 2A', 4: 'LFO 2B', 5: 'ADSR 1', 6: 'ADSR 2', 7: 'Sequencer',
  8: 'Envelope Follower', 9: 'Pitch Follower', 10: 'Pedal 1', 14: 'External 1', 15: 'External 2', 16: 'External 3',
  17: 'External 4', 18: 'External 5', 19: 'External 6', 20: 'External 7', 21: 'External 8', 22: 'External 9', 23: 'External 10',
  24: 'External 11', 25: 'External 12', 26: 'External 13', 27: 'External 14', 28: 'External 15', 29: 'External 16', 30: 'Scene Controller 1', 31: 'Scene Controller 2', 32: 'Scene Controller 3',
  33: 'Scene Controller 4', 34: 'FC Pedal 1', 35: 'FC Pedal 2', 50: 'Control Switch 1', 51: 'Control Switch 2',
  56: 'Manual 1', 57: 'Manual 2', 58: 'Manual 3', 59: 'Manual 4', 60: 'Manual 5' };
function modRecords(m) {
  const u = o => m.dv.getUint16(o, true); const out = [];
  let st = -1; for (let o = 0x200; o < m.body.length - 200; o += 2) if (u(o + 30) === 25 && u(o + 32) === 1 && u(o + 126) === 25 && u(o + 128) === 1) { st = o; break; }
  for (let o = st; st >= 0 && u(o + 30) === 25 && u(o + 32) === 1; o += 96) out.push(o);
  return out; // param p of record at o lives at o + (17 + p) * 2
}
const modWord = (o, p) => o + (17 + p.paramId) * 2;
const effectName = eid => { if (!eid) return '-'; if (eid > 1000) return `Shunt ${eid - 1023}`; const k = Object.keys(EFFECT_ID).find(x => eid >= EFFECT_ID[x] && eid < EFFECT_ID[x] + 4); return k ? `${k}${eid > EFFECT_ID[k] ? '#' + (eid - EFFECT_ID[k] + 1) : ''}` : `eid ${eid}`; };
function modTargetParam(eid, pid) { const k = Object.keys(EFFECT_ID).find(x => eid >= EFFECT_ID[x] && eid < EFFECT_ID[x] + 4); const f = k && FAMILY[k]; return f && PARAMS[f].find(x => x.paramId === pid)?.name || `param ${pid}`; }
// ---------- block records ----------
// Every record = eid word, 5 words, then the 23-word block header (cols/rows at header words 15/16) + cols x rows words.
// Order seen: 32 MOD records (eid 3..34), the blocks, then eid 201 and 200 (per-preset footswitch data).
const DEFAULTS = process.env.FM3_DEFAULTS || CALIB.replace(/calib\.json$/, 'defaults/');
function chainRecords(m) {
  const u = o => m.dv.getUint16(o, true); const out = [];
  let o = modRecords(m)[0];
  while (o > 0 && o + 34 < m.body.length && u(o + 30) && u(o + 32)) { const n = (23 + u(o + 30) * u(o + 32)) * 2; out.push({ eid: u(o - 12), start: o - 12, end: o - 12 + n }); o += n; }
  return out;
}
function setBody(m, body) { m.body = body; m.dv = new DataView(body.buffer, body.byteOffset, body.byteLength); }
function save(m, out, slot = m.slot) {
  let bytes = author.reencodeDumpFromRawPatch(m.bytes, huff.reencodeRawPatch(m.patch.rawPatch, m.body));
  if (slot !== ((bytes[6] << 7) | bytes[7])) bytes = retarget(bytes, slot);
  writeFileSync(out, bytes);
  return bytes;
}
function retarget(bytes, slot) {
  const b = Uint8Array.from(bytes);
  b[6] = (slot >> 7) & 0x7f; b[7] = slot & 0x7f;
  let x = 0; for (let i = 0; i < 11; i++) x ^= b[i]; b[11] = x & 0x7f; // header checksum
  return b;
}
function findBlock(m, spec) {
  const [name, nth = '1'] = spec.split('#');
  const hits = m.dec.blocks.filter(b => b.block.toLowerCase() === name.toLowerCase());
  const b = hits[+nth - 1];
  if (!b) throw new Error(`block "${spec}" not in preset (have: ${m.dec.blocks.map(x => x.block).join(', ')})`);
  return b;
}
function paramDef(block, pname) {
  const fam = FAMILY[block.block]; if (!fam) throw new Error(`no param family for block ${block.block}`);
  const want = pname.toUpperCase(); const list = PARAMS[fam];
  const p = list.find(x => x.name === want) || list.find(x => x.name === fam + '_' + want) ||
    list.find(x => (x.displayLabel || '').toUpperCase() === want);
  if (!p) throw new Error(`param ${pname} not in ${fam}`);
  if (p.paramId >= block.cols) throw new Error(`${p.name} (id ${p.paramId}) is beyond this block's ${block.cols} params`);
  return p;
}
const wordAt = (block, ch, p) => block.params_offset + ('ABCD'.indexOf(ch) * block.cols + (p.paramId - 6)) * 2;
const chans = block => block.rows >= 4 ? ['A', 'B', 'C', 'D'] : ['A'];
const sceneChOff = (b, s) => b.offset + (s === 0 ? -1 : s - 1) * 2;
const sceneCh = (m, b, s) => 'ABCD'[m.dv.getUint16(sceneChOff(b, s), true)];
const sceneByp = (m, b, s) => m.dv.getUint16(b.offset + (7 + s) * 2, true) ? 'bypass' : 'engaged';

// ---------- raw <-> display ----------
const calib = () => existsSync(CALIB) ? JSON.parse(readFileSync(CALIB, 'utf8')) : {};
// scales.json = what the FM3 itself displays (calibrate.mjs): cont params as 21 [raw, "text"] points, enums as names.
const SCALES = process.env.FM3_SCALES || CALIB.replace(/calib\.json$/, 'scales.json');
let _sc; const scales = () => _sc ??= existsSync(SCALES) ? JSON.parse(readFileSync(SCALES, 'utf8')) : {};
function curve(p) {
  const e = scales()[p.name]; if (e?.kind !== 'cont') return null;
  let pts = e.pts.map(([r, t]) => [r, parseFloat(t), String(t).replace(/^[-+\d.\s]+/, '').trim()]).filter(x => !isNaN(x[1]));
  if (pts.length > 2 && pts[0][0] === 0 && (pts[0][1] - pts[1][1]) * (pts[2][1] - pts[1][1]) > 0) pts = pts.slice(1); // stale first echo
  if (pts.length < 2) return null;
  const v = pts.map(x => x[1]), n = v.length - 1, mid = v[n >> 1], unit = pts[n][2];
  const tol = Math.max(1e-9, Math.abs(v[n] - v[0]) * 0.01);
  if (pts[0][0] === 0 && pts[n][0] === 65534 && Math.abs(mid - (v[0] + v[n]) / 2) < tol) return { lin: [v[0], v[n]], unit };
  if (pts[0][0] === 0 && pts[n][0] === 65534 && v[0] > 0 && Math.abs(mid - Math.sqrt(v[0] * v[n])) < tol) return { log: [v[0], v[n]], unit };
  return { pts: pts.map(x => [x[0], x[1]]), unit };
}
const enumNames = p => { const e = scales()[p.name]; return e?.kind === 'enum' && e.names.some(Boolean) ? e.names : null; };
function toDisplay(p, raw) {
  const pts = calib()[p.name] ?? curve(p);
  if (pts?.log) return { v: pts.log[0] * Math.pow(pts.log[1] / pts.log[0], raw / 65534), how: 'calib' };
  if (pts?.lin) return { v: pts.lin[0] + raw / 65534 * (pts.lin[1] - pts.lin[0]), how: 'calib' };
  if (Array.isArray(pts) && pts.length >= 2) return { v: interp(pts, raw, 0, 1), how: 'calib' };
  if (pts?.pts) return { v: interp(pts.pts, raw, 0, 1), how: 'calib' };
  if (p.unit === 'semitones') return { v: raw > 32767 ? raw - 65536 : raw, how: 'linear' }; // signed int, not 0..65534
  if (p.unit === 'hz' && p.displayMin > 0) return { v: p.displayMin * Math.pow(p.displayMax / p.displayMin, raw / 65534), how: 'log' };
  if (p.displayMin !== undefined && p.displayMax !== undefined) {
    const v = p.displayMin + raw / 65534 * (p.displayMax - p.displayMin);
    return { v, how: LINEAR.includes(p.unit) ? 'linear' : '~linear?' };
  }
  return null;
}
function toRaw(p, display) {
  const names = enumNames(p);
  if (names && isNaN(+display)) {
    const w = String(display).toLowerCase(); let i = names.findIndex(x => (x || '').toLowerCase() === w);
    if (i < 0) { const hits = names.map((x, k) => [x, k]).filter(([x]) => (x || '').toLowerCase().includes(w)); if (hits.length === 1) i = hits[0][1]; else throw new Error(`${p.name}: "${display}" matches ${hits.length} of: ${names.filter(Boolean).join(', ')}`); }
    return i;
  }
  display = +display;
  const pts = calib()[p.name] ?? curve(p);
  if (pts?.log) return Math.round(65534 * Math.log(display / pts.log[0]) / Math.log(pts.log[1] / pts.log[0]));
  if (pts?.lin) return Math.round((display - pts.lin[0]) / (pts.lin[1] - pts.lin[0]) * 65534);
  if (Array.isArray(pts) && pts.length >= 2) return Math.round(interp(pts, display, 1, 0));
  if (pts?.pts) return Math.round(interp(pts.pts, display, 1, 0));
  if (names) return Math.round(display);
  if (p.unit === 'semitones') return (Math.round(display) + 65536) % 65536;
  if (p.unit === 'hz' && p.displayMin > 0) return Math.round(65534 * Math.log(display / p.displayMin) / Math.log(p.displayMax / p.displayMin));
  if (p.displayMin === undefined) throw new Error(`${p.name} has no known scale: pass raw:<0..65534> or "learn" it first`);
  return Math.round((display - p.displayMin) / (p.displayMax - p.displayMin) * 65534);
}
function interp(pts, x, a, b) {
  const s = [...pts].sort((u, w) => u[a] - w[a]);
  for (let i = 1; i < s.length; i++) if (x <= s[i][a] || i === s.length - 1) {
    const [p0, p1] = [s[i - 1], s[i]]; return p0[b] + (x - p0[a]) / (p1[a] - p0[a]) * (p1[b] - p0[b]);
  }
}
const fmt = (p, raw) => {
  const names = enumNames(p); if (names) return names[raw] != null ? `"${names[raw]}"` : `#${raw}?`;
  const c = !calib()[p.name] && curve(p); if (c) { const d = toDisplay(p, raw); return `${+d.v.toFixed(3)} ${c.unit}`.trim(); }
  const d = toDisplay(p, raw); return d ? `${+d.v.toFixed(2)} ${p.unit}${['linear', 'calib', 'log'].includes(d.how) ? '' : ' ' + d.how}` : ''; };

// ---------- serial ----------
async function openPort() {
  const { SerialPort } = createRequire(ROOT)(ROOT + 'serialport');
  const port = new SerialPort({ path: PORT, baudRate: 115200 });
  await new Promise((ok, ko) => port.on('open', ok).on('error', e => ko(new Error(`${PORT}: ${e.message} (close FM3-Edit / the MCP server)`))));
  return port;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- commands ----------
const cmd = {
  async pull(slot, out) {
    slot = +slot; const port = await openPort(); const rx = [];
    port.on('data', d => rx.push(...d));
    port.write(gen3.buildRequestPresetDump(slot, FM3));
    for (let t = 0; t < 100 && !Buffer.from(rx).includes(Buffer.from([0x01, 0x74, FM3, 0x79])); t++) await sleep(100);
    await sleep(200); port.close();
    const buf = Uint8Array.from(rx); const start = buf.indexOf(0xf0);
    const m0 = dump.parsePresetDump(buf.subarray(start));
    writeFileSync(out, dump.serializePresetDump(m0));
    const m = load(out); console.log(`pulled ${slot} "${m.name}" -> ${out} (${m.bytes.length} bytes)`);
  },
  info(file) {
    const m = load(file); const d = m.dec;
    console.log(`slot ${m.slot}  name "${m.name}"`);
    console.log('scenes: ' + (d.scene_names || []).map((s, i) => `${i + 1}=${s || '-'}`).join('  '));
    for (let r = 0; r < 4; r++) { const row = d.grid.filter(g => g.row === r).sort((a, b) => a.col - b.col); if (row.length) console.log(`row ${r + 1}: ` + row.map(g => `${g.col + 1}:${g.name}${g.from_rows ? '<' + g.from_rows.map(x => x + 1).join(',') : ''}`).join('  ')); }
    for (const b of d.blocks) {
      const types = b.channels ? Object.entries(b.channels).map(([c, v]) => `${c}=${v.type ?? v.dynacab1 ?? v.mode ?? '?'}`).join(' ') : (b.type || '');
      console.log(`${b.block.padEnd(8)} ${types}`);
      if (b.scene_channels) console.log(`         scenes ch ${b.scene_channels.join('')}  ${b.scene_bypass.map(x => x ? 'b' : 'E').join('')}`);
    }
    this.mods(file);
    const ctl = d.blocks.find(b => b.block === 'Control');
    if (ctl) { const g = k => m.dv.getUint16(wordAt(ctl, 'A', paramDef(ctl, k)), true);
      console.log(`tempo ${g('TEMPO')} BPM` + [1, 2, 3, 4].map(n => { const v = [1, 2, 3, 4, 5, 6, 7, 8].map(i => g(`SCENE${n}_VAL${i}`)); return v.some(Boolean) ? `
Scene Controller ${n}: ${v.map(x => +(x / 655.34).toFixed(1)).join(' ')} %` : ''; }).join('')); }
  },
  params(file, blk, ch) {
    const m = load(file); const b = findBlock(m, blk); const fam = FAMILY[b.block];
    for (const c of ch ? [ch.toUpperCase()] : chans(b)) {
      console.log(`--- ${b.block} channel ${c} ${b.channels?.[c]?.type ?? ''}`);
      if (!fam) { for (let k = 0; k < b.cols; k++) console.log(k, m.dv.getUint16(b.params_offset + ('ABCD'.indexOf(c) * b.cols + k) * 2, true)); continue; }
      for (const p of PARAMS[fam]) {
        if (p.paramId >= b.cols) continue;
        const raw = m.dv.getUint16(wordAt(b, c, p), true);
        console.log(`${p.name.padEnd(26)} ${String(raw).padStart(5)}  ${fmt(p, raw)}`);
      }
    }
  },
  get(file, blk, ch, pname) {
    const m = load(file); const b = findBlock(m, blk); const p = paramDef(b, pname);
    const raw = m.dv.getUint16(wordAt(b, ch.toUpperCase(), p), true); console.log(`${p.name} ${ch} = ${raw}  ${fmt(p, raw)}`);
  },
  set(inF, outF, blk, ch, ...pairs) {
    const m = load(inF); const b = findBlock(m, blk);
    for (let i = 0; i < pairs.length; i += 2) {
      const p = paramDef(b, pairs[i]); const v = String(pairs[i + 1]); const o = wordAt(b, ch.toUpperCase(), p);
      const raw = v.startsWith('raw:') ? +v.slice(4) : toRaw(p, v);
      if (!(raw >= 0 && raw <= 65535)) throw new Error(`${p.name}: raw ${raw} out of range`);
      console.log(`${p.name} ${ch}: ${m.dv.getUint16(o, true)} -> ${raw}  ${fmt(p, raw)}`);
      m.dv.setUint16(o, raw, true);
    }
    save(m, outF); console.log('wrote', outF);
  },
  // scene <in> <out> <Block> <1-8|all> [ch=A-D] [bypass|engaged]
  scene(inF, outF, blk, which, ...opts) {
    const m = load(inF); const b = findBlock(m, blk);
    for (const s of which === 'all' ? [0, 1, 2, 3, 4, 5, 6, 7] : which.split(',').map(x => +x - 1)) for (const o of opts) {
      if (o.startsWith('ch=')) m.dv.setUint16(sceneChOff(b, s), 'ABCD'.indexOf(o.slice(3).toUpperCase()), true);
      else if (o === 'bypass' || o === 'engaged') m.dv.setUint16(b.offset + (7 + s) * 2, o === 'bypass' ? 1 : 0, true);
      else throw new Error(`bad option ${o}`);
      console.log(`${b.block} scene ${s + 1}: ${sceneCh(m, b, s)} ${sceneByp(m, b, s)}`);
    }
    save(m, outF); console.log('wrote', outF);
  },
  // scenename <in> <out> <1-8> <name>  (31 chars max)
  scenename(inF, outF, n, ...name) {
    const m = load(inF); const t = name.join(' '); const o = 4 + (+n - 1) * 32;
    if (!(+n >= 1 && +n <= 8)) throw new Error('scene 1-8'); if (t.length > 31 || /[^ -~]/.test(t)) throw new Error('name: 31 printable ASCII chars max');
    m.body.fill(0, o, o + 32); for (let i = 0; i < t.length; i++) m.body[o + i] = t.charCodeAt(i);
    save(m, outF); console.log(`scene ${n} name "${t}"; wrote ${outF}`);
  },
  // cell <in> <out> <row 1-4> <col 1-12> [<Block[#n]|Shunt[#n]|empty|eid:N>] [from=1,2|from=none]
  cell(inF, outF, row, col, ...opts) {
    const m = load(inF); const o = cellOff(+row, +col);
    if (!(+row >= 1 && +row <= GRID_ROWS && +col >= 1 && +col <= GRID_COLS)) throw new Error(`row 1-${GRID_ROWS}, col 1-${GRID_COLS}`);
    for (const x of opts) {
      if (x.startsWith('from=')) m.dv.setUint16(o + 2, x === 'from=none' ? 0 : x.slice(5).split(',').reduce((a, r) => a | 1 << (+r - 1), 0), true);
      else { const eid = effectId(x); m.dv.setUint16(o, eid, true); if (!eid) m.dv.setUint16(o + 2, 0, true); }
    }
    const eid = m.dv.getUint16(o, true), f = m.dv.getUint16(o + 2, true);
    console.log(`cell r${row} c${col}: eid ${eid} from rows [${[0, 1, 2, 3].filter(r => f & 1 << r).map(r => r + 1)}]`);
    const fam = Object.keys(EFFECT_ID).find(k => eid >= EFFECT_ID[k] && eid < EFFECT_ID[k] + 4 && eid < 1000);
    if (fam && !['Input', 'Output', 'Shunt'].includes(fam) && !m.dec.blocks.some(b => b.block === fam)) console.log(`note: no ${fam} block in this preset's block chain yet; the FM3 may load it with defaults (or ignore it)`);
    save(m, outF); console.log('wrote', outF);
  },
  // mods <file> [all]: modifier records in use (or all 32)
  mods(file, all) {
    const m = load(file);
    modRecords(m).forEach((o, i) => {
      const v = Object.fromEntries(PARAMS.MOD.map(p => [p.name.slice(4), m.dv.getUint16(modWord(o, p), true)]));
      if (!all && !v.EFFECTID && !v.CTRLID) return;
      console.log(`mod ${String(i + 1).padStart(2)}: ${MOD_SOURCES[v.CTRLID] ?? 'source ' + v.CTRLID} -> ${effectName(v.EFFECTID)} ${modTargetParam(v.EFFECTID, v.PARAM)}` +
        `  min ${v.MIN} max ${v.MAX} start ${v.STARTPT} mid ${v.MIDPT} end ${v.ENDPT} slope ${v.SLOPE} damp ${v.DAMPING} auto ${v.AUTOENGAGE} pcreset ${v.PCRESET} scale ${v.SCALE} offset ${v.OFFSET}`);
    });
  },
  // mod <in> <out> <1-32> FIELD=val ...   fields: MOD catalog names (CTRLID MIN MAX STARTPT MIDPT ENDPT SLOPE ATTACK
  // EFFECTID PARAM AUTOENGAGE PCRESET OFFVAL SCALE OFFSET RELEASE RATE CHANNEL CTRLID2 SCALE1 SCALE2 OPERATION DAMPING).
  // CTRLID accepts a source name ("Scene Controller 1"), EFFECTID a block (Pitch, Amp#2), PARAM a param name of that block.
  // Other values are raw words (MIN/MAX/STARTPT...: 0..65534 = 0..100 %).
  mod(inF, outF, n, ...kv) {
    const m = load(inF); const o = modRecords(m)[+n - 1]; if (o === undefined) throw new Error('modifier 1-32');
    const get = name => m.dv.getUint16(modWord(o, PARAMS.MOD.find(p => p.name === 'MOD_' + name)), true);
    for (const x of kv) {
      const [k, ...r] = x.split('='); const key = k.toUpperCase().replace(/^MOD_/, ''); const val = r.join('=');
      const p = PARAMS.MOD.find(q => q.name === 'MOD_' + key); if (!p) throw new Error(`unknown modifier field ${k}`);
      let raw;
      if (/^raw:/.test(val) || /^\d+$/.test(val)) raw = +val.replace('raw:', '');
      else if (key === 'CTRLID' || key === 'CTRLID2') { const e = Object.entries(MOD_SOURCES).find(([, nm]) => nm.toLowerCase() === val.toLowerCase()); if (!e) throw new Error(`source? ${Object.values(MOD_SOURCES).join(', ')}`); raw = +e[0]; }
      else if (key === 'EFFECTID') raw = effectId(val);
      else if (key === 'PARAM') { const eid = get('EFFECTID'); const kk = Object.keys(EFFECT_ID).find(z => eid >= EFFECT_ID[z] && eid < EFFECT_ID[z] + 4); raw = paramDef({ block: kk, cols: 1e9 }, val).paramId; }
      else if (/%$/.test(val)) raw = Math.round(parseFloat(val) / 100 * 65534);
      else throw new Error(`${key}: give raw:N, N, or N% (got ${val})`);
      m.dv.setUint16(modWord(o, p), raw, true);
    }
    save(m, outF); this.mods(outF);
  },
  // records <file>: block records in chain order; record <file> <Block[#n]> <out.bin>: save one record
  records(file) { console.log(chainRecords(load(file)).map(r => `${r.eid}:${(r.end - r.start)}`).join(' ')); },
  record(file, what, out) {
    const m = load(file); const eid = effectId(what); const r = chainRecords(m).find(x => x.eid === eid);
    if (!r) throw new Error(`no record for ${what}`);
    writeFileSync(out, m.body.subarray(r.start, r.end)); console.log(`${what}: ${r.end - r.start} bytes -> ${out}`);
  },
  // add <in> <out> <row> <col> <Block[#n]> [from=1,2]: new block with the FM3's own defaults (defaults/<eid>.bin)
  add(inF, outF, row, col, what, ...opts) {
    const m = load(inF); const eid = effectId(what); const base = Object.values(EFFECT_ID).filter(v => v <= eid).sort((a, b) => b - a)[0];
    const recs = chainRecords(m);
    if (recs.some(r => r.eid === eid)) throw new Error(`${what} (eid ${eid}) already exists in this preset`);
    const f = DEFAULTS + base + '.bin'; if (!existsSync(f)) throw new Error(`no defaults for eid ${base} (${f}); run harvest.mjs`);
    const rec = new Uint8Array(readFileSync(f)); rec[0] = eid & 0xff; rec[1] = eid >> 8;
    const prev = recs.find(r => r.eid === eid - 1);   // second instance: right after the first, as the FM3 stores it
    const at = prev ? prev.end : (recs.find(r => r.eid === 201 || r.eid === 200) || recs[recs.length - 1]).start;
    setBody(m, Uint8Array.from([...m.body.subarray(0, at), ...rec, ...m.body.subarray(at)]));
    const o = cellOff(+row, +col); if (m.dv.getUint16(o, true)) throw new Error(`cell r${row} c${col} is not empty`);
    m.dv.setUint16(o, eid, true);
    const fr = opts.find(x => x.startsWith('from=')); if (fr) m.dv.setUint16(o + 2, fr.slice(5).split(',').reduce((a, r) => a | 1 << (+r - 1), 0), true);
    save(m, outF); console.log(`added ${what} (eid ${eid}) at r${row} c${col}, ${rec.length}-byte record; wrote ${outF}`);
  },
  // midi <in> <out> <scene 1-8> [pc:<chan>:<value>|cc:<chan>:<num>:<value>|-]...  Scene MIDI rows, up to 8, the rest cleared.
  // Record: 23 header words, then 257 values. Each table has 64 entries, index (scene-1)*8 + row-1.
  // Tables: type at 0 (0 none, 1 CC, 2 PC), channel at 64 (0-based), number at 128, value at 192.
  midi(inF, outF, scene, ...rows) {
    const m = load(inF); const rec = chainRecords(m).find(r => r.eid === 190); if (!rec) throw new Error('no MIDI block: add it first (add <in> <out> <row> <col> MIDI)');
    if (!(+scene >= 1 && +scene <= 8) || rows.length > 8) throw new Error('scene 1-8, at most 8 rows');
    const put = (table, row, v) => m.dv.setUint16(rec.start + (23 + table + (+scene - 1) * 8 + row) * 2, v, true);
    for (let i = 0; i < 8; i++) {
      const [t, ...a] = (rows[i] || '-').toLowerCase().split(':').map(x => isNaN(+x) ? x : +x);
      const v = t === 'pc' ? [2, a[0], 0, a[1]] : t === 'cc' ? [1, a[0], a[1], a[2]] : t === '-' ? [0, 1, 0, 0] : null;
      if (!v || !(v[1] >= 1 && v[1] <= 16) || !(v[2] >= 0 && v[2] <= 127) || !(v[3] >= 0 && v[3] <= 127)) throw new Error(`bad row ${rows[i]}`);
      put(0, i, v[0]); put(64, i, v[1] - 1); put(128, i, v[2]); put(192, i, v[3]);
    }
    save(m, outF); console.log(`scene ${scene}: ${rows.length} MIDI rows; wrote ${outF}`);
  },
  // midishow <file>: the Scene MIDI rows of every scene
  midishow(f) {
    const m = load(f); const rec = chainRecords(m).find(r => r.eid === 190); if (!rec) return console.log('no MIDI block');
    const get = i => m.dv.getUint16(rec.start + (23 + i) * 2, true);
    for (let s = 0; s < 8; s++) { const o = []; for (let r = 0; r < 8; r++) { const i = s * 8 + r, t = get(i), c = get(64 + i) + 1, n = get(128 + i), v = get(192 + i); if (t === 2) o.push(`PC ${v} ch${c}`); else if (t === 1) o.push(`CC ${n}=${v} ch${c}`); } console.log(`scene ${s + 1}: ${o.join(', ') || '-'}`); }
  },
  // remove <in> <out> <Block[#n]>: clear its grid cell(s) and delete its record
  remove(inF, outF, what) {
    const m = load(inF); const eid = effectId(what);
    for (let c = 1; c <= GRID_COLS; c++) for (let r = 1; r <= GRID_ROWS; r++) if (m.dv.getUint16(cellOff(r, c), true) === eid) { m.dv.setUint16(cellOff(r, c), 0, true); m.dv.setUint16(cellOff(r, c) + 2, 0, true); }
    const rec = chainRecords(m).find(r => r.eid === eid); if (!rec) throw new Error(`no record for ${what}`);
    setBody(m, Uint8Array.from([...m.body.subarray(0, rec.start), ...m.body.subarray(rec.end)]));
    save(m, outF); console.log(`removed ${what}; wrote ${outF}`);
  },
  // scenectl <in> <out> <1-4> <v1> [v2 ... v8]: Scene Controller values per scene, in % (one value = all scenes)
  scenectl(inF, outF, n, ...vals) {
    const m = load(inF); const b = findBlock(m, 'Control');
    if (!(+n >= 1 && +n <= 4)) throw new Error('scene controller 1-4');
    const v = vals.length === 1 ? Array(8).fill(vals[0]) : vals; if (v.length !== 8) throw new Error('give 1 or 8 values');
    for (const c of chans(b)) v.forEach((x, i) => m.dv.setUint16(wordAt(b, c, paramDef(b, `SCENE${n}_VAL${i + 1}`)), Math.round(Math.min(100, Math.max(0, parseFloat(x))) / 100 * 65534), true));
    save(m, outF); console.log(`Scene Controller ${n}: ${v.map(x => parseFloat(x) + '%').join(' ')}; wrote ${outF}`);
  },
  type(inF, outF, blk, ch, ...q) {
    const r = author.swapBlockType(new Uint8Array(readFileSync(inF)), blk, q.join(' '), ch.toUpperCase());
    writeFileSync(outF, r.syx); console.log(`${blk} ${r.channel} -> ${r.resolvedType} (id ${r.typeId}); wrote ${outF}`);
  },
  types(blk) { console.log(author.listBlockTypes(blk).map(t => `${t.id}:${t.name}`).join('\n')); },
  rename(inF, outF, ...name) { writeFileSync(outF, author.renamePreset(new Uint8Array(readFileSync(inF)), name.join(' '))); console.log('wrote', outF); },
  slot(inF, outF, slot) { writeFileSync(outF, retarget(readFileSync(inF), +slot)); console.log(`retargeted to slot ${slot}; wrote ${outF}`); },
  diff(a, b) {
    const A = load(a), B = load(b);
    if (A.name !== B.name) console.log(`name: "${A.name}" -> "${B.name}"`);
    if (A.slot !== B.slot) console.log(`slot: ${A.slot} -> ${B.slot}`);
    for (const ba of A.dec.blocks) {
      const bb = B.dec.blocks.find(x => x.block === ba.block && x.offset === ba.offset) || B.dec.blocks.find(x => x.block === ba.block);
      if (!bb) { console.log(`${ba.block}: removed`); continue; }
      const fam = FAMILY[ba.block];
      for (let s = 0; s < 8; s++) {
        if (sceneCh(A, ba, s) !== sceneCh(B, bb, s)) console.log(`${ba.block} scene ${s + 1} channel: ${sceneCh(A, ba, s)} -> ${sceneCh(B, bb, s)}`);
        if (sceneByp(A, ba, s) !== sceneByp(B, bb, s)) console.log(`${ba.block} scene ${s + 1} bypass: ${sceneByp(A, ba, s)} -> ${sceneByp(B, bb, s)}`);
      }
      for (const c of chans(ba)) for (let k = -6; k < Math.min(ba.cols, bb.cols) - 6; k++) {
        const ra = A.dv.getUint16(ba.params_offset + ('ABCD'.indexOf(c) * ba.cols + k) * 2, true);
        const rb = B.dv.getUint16(bb.params_offset + ('ABCD'.indexOf(c) * bb.cols + k) * 2, true);
        if (ra === rb) continue;
        const p = fam && PARAMS[fam].find(x => x.paramId === k + 6);
        console.log(`${ba.block} ${c} ${p ? p.name : 'word ' + k}: ${ra} -> ${rb}  ${p ? fmt(p, ra) + ' -> ' + fmt(p, rb) : ''}`);
      }
    }
    const n = Math.min(A.body.length, B.body.length); let other = 0;
    for (let i = 0; i < n; i++) if (A.body[i] !== B.body[i]) other++;
    console.log(`(${other} body bytes differ in total)`);
  },
  // calib.json: PARAM -> [[raw, display], ...] points, or {"lin":[min,max]} / {"log":[min,max]}
  learn(file, blk, ch, pname, display) {
    const m = load(file); const b = findBlock(m, blk); const p = paramDef(b, pname);
    const raw = m.dv.getUint16(wordAt(b, ch.toUpperCase(), p), true);
    const c = calib(); if (!Array.isArray(c[p.name])) c[p.name] = []; c[p.name].push([raw, +display]);
    writeFileSync(CALIB, JSON.stringify(c, null, 1)); console.log(`${p.name}: raw ${raw} = ${display} ${p.unit} (${c[p.name].length} points)`);
  },
  async push(file, ...flags) {
    const bytes = readFileSync(file); const slot = (bytes[6] << 7) | bytes[7]; const m = load(file);
    if (PROTECTED.includes(slot)) throw new Error(`refusing to write protected slot ${slot}`);
    if (!flags.includes('--yes')) { console.log(`would store "${m.name}" into slot ${slot}. Re-run with --yes to write.`); return; }
    const port = await openPort(); let rx = []; port.on('data', d => rx.push(...d));
    const frames = []; let s = 0;
    for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0xf7) { frames.push(bytes.subarray(s, i + 1)); s = i + 1; }
    for (const f of frames) { port.write(f); await new Promise(r => port.drain(r)); await sleep(150); }
    await sleep(600); port.close();
    console.log(`sent ${frames.length} frames to slot ${slot}; replies: ${Buffer.from(rx.slice(0, 48)).toString('hex') || 'none'}`);
  },
};

const [c, ...args] = process.argv.slice(2);
if (!cmd[c]) {
  console.log(`fm3syx.mjs commands:
  pull <slot> <out.syx>                      read a STORED preset from the FM3 (${PORT})
  info <file>                                name, slot, grid, block types, scenes, modifiers
  params <file> <Block[#n]> [ch]             every param of a block (raw + display)
  get <file> <Block> <ch> <PARAM>
  set <in> <out> <Block> <ch> <PARAM> <val> [<PARAM> <val>...]   val = display value or raw:N
  scene <in> <out> <Block> <1-8|1,3|all> [ch=X] [bypass|engaged]
  scenename <in> <out> <1-8> <name>
  cell <in> <out> <row> <col> [Block[#n]|Shunt|empty] [from=1,2|from=none]   grid cell + its input cables
  scenectl <in> <out> <1-4> <% x1|x8>         Scene Controller value per scene
  mods <file> [all]                          modifiers (source -> block param, curve)
  mod <in> <out> <1-32> FIELD=val ...        edit a modifier (CTRLID="Scene Controller 1" EFFECTID=Pitch PARAM=MIX MIN=0% MAX=100%)
  add <in> <out> <row> <col> <Block[#n]> [from=1,2]   new block with FM3 defaults
  midi <in> <out> <scene> [pc:ch:val|cc:ch:num:val|-]...  Scene MIDI rows of one scene (block MIDI)
  midishow <file>                            Scene MIDI rows of all scenes
  remove <in> <out> <Block[#n]>              delete a block (grid + record)
  type <in> <out> <Block> <ch> <type name>   swap block type (Amp/Reverb/Drive/Delay/...)
  types <Block>                              list type names
  rename <in> <out> <name>
  slot <in> <out> <N>                        retarget the file to another slot
  diff <a> <b>                               per-param differences
  learn <file> <Block> <ch> <PARAM> <display>  record a raw->display point (calib.json)
  push <file> --yes                          store the file into the slot in its header (slots in fm3-local.json refused)`);
  process.exit(c ? 1 : 0);
}
try { await cmd[c](...args); } catch (e) { console.error('error:', e.message); process.exit(1); }
