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
Blocks 0-31 are the active system, blocks 32-63 a second copy that can lag behind it: compare block 0-31.
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
