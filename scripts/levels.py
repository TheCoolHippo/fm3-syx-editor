# Measure the FM3 output loudness of each scene of the loaded preset by USB re-amping.
# Needs: global Input 1 Source = USB (Channels 3/4) (fm3sys.mjs IN1_SOURCE 1), FM3-Edit CLOSED (ASIO hangs),
# the nam venv (sounddevice 0.5.6, numpy). Plays a synthetic plucked-guitar DI on USB 3/4 (-> Input 1) and
# records USB 1/2 (= Output 1). Usage: python -I levels.py <scene> [scene ...]
import os, sys, time, subprocess
os.environ['SD_ENABLE_ASIO'] = '1'
import numpy as np, sounddevice as sd

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = os.path.join(os.environ['LOCALAPPDATA'], 'mcp-midi-control', 'mcp-midi-control-v0.8.0', 'node.exe')
scenes = [int(s) for s in sys.argv[1:]] or [1]
asio = [h['name'] for h in sd.query_hostapis()].index('ASIO')
dev = [i for i, d in enumerate(sd.query_devices()) if d['name'] == 'FM3 USB Audio Device' and d['hostapi'] == asio][0]
fs = 48000
db = lambda x: 20 * np.log10(x + 1e-12)

def pluck(freq, dur, amp, rng):
    # Karplus-Strong string: noise burst through a damped delay line, like a picked guitar string
    n = int(dur * fs); p = int(fs / freq); buf = rng.uniform(-1, 1, p); out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]; buf[i % p] = 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return amp * out

def di_signal():
    rng = np.random.default_rng(1); hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    parts = []
    for chord in ([45, 52, 57, 61, 64], [43, 50, 55, 59, 62], [40, 47, 52, 56, 59, 64]):  # A, G, E chords strummed
        x = np.zeros(int(2.5 * fs))
        for k, m in enumerate(chord):
            s = pluck(hz(m), 2.5, 0.5, rng); d = int(k * 0.012 * fs); x[d:] += s[:len(x) - d]
        parts.append(x)
    for m in (57, 60, 64, 69, 67, 64, 62, 60):  # single-note line around A 440
        parts.append(pluck(hz(m), 0.45, 0.8, rng))
    parts.append(np.zeros(int(1.5 * fs)))  # room for delay/reverb tails
    x = np.concatenate(parts); return (x / np.abs(x).max() * 10 ** (-14 / 20)).astype('float32')  # DI peak -14 dBFS

def ctl(*a):
    subprocess.run([NODE, os.path.join(HERE, 'fm3ctl.mjs'), *a], check=True, capture_output=True)

x = di_signal()
sig = np.zeros((len(x), 4), 'float32'); sig[:, 2] = sig[:, 3] = x
res = []
for s in scenes:
    ctl('scene', str(s)); time.sleep(1.0)
    rec = sd.playrec(sig, fs, device=dev, channels=4, dtype='float32', blocking=True)
    y = rec[:, :2].mean(axis=1)
    w = int(0.4 * fs); blocks = np.array([np.sqrt((y[i:i + w] ** 2).mean()) for i in range(0, len(y) - w, w // 4)])
    g = blocks[db(blocks) > db(blocks.max()) - 20]  # gate out the silences
    res.append((s, db(np.abs(y).max()), db(np.sqrt((g ** 2).mean()))))
    print(f'scene {s}: peak {res[-1][1]:6.1f} dBFS   loudness {res[-1][2]:6.1f} dB   (DI in peak {db(np.abs(rec[:, 2]).max()):.1f})', flush=True)
ref = res[0][2]
print('relative to scene', res[0][0], ':', '  '.join(f'S{s} {l - ref:+.1f} dB' for s, _, l in res))
