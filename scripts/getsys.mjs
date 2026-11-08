// Read-only: ask the FM3 for block-1 (Setup/system) parameters with FM3-Edit's GET (fn 0x01 sub 0x1a) and print
// the value and the display text the FM3 sends back. pid = system-bank word - 4. Stops at the first missing reply.
// node getsys.mjs <from> <to> [eid=1]    Never use on block 199 (FC) or 200/201.
import { createRequire } from 'node:module';
import { PORT } from './local.mjs';
const ROOT = (process.env.LOCALAPPDATA || '').split(String.fromCharCode(92)).join('/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/';
const { SerialPort } = createRequire(ROOT)(ROOT + 'serialport');
const [from, to] = process.argv.slice(2).map(Number), eid = 1;
const msb = b => { const s = b.map(x => x.toString(2).padStart(7, '0')).join(''); const o = []; for (let i = 0; i + 8 <= s.length; i += 8) o.push(parseInt(s.slice(i, i + 8), 2)); return o; };
export function getMsg(pid) {
  const m = [0xf0, 0x00, 0x01, 0x74, 0x11, 0x01, 0x1a, 0x00, eid & 0x7f, eid >> 7, pid & 0x7f, pid >> 7, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let c = 0; for (const b of m) c ^= b; return Buffer.from([...m, c & 0x7f, 0xf7]);
}
const port = new SerialPort({ path: PORT, baudRate: 115200 });
await new Promise((ok, ko) => port.on('open', ok).on('error', e => ko(new Error(e.message + ' (close FM3-Edit)'))));
let rx = []; port.on('data', d => rx.push(...d));
for (let pid = from; pid <= to; pid++) {
  rx = []; port.write(getMsg(pid));
  const t = Date.now(); while (Date.now() - t < 600 && !rx.includes(0xf7)) await new Promise(r => setTimeout(r, 5));
  const i = rx.indexOf(0xf0), j = rx.indexOf(0xf7, i);
  if (i < 0 || j < 0) { console.log(pid, 'NO REPLY - stop'); break; }
  const m = rx.slice(i, j + 1); const v = m.slice(12, 17); const u = v.reduce((a, x, k) => a + x * 2 ** (7 * k), 0) >>> 0;
  const f = new DataView(new ArrayBuffer(4)); f.setUint32(0, u);
  const txt = String.fromCharCode(...msb(m.slice(21, -2)).filter(x => x)).split('\0')[0];
  console.log(`${pid}\t${pid + 4}\t${+f.getFloat32(0).toFixed(4)}\t${txt}`);
}
port.close();
