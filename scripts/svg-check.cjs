// Static safety checks for SVG icons (no parser, no entity expansion, no network).
'use strict';

function checkSvg(text) {
	const problems = [];
	const head = text.slice(0, 2048).toLowerCase();
	if (/<!doctype\s+html|<html[\s>]/.test(head)) problems.push('looks like an HTML page, not an SVG');
	if (/<!doctype|<!entity/i.test(text)) problems.push('contains a DOCTYPE/ENTITY declaration');
	if (!/<svg[\s>]/i.test(text)) problems.push('no <svg> root element');
	if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(text)) problems.push('missing SVG namespace');
	if (!/viewBox\s*=/i.test(text)) problems.push('missing viewBox');
	if (/<script[\s>]/i.test(text)) problems.push('contains <script>');
	if (/\son[a-z]+\s*=/i.test(text)) problems.push('contains event handler attributes');
	if (/<foreignObject[\s>]/i.test(text)) problems.push('contains <foreignObject>');
	if (/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(text)) problems.push('references an external resource');
	if (/url\(\s*["']?(?!#)/i.test(text)) problems.push('uses url() with an external target');
	if (/javascript:/i.test(text)) problems.push('contains javascript: URL');
	return problems;
}

module.exports = { checkSvg };
