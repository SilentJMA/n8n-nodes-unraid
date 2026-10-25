// Deterministic asset copy: src/nodes/**/{*.svg,*.png,*.node.json} -> dist/nodes/** with hash verification.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { checkSvg } = require('./svg-check.cjs');

const root = path.join(__dirname, '..');
const srcRoot = path.join(root, 'src', 'nodes');
const distRoot = path.join(root, 'dist', 'nodes');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function walk(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		return e.isDirectory() ? walk(p) : [p];
	});
}

let failed = false;
const copied = [];
for (const file of walk(srcRoot).sort()) {
	if (!/\.(svg|png)$/i.test(file) && !file.endsWith('.node.json')) continue;
	const data = fs.readFileSync(file);
	if (file.toLowerCase().endsWith('.svg')) {
		const problems = checkSvg(data.toString('utf8'));
		if (problems.length) {
			console.error(`Unsafe or invalid SVG ${path.relative(root, file)}: ${problems.join('; ')}`);
			failed = true;
			continue;
		}
	}
	const target = path.join(distRoot, path.relative(srcRoot, file));
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.copyFileSync(file, target);
	if (sha(fs.readFileSync(target)) !== sha(data)) {
		console.error(`Hash mismatch after copying ${file}`);
		failed = true;
	}
	copied.push(`${path.relative(root, target).split(path.sep).join('/')} sha256=${sha(data)}`);
}
for (const line of copied) console.log(`asset ${line}`);
if (failed) process.exit(1);
