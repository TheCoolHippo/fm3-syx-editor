---
name: fm3-syx-editor
description: Read, analyse and edit Fractal FM3 preset save files (.syx) without FM3-Edit — pull a stored preset over USB, list its grid/blocks/channels/scenes/modifiers and every block parameter, change values, swap block types, rename, retarget to another slot, diff two saves, and push the file back into a slot. Use whenever the user asks to look inside, compare, copy or modify an FM3 preset or .syx, build a patch "by file", or when driving FM3-Edit by desktop control would be too slow.
---

# FM3 .syx editor

One script does everything: `scripts/fm3syx.mjs`. It reuses the codec
shipped with mcp-midi-control v0.8.0, so run it with that install's node:

```
N="$LOCALAPPDATA/mcp-midi-control/mcp-midi-control-v0.8.0/node.exe"
"$N" scripts/fm3syx.mjs <command> ...
```

## Commands
| command | what |
|---|---|
| `pull <slot> <out.syx>` | read a STORED preset from the FM3 over COM7 (no FM3-Edit) |
| `info <file>` | slot, name, scenes, grid rows, per-channel block types, scene channel/bypass, modifiers |
| `params <file> <Block[#n]> [ch]` | every parameter of a block: name, raw word, display value |
| `get <file> <Block> <ch> <PARAM>` | one value |
| `set <in> <out> <Block> <ch> <PARAM> <val> ...` | val = display value as the FM3 shows it (`40` Hz, `-12` dB, `3.5`), an option name (`post`, `"Analog Stereo"`), or `raw:N` |
| `scenename <in> <out> <1-8> <name>` | scene name (31 chars) |
| `cell <in> <out> <row> <col> [Block\|Shunt\|empty] [from=1,2\|none]` | grid cell + which rows feed it (cables). Rows/cols 1-based like FM3-Edit |
| `add <in> <out> <row> <col> <Block[#n]> [from=1,2]` | new block with the FM3's own defaults (`defaults/<eid>.bin`) |
| `midi <in> <out> <scene> [pc:ch:val\|cc:ch:num:val\|-]...` | Scene MIDI rows of one scene; add the block with `add ... MIDI` (eid 190, no grid cable). Verified: a rebuilt preset was byte-identical to an FM3-Edit save, and tested on scene change and preset load |
| `midishow <file>` | Scene MIDI rows of all scenes |
| `remove <in> <out> <Block[#n]>` | delete a block (grid cells + record) |
| `scenectl <in> <out> <1-4> <%> [x8]` | Scene Controller 1-4 value per scene (one value = all 8 scenes) |
| `mods <file> [all]` / `mod <in> <out> <1-32> FIELD=val ...` | the 32 modifiers: CTRLID (source name), EFFECTID (block), PARAM (param name), MIN/MAX/STARTPT/MIDPT/ENDPT (`N%` or raw), SLOPE, DAMPING, AUTOENGAGE, PCRESET, SCALE, OFFSET… |
| `type <in> <out> <Block> <ch> <name>` / `types <Block>` | swap / list types (Amp, Reverb, Drive, Delay, Chorus, Comp, Filter, Flanger, Phaser, Wah, Tremolo) |
| `rename <in> <out> <name>` | preset name |
| `slot <in> <out> <N>` | retarget the file to slot N (header + checksum) |
| `diff <a> <b>` | per-param differences, by name |
| `learn <file> <Block> <ch> <PARAM> <display>` | add a raw→display calibration point to `calib.json` |
| `node cpu.mjs [preset]` | live CPU (DSP) load of the loaded preset, as FM3-Edit shows it (switches first if a preset is given). Exit code 2 at 80 % or more |
| `push <file> --yes` | store the file into the slot in its header |

