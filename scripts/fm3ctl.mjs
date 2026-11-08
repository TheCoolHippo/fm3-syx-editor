// Live FM3 controls over USB (no file): node fm3ctl.mjs <cmd> ...
//   scene <1-8>              select a scene
//   looper <record|play|undo|once|reverse|half_speed>   press a looper button
//   looperstate              print the looper state bits
import { createRequire } from 'node:module';
const ROOT = (process.env.MCP_MIDI_ROOT || (process.env.LOCALAPPDATA || '').replace(/\\/g, '/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/');
const g = await import('file:///' + ROOT + 'fractal-midi/dist/gen3/axe-fx-iii/index.js');
const { SerialPort } = createRequire(ROOT)(ROOT + 'serialport');
const FM3 = 0x11;
// Some builders have no model argument and emit the Axe-Fx III id (0x10): retarget to the FM3 and fix the checksum.
function fm3(msg) { const m = [...msg]; if (m[4] === 0x10) { m[4] = FM3; let x = 0; for (let i = 0; i < m.length - 2; i++) x ^= m[i]; m[m.length - 2] = x & 0x7f; } return m; }
const port = new SerialPort({ path: process.env.FM3_PORT || 'COM7', baudRate: 115200 });
await new Promise((a, b) => port.on('open', a).on('error', e => b(new Error(e.message + ' (pause FM3-Edit)'))));
let rx = []; port.on('data', d => rx.push(...d));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [c, a] = process.argv.slice(2);
if (c === 'scene') port.write(Buffer.from(g.buildSetScene(+a - 1, FM3)));
else if (c === 'looper') port.write(Buffer.from(fm3(g.buildSetLooper(a))));
else if (c === 'looperstate') port.write(Buffer.from(fm3(g.buildGetLooperState())));
else { console.log('scene <n> | looper <action> | looperstate'); process.exit(1); }
await sleep(300); port.close();
const hex = Buffer.from(rx).toString('hex');
if (c === 'looperstate') { const i = rx.indexOf(0x0f, 5); const st = rx[i + 1]; console.log('state', st, ['record', 'play', 'overdub', 'once', 'reverse', 'half'].filter((_, k) => st & 1 << k).join(' ') || 'stopped'); }
else console.log(c, a, hex ? 'reply ' + hex.slice(0, 40) : '');
