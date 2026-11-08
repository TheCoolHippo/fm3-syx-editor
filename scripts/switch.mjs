import { createRequire } from 'node:module';
const ROOT = (process.env.MCP_MIDI_ROOT || (process.env.LOCALAPPDATA || '').replace(/\\/g, '/') + '/mcp-midi-control/mcp-midi-control-v0.8.0/node_modules/');
const g = await import('file:///'+ROOT+'fractal-midi/dist/gen3/axe-fx-iii/index.js');
const { SerialPort } = createRequire(ROOT)(ROOT+'serialport');
const port = new SerialPort({ path:process.env.FM3_PORT||'COM7', baudRate:115200 }); await new Promise((a,b)=>port.on('open',a).on('error',b));
port.write(g.buildSwitchPresetSysEx(+process.argv[2],0x11)); await new Promise(r=>setTimeout(r,800)); port.close(); console.log('switched');
