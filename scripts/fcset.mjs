// Live footswitch edit, same message FM3-Edit sends (fn 0x01 sub 0x09 on block 199), no reboot needed.
// node fcset.mjs <pid> <value> [<pid> <value> ...]   value = float (category, function, scene, block number ...)
// pid map (i = layout*12 + view*3 + switch, 0-based): tap cat i, tap func 108+i, tap label 216+i, tap params 324+6i+k,
// hold cat 972+i, hold func 1080+i, hold label 1188+i, hold params 1296+6i+k, tap custom text 2241+11i (one char per pid,
// value = char code, 0 after the end), hold text 3429+11i (inferred), colour 4618+i.
// node fcset.mjs text <layout 1-9> <view 1-4> <switch 1-3> <TEXT>   sets tap label mode Custom (Scene 2 / Effect 4: pass mode=N) and text
// Only pids seen in FM3-Edit captures are known safe. Never send GETs (sub 0x1a/0x1b) to block 199 for unknown pids.
import { createRequire } from 'node:module';
import { PORT } from './local.mjs';
import { pathToFileURL } from 'node:url';
const ROOT = (process.env.MCP_MIDI_ROOT || (process.env.LOCALAPPDATA || '').split(String.fromCharCode(92)).join('/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/');
const { SerialPort } = createRequire(ROOT)(ROOT + 'serialport');
export function setMsg(pid, value, eid = 199) {
  const f = new DataView(new ArrayBuffer(4)); f.setFloat32(0, value); const u = f.getUint32(0);
  const m = [0xf0, 0x00, 0x01, 0x74, 0x11, 0x01, 0x09, 0x00, eid & 0x7f, eid >> 7, pid & 0x7f, pid >> 7,
    u & 0x7f, (u >> 7) & 0x7f, (u >> 14) & 0x7f, (u >> 21) & 0x7f, (u >> 28) & 0x0f, 0, 0, 0, 0];
  let c = 0; for (const b of m) c ^= b; return Buffer.from([...m, c & 0x7f, 0xf7]);
}
let a = import.meta.url === pathToFileURL(process.argv[1]).href ? process.argv.slice(2) : [], eid = 199;
// Per-preset switches (current preset, block 200): node fcset.mjs pp <pid> <value> ... | pp text <PP 1-24> <TEXT> [mode=N]
// pid map (j = PP-1): tap cat j, func 24+j, label 48+j, params 72+6j+k, hold cat 216+j, hold func 240+j, hold label 264+j,
// hold params 288+6j+k, tap text 432+11j, hold text 696+11j (inferred), layout override 960+i (value = PP-1, 65535 none), colour 1069+j.
// Changes are live only: save the preset (FM3 or fm3syx push) to keep them.
// System (Setup) parameters, block 1: node fcset.mjs sys <pid> <value> ...  pid = system-bank word - 4 (see fm3song.mjs, SKILL.md)
if (a[0] === 'sys') { eid = 1; a = a.slice(1); }
if (a[0] === 'pp') {
  eid = 200; a = a.slice(1);
  if (a[0] === 'text') { const [, P, txt, mode] = a, j = P - 1; a = [];
    for (let c = 0; c < 11; c++) a.push(432 + 11 * j + c, c < 10 && c < txt.length ? txt.charCodeAt(c) : 0);
    if (mode) a.push(48 + j, +mode.replace('mode=', '')); }
}
if (a[0] === 'text') {
  const [, L, V, S, txt, mode] = a; const i = (L - 1) * 12 + (V - 1) * 3 + (S - 1); a = [];
  for (let c = 0; c < 11; c++) a.push(2241 + 11 * i + c, c < 10 && c < txt.length ? txt.charCodeAt(c) : 0);
  if (mode) a.push(216 + i, +mode.replace('mode=', ''));
}
// send([[pid, value], ...], eid): open the port, send each SET, print the replies
export async function send(pairs, eid = 199) {
  const port = new SerialPort({ path: PORT, baudRate: 115200 });
  await new Promise((ok, ko) => port.on('open', ok).on('error', e => ko(new Error(e.message + ' (close FM3-Edit)'))));
  let rx = []; port.on('data', d => rx.push(...d));
  for (const [pid, v] of pairs) {
    const msg = setMsg(pid, v, eid); rx = [];
    port.write(msg); await new Promise(r => port.drain(r)); await new Promise(r => setTimeout(r, 300));
    console.log(`eid ${eid} pid ${pid} = ${v}  reply ${Buffer.from(rx).toString('hex')}`);
  }
  port.close();
}
if (a.length >= 2) { const p = []; for (let k = 0; k < a.length; k += 2) p.push([+a[k], +a[k + 1]]); await send(p, eid); }
