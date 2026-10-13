#!/bin/bash
# Compile the MAFFT programs needed by the `mafft` driver's common modes.
#
# The `mafft` command itself is a bash script (core/mafft.tmpl) that runs these
# programs in sequence, so it cannot be compiled; see examples/mafft.js for a
# JavaScript replacement covering FFT-NS-2, FFT-NS-i, L-INS-i and
# --add/--addfragments --keeplength.
#
#   disttbfast      FFT-NS-1/2 (the default) and --add
#   dndpre          FFT-NS-i guide tree; --addfragments distances
#   pairlocalalign  --addfragments pairwise alignments
#   addsingle       --addfragments
#   tbfast, dvtditr L-INS-i / G-INS-i / E-INS-i and iterative refinement
#
# No source patches are needed:
# - ENABLE_MULTITHREAD= selects MAFFT's single-threaded code path (no pthreads).
# - The system() calls in these programs are in debug-only code or on paths
#   (e.g. user-supplied guide trees) that the driver does not use.
# - Input is passed with -i (MAFFT rewinds its input, so it must be a file).
set -euo pipefail

PROGS="disttbfast dndpre pairlocalalign addsingle tbfast dvtditr"
# node + NODEFS let the same files run (and be tested) in Node.
# Alignments of whole viral genomes can need well over the 16 MB default heap.
FLAGS="$EM_FLAGS -s MAXIMUM_MEMORY=4GB -s TOTAL_STACK=8MB -s ENVIRONMENT=web,worker,node -lnodefs.js"

cd core
emmake make -j"$(nproc)" $PROGS \
	CC=emcc CFLAGS="-O3" ENABLE_MULTITHREAD= \
	LDFLAGS="-O3 $FLAGS"

for prog in $PROGS; do
	cp "$prog" "../../build/$prog.js"
	cp "$prog.wasm" "../../build/$prog.wasm"
done
