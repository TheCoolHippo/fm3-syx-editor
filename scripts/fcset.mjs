// Live footswitch edit, same message FM3-Edit sends (fn 0x01 sub 0x09 on block 199), no reboot needed.
// node fcset.mjs <pid> <value> [<pid> <value> ...]   value = float (category, function, scene, block number ...)
// pid map (i = layout*12 + view*3 + switch, 0-based): tap cat i, tap func 108+i, tap label 216+i, tap params 324+6i+k,
// hold cat 972+i, hold func 1080+i, hold label 1188+i, hold params 1296+6i+k, colour 4618+i (from one sample).
// Only pids seen in FM3-Edit captures are known safe. Never send GETs (sub 0x1a/0x1b) to block 199 for unknown pids.
import { createRequire } from 'node:module';
import { PORT } from './local.mjs';
const ROOT = (process.env.MCP_MIDI_ROOT || (process.env.LOCALAPPDATA || '').split(String.fromCharCode(92)).join('/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/');
const { SerialPort } = createRequire(ROOT)(ROOT + 'serialport');
export function setMsg(pid, value) {
  const f = new DataView(new ArrayBuffer(4)); f.setFloat32(0, value); const u = f.getUint32(0);
  const m = [0xf0, 0x00, 0x01, 0x74, 0x11, 0x01, 0x09, 0x00, 199 & 0x7f, 199 >> 7, pid & 0x7f, pid >> 7,
    u & 0x7f, (u >> 7) & 0x7f, (u >> 14) & 0x7f, (u >> 21) & 0x7f, (u >> 28) & 0x0f, 0, 0, 0, 0];
  let c = 0; for (const b of m) c ^= b; return Buffer.from([...m, c & 0x7f, 0xf7]);
}
const a = process.argv.slice(2);
if (a.length >= 2) {
  const port = new SerialPort({ path: PORT, baudRate: 115200 });
  await new Promise((ok, ko) => port.on('open', ok).on('error', e => ko(new Error(e.message + ' (close FM3-Edit)'))));
  let rx = []; port.on('data', d => rx.push(...d));
  for (let k = 0; k < a.length; k += 2) {
    const msg = setMsg(+a[k], +a[k + 1]); rx = [];
    port.write(msg); await new Promise(r => port.drain(r)); await new Promise(r => setTimeout(r, 300));
    console.log(`pid ${a[k]} = ${a[k + 1]}  sent ${msg.toString('hex')}  reply ${Buffer.from(rx).toString('hex')}`);
  }
  port.close();
}
