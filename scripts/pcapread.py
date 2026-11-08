"""Reads a USBPcap .pcap file: lists devices/endpoints, or dumps bulk payloads.
Usage: pcapread.py <file> [summary]
       pcapread.py <file> dump <device> [out.txt]
"""
import struct, sys
from collections import Counter

def packets(path):
    with open(path, 'rb') as f:
        h = f.read(24)
        if len(h) < 24:
            return
        magic = struct.unpack('<I', h[:4])[0]
        if magic != 0xa1b2c3d4:
            raise SystemExit('bad magic %x' % magic)
        while True:
            r = f.read(16)
            if len(r) < 16:
                return
            sec, usec, incl, orig = struct.unpack('<IIII', r)
            d = f.read(incl)
            if len(d) < incl:
                return
            hlen, irp, status, func, info, bus, dev, ep, tr, dlen = struct.unpack('<HQIHBHHBBI', d[:27])
            yield sec + usec / 1e6, bus, dev, ep, tr, info, dlen, d[hlen:]

def summary(path):
    c = Counter(); b = Counter()
    for t, bus, dev, ep, tr, info, dlen, data in packets(path):
        k = (bus, dev, hex(ep), {0: 'iso', 1: 'int', 2: 'ctrl', 3: 'bulk'}.get(tr, tr))
        c[k] += 1; b[k] += len(data)
    for k in sorted(c, key=str):
        print(k, c[k], 'packets', b[k], 'bytes')

def dump(path, device, out):
    w = open(out, 'w') if out else sys.stdout
    t0 = None
    for t, bus, dev, ep, tr, info, dlen, data in packets(path):
        if dev != device or tr != 3 or not data:
            continue
        t0 = t0 or t
        w.write('%9.4f %s %3d %s\n' % (t - t0, 'IN ' if ep & 0x80 else 'OUT', len(data), data.hex(' ')))

if __name__ == '__main__':
    p = sys.argv[1]
    if len(sys.argv) > 2 and sys.argv[2] == 'dump':
        dump(p, int(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else None)
    else:
        summary(p)
