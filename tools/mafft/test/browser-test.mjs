// Headless-browser check of the Aioli runner. Serves the biowasm checkout over HTTP and
// opens test/browser.html in Chromium (needs playwright-core and a Chromium/Chrome binary).
// Usage: node browser-test.mjs <port> <build dir rel. to repo> <mode> <nt|aa> <in.fa> [add.fa] > out.fa
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const [port, build, mode, type, inFile, addFile] = process.argv.slice(2);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const extra = { "/in.fa": inFile, "/add.fa": addFile };
const types = { ".js": "text/javascript", ".wasm": "application/wasm", ".html": "text/html" };
const server = http.createServer((req, res) => {
	const p = new URL(req.url, "http://x").pathname;
	const file = extra[p] ? path.resolve(extra[p]) : path.join(ROOT, p);
	fs.readFile(file, (err, data) => {
		if (err) { res.writeHead(404); return res.end(); }
		res.writeHead(200, { "Content-Type": types[path.extname(file)] || "text/plain", "Access-Control-Allow-Origin": "*" });
		res.end(data);
	});
}).listen(+port, "127.0.0.1");

const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/chromium" });
const page = await browser.newPage();
page.on("console", m => process.env.VERBOSE && console.error("[browser]", m.text()));
const qs = new URLSearchParams({ build: `/${build}/`, mode, type, in: "/in.fa", ...(addFile ? { add: "/add.fa" } : {}) });
await page.goto(`http://127.0.0.1:${port}/tools/mafft/test/browser.html?${qs}`);
await page.waitForFunction(() => window.result, null, { timeout: 0 });
const r = await page.evaluate(() => window.result);
await browser.close(); server.close();
if (r.error) { console.error(r.error); process.exit(1); }
process.stdout.write(r.fasta);
console.error(JSON.stringify({ mode: r.mode, seconds: +r.seconds.toFixed(2) }));
