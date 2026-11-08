// FM3 Setup pages (Config, Audio, Scales, Out EQ, MIDI/Remote) without FM3-Edit, decoded 2026-11-08 (firmware 12).
// Every Setup parameter is system-bank word w = live pid + 4 on block 1. The FM3 saves Setup changes itself.
// Names: v = verified by changing it in FM3-Edit and seeing the word move; t = named from the display text the FM3 returns.
//   node fm3setup.mjs show [filter]          read the named parameters live (read-only GET, shows the FM3's own text)
//   node fm3setup.mjs set <name> <raw> ...   write raw values (word values, e.g. CC number, 128 = None, menu index)
//   node fm3setup.mjs list                   names, words, notes
// Tables (word = base + index): bypass CC 138+eid, channel CC 394+eid (eid = block effect id, see fm3perf.mjs EFFECT_ID),
// MIDI mapping PC n -> preset 650+n, scene 778+n (0 = As Saved), custom scales 906+12*scale+note (A..G#),
// External Control n (1-16) CC 1305+n, initial value 1321+n. CC values: 0-127, 128 = None.
export const SETUP = {
  // Config
  'reverb-mix': [5, 't'], 'effects-mix': [6, 't'], 'cab-modeling': [7, 't'], 'power-amp-modeling': [8, 't'],
  'tuning-reference': [9, 't'], 'spillover': [11, 't'], 'noisegate-offset': [43, 't'], 'tap-tempo-mode': [44, 't'],
  'display-offset': [76, 'v', '0/1, shared by Config and MIDI pages'], 'default-scene': [109, 'v', '0 As Saved, 1-8'],
  'prompt-on-edit': [110, 'v'], 'ac-line-frequency': [116, 't'], 'edit-on-scene-change': [8685, 'v'],
  'speaker-impedance-curve': [8687, 'v', '0 Default'], 'gapless': [14877, 'v', '2 All, 1 Chan & Scene, 0 Off'],
  'out1-eq-type': [8651, 't', 'inferred next to out2'], 'out2-eq-type': [8652, 'v', '0 Off, 1 Graphic, 2 Parametric'],
  // Audio
  'in1-source': [65, 't'], 'in1-pad': [48, 't'], 'in2-mode': [45, 'v', '0 Stereo, 2 Right Only'], 'in2-pad': [49, 'v', '0 0dB, 2 18dB'],
  'out1-mode': [52, 'v', '0 Stereo, 2 Copy L->R'], 'out1-level': [60, 't'], 'out2-mode': [53, 'v', '0 Stereo, 2 Sum L+R'],
  'out2-phase': [57, 'v', '0 Normal, 1 Invert'], 'out2-boost-pad': [61, 'v', '0 0dB, 1 6dB'],
  'out2-copy': [64, 'v', '2 Output 1, 1 Input 1'], 'spdif-out-source': [67, 'v', '0 Output 1, 1 Output 2'],
  'usb34-record-source': [104, 't'], 'usb-buffer-size': [103, 't', 'index, 5 = 1536'],
  'usb34-playback-dest': [7428, 'v', '0 Input 1, 2 Output 2'],
  // MIDI/Remote general
  'midi-channel': [72, 't'], 'program-change': [73, 't'], 'ignore-redundant-pc': [74, 'v', 'by elimination'],
  'scene-revert': [97, 'v'], 'effect-bypass-mode': [108, 't'], 'send-realtime-sysex': [117, 'v'],
  'receive-midi-clock': [14878, 'v'], 'send-midi-clock': [14879, 'v'],
  // MIDI/Remote Other + Looper (CC, 128 None)
  'cc-tempo-tap': [92, 'v'], 'cc-metronome': [14883, 'v'], 'cc-tuner': [93, 'v'], 'cc-tuner-heel-down': [8296, 'v'],
  'cc-preset-inc': [119, 'v'], 'preset-incdec-start': [121, 't'], 'preset-incdec-end': [122, 't'],
  'cc-scene-inc': [95, 'v'], 'cc-scene-dec': [96, 'v'],
  'cc-in1-volume': [84, 'v'], 'cc-in2-volume': [85, 'v'], 'cc-out1-volume': [88, 'v'], 'cc-out2-volume': [89, 'v'],
  'cc-out1-vol-inc': [98, 'v'], 'cc-out1-vol-dec': [99, 'v'], 'cc-out2-vol-inc': [7117, 'v'], 'cc-out2-vol-dec': [7118, 'v'],
  'cc-looper-record': [1290, 'v'], 'cc-looper-play': [1291, 't'], 'cc-looper-undo': [1292, 't'], 'cc-looper-once': [1293, 't'],
  'cc-looper-reverse': [1294, 't'], 'cc-looper-stop': [1295, 'v'], 'cc-looper-halfspeed': [1296, 't'],
  // FC (see SKILL.md for the rest of FC Config)
  'fm3-startup-layout': [3606, 'v', '1-based'], 'fm3-startup-view': [8690, 'v'],
};
for (let n = 1; n <= 16; n++) { SETUP[`ext${n}-cc`] = [1305 + n, n <= 6 ? 'v' : 't']; SETUP[`ext${n}-init`] = [1321 + n, 't']; }

const [cmd, ...a] = process.argv[1] && import.meta.url === new URL('file:///' + process.argv[1].replace(/\\/g, '/')).href ? process.argv.slice(2) : ['lib'];
if (cmd === 'list') for (const [k, [w, s, n]] of Object.entries(SETUP)) console.log(`${k.padEnd(26)} word ${String(w).padStart(5)}  pid ${w - 4}  ${s}${n ? '  ' + n : ''}`);
else if (cmd === 'show') {
  const { execFileSync } = await import('node:child_process');
  for (const [k, [w]] of Object.entries(SETUP).filter(([k]) => !a[0] || k.includes(a[0]))) {
    const out = execFileSync(process.execPath, [(await import('node:url')).fileURLToPath(new URL('./getsys.mjs', import.meta.url)), String(w - 4), String(w - 4)]).toString().trim();
    console.log(k.padEnd(26), out.split('\t').slice(3).join(' '));
  }
} else if (cmd === 'set') {
  const { send } = await import('./fcset.mjs'); const p = [];
  for (let i = 0; i < a.length; i += 2) { const e = SETUP[a[i]]; if (!e) throw new Error('unknown ' + a[i] + ' (node fm3setup.mjs list)'); p.push([e[0] - 4, +a[i + 1]]); }
  await send(p, 1);
} else if (cmd !== 'lib') console.log('usage: list | show [filter] | set <name> <raw> ...   (see header)');
