import { describe, expect, it } from 'vitest';

import { analyzeHealth, classifyLogLine, summarizeFindings } from '../lib/analysis';
import { matchContainer } from '../lib/containers';
import { filterLogLines, invalidPatternReason, splitLogContent } from '../lib/logs';

describe('classifyLogLine', () => {
	it.each([
		['Oct 24 03:12:01 Tower kernel: ata3.00: failed command: READ FPDMA QUEUED', 'disk-io-error', 'critical'],
		['Oct 24 03:12:01 Tower kernel: blk_update_request: I/O error, dev sdc, sector 1234', 'disk-io-error', 'critical'],
		['Oct 24 kernel: BTRFS error (device nvme0n1p1): bdev /dev/nvme0n1p1 errs: wr 0, rd 0, flush 0, corrupt 3', 'filesystem-corruption', 'critical'],
		['Oct 24 kernel: Out of memory: Killed process 4242 (java)', 'out-of-memory', 'critical'],
		['Oct 24 kernel: mce: [Hardware Error]: Machine check events logged', 'hardware-mce', 'critical'],
		['Oct 24 kernel: Call Trace:', 'kernel-trace', 'critical'],
		['Oct 24 sshd[123]: Failed password for root from 45.1.2.3 port 22 ssh2', 'auth-failure', 'warning'],
		['Oct 24 kernel: eth0: Link is Down', 'network', 'warning'],
		['Oct 24 nginx: something failed to load', 'generic-error', 'info'],
		['Fatal error: database disk image is malformed', 'app-fatal', 'warning'],
		['Traceback (most recent call last):', 'app-fatal', 'warning'],
	])('%s -> %s', (line, rule, severity) => {
		const match = classifyLogLine(line);
		expect(match?.rule).toBe(rule);
		expect(match?.severity).toBe(severity);
		expect(match?.nextSteps.length).toBeGreaterThan(0);
	});

	it('ignores normal and benign lines', () => {
		expect(classifyLogLine('Oct 24 emhttpd: Spinning down all drives...')).toBeNull();
		expect(classifyLogLine('ACPI Error: AE_NOT_FOUND, While resolving a named reference')).toBeNull();
		expect(classifyLogLine('')).toBeNull();
	});
});

describe('log filtering', () => {
	it('numbers lines from startLine and filters by severity', () => {
		const lines = splitLogContent('ok line\nkernel: I/O error, dev sdb\nsshd: Failed password for x\n', 10);
		expect(lines.map((l) => l.lineNumber)).toEqual([10, 11, 12]);
		const critical = filterLogLines(lines, { analyze: true, minSeverity: 'critical' });
		expect(critical).toHaveLength(1);
		expect(critical[0]).toMatchObject({ lineNumber: 11, category: 'disk' });
		expect(filterLogLines(lines, { pattern: 'sshd' })).toHaveLength(1);
	});
});

describe('analyzeHealth', () => {
	const disk = (over: object) => ({ id: 'srv:d1', name: 'disk1', device: 'sdb', status: 'DISK_OK', type: 'DATA', temp: 35, numErrors: 0, fsSize: 100, fsUsed: 50, ...over });

	it('returns nothing for a healthy server', () => {
		const findings = analyzeHealth({
			array: { state: 'STARTED', disks: [disk({})], parityCheckStatus: { status: 'COMPLETED', errors: 0 } },
			docker: { containers: [{ id: 'c1', names: ['/plex'], state: 'RUNNING', autoStart: true }] },
			metrics: { cpu: { percentTotal: 10 }, memory: { percentTotal: 40 } },
		});
		expect(summarizeFindings(findings)).toEqual({ status: 'ok', counts: { critical: 0, warning: 0, info: 0 }, total: 0 });
	});

	it('reports disk, container and array problems, worst first', () => {
		const findings = analyzeHealth({
			array: {
				state: 'STARTED',
				disks: [disk({ status: 'DISK_DSBL' }), disk({ id: 'srv:d2', name: 'disk2', temp: 50, fsUsed: 95, numErrors: '12' })],
			},
			docker: {
				containers: [
					{ id: 'c1', names: ['/plex'], state: 'EXITED', autoStart: true, image: 'plexinc/pms-docker' },
					{ id: 'c2', names: ['/sonarr'], state: 'RUNNING', autoStart: true, isUpdateAvailable: true },
					{ id: 'c3', names: ['/ignored'], state: 'EXITED', autoStart: true },
				],
			},
		}, { ignoreContainers: ['ignored'] });
		expect(findings[0].severity).toBe('critical');
		expect(findings.map((f) => f.key)).toEqual(
			expect.arrayContaining(['disk:status:srv:d1:DISK_DSBL', 'disk:errors:srv:d2', 'disk:temp:srv:d2:warning', 'disk:usage:srv:d2:warning', 'container:down:plex', 'container:update:sonarr']),
		);
		expect(findings.find((f) => f.key === 'container:down:plex')?.suggestedAction).toMatchObject({ operation: 'start', id: 'c1' });
		expect(findings.some((f) => f.key.includes('ignored'))).toBe(false);
	});

	it('flags a stopped array', () => {
		const [f] = analyzeHealth({ array: { state: 'STOPPED' } });
		expect(f).toMatchObject({ severity: 'critical', suggestedAction: { resource: 'array', operation: 'start' } });
	});
});

describe('matchContainer', () => {
	const refs = [
		{ id: 'abc123:deadbeef', names: ['/Plex'], state: 'RUNNING' },
		{ id: 'abc123:cafe', names: ['/sonarr'], state: 'EXITED' },
	];
	it('matches by full id, bare id and case-insensitive name', () => {
		expect(matchContainer(refs, 'abc123:cafe')?.names).toEqual(['/sonarr']);
		expect(matchContainer(refs, 'deadbeef')?.names).toEqual(['/Plex']);
		expect(matchContainer(refs, 'plex')?.id).toBe('abc123:deadbeef');
		expect(matchContainer(refs, 'radarr')).toBeUndefined();
		expect(matchContainer([...refs, { id: 's:9', names: ['/Plex-Media-Server'], state: 'RUNNING' }], 'plex_media_server')?.id).toBe('s:9');
	});
});

describe('temperature thresholds', () => {
	it('uses SSD defaults for non-rotational disks', () => {
		const disk = { id: 'c', name: 'cache', status: 'DISK_OK', type: 'CACHE', rotational: false, temp: 50 };
		expect(analyzeHealth({ array: { state: 'STARTED', caches: [disk] } })).toHaveLength(0);
		expect(analyzeHealth({ array: { state: 'STARTED', caches: [{ ...disk, temp: 62 }] } })[0].key).toBe('disk:temp:c:warning');
		expect(analyzeHealth({ array: { state: 'STARTED', disks: [{ ...disk, rotational: true, type: 'DATA' }] } })[0].severity).toBe('warning');
	});
});

describe('filter patterns', () => {
	it('reports an invalid pattern instead of throwing', () => {
		expect(invalidPatternReason('error|fail')).toBeNull();
		expect(invalidPatternReason('')).toBeNull();
		expect(invalidPatternReason('(unclosed')).toMatch(/Invalid filter pattern/);
		expect(filterLogLines([{ line: 'x' }], { pattern: '(unclosed' })).toHaveLength(1);
	});
});
