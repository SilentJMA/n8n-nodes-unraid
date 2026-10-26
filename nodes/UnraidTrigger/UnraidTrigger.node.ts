import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';

import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { analyzeHealth, containerName, severityAtLeast, type HealthSnapshot, type Severity } from '../../lib/analysis';
import { unraidGraphql } from '../../lib/client';
import { containerOptions, resolveContainerIds } from '../../lib/containers';
import { filterLogLines, invalidPatternReason, splitLogContent, type LogLine } from '../../lib/logs';
import { NOTIFICATION_FIELDS, Q } from '../../lib/queries';

interface PollState {
	logTotals?: Record<string, number>;
	containerCursor?: Record<string, string>;
	findingKeys?: string[];
	notificationIds?: string[];
	containerStates?: Record<string, string>;
	updateNames?: string[];
}

const MAX_REMEMBERED = 1000;

const severityOptions: INodePropertyOptions[] = [
	{ name: 'Info and Above', value: 'info' },
	{ name: 'Warning and Above', value: 'warning' },
	{ name: 'Critical Only', value: 'critical' },
];

const wrap = (rows: IDataObject[]): INodeExecutionData[][] | null => (rows.length ? [rows.map((json) => ({ json }))] : null);

export class UnraidTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Unraid Trigger',
		name: 'unraidTrigger',
		icon: { light: 'file:unraid.svg', dark: 'file:unraid.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Polls an Unraid server and starts the workflow on new log errors, health problems, notifications or container changes',
		defaults: { name: 'Unraid Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'unraidApi', required: true }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Container Log Line', value: 'containerLog', description: 'New lines in a Docker container log matching the rules / pattern' },
					{ name: 'Container State Changed', value: 'containerState', description: 'A container started, stopped, paused or was removed' },
					{ name: 'Container Update Available', value: 'containerUpdate', description: 'A container newly has an image update available' },
					{ name: 'Health Problem', value: 'health', description: 'New problem found by the health report (array, disks, containers, load)' },
					{ name: 'Log File Line', value: 'logFile', description: 'New lines in a /var/log file (e.g. syslog) matching the rules / pattern' },
					{ name: 'New Notification', value: 'notification', description: 'New unread Unraid notification' },
				],
				default: 'logFile',
			},
			{
				displayName: 'Log File Name or ID',
				name: 'logPath',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getLogFiles' },
				displayOptions: { show: { event: ['logFile'] } },
				default: '/var/log/syslog',
				description: 'Choose from the list, or specify a path using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Container Name or ID',
				name: 'container',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getContainers' },
				displayOptions: { show: { event: ['containerLog'] } },
				default: '',
				required: true,
				description: 'Choose from the list, or specify a name or ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Minimum Severity',
				name: 'minSeverity',
				type: 'options',
				options: severityOptions,
				displayOptions: { show: { event: ['logFile', 'containerLog', 'health'] } },
				default: 'warning',
				description: 'Built-in rules tag lines/findings as info, warning or critical (disk I/O, filesystem, OOM, MCE, call traces, auth failures…)',
			},
			{
				displayName: 'Minimum Importance',
				name: 'minImportance',
				type: 'options',
				options: [
					{ name: 'Info and Above', value: 'info' },
					{ name: 'Warning and Above', value: 'warning' },
					{ name: 'Alert Only', value: 'critical' },
				],
				displayOptions: { show: { event: ['notification'] } },
				default: 'warning',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Emit Existing on First Poll',
						name: 'emitExisting',
						type: 'boolean',
						default: false,
						description: 'Whether the first poll after activation also emits what already exists (otherwise it only records a baseline)',
					},
					{
						displayName: 'Emit Resolved Problems',
						name: 'emitResolved',
						type: 'boolean',
						default: false,
						description: 'Whether to also emit an item when a previously reported health problem disappears (Health Problem event only)',
					},
					{
						displayName: 'Extra Pattern',
						name: 'pattern',
						type: 'string',
						default: '',
						placeholder: 'plex|nginx',
						description: 'Log events only: case-insensitive regex a line must also match',
					},
					{
						displayName: 'Group Lines Into One Item',
						name: 'group',
						type: 'boolean',
						default: true,
						description: 'Whether to emit the log lines found in one poll as a single item (one alert) instead of one item per line',
					},
					{
						displayName: 'Ignore Containers',
						name: 'ignoreContainers',
						type: 'string',
						default: '',
						description: 'Comma-separated container names to ignore (Health, State and Update events)',
					},
					{
						displayName: 'Max Lines per Poll',
						name: 'maxLines',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1000,
						description: 'Log events only: upper bound on new lines read per poll',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getContainers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return containerOptions.call(this);
			},
			async getLogFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const data = await unraidGraphql.call(this, Q.logFiles);
				const files = (data.logFiles as unknown as Array<{ name: string; path: string }>) ?? [];
				return files.map((f) => ({ name: f.name, value: f.path })).sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const badPattern = invalidPatternReason(options.pattern as string);
		if (badPattern) throw new NodeOperationError(this.getNode(), badPattern);
		const state = this.getWorkflowStaticData('node') as PollState;
		const manual = this.getMode() === 'manual';
		const emitExisting = manual || options.emitExisting === true;
		const ignored = new Set(
			String(options.ignoreContainers ?? '')
				.split(',')
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean),
		);
		const hostname = async () => ((await unraidGraphql.call(this, '{ info { os { hostname } } }')).info as { os: { hostname?: string } }).os.hostname;

		const groupLines = async (source: IDataObject, lines: LogLine[]) => {
			if (!lines.length) return null;
			if (options.group === false) return wrap(lines.map((l) => ({ ...source, ...l }) as IDataObject));
			const worst = lines.reduce<Severity>((acc, l) => (l.severity && severityAtLeast(l.severity, acc) ? l.severity : acc), 'info');
			const categories = [...new Set(lines.map((l) => l.category).filter(Boolean))] as string[];
			const nextSteps = [...new Set(lines.flatMap((l) => l.nextSteps ?? []))];
			return wrap([{ hostname: await hostname(), ...source, severity: worst, categories, count: lines.length, nextSteps, lines: lines as unknown as IDataObject[] }]);
		};

		if (event === 'logFile') {
			const path = this.getNodeParameter('logPath') as string;
			const maxLines = Number(options.maxLines ?? 1000);
			const minSeverity = this.getNodeParameter('minSeverity') as Severity;
			const totals = (state.logTotals ??= {});
			const last = totals[path];
			let file: { path: string; content: string; totalLines: number; startLine?: number };
			if (last === undefined || manual) {
				file = (await unraidGraphql.call(this, Q.logFile, { path, lines: manual ? 200 : maxLines })).logFile as typeof file;
				if (!manual) totals[path] = file.totalLines;
				if (!emitExisting) return null;
			} else {
				// startLine past the end returns no content but still reports totalLines.
				file = (await unraidGraphql.call(this, Q.logFile, { path, lines: maxLines, startLine: last + 1 })).logFile as typeof file;
				if (file.totalLines < last) {
					// Log rotated or truncated: read the tail of the new file.
					file = (await unraidGraphql.call(this, Q.logFile, { path, lines: Math.min(maxLines, file.totalLines || 1) })).logFile as typeof file;
				}
				totals[path] = Math.min(file.totalLines, (file.startLine ?? 1) + splitLogContent(file.content).length - 1);
			}
			const lines = filterLogLines(splitLogContent(file.content, file.startLine), { pattern: options.pattern as string, analyze: true, minSeverity });
			return groupLines({ source: 'logFile', path: file.path }, lines);
		}

		if (event === 'containerLog') {
			const container = this.getNodeParameter('container') as string;
			const [id] = await resolveContainerIds.call(this, [container], {});
			const cursors = (state.containerCursor ??= {});
			const since = manual ? undefined : cursors[id];
			const firstPoll = !manual && since === undefined;
			const vars: IDataObject = { id, tail: Number(options.maxLines ?? 1000) };
			if (since) vars.since = since;
			const logs = ((await unraidGraphql.call(this, Q.containerLogs, vars)).docker as IDataObject).logs as {
				cursor?: string;
				lines: Array<{ timestamp: string; message: string }>;
			};
			if (!manual) cursors[id] = logs.cursor ?? logs.lines.at(-1)?.timestamp ?? since ?? new Date().toISOString();
			if (firstPoll && !emitExisting) return null;
			// `since` is inclusive on some Docker versions; drop the line we already saw.
			const fresh = since ? logs.lines.filter((l) => l.timestamp > since) : logs.lines;
			const lines = filterLogLines(
				fresh.map((l) => ({ timestamp: l.timestamp, line: l.message })),
				{ pattern: options.pattern as string, analyze: true, minSeverity: this.getNodeParameter('minSeverity') as Severity },
			);
			return groupLines({ source: 'container', container, containerId: id }, lines);
		}

		if (event === 'health') {
			const snapshot = (await unraidGraphql.call(this, Q.health)) as unknown as HealthSnapshot & { info?: { os?: { hostname?: string } } };
			const minSeverity = this.getNodeParameter('minSeverity') as Severity;
			const findings = analyzeHealth(snapshot, { ignoreContainers: [...ignored] }).filter((f) => severityAtLeast(f.severity, minSeverity));
			const previous = state.findingKeys;
			const host = snapshot.info?.os?.hostname;
			if (!manual) state.findingKeys = findings.map((f) => f.key);
			if (previous === undefined && !emitExisting) return null;
			const known = new Set(manual ? [] : previous ?? []);
			const rows: IDataObject[] = findings.filter((f) => !known.has(f.key)).map((f) => ({ hostname: host, status: 'new', ...f }) as unknown as IDataObject);
			if (options.emitResolved && previous) {
				const current = new Set(findings.map((f) => f.key));
				for (const key of previous.filter((k) => !current.has(k))) {
					rows.push({ hostname: host, status: 'resolved', key, severity: 'info', title: `Resolved: ${key}`, nextSteps: [] } as IDataObject);
				}
			}
			return wrap(rows);
		}

		if (event === 'notification') {
			const minImportance = this.getNodeParameter('minImportance') as Severity;
			const data = await unraidGraphql.call(this, `query ($filter: NotificationFilter!) { notifications { list(filter: $filter) { ${NOTIFICATION_FIELDS} } } }`, {
				filter: { type: 'UNREAD', offset: 0, limit: 100 },
			});
			const list = ((data.notifications as IDataObject).list as unknown as Array<IDataObject & { id: string; importance: string }>) ?? [];
			const previous = state.notificationIds;
			if (!manual) state.notificationIds = [...new Set([...list.map((n) => n.id), ...(previous ?? [])])].slice(0, MAX_REMEMBERED);
			if (previous === undefined && !emitExisting) return null;
			const seen = new Set(manual ? [] : previous ?? []);
			const level = (imp: string): Severity => (imp === 'ALERT' ? 'critical' : imp === 'WARNING' ? 'warning' : 'info');
			return wrap(list.filter((n) => !seen.has(n.id) && severityAtLeast(level(n.importance), minImportance)).map((n) => ({ ...n, severity: level(n.importance) })));
		}

		if (event === 'containerState' || event === 'containerUpdate') {
			const containers = (((await unraidGraphql.call(this, Q.containers)).docker as IDataObject).containers as unknown as Array<
				IDataObject & { id: string; names: string[]; state: string; isUpdateAvailable?: boolean }
			>).filter((c) => !ignored.has(containerName(c).toLowerCase()));

			if (event === 'containerState') {
				const previous = state.containerStates;
				const current: Record<string, string> = Object.fromEntries(containers.map((c) => [containerName(c), c.state]));
				if (!manual) state.containerStates = current;
				if (previous === undefined && !emitExisting) return null;
				const before = manual || !previous ? {} : previous;
				const rows: IDataObject[] = containers
					.filter((c) => before[containerName(c)] !== c.state)
					.map((c) => ({ name: containerName(c), previousState: before[containerName(c)] ?? null, ...c }));
				for (const gone of Object.keys(before).filter((n) => !(n in current))) rows.push({ name: gone, previousState: before[gone], state: 'REMOVED' });
				return wrap(rows);
			}

			const withUpdate = containers.filter((c) => c.isUpdateAvailable === true);
			const previous = state.updateNames;
			if (!manual) state.updateNames = withUpdate.map((c) => containerName(c));
			if (previous === undefined && !emitExisting) return null;
			const known = new Set(manual ? [] : previous ?? []);
			return wrap(withUpdate.filter((c) => !known.has(containerName(c))).map((c) => ({ name: containerName(c), ...c })));
		}

		return null;
	}
}

