#!/usr/bin/env bash
# Run every driver mode in Node (WebAssembly) and with native MAFFT (single thread),
# then compare the alignments.  Usage:
#   NATIVE_MAFFT=/path/to/mafft ./bench.sh <build dir> <out dir> nt.fa aa.fa nt_ref.aln nt_frags.fa aa_ref.aln aa_frags.fa [ntsmall.fa]
# ntsmall.fa (e.g. a single gene) is used for nucleotide L-INS-i, which is too slow on whole genomes.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
BUILD=$(realpath "$1"); OUT=$2; NT=$3; AA=$4; NTREF=$5; NTFR=$6; AAREF=$7; AAFR=$8; NTSMALL=${9:-$3}
mkdir -p "$OUT"
now() { date +%s.%N; }
run() {  # name mode type input [add] -- native args...
	local name=$1 mode=$2 type=$3 in=$4 add=$5; shift 6
	local t0=$(now); "$NATIVE_MAFFT" --thread 1 "$@" > "$OUT/$name.native.fa" 2>/dev/null; local t1=$(now)
	node "$HERE/node-runner.mjs" "$BUILD" "$mode" "$type" "$in" $add > "$OUT/$name.wasm.fa" 2> "$OUT/$name.wasm.log"; local t2=$(now)
	printf "%-16s native %7.1fs  wasm %7.1fs  %s\n" "$name" "$(echo "$t1-$t0" | bc)" "$(echo "$t2-$t1" | bc)" \
		"$("$HERE/compare.py" "$OUT/$name.wasm.fa" "$OUT/$name.native.fa")"
}
run nt-fftns2   fftns2       nt "$NT"      ""      -- "$NT"
run aa-fftns2   fftns2       aa "$AA"      ""      -- --amino "$AA"
run nt-auto     auto         nt "$NT"      ""      -- --auto "$NT"
run aa-auto     auto         aa "$AA"      ""      -- --auto --amino "$AA"
run nt-linsi    linsi        nt "$NTSMALL" ""      -- --localpair --maxiterate 1000 "$NTSMALL"
run aa-linsi    linsi        aa "$AA"      ""      -- --localpair --maxiterate 1000 --amino "$AA"
run nt-add      add          nt "$NTREF"   "$NTFR" -- --add "$NTFR" --keeplength "$NTREF"
run nt-addfrag  addfragments nt "$NTREF"   "$NTFR" -- --addfragments "$NTFR" --keeplength "$NTREF"
run aa-addfrag  addfragments aa "$AAREF"   "$AAFR" -- --amino --addfragments "$AAFR" --keeplength "$AAREF"
