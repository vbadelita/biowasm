# MAFFT

`mafft` itself is a bash script (`core/mafft.tmpl`) that runs compiled programs in
a temporary folder, so it cannot be compiled to WebAssembly. Earlier versions of this
recipe built only `tbfast` and `dvtditr`, the two programs E-INS-i needs (PR #94 and #96).
This recipe builds the six programs that the common modes need, and
`examples/mafft.js` replaces the bash driver:

| Mode | Programs |
|---|---|
| FFT-NS-2 (default), `--add --keeplength` | disttbfast |
| FFT-NS-i | disttbfast, dndpre, dvtditr |
| L-INS-i (`--localpair --maxiterate 1000`), `--auto` on small inputs | tbfast, dvtditr |
| `--addfragments --keeplength` | dndpre, pairlocalalign, addsingle |

No source patches are needed. `ENABLE_MULTITHREAD=` selects MAFFT's single-threaded code path,
the `system()` calls in these programs are on debug or guide-tree-file paths the driver does not use,
and the input is passed with `-i` because MAFFT rewinds it. The build also targets Node and
links NODEFS so the same files can be tested outside a browser. Memory grows up to 4 GB.

## Usage with Aioli

```js
import { mafft, aioliRunner } from "./mafft.js";
const programs = ["disttbfast", "dndpre", "pairlocalalign", "addsingle", "tbfast", "dvtditr"];
const CLI = await new Aioli(["base/1.0.0", ...programs.map(program => ({ tool: "mafft", version: "7.526", program, reinit: true }))],
	{ printInterleaved: false });
const { fasta } = await mafft({ runner: aioliRunner(CLI), mode: "addfragments", type: "nt", input: refAln, add: fragments });
```

## Tests

`test/bench.sh` runs every mode in Node (`test/node-runner.mjs`) and with native MAFFT, then compares
the outputs row by row (`test/compare.py`). `test/browser-test.mjs` runs the Aioli runner in headless Chromium.
`test/bench-results-7.526.txt` shows the results for 200 DENV-1 genomes (10.2–10.8 kb) and 150 DENV-1 E proteins (495 aa; their 1485 nt genes for nucleotide L-INS-i).
`--add`/`--addfragments` use 30 aligned references plus 40 fragments (400–1500 nt or 80–250 aa). Every output is identical to native MAFFT 7.526 run with `--thread 1`.
