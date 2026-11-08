// Second pass over scales.json: re-read the first point of every continuous sweep (it can be a stale echo)
// and re-sweep enums whose count looks wrong (Amp TYPE). Usage: node calfix.mjs <presetToReload>
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = (process.env.MCP_MIDI_ROOT || (process.env.LOCALAPPDATA || '').replace(/\\/g, '/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/');
const HERE = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const g = await import('file:///' + ROOT + 'fractal-midi/dist/gen3/axe-fx-iii/index.js');
const codec = await import('file:///' + ROOT + 'fractal-midi/dist/gen3/axe-fx-iii/setParam.js');
const PARAMS = (await import('file:///' + ROOT + 'fractal-midi/dist/gen3/fm3/index.js')).FM3_PARAMS_BY_FAMILY;
const author = await import('file:///' + ROOT + '@mcp-midi-control/fractal-gen3/dist/presetAuthor.js');
const { SerialPort } = createRequire(ROOT)(ROOT + 'serialport');
const FM3 = 0x11, OUT = HERE + 'scales.json';
const EID = { COMP: 46, GEQ: 50, PEQ: 54, DISTORT: 58, CABINET: 62, REVERB: 66, DELAY: 70, MULTITAP: 74, CHORUS: 78,
  FLANGER: 82, ROTARY: 86, PHASER: 90, WAH: 94, FORMANT: 98, VOLUME: 102, TREMOLO: 106, PITCH: 110, FILTER: 114,
  FUZZ: 118, ENHANCER: 122, MIXER: 126, SYNTH: 130, MEGATAP: 138, GATE: 146, RINGMOD: 150, MULTICOMP: 154,
  TENTAP: 158, RESONATOR: 162, PLEX: 178, FDBKSEND: 182, FDBKRET: 186, MULTIPLEXER: 191, INPUT: 37, OUTPUT: 42 };
const ON_GRID = { DISTORT: 1, CABINET: 1, PITCH: 1, DELAY: 1, REVERB: 1, INPUT: 1, OUTPUT: 1 };
import { PORT, neighbour } from './local.mjs';
const port = new SerialPort({ path: PORT, baudRate: 115200 });
await new Promise((a, b) => port.on('open', a).on('error', b));
let rx = []; port.on('data', d => rx.push(...d));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frames = () => { const o = []; let s = -1; for (let i = 0; i < rx.length; i++) { if (rx[i] === 0xf0) s = i; else if (rx[i] === 0xf7 && s >= 0) { o.push(rx.slice(s, i + 1)); s = -1; } } return o; };
function text(f) { let bits = ''; for (let i = 21; i < f.length - 2; i++) bits += f[i].toString(2).padStart(7, '0');
  let s = ''; for (let i = 0; i + 8 <= bits.length; i += 8) { const c = parseInt(bits.slice(i, i + 8), 2); if (!c) break; s += String.fromCharCode(c); } return s.trim(); }
async function echo(msg, eid, pid) {
  for (let t = 0; t < 3; t++) { await sleep(30); rx = []; port.write(msg);
    for (let w = 0; w < 20; w++) { await sleep(15);
      for (const f of frames()) if (f[5] === 1 && f.length > 40 && f[8] + (f[9] << 7) === eid && f[10] + (f[11] << 7) === pid)
        return { iv: g.parseGetParameterResponse(f, FM3).internalValue, s: text(f) }; } }
  return null;
}
const setC = (eid, pid, n) => { try { return echo(g.buildSetParameterContinuous(eid, pid, n, FM3), eid, pid); } catch { return null; } };
const setD = (eid, pid, o) => echo(g.buildSetParameter(eid, pid, o, FM3), eid, pid);
async function grid(eid) { const cell = { row: 4, col: 12, rows: 4 };
  port.write(Buffer.from(codec.buildSelectCell(cell, FM3))); await sleep(40);
  port.write(Buffer.from(codec.buildSetGridCell({ ...cell, blockId: eid }, FM3))); await sleep(300); }
const ROSTER = { DISTORT_TYPE: 'Amp' };
const sc = JSON.parse(readFileSync(OUT, 'utf8')); let fixed = 0;
await setC(42, 12, 0);
for (const [fam, eid] of Object.entries(EID)) {
  const mine = PARAMS[fam].filter(p => sc[p.name]?.kind === 'cont' || ROSTER[p.name]); if (!mine.length) continue;
  if (!ON_GRID[fam]) await grid(eid);
  for (const p of mine) {
    if (ROSTER[p.name]) { const n = author.listBlockTypes(ROSTER[p.name]).length; const names = [];
      for (let o = 0; o < n + 5; o++) { const r = await setD(eid, p.paramId, o); names.push(r ? r.s : null); }
      sc[p.name] = { kind: 'enum', names }; fixed++; continue; }
    await setC(eid, p.paramId, 0.5); const r = await setC(eid, p.paramId, 0);
    if (r && r.s !== sc[p.name].pts[0][1]) { sc[p.name].pts[0] = [0, r.s]; fixed++; }
    if (fam === 'OUTPUT') await setC(42, 12, 0);
  }
  writeFileSync(OUT, JSON.stringify(sc)); console.log(fam, 'ok');
  if (!ON_GRID[fam]) await grid(0);
}
await setC(42, 12, 0);
const rl = +process.argv[2];
if (rl) { port.write(Buffer.from(g.buildSwitchPresetSysEx(neighbour(rl), FM3))); await sleep(800); port.write(Buffer.from(g.buildSwitchPresetSysEx(rl, FM3))); await sleep(800); }
port.close(); console.log('fixed', fixed);