`PARAM` = catalog name (`PITCH_FEEDBACK1`, or just `FEEDBACK1`) or the FM3-Edit label (`Feedback 1`).
`Block#2` picks the second block of that name (Return#2).

## Rules (never break)
- **Protected slots**: list them in `scripts/fm3-local.json` (`{"protected":[383]}`, git-ignored) or `FM3_PROTECTED`; `push` and `harvest.mjs` refuse them.
- `push` = saving on the unit: **ask the user first**, every time, and say which slot.
  Run `pull` of the target slot first so there is a backup of what gets overwritten.
- The FM3 port (COM7, FM3_PORT overrides) is exclusive: close FM3-Edit or use Settings > Pause Communications first; no mcp-midi-control server may hold it.
- Never probe the FC block (effect id 199).
- **CPU: Fractal says never above 80 %.** After every `add` + `push`, load the preset and run `cpu.mjs`;
  at 80 % or more, remove/simplify blocks before keeping it. Add heavy blocks (Amp, Cab, Pitch, Reverb) one at a time.
- Work on copies (`set in out`): keep the pulled original untouched.

## How the file is built (verified 2026-11-03)
- `.syx` = 0x77 header (bytes 6-7 = slot as 14-bit, byte 11 = XOR checksum) + 8 × 0x78
  chunks (compressed patch, CRC-checked) + 0x79 XOR footer. 24,680 bytes per FM3 preset.
  The codec re-compresses and recomputes CRC + footer on every write.
- Decompressed body: block chain; each block has a header (23 words: scene channels,
  scene bypass, …) then a per-channel param array: `rows` channels × `cols` words.
- **Word index = FM3 paramId − 6** (paramIds from `fractal-midi/dist/gen3/fm3`, mined from
  FM3-Edit). Checked on Amp (drive/bass/mid/treble/master/presence/depth), Pitch
  (shift/pan/feedback/mix/level/splice) and Delay (time). ParamIds 0-5 live in header words 17-22 (same formula works).
- Values are raw uint16 0..65534 (same as the live wire), EXCEPT integer params stored as
  plain ints: types/models, enums, tempo divisions, **semitones (signed: 12 = +12, 0 = 0)**.
- Scales checked in FM3-Edit (2026-11-03), stored in `calib.json` next to the canonical script:
  - linear: percent, bipolar_percent, knob 0-10, Pitch feedback 0..100 %, Pitch detune
    −50..+50 ct, levels **−80..+20 dB** (52427 = 0 dB), Delay FEED **−100..+100 %**.
  - log: **Hz = min·(max/min)^(raw/65534)** using the catalog displayMin/Max (Pitch high cut
    200..20000 Hz, 42631 = 4000 Hz). The script does this automatically for unit `hz`.
  - points: Delay TIME 2044 = 500 ms; Reverb TIME 2034 = 3.20 s, 5085 = 7.85 s.
  - tempo enum (DTEMPO/TEMPO): 0 None, 11 1/8, 12 1/8 dot, 13 1/4 trip, 14 1/4, 15 1/4 dot.
  - Pitch TYPE (paramId 0): 8 = Crystal Echoes. Delay type = **DELAY_MODEL** (not DELAY_TYPE):
    13 = Ambient Stereo, 2 = Analog Mono, 24 = Wandering Delays (`types Delay`).
  - Cab → DynaCab: `CABINET_MODE raw:1` + `DYNACAB_TYPE1/2 raw:<id>` (`types DynaCab`;
    FM3-Edit shows id+1, 29 = "30: 2x12 Texas Star"), `AUTO_ALIGN raw:1`.
  Unknown scale? Set a raw guess, push, read FM3-Edit, add the point (`learn`).
- Block header: word −1 = scene-1 channel, words 0..6 = scenes 2-8 channel (0=A..3=D),
  words 7..14 = scene 1-8 bypass (1 = bypassed); `scene` command edits them.
- The FM3 stores a pushed dump straight into the slot in its header (no extra save).

## Coverage (2026-11-03)
- **Control block** = the whole Controllers menu (tempo, LFO 1/2, ADSR 1/2, sequencer, envelope, Manual
  1-5, Scene Controllers): family CONTROLLERS, eid 2, 130 params × 4 channels, right after the grid
  (body 0x1c4). Edit it like any block: `set f out Control A TEMPO raw:120` (tempo = plain BPM),
  `params f Control A`. The codec's scene-controller offset is wrong (off by 9 words); use `scenectl`.
- Verified on the FM3 in FM3-Edit: scene names, grid cells/cables, `add`/`remove`, modifier
  (`mod 2 CTRLID="LFO 1A" EFFECTID=Delay PARAM=MIX MIN=10% MAX=40%` made the Delay mix move),
  Scene Controllers, tempo.
- Live output meter (sub 0x2E `parseGen3LiveMeters` output_left/right) returns random values with no
  signal: not usable. Scene loudness has to be measured by USB re-amp recording instead.
- **scales.json**: 1,390 params of 34 block families calibrated against the FM3's own display text
  (`calibrate.mjs` sweeps each param live and reads the echo; `calfix.mjs` second pass). Continuous params
  are fitted lin/log or interpolated; enums map names both ways. calib.json (hand-checked) wins over it.
  Not covered: params with no text (some MIX/graph params, 73 entries empty), Plex (FM3 refused to place it).
- **Every record** in the body = eid word + 5 words + 23-word header + cols×rows words. Order: 32 MOD
  records (eid 3..34 = modifiers 1..32), the blocks, then eid 201 and eid 200 (per-preset footswitch data,
  1525 words: read-only knowledge, never probe it live). The codec names blocks by size and gets some wrong
  (Input/Output shown as Vol/Pan/PEQ); fm3syx relabels them.
- A block put only in the grid comes up with ALL params at 0 (level −80 dB): always use `add`, which
  inserts the default record harvested from the FM3 (`harvest.mjs <scratchSlot> <restore.syx> [eids]`,
  one block per batch with `BATCH=1`: placing many heavy blocks at once froze the FM3 once).
- A never-saved slot (`<EMPTY>`) uses another container the codec can't decode: pull it after one store.

## Works without FM3-Edit
Everything here talks to the FM3 directly over USB (COM7 by default, set FM3_PORT if the port changed): `pull`, `push`, `switch.mjs`, `cpu.mjs`,
`fm3ctl.mjs` (scene select, looper buttons), `levels.py` (scene loudness by USB recording).
FM3-Edit is NOT needed. Verify a change without it: `push` → `pull` again → `cmp`/`diff` (0 bytes =
the FM3 stored exactly what was sent) → `switch.mjs <other>` then `switch.mjs <slot>` to load it →
`cpu.mjs` (< 80 %). FM3-Edit was only used while building the skill, to eyeball results.
## Global (Setup) settings — `fm3sys.mjs` + `sendsys.mjs` (verified 2026-11-03)
Globals are not in presets. They travel as a whole **system bank** of 197 kB, 66 frames. Read it with
`node pullsystem.mjs <out.syx>` (FM3-Edit closed, read-only, request fn 0x43 as sent by Fractal-Bot,
captured by USBPcap 2026-11-06; output byte-identical to a Fractal-Bot `FM3-<date>-system+gb+fc.syx`).
The bank holds **two copies** (words 0.. and 32768.., each with its own header and CRC). The FM3 writes the
OLDER copy and bumps a save counter at copy + 14874, so the newest copy alternates. `fm3sys.mjs` and
`fm3fc.mjs` write every edit into both copies.
- Format: fn 0x51 header, 64 × fn 0x52 chunks (2-byte index + 1024 words, 3 septets per word), fn 0x53
  footer (XOR of all words). NOT compressed. Word 0 = 0x1008, word 1 = 0xAA55, word 2 = CRC-CCITT
  (poly 0x1021, **init 0xAA55**) over bytes 8 .. 8 + word 3, word 3 = data length (29760).
  **GLOBAL catalog param p = word 4 + p** (IN1_SOURCE 61, MIDI_CHAN 68 (0-based), LINEFREQ 112, DISPLAY_OFFSET 72…).
- `fm3sys.mjs get <file> IN1_SOURCE` / `set <in> <out> IN1_SOURCE 1` / `diff a b` / `check file`
  (fixes CRC, footer and frame checksums; an unchanged round trip is byte-identical).
- MIDI/Remote tables (verified 2026-11-05 by a write, a read back and MC8 tests): Bypass word 138 + block id, Channel word 394 + block id, External n word 1305 + n; 128 = none. Edit with `fm3sys.mjs setword <in> <out> <word> <raw>...`. Modifier sources External 6..16 = ids 19..29.
- `sendsys.mjs <file> --yes` writes the whole bank (FM3 answers fn 0x64 code 0 per frame). Tested: Display
  Offset 1 → 0 by file, then a fresh backup matched the sent file exactly.
- Rules: always start from a FRESH backup (it holds every global + FC layouts); ask the user before sending;
  keep the original backup to restore. Never probe for other request codes.

## Footswitch layouts — `fm3fc.mjs` (stored) + `fcset.mjs` (live) (verified 2026-11-08)
The 8 layouts + Master Layout are in the system bank, so no FC-block probing is needed.
Switch index **i = layout × 12 + view × 3 + switch** (0-based; layout 8 = Master Layout). Offsets in a copy:
| Field | Tap | Hold |
|---|---|---|
| category (0 Unassigned, 1 Bank, 2 Preset, 3 Scene, 4 Effect, 5 Utility, 6 Layout, 7 Control Switch, 8 Looper, 9 Per-Preset, 10 View, 11 Setlist, 12 Song, 13 Song Section) | 1658 + i | 2630 + i |
| function (FM3-Edit menu order: Utility 0 Tuner 1 Tap Tempo 2 Amp Level+Save 3 Reveal Hold 4 Scene Level+Save; Effect 0 Bypass 1 Chan Select 2 Chan Toggle 3 Chan Inc/Dec) | 1766 + i | 2738 + i |
| label mode (Scene: 0 Name, 1 Number, 2 Custom; Effect: 0 Long Name, 1 Short Name, 2 Long Name + Channel, 3 Short Name + Channel, 4 Custom) | 1874 + i | 2846 + i |
| params, 6 words (preset/scene/layout number 1-based; Effect = [block, channel]; Inc/Dec = [step, wrap, lower, upper], step 65535 = -1) | 1982 + 6i | 2954 + 6i |
| custom label, 10 chars + 0 | 3623 + 11i | 4811 + 11i |
Layout names at 1370 + 32 × layout; colour at 6000 + i (0 default, 1 red, 2 orange…).
Effect block numbers follow an alphabetical internal list with hidden entries; the table is in `fm3fc.mjs`
(verified: Amp 1 0, Cab 1 1, Chorus 1 2, Comp 1 4, Delay 1 7, Drive 1 9, Drive 2 10, Enhance 1 11, Filter 1 17,
Flanger 1 21, Gate 1 25, GEQ 1 27, In 2 30, MultDly 1 38, Phaser 1 45, Pitch 1 47, Plex 1 48, Reverb 1 51,
Rotary 1 53, TremPan 1 57, Vol/Pan 1 59, Vol/Pan 2 60, Wah 1 61).
- `fm3fc.mjs show <system.syx> [layout]` lists every switch; `set <in> <out> <layout> <view> <switch> tap=Effect param="Wah 1" ...`
  edits both copies. A file sent with `sendsys.mjs` is stored but the running FM3 keeps its layouts in RAM
  until a **power cycle** (and any system save before that overwrites the edit).
- **Live, no reboot**: FM3-Edit edits one parameter of block 199 with fn 0x01 sub 0x09:
  `F0 00 01 74 11 01 09 00 47 01 <pid lo> <pid hi> <float32 as 5 septets, LSB first> 00 00 00 00 <xor> F7`.
  Parameter id = stored offset − 1658 (tap category i, tap function 108 + i, tap params 324 + 6i + k,
  hold category 972 + i, tap label mode 216 + i); from the text area on the ids are shifted by +276: tap custom
  text 2241 + 11i (one parameter per character, value = character code, 0 after the end), colour 4618 + i.
  `fcset.mjs text <layout> <view> <switch> <TEXT> [mode=N]` renames a switch live. `fcset.mjs <pid> <value> ...` rebuilds the captured messages byte
  for byte; the FM3 applies the change at once and saves it itself. Captured with USBPcap from FM3-Edit.
- Only SET known parameter ids. Never send GETs (sub 0x1a/0x1b) to block 199 for ids you have not seen
  FM3-Edit use: reading unknown FC parameters froze an FM3.

## Per-preset switches — `fm3syx.mjs pp/ppset` (file) + `fcset.mjs pp` (live) (verified 2026-11-08)
They are in the preset itself: record eid 200, data = record start + 23 words. Offsets from there (j = PP number − 1)
are also the live parameter ids on block 200:
| Field | Tap | Hold |
|---|---|---|
| category | j | 216 + j |
| function | 24 + j | 240 + j |
| label mode | 48 + j | 264 + j |
| params (6) | 72 + 6j | 288 + 6j |
| custom text (11) | 432 + 11j | 696 + 11j |

Layout override table at 960 + i (i = layout × 12 + view × 3 + switch, value = PP − 1, 65535 = none); colour 1069 + j.
Codes are the same as the layouts (tables in `fcmap.mjs`).
- `fm3syx.mjs pp <file>` lists them; `ppset <in> <out> <PP> key=value ...` or `ppset ... override L V S PP|none` edits a file
  (a scripted edit reproduced FM3-Edit's file byte for byte).
- `fcset.mjs pp <pid> <value> ...` / `fcset.mjs pp text <PP> <TEXT>` change the loaded preset live (same message as FM3-Edit,
  eid 200). Live edits stay in the edit buffer: store with the save message fn 0x01 sub 0x26
  (`F0 00 01 74 11 01 26 00 00 00 00 00 <slot & 0x7f> <slot >> 7> 00 00 00 00 00 00 00 <xor> F7`) only while that slot is loaded,
  or push a file. Live set + save + pull gave the original preset body back.

## Setlists, Songs, Sections — `fm3song.mjs` (file + live) (verified 2026-11-08)
In the system bank (two copies, same rules as the layouts). Names here are 10 chars, **2 characters per word**, low byte first.
Offsets in a copy (s = song 0-127, k = section 0-5, L = setlist 0-3, n = slot 0-31):
| Item | Word | Value |
|---|---|---|
| song name | 8694 + 5s | text |
| section name | 9334 + 5(6s + k) | text |
| section preset | 13174 + 6s + k | preset + 1, 0 = None |
| section scene | 13943 + 6s + k | 1-8, 0 = Default |
| setlist slot | 14712 + 32L + n | song number, 0 = empty |
| setlist name | 14841 + 5L | text |

Live: FM3-Edit sends the usual SET (fn 0x01 sub 0x09) on block 1 with **pid = word − 4**; the FM3 stores it itself.
`fm3song.mjs show <sys.syx>`, `set <in> <out> <op>`, `live <op>`; ops `song N NAME`, `sect S K name= preset= scene=`,
`setname L NAME`, `slots L song song ...`. A scripted file matched FM3-Edit's result; a live edit read back as sent.
Active setlist: word 14861 (0-3), `fm3song.mjs ... active <1-4>`.

## Other Setup parameters live — `fcset.mjs sys` (verified 2026-11-08)
FM3-Edit changes Setup values with the same SET on **block 1, pid = system-bank word − 4**, and the FM3 saves them itself.
`fcset.mjs sys <pid> <value> ...` sends them. Words checked (value as FM3-Edit shows unless noted):
| Word | Setting |
|---|---|
| 70 | FC Hold Function Timeout (index: 0 = 0.25 s, 1 = 0.50, 2 = 0.75, 3 = 1.00 …) |
| 112 | Main display Preset Num (1 On, 0 Off) |
| 6990 / 7014 / 7038 / 7062 / 7086 + idx | CS MIDI type (1 CC) / channel / number / on / off value (65535 = --), idx = CS × 4 + command |
| 7111 + CS | Control switch Exclusive (1 yes) |
| 7426 | Hold Function Mode (0 Automatic, 1 Switch Up) |
| 8297 | Footswitch Tuner Mode (1 Enabled) |
| 8686 | Bank Switch Limits (**1 = Disabled, 0 = Enabled**) |
| 3606 | FM3 Startup Layout (1-based, as displayed) |
| 8690 | FM3 Startup View |
| 14861 | Active setlist (0-3) |
| 6108 + c | Ring colour of FC category c (same codes as switch colours; 0 seems to mean the default) |
| 7394 + r / 7406 + r | Stand-In row r (FM3 SW1 Tip, SW1 Ring, SW2 Tip, SW2 Ring, FC1 SW1-4, FC2 SW1-4): layout / switch, 0-based, 65535 = none (send **-1** live: 65535 is clamped) |

### Setup pages (Config, Audio, Scales, Out EQ, MIDI/Remote)
Every Setup parameter is system word w = block-1 pid + 4, and the FM3 saves Setup changes by itself.
- `getsys.mjs <from> <to>` reads block-1 parameters live with FM3-Edit's GET (fn 0x01 sub 0x1a). The reply carries the FM3's own display text, MSB-first 7-bit packed from byte 21, for example "0.50 SECONDS", "CC #72" or "1536". It is read-only; use it on block 1 only, never on block 199.
- `fm3setup.mjs list | show [filter] | set <name> <raw>` gives about 90 named parameters with their word numbers. Each is marked verified (changed in FM3-Edit and seen moving) or named from the display text.
- Tables: bypass CC 138+eid, channel CC 394+eid, MIDI mapping PC n -> preset 650+n and scene 778+n, custom scales 906+12*scale+note, External Control n CC 1305+n and initial value 1321+n. CC values are 0-127, and 128 means None (send 128 live).
- Out 1/2 graphic EQ (verified): Out 1 words 19-29, Out 2 words 30-40, each = 31, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz, Level. Stored as 32767 + dB/12*32767 (±12 dB); a live SET takes dB (send 0 for flat, not 32767). EQ type is at 8651/8652 (0 Off, 1 Graphic, 2 Parametric).
- MIDI/Remote: Send MIDI PC word 77 (0 Off, 1-16 channel, 17 Omni); Other tab Scene Select CC word 94, Preset Decrement CC word 120 (verified).
- Config Spillover is word 11 (4 All, 1 Delay; verified), not to be confused with Gapless at 14877.
- The fractal-midi FM3 catalog (GLOBAL family, paramId = pid = word - 4) names most Setup words and agrees with every word verified by FM3-Edit diffs; `fm3setup.mjs` now lists about 180 names including the front-panel-only pages: tuner config and offsets (9-18, 104, 8649-8650), Pedal page (setup 78-79, switch polarity 7418-7421, behaviour 7422-7425), Tone Control Display 134, Out 2 type/level 8684/8683, USB levels 127-128, metronome levels 123-125, FC display/ring settings, Main LCD display mode 14868, ring colours of the later categories (View 7430, Setlist 14869, Song 14870, Section 14871). Options were probed live (SET each value, read the text, restore).
- Words 41-68, 106-107, 126-136 are the Axe-Fx III layout (inputs/outputs 3-4, IR capture, word clock, USB 5-8) and do nothing on the FM3. Still unresolved: 7431 and 14881 (Off/On, one is probably MIDI Thru), 14880 (Legacy/Red/.../Magenta, Logo Color on the Axe-Fx III), 14876, 8689.
- Word 103 is the USB buffer size, not a footswitch setting.

Stand-In Switches and Ring Colors exist only on the FM3 front panel (not in FM3-Edit); decoded from a front-panel change + system diff,
then set back live. `fm3fc.mjs show <sys.syx>` lists them.

## Performance pages — `fm3perf.mjs` + `fm3syx.mjs perf/perfset` (verified 2026-11-08)
Two pages of 10 controls with the same layout (k = slot 0-9, offsets from the page base): control type k (0 empty, 1 knob, 2 list/button, 7 on/off switch), block effect id 10 + k
(Amp 1 = 58, Reverb 1 = 66 …), parameter id 20 + k (the block's own parameter ids), label line 1 30 + 16k, line 2 190 + 16k
(one char per word, 0-terminated).
- **Global page:** system bank, base word 8299. Live: block 1, pid = word − 4. `fm3perf.mjs show <sys.syx>`, `set`, `live global <op>`.
- **Per-preset page:** preset record eid 201, base = record start + 23. Live: block 201, pid = offset (edit buffer, save the preset).
  `fm3syx.mjs perf <file>`, `perfset <in> <out> <op>`, `fm3perf.mjs live pp <op>`.
- ops: `slot <1-10> <Block n | effect id> <param id> [LINE1] [LINE2] [type=1|2|7]`, `clear <1-10>`. FM3-Edit writes type 0, the control, then the type.
Scripted edits matched FM3-Edit's; live edits read back as sent.

## Scene loudness — `levels.py` (verified 2026-11-03 on a test preset)
Re-amps a synthetic plucked-guitar DI (chords + single notes, peak −14 dBFS) through each scene and
records the output. Steps (ask the user first: the guitar input is silent while Input 1 = USB):
1. Fresh system backup → `fm3sys.mjs set <bak> usb.syx IN1_SOURCE 1` → `sendsys.mjs usb.syx --yes`.
2. Close FM3-Edit (ASIO hangs otherwise); load the preset (`switch.mjs <n>`).
3. `python -I levels.py 1 2 3 …` (plays USB 3/4 → Input 1,
   records USB 1/2 = Output 1; prints peak, gated loudness, and dB relative to the first scene).
4. Restore: `sendsys.mjs <bak> --yes`, check Setup > Audio shows Input 1 Source = Analog.
Repeat runs agree within ~0.1 dB. Balance scenes with Output/Amp level, then measure again.

## Verify loop if FM3-Edit happens to be open
FM3-Edit menu **Settings > Pause Communications** frees COM7 (same menu item resumes).
Pause → `pull`/`set`/`push` → reload the preset (`buildSwitchPresetSysEx(n, 0x11)` over
COM7, or the panel) → resume → click the block and zoom the screenshot to read values.
After every push, `pull` again and `diff` against what you sent: 0 bytes = stored exactly.
If FM3-Edit comes up "Disconnected": Settings > Preferences > In/Out = COM7; cancel the update prompt.

## Typical jobs
- **Analyse a preset**: `pull` → `info` → `params` on the blocks of interest. Explain in plain words.
- **Copy a sound**: `params` on the source preset, then `set ... raw:N` on the target.
- **Build a new patch**: start from a pulled preset, `add` blocks, `cell ... from=` for cables, `set`
  values, `scene`/`scenename`, `mod` for modifiers, then `push` (after the user's OK) and check in FM3-Edit.
- **What changed?**: `diff` two pulls (before/after a panel tweak) — this is also how you
  learn an unknown scale.

## Credits / sources
Codec: mcp-midi-control (Apache-2.0, TheAndrewStaker), which reimplements BoodieTraps'
`fractal-syx-codec` (Apache-2.0). Third-party alternatives seen: FracTool / FracPad III
(AlGrenadine, closed source).
