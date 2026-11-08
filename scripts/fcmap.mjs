// Footswitch tables shared by fm3fc.mjs (system layouts) and fm3syx.mjs pp (per-preset switches).
export const CAT = ['Unassigned', 'Bank', 'Preset', 'Scene', 'Effect', 'Utility', 'Layout', 'Control Switch', 'Looper', 'Per-Preset', 'View', 'Setlist', 'Song', 'Song Section'];
export const FUNC = { Effect: ['Bypass', 'Chan Select', 'Chan Toggle', 'Chan Inc/Dec'], Utility: ['Tuner', 'Tap Tempo', 'Amp Level+Save', 'Reveal Hold', 'Scene Level+Save'] };
// Effect block numbers: alphabetical over a longer internal list. Verified 2026-11-08 marked; 6, 15, 16 and 31-37 hidden/unsure.
export const BLOCK = ['Amp 1', 'Cab 1', 'Chorus 1', 'Chorus 2', 'Comp 1', 'Comp 2', '?6', 'Delay 1', 'Delay 2', 'Drive 1', 'Drive 2', 'Enhance 1', 'Enhance 2',
  'FB Rtn 1', 'FB Rtn 2', '?15', '?16', 'Filter 1', 'Filter 2', 'Filter 3', 'Filter 4', 'Flanger 1', 'Flanger 2', 'Formant 1', 'Formant 2', 'Gate 1', 'Gate 2',
  'GEQ 1', 'GEQ 2', 'In 1', 'In 2', '?31', '?32', '?33', '?34', '?35', '?36', '?37', 'MultDly 1', 'MultPlx 1', 'MultPlx 2', 'Out 1', 'Out 2', 'PEQ 1', 'PEQ 2',
  'Phaser 1', 'Phaser 2', 'Pitch 1', 'Plex 1', 'Reso 1', 'Reso 2', 'Reverb 1', 'RingMod 1', 'Rotary 1', 'Rotary 2', 'Synth 1', 'Ten-Tap 1', 'TremPan 1', 'TremPan 2',
  'Vol/Pan 1', 'Vol/Pan 2', 'Wah 1', 'Wah 2'];
