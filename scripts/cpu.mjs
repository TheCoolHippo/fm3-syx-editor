// Read the FM3 CPU (DSP) load of the preset currently loaded: node cpu.mjs [preset]
// Optional preset number: switch to it first (nothing saved).
import { createRequire } from 'node:module';
const ROOT = (process.env.MCP_MIDI_ROOT || (process.env.LOCALAPPDATA || '').replace(/\\/g, '/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/');
const g = await import('file:///' + ROOT + 'fractal-midi/dist/gen3/axe-fx-iii/index.js');
const { SerialPort } = createRequire(ROOT)(ROOT + 'serialport');
const port = new SerialPort({ path: process.env.FM3_PORT || 'COM7', baudRate: 115200 });
await new Promise((a, b) => port.on('open', a).on('error', e => b(new Error(e.message + ' (pause FM3-Edit)'))));
let rx = []; port.on('data', d => rx.push(...d));
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (process.argv[2]) { port.write(Buffer.from(g.buildSwitchPresetSysEx(+process.argv[2], 0x11))); await sleep(1500); }
const reads = [];
for (let i = 0; i < 5; i++) {
  rx = []; port.write(Buffer.from(g.buildRequestGridLayout(0x11))); await sleep(250);
  const s = rx.indexOf(0xf0), e = rx.indexOf(0xf7, s);
  try { reads.push(g.parseGen3LiveMeters(rx.slice(s, e + 1)).cpu_percent); } catch {}
}
port.close();
const cpu = Math.max(...reads);
console.log(reads.length ? `CPU ${cpu.toFixed(1)} % (reads: ${reads.join(', ')})` : 'no reply');
// Fractal: keep the FM3 under 80 % CPU (audio glitches / lock-ups above that)
if (reads.length && cpu >= 80) { console.log('OVER 80 %: remove or simplify blocks before saving'); process.exitCode = 2; }
else if (reads.length && cpu >= 75) console.log('warning: close to the 80 % limit');
