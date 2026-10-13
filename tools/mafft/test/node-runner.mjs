// Runs the biowasm MAFFT builds in Node: each program gets a fresh Emscripten module
// with a real temporary directory mounted (NODEFS) as its working directory.
// Usage: node node-runner.mjs <build dir> <mode> <nt|aa> <input.fa> [add.fa] > out.fa
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { mafft } from "../examples/mafft.js";

export function nodeRunner(buildDir) {
	const require = createRequire(import.meta.url);
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mafft-"));
	return {
		dir,
		async run(program, args) {
			const out = [];
			const M = await require(path.resolve(buildDir, program + ".js"))({
				// Node 18+ has fetch(), which the Emscripten 2.0.25 glue would use for file paths.
				wasmBinary: fs.readFileSync(path.resolve(buildDir, program + ".wasm")),
				print: s => out.push(s), printErr: s => process.env.MAFFT_VERBOSE && console.error(program + ": " + s),
			});
			M.FS.mkdir("/w"); M.FS.mount(M.FS.filesystems.NODEFS, { root: dir }, "/w"); M.FS.chdir("/w");
			let status = 0;
			try { status = M.callMain(args) ?? 0; } catch (e) { if (e?.name !== "ExitStatus") throw e; status = e.status; }
			if (status) throw new Error(`${program} exited with status ${status}`);
			return out.length ? out.join("\n") + "\n" : "";
		},
		write: (n, t) => fs.writeFileSync(path.join(dir, n), t),
		read: n => fs.readFileSync(path.join(dir, n), "utf8"),
		rename: (a, b) => fs.renameSync(path.join(dir, a), path.join(dir, b)),
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const [buildDir, mode, type, inFile, addFile] = process.argv.slice(2);
	const runner = nodeRunner(buildDir);
	const t0 = performance.now();
	const r = await mafft({ runner, mode, type, input: fs.readFileSync(inFile, "utf8"), add: addFile ? fs.readFileSync(addFile, "utf8") : null });
	process.stdout.write(r.fasta);
	console.error(JSON.stringify({ mode: r.mode, seconds: +((performance.now() - t0) / 1000).toFixed(2), steps: r.steps }));
	fs.rmSync(runner.dir, { recursive: true });
}
