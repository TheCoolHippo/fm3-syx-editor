# fm3-syx-editor

Read, analyse and edit **Fractal Audio FM3** preset files (`.syx`) without FM3-Edit, and push them back
to the unit over USB. It is also a Claude skill (`SKILL.md`).

What it can do on a preset file:
- list the grid, blocks, channels, scenes, modifiers and every block parameter, shown as on the FM3 screen
  (1,390 parameters calibrated against the unit's own display text, see `scripts/scales.json`)
- set parameters by display value (`40` Hz, `-12` dB), option name (`post`), or raw word
- add / remove blocks (with the FM3's real default values), place blocks and cables on the grid
- scene channels, bypass and names; the 32 modifiers; block type swaps; preset rename; retarget to another slot
- diff two presets parameter by parameter
- pull a stored preset from the FM3 and push a file into a slot (COM port, FM3-Edit paused)

On the system side: read and write the global settings bank (`pullsystem.mjs`, `fm3sys.mjs`, `sendsys.mjs`),
and the **footswitch layouts**: list and edit them in the system bank (`fm3fc.mjs`), or change a switch live
without a reboot, with the same message FM3-Edit sends (`fcset.mjs`). Per-preset switches (PP#1-24 and their layout
overrides) too: in a preset file (`fm3syx.mjs pp`, `ppset`) or live (`fcset.mjs pp`). Details in `SKILL.md`.

## Requirements
- Windows, an FM3 on USB (tested on firmware 12.00)
- [mcp-midi-control](https://github.com/TheAndrewStaker/mcp-midi-control) v0.8.0 installed: the scripts reuse its
  codec (`@mcp-midi-control/fractal-gen3`, `fractal-midi`) and `serialport`. Set `MCP_MIDI_ROOT` to its
  `node_modules/` folder if it is not in `%LOCALAPPDATA%\mcp-midi-control\mcp-midi-control-v0.8.0\`.
- `FM3_PORT` (default `COM7`), or `scripts/fm3-local.json` `{"port":"COM7","protected":[383]}` (git-ignored).

## Quick start
```
N="%LOCALAPPDATA%/mcp-midi-control/mcp-midi-control-v0.8.0/node.exe"
"$N" scripts/fm3syx.mjs pull 383 p383.syx
"$N" scripts/fm3syx.mjs info p383.syx
"$N" scripts/fm3syx.mjs params p383.syx Amp A
"$N" scripts/fm3syx.mjs set p383.syx out.syx Amp A DRIVE 3.5 HPFREQ 40
"$N" scripts/fm3syx.mjs add out.syx out.syx 3 5 Chorus from=2
"$N" scripts/fm3syx.mjs push out.syx --yes
```
Run the script with no arguments for the full command list. See `SKILL.md` for the file format notes.

MC8 Pro tools (bank editor, USB connector, backup format) live in a separate repo:
[mc8-tools](https://github.com/TheCoolHippo/mc8-tools).

## Safety
- `push` overwrites a preset slot. Pull a backup first. Slots listed as protected in `fm3-local.json` or `FM3_PROTECTED` are refused by the script.
- Never read unknown parameters of the footswitch block (199) over SysEx: it froze an FM3 once. `fcset.mjs` only
  sends the SET messages FM3-Edit itself uses.
- `harvest.mjs` places blocks live to read their defaults: keep `BATCH=1` (many heavy blocks at once froze the unit).

## Credits
Codec: mcp-midi-control (Apache-2.0, TheAndrewStaker), itself based on BoodieTraps' fractal-syx-codec (Apache-2.0).
Not affiliated with Fractal Audio Systems.
