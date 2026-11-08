// FM3 Setup pages (Config, Audio, Scales, Out EQ, MIDI/Remote) without FM3-Edit, decoded 2026-11-08 (firmware 12).
// Every Setup parameter is system-bank word w = live pid + 4 on block 1. The FM3 saves Setup changes itself.
// Names: v = verified by changing it in FM3-Edit and seeing the word move; c = named by the FM3 parameter catalog (fractal-midi,
// which matches every v word) and its live text; p = options probed live (SET each value, read the text, restore) + manual;
// t = named from the display text the FM3 returns; i = inferred from its neighbours.
//   node fm3setup.mjs show [filter]          read the named parameters live (read-only GET, shows the FM3's own text)
//   node fm3setup.mjs set <name> <raw> ...   write values (CC number, 128 = None, menu index; EQ in dB)
//   node fm3setup.mjs list                   names, words, notes
// Tables (word = base + index): bypass CC 138+eid, channel CC 394+eid (eid = block effect id, see fm3perf.mjs EFFECT_ID),
// MIDI mapping PC n -> preset 650+n, scene 778+n (0 = As Saved), custom scales 906+12*scale+note (A..G#),
// External Control n (1-16) CC 1305+n, initial value 1321+n. CC values: 0-127, 128 = None.
export const SETUP = {
  // Config
  'reverb-mix': [5, 't'], 'effects-mix': [6, 't'], 'cab-modeling': [7, 't'], 'power-amp-modeling': [8, 't'],
  'tuning-reference': [9, 't'], 'spillover': [11, 'v', '4 All, 1 Delay'], 'noisegate-offset': [43, 't'], 'tap-tempo-mode': [44, 't'],
  'display-offset': [76, 'v', '0/1, shared by Config and MIDI pages'], 'default-scene': [109, 'v', '0 As Saved, 1-8'],
  'prompt-on-edit': [110, 'v'], 'ac-line-frequency': [116, 't'], 'edit-on-scene-change': [8685, 'v'],
  'speaker-impedance-curve': [8687, 'v', '0 Default'], 'gapless': [14877, 'v', '2 All, 1 Chan & Scene, 0 Off'],
  'out1-eq-type': [8651, 'c'], 'out2-eq-type': [8652, 'v', '0 Off, 1 Graphic, 2 Parametric'],
  // Audio
  'in1-source': [65, 't'], 'in1-pad': [48, 't'], 'in2-mode': [45, 'v', '0 Stereo, 2 Right Only'], 'in2-pad': [49, 'v', '0 0dB, 2 18dB'],
  'out1-mode': [52, 'v', '0 Stereo, 2 Copy L->R'], 'out1-level': [60, 't'], 'out2-mode': [53, 'v', '0 Stereo, 2 Sum L+R'],
  'out2-phase': [57, 'v', '0 Normal, 1 Invert'], 'out2-boost-pad': [61, 'v', '0 0dB, 1 6dB'],
  'out2-copy': [64, 'v', '2 Output 1, 1 Input 1'], 'spdif-out-source': [67, 'v', '0 Output 1, 1 Output 2'],
  'usb34-record-source': [7427, 'c', '0 Input 1, 1 Input 2, 2 Output 2'], 'usb-buffer-size': [103, 't', 'index, 5 = 1536'],
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
  'cc-preset-dec': [120, 'v'], 'cc-scene-select': [94, 'v'], 'send-midi-pc': [77, 'v', '0 Off, 1-16 channel, 17 Omni'],
  'pc-offset': [75, 'c'], 'pc-mapping': [101, 'c', '0 Off, 1 On'],
  // Config (front panel) + Tuner
  'tone-control-display': [134, 'p', '0 Authentic, 1 Ideal'], 'input1-gain': [14875, 'c', 'live SET in display units'],
  'value-knob-push': [111, 'c'], 'tuner-mute': [10, 'c', 'Off / Input / Output'], 'tuner-use-offsets': [12, 'c'],
  'tuner-offset-e1': [13, 'c', 'cents'], 'tuner-offset-b2': [14, 'c'], 'tuner-offset-g3': [15, 'c'], 'tuner-offset-d4': [16, 'c'],
  'tuner-offset-a5': [17, 'c'], 'tuner-offset-e6': [18, 'c'], 'tuner-source': [104, 'c', '0 Input 1'],
  'tuner-downtune': [8649, 'c', 'semitones'], 'tuner-display-mode': [8650, 'c', '0 Mixed, all flats, all sharps'],
  // Audio extras
  'out2-type': [8684, 'c', '0 Unity Gain, 1 Line Level'], 'out2-level': [8683, 'c', '-10 dBV / +4 dBu (Line Level only)'],
  'usb12-playback-dest': [8688, 'c', '0 Output 1, 1 Output 2'], 'usb12-level': [127, 'c', 'dB'], 'usb34-level': [128, 'c', 'dB'],
  // I/O Pedal page (front panel only)
  'pedal1-setup': [78, 'p', '0 Expression, 1 One switch (Tip), 2 Two switches'], 'pedal2-setup': [79, 'p', 'same'],
  'sw1-tip-polarity': [7418, 'p', '0 Normally closed (momentary break), 1 Normally open (make)'], 'sw1-ring-polarity': [7419, 'p'],
  'sw2-tip-polarity': [7420, 'p'], 'sw2-ring-polarity': [7421, 'p'],
  'sw1-tip-behavior': [7422, 'p', '0 Follow hardware, 1 Virtual toggle'], 'sw1-ring-behavior': [7423, 'p'],
  'sw2-tip-behavior': [7424, 'p'], 'sw2-ring-behavior': [7425, 'p'],
  // Metronome
  'metronome': [14882, 'c'], 'metronome-level-out1': [123, 'c', 'dB'], 'metronome-level-out2': [124, 'c'], 'metronome-level-usb': [125, 'c'],
  // FC Controllers / onboard switches (more in SKILL.md: layouts, stand-ins, CS MIDI)
  'fm3-startup-layout': [3606, 'v', '1-based; FC1-3 at 3607-3609'], 'fm3-startup-view': [8690, 'v', 'FC1-3 at 8691-8693'],
  'hold-timeout': [70, 'v'], 'hold-mode': [7426, 'v', '0 Automatic, 1 Switch Up'], 'bank-size': [71, 'c'],
  'bank-switch-limits': [8686, 'v', '1 Disabled, 0 Enabled'], 'mlm-switch-combo-disabled': [5999, 'c'],
  'per-preset-overrides-disabled': [6117, 'c'], 'footswitch-tuner-mode': [8297, 'v'], 'fc6-layout-mode': [7429, 'c'],
  'fc-show-preset-num': [112, 'v'], 'fc-show-scene-num': [113, 'c'], 'ring-bright': [114, 'c', '%'], 'ring-dim': [115, 'c', '%'],
  'message-hold': [7393, 'c'], 'mini-display-brightness': [7119, 'c', '%'], 'mini-display-contrast': [7120, 'c', '%'],
  'invert-mini-displays': [8298, 'c'], 'main-lcd-display-mode': [14868, 'p', '0 Automatic, 1 Always Preset/Scene, 2 Always Song/Section'],
  // Ring colours (0 Off/default, 1 Red, 2 Orange, 3 Yellow, 4 Green, 5 Blue, 6 Cyan, 7 Purple, 8 White, 9 Pink, 10 Teal, 11 Yellow-Green):
  // Unassigned..Looper at 6108-6116 (fm3fc.mjs); the later categories sit elsewhere (values match the colours on the unit):
  'ring-color-view': [7430, 'p'], 'ring-color-setlist': [14869, 'p'], 'ring-color-song': [14870, 'p'], 'ring-color-section': [14871, 'p'],
  'ring-color-per-preset': [6118, 'i', 'by elimination'],
};
// Not settings on the FM3 (Axe-Fx III layout kept in the bank): 41-42 IR capture type/method, 46-47 In3/4 mode, 50-51 In3/4 pad,
// 54-55 Out3/4 mode, 58-59 Out3/4 phase, 62-63 Out3/4 pad, 66 digital input source, 68 word clock, 106-107 Out3/4 copy In1,
// 126 USB 7/8 source, 129-130 USB 5/6 + 7/8 level, 131-133 IR capture processing/delay/deconvolution, 135 AES level, 136 USB mapping.
// State, not settings: 80-83 pedal calibration, 105 last preset, 14874 save counter, 14864-14867 and 14872-14873 (setlist state).
// Unresolved (front panel check needed): 7431 and 14881 (Off/On, one of them is probably MIDI Thru), 14880 (Legacy, Red, Green,
// Blue, Yellow, Cyan, Magenta: Axe-Fx III calls this Logo Color), 14876 (Last Used / 0-3), 8689 (a colour, Off).
// Output EQ (graphic): Out 1 words 19-29, Out 2 words 30-40 = 31, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz, Level.
// Stored 32767 + dB/12*32767; live SET takes dB (send 0 for flat, not 32767).
const BANDS = ['31', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k', 'level'];
BANDS.forEach((b, i) => { SETUP[`out1-eq-${b}`] = [19 + i, i === 0 || i >= 9 ? 'v' : 'i', 'dB']; SETUP[`out2-eq-${b}`] = [30 + i, i === 1 ? 'v' : 'i', 'dB']; });
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
