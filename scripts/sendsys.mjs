// Send an FM3 system backup (.syx from Fractal-Bot / fm3sys.mjs) over USB: node sendsys.mjs <file> --yes
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const ROOT = (process.env.MCP_MIDI_ROOT || (process.env.LOCALAPPDATA || '').split(String.fromCharCode(92)).join('/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/');
const { SerialPort } = createRequire(ROOT)(ROOT + 'serialport');
const [file, yes] = process.argv.slice(2);
const b = readFileSync(file); const fr = []; let s = 0;
for (let i = 0; i < b.length; i++) if (b[i] === 0xf7) { fr.push(b.subarray(s, i + 1)); s = i + 1; }
if (fr[0][5] !== 0x51 || fr.at(-1)[5] !== 0x53) throw new Error('not a system backup');
if (yes !== '--yes') { console.log(`would send ${fr.length} frames (system settings). Re-run with --yes.`); process.exit(0); }
const port = new SerialPort({ path: process.env.FM3_PORT || 'COM7', baudRate: 115200 });
await new Promise((a, r) => port.on('open', a).on('error', e => r(new Error(e.message + ' (pause FM3-Edit)'))));
let rx = []; port.on('data', d => rx.push(...d));
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const f of fr) { port.write(f); await new Promise(r => port.drain(r)); await sleep(150); }
await sleep(1500); port.close();
console.log(`sent ${fr.length} frames; replies: ${Buffer.from(rx).toString('hex').slice(0, 200) || 'none'}`);
