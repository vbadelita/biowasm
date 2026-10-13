// JavaScript replacement for MAFFT's `mafft` bash driver (core/mafft.tmpl), covering
// FFT-NS-2 (default), FFT-NS-i, L-INS-i, --auto and --add / --addfragments with
// --keeplength, for nucleotides ("nt") and amino acids ("aa").
//
// The argument lists were copied from `bash -x` traces of the native v7.526 driver
// running single-threaded. Every program reads and writes files in one working
// directory (infile, pre, hat2, ...), as the bash driver does in its temp folder.
//
// The driver does not depend on how the programs are run. Pass a `runner` with:
//   run(program, args) -> Promise<string>   run a program in the working dir, return stdout
//   write(name, text), read(name) -> string, rename(from, to)
// See aioliRunner() below for the biowasm/Aioli version and test/node-runner.mjs for Node.

const parseFasta = text => {
	const recs = []; let cur = null;
	for (const line of text.split(/\r?\n/)) {
		if (line.startsWith(">")) recs.push(cur = { name: line.slice(1), seq: "" });
		else if (cur) cur.seq += line.trim();
	}
	return recs;
};
const toFasta = recs => recs.map(r => `>${r.name}\n${r.seq}\n`).join("");

// The native driver passes -P for --amino; nucleotides are auto-detected.
const T = type => (type === "aa" ? ["-P"] : []);
const DIST_FFT = (type, extra = []) => ["-q", "0", "-E", "2", "-V", "-1.53", "-s", "0.0", "-W", "6", "-O", ...extra,
	"-C", "0-0", ...T(type), "-b", "62", "-g", "0", "-f", "-1.53", "-Q", "100.0", "-h", "0", "-F", "-X", "0.1", "-x", "100"];

/**
 * @param {object} o
 * @param {object} o.runner  see above
 * @param {string} o.input   FASTA; for add/addfragments, the existing (aligned) reference
 * @param {string} [o.add]   FASTA of sequences to add (add/addfragments only)
 * @param {"auto"|"fftns2"|"fftnsi"|"linsi"|"add"|"addfragments"} [o.mode]
 * @param {"nt"|"aa"} [o.type]
 * @returns {Promise<{fasta: string, mode: string, steps: {program: string, ms: number}[]}>}
 */
export async function mafft({ runner, input, add = null, mode = "auto", type = "nt" }) {
	const recs = parseFasta(input);
	const steps = [];
	const step = async (program, args) => {
		const t0 = performance.now();
		const out = await runner.run(program, [...args, "-i", "infile"].map(String));
		steps.push({ program, ms: Math.round(performance.now() - t0) });
		return out;
	};
	await runner.write("infile", toFasta(recs));

	// --auto: same thresholds as the bash driver.
	if (mode === "auto") {
		const nseq = recs.length, nlen = Math.max(...recs.map(r => r.seq.length));
		mode = nlen < 3000 && nseq < 100 ? "linsi" : nlen < 1000 && nseq < 200 ? "linsi2" : nlen < 10000 && nseq < 500 ? "fftnsi" : "fftns2";
	}

	if (mode === "fftns2" || mode === "fftnsi") {
		await runner.write("pre", await step("disttbfast", DIST_FFT(type)));
		if (mode === "fftnsi") {
			await runner.rename("pre", "infile");
			await step("dndpre", ["-y", "hat2", ...T(type), "-b", "62", "-M", "2", "-C", "0"]);
			await step("dvtditr", ["-W", "0.00001", "-E", "0.0", "-s", "0.0", "-C", "0", "-t", "0", "-F", "-z", "50", ...T(type), "-b", "62", "-f", "-1.53", "-Q", "100.0", "-h", "0", "-I", "2", "-X", "0.1", "-p", "BAATARI2", "-K", "0"]);
		}
	} else if (mode === "linsi" || mode === "linsi2") {
		const it = mode === "linsi" ? "16" : "2";
		await step("tbfast", ["_", "-u", "0.0", "-l", "2.7", "-C", "0", ...T(type), "-b", "62", "-g", "-0.100", "-f", "-2.00", "-Q", "100.0", "-h", "0.1", "-L", "_", "-+", it, "-W", "0.00001", "-V", "-1.53", "-s", "0.0", "-O", "-C", "0", ...T(type), "-b", "62", "-f", "-1.53", "-Q", "100.0", "-h", "0", "-F", "-l", "2.7", "-X", "0.1"]);
		await runner.rename("pre", "infile");
		await step("dvtditr", ["-W", "0.00001", "-E", "0.0", "-s", "0.0", "-C", "0", "-t", "0", "-F", "-l", "2.7", "-z", "50", ...T(type), "-b", "62", "-f", "-1.53", "-Q", "100.0", "-h", "0", "-I", it, "-X", "0.1", "-p", "BAATARI2", "-K", "0"]);
	} else if (mode === "add" || mode === "addfragments") {
		const addRecs = parseFasta(add);
		const n = addRecs.length;
		await runner.write("infile", toFasta(recs) + toFasta(addRecs));
		await runner.write("_addfile", toFasta(addRecs));
		if (mode === "add") {
			await runner.write("pre", await step("disttbfast", DIST_FFT(type, ["-K", "-I", n, "-Y"])));
		} else {
			const ADD = ["-K", "-I", n, "-g", "-0.01", "-C", "0", ...T(type), "-b", "62"];
			// The bash driver renames hat2 after each step; without this addsingle stops silently.
			await step("dndpre", ["-y", "hat2", "-b", "62", "-M", "2", ...ADD, "-g", "-0.100", "-f", "-2.00", "-h", "0.1"]);
			await runner.rename("hat2", "hat2i");
			await step("pairlocalalign", ["-l", "2.7", ...ADD, "-g", "-0.100", "-f", "-2.00", "-Q", "100.0", "-h", "0.1", "-Y"]);
			await runner.rename("hat2", "hat2n");
			await step("addsingle", ["-Q", "100", "-d", "-O", "-K", "-I", n, "-g", "-0.01", "-Y", "-C", "0", ...T(type), "-b", "62", "-f", "-1.53", "-h", "0", "-F", "-l", "2.7", "-X", "0.1"]);
		}
	} else throw new Error("unknown mode " + mode);

	const fasta = await runner.read("pre");
	if (!/^>[^\n]*\n[^>\s]/m.test(fasta)) throw new Error("MAFFT produced no alignment");
	return { fasta, mode, steps };
}

// Runner for Aioli (biowasm.com/cdn/v3/aioli.js), loaded with all six programs, e.g.
//   const CLI = await new Aioli(["base/1.0.0", ...["disttbfast","dndpre","pairlocalalign","addsingle","tbfast","dvtditr"]
//     .map(program => ({ tool: "mafft", version: "7.526", program, reinit: true }))],
//     { printInterleaved: false });   // keep stderr out of the alignment
// reinit: true gives each run a fresh heap, as separate processes would; Aioli then needs
// base/1.0.0 as the (reinit: false) module that holds the shared file system.
export function aioliRunner(CLI) {
	return {
		run: async (program, args) => {
			const out = await CLI.exec(program, args);
			if (typeof out === "string") throw new Error("create Aioli with { printInterleaved: false }");
			return out.stdout;
		},
		write: (name, text) => CLI.fs.writeFile(name, text),
		read: name => CLI.fs.readFile(name, { encoding: "utf8" }),
		rename: (a, b) => CLI.fs.rename(a, b),
	};
}
