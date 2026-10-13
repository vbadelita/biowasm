#!/usr/bin/env python3
"""Compare two FASTA alignments record by record (line wrapping ignored).
Usage: compare.py a.fa b.fa  -> prints identical rows / total, exits 1 on any difference."""
import sys

def read(path):
    recs, name = [], None
    for line in open(path):
        line = line.rstrip("\n")
        if line.startswith(">"):
            recs.append([line[1:], ""])
        elif recs:
            recs[-1][1] += line.strip()
    return recs

a, b = read(sys.argv[1]), read(sys.argv[2])
same = sum(x == y for x, y in zip(a, b))
caseonly = sum(x != y and x[0] == y[0] and x[1].lower() == y[1].lower() for x, y in zip(a, b))
print(f"{same}/{max(len(a), len(b))} identical rows" + (f", {caseonly} differ only in letter case" if caseonly else ""))
sys.exit(0 if same == len(a) == len(b) else 1)
