import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeProperties,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { analyzeHealth, severityAtLeast, summarizeFindings, type HealthSnapshot, type Severity } from '../../lib/analysis';
import { unraidGraphql } from '../../lib/client';
import { containerOptions, resolveContainerIds, withName, type ContainerCache } from '../../lib/containers';
import { filterLogLines, invalidPatternReason, splitLogContent } from '../../lib/logs';
import { M, Q } from '../../lib/queries';

const show = (resource: string, operation?: string[]) => ({
	show: { resource: [resource], ...(operation ? { operation } : {}) },
});

const severityOptions: INodePropertyOptions[] = [
	{ name: 'All', value: 'all', description: 'Keep every line / finding' },
	{ name: 'Info and Above', value: 'info', description: 'Lines that match any built-in rule' },
	{ name: 'Warning and Above', value: 'warning' },
	{ name: 'Critical Only', value: 'critical' },
];

const properties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Array', value: 'array' },
			{ name: 'Custom GraphQL', value: 'custom' },
			{ name: 'Disk', value: 'disk' },
			{ name: 'Docker Container', value: 'dockerContainer' },
			{ name: 'Log File', value: 'logFile' },
			{ name: 'Notification', value: 'notification' },
			{ name: 'Share', value: 'share' },
			{ name: 'System', value: 'system' },
			{ name: 'Virtual Machine', value: 'vm' },
		],
		default: 'dockerContainer',
	},

	// ---------------- System
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('system'),
		options: [
			{ name: 'Get Health Report', value: 'getHealthReport', description: 'Check array, disks, containers, notifications and load, with suggested next steps', action: 'Get a health report' },
			{ name: 'Get Info', value: 'getInfo', description: 'OS, CPU and hardware information', action: 'Get system info' },
			{ name: 'Get Metrics', value: 'getMetrics', description: 'Current CPU and memory utilisation', action: 'Get system metrics' },
		],
		default: 'getHealthReport',
	},
	{
		displayName: 'Output',
		name: 'healthOutput',
		type: 'options',
		displayOptions: show('system', ['getHealthReport']),
		options: [
			{ name: 'Single Report', value: 'report', description: 'One item with status, counts and all findings' },
			{ name: 'One Item per Finding', value: 'findings', description: 'One item per problem found; no items when healthy' },
		],
		default: 'report',
	},
	{
		displayName: 'Options',
		name: 'healthOptions',
		type: 'collection',
		placeholder: 'Add Option',
		displayOptions: show('system', ['getHealthReport']),
		default: {},
		options: [
			{ displayName: 'CPU Warning (%)', name: 'cpuWarningPercent', type: 'number', default: 95 },
			{ displayName: 'Default HDD Temp Critical (°C)', name: 'defaultTempCritical', type: 'number', default: 55, description: 'Spinning disks without their own critical threshold' },
			{ displayName: 'Default HDD Temp Warning (°C)', name: 'defaultTempWarning', type: 'number', default: 45, description: 'Spinning disks without their own warning threshold' },
			{ displayName: 'Default SSD Temp Critical (°C)', name: 'defaultSsdTempCritical', type: 'number', default: 70, description: 'SSD / NVMe without their own critical threshold' },
			{ displayName: 'Default SSD Temp Warning (°C)', name: 'defaultSsdTempWarning', type: 'number', default: 60, description: 'SSD / NVMe without their own warning threshold' },
			{ displayName: 'Disk Usage Critical (%)', name: 'diskUsageCriticalPercent', type: 'number', default: 97 },
			{ displayName: 'Disk Usage Warning (%)', name: 'diskUsageWarningPercent', type: 'number', default: 90 },
			{ displayName: 'Ignore Containers', name: 'ignoreContainers', type: 'string', default: '', description: 'Comma-separated container names to leave out of the report' },
			{ displayName: 'Include Unraid Notifications', name: 'includeUnraidNotifications', type: 'boolean', default: true, description: 'Whether to include unread Unraid warning/alert notifications as findings' },
			{ displayName: 'Memory Warning (%)', name: 'memoryWarningPercent', type: 'number', default: 90 },
			{ displayName: 'Minimum Severity', name: 'minSeverity', type: 'options', options: severityOptions, default: 'all' },
			{ displayName: 'Report Container Updates', name: 'reportContainerUpdates', type: 'boolean', default: true, description: 'Whether to report containers with an image update available' },
			{ displayName: 'Report Stopped Autostart Containers', name: 'reportStoppedAutostartContainers', type: 'boolean', default: true, description: 'Whether to report containers that have autostart on but are not running' },
		],
	},

	// ---------------- Array
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('array'),
		options: [
			{ name: 'Cancel Parity Check', value: 'cancelParityCheck', action: 'Cancel the parity check' },
			{ name: 'Get Parity History', value: 'getParityHistory', action: 'Get parity check history' },
			{ name: 'Get Status', value: 'getStatus', description: 'Array state, capacity, disks and parity status', action: 'Get array status' },
			{ name: 'Pause Parity Check', value: 'pauseParityCheck', action: 'Pause the parity check' },
			{ name: 'Resume Parity Check', value: 'resumeParityCheck', action: 'Resume the parity check' },
			{ name: 'Start', value: 'start', action: 'Start the array' },
			{ name: 'Start Parity Check', value: 'startParityCheck', action: 'Start a parity check' },
			{ name: 'Stop', value: 'stop', description: 'Stops the array; Docker and VMs on it go down', action: 'Stop the array' },
		],
		default: 'getStatus',
	},
	{
		displayName: 'Write Corrections to Parity',
		name: 'correct',
		type: 'boolean',
		displayOptions: show('array', ['startParityCheck']),
		default: false,
		description: 'Whether to fix parity errors found (correcting check) instead of only reporting them',
	},
	{
		displayName: 'Decryption Password',
		name: 'decryptionPassword',
		type: 'string',
		typeOptions: { password: true },
		displayOptions: show('array', ['start']),
		default: '',
		description: 'Only for encrypted arrays. Leave empty otherwise.',
	},

	// ---------------- Disk / Share
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('disk'),
		options: [{ name: 'Get Many', value: 'getAll', description: 'Physical disks with SMART status and temperature', action: 'Get many disks' }],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('share'),
		options: [{ name: 'Get Many', value: 'getAll', action: 'Get many shares' }],
		default: 'getAll',
	},

	// ---------------- Docker container
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('dockerContainer'),
		options: [
			{ name: 'Check for Updates', value: 'checkForUpdates', description: 'Refresh image digests so update status is current', action: 'Check containers for updates' },
			{ name: 'Get', value: 'get', action: 'Get a container' },
			{ name: 'Get Logs', value: 'getLogs', description: 'Read (and optionally analyse) a container\'s log', action: 'Get container logs' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many containers' },
			{ name: 'Get Update Status', value: 'getUpdateStatus', description: 'Update status of every container', action: 'Get container update status' },
			{ name: 'Pause', value: 'pause', action: 'Pause a container' },
			{ name: 'Restart', value: 'restart', action: 'Restart a container' },
			{ name: 'Start', value: 'start', action: 'Start a container' },
			{ name: 'Stop', value: 'stop', action: 'Stop a container' },
			{ name: 'Unpause', value: 'unpause', action: 'Unpause a container' },
			{ name: 'Update', value: 'update', description: 'Pull the latest image and recreate the container(s)', action: 'Update containers' },
			{ name: 'Update All', value: 'updateAll', description: 'Update every container that has an update available', action: 'Update all containers' },
		],
		default: 'getAll',
	},
	{
		displayName: 'Container Name or ID',
		name: 'container',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getContainers' },
		required: true,
		displayOptions: show('dockerContainer', ['get', 'getLogs', 'pause', 'restart', 'start', 'stop', 'unpause']),
		default: '',
		description: 'Choose from the list, or specify a container name or ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Container Names or IDs',
		name: 'containers',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getContainers' },
		required: true,
		displayOptions: show('dockerContainer', ['update']),
		default: [],
		description: 'Choose from the list, or specify names or IDs (array or comma-separated) using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Filters',
		name: 'containerFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: show('dockerContainer', ['getAll']),
		default: {},
		options: [
			{ displayName: 'Autostart Only', name: 'autoStartOnly', type: 'boolean', default: false, description: 'Whether to return only containers with autostart enabled' },
			{ displayName: 'Name Contains', name: 'nameContains', type: 'string', default: '' },
			{
				displayName: 'State',
				name: 'state',
				type: 'options',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Exited', value: 'EXITED' },
					{ name: 'Not Running', value: 'NOT_RUNNING' },
					{ name: 'Paused', value: 'PAUSED' },
					{ name: 'Running', value: 'RUNNING' },
				],
				default: '',
			},
			{ displayName: 'Update Available Only', name: 'updatesOnly', type: 'boolean', default: false, description: 'Whether to return only containers with a newer image available' },
		],
	},
	{
		displayName: 'Tail',
		name: 'tail',
		type: 'number',
		typeOptions: { minValue: 1 },
		displayOptions: show('dockerContainer', ['getLogs']),
		default: 200,
		description: 'Number of most recent log lines to read',
	},

	// ---------------- VM
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('vm'),
		options: [
			{ name: 'Force Stop', value: 'forceStop', action: 'Force stop a VM' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many virtual machines' },
			{ name: 'Pause', value: 'pause', action: 'Pause a VM' },
			{ name: 'Reboot', value: 'reboot', action: 'Reboot a VM' },
			{ name: 'Reset', value: 'reset', action: 'Reset a VM' },
			{ name: 'Resume', value: 'resume', action: 'Resume a VM' },
			{ name: 'Start', value: 'start', action: 'Start a VM' },
			{ name: 'Stop', value: 'stop', description: 'Graceful ACPI shutdown', action: 'Stop a VM' },
		],
		default: 'getAll',
	},
	{
		displayName: 'VM Name or ID',
		name: 'vmId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getVms' },
		required: true,
		displayOptions: show('vm', ['forceStop', 'pause', 'reboot', 'reset', 'resume', 'start', 'stop']),
		default: '',
		description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},

	// ---------------- Log file
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('logFile'),
		options: [
			{ name: 'Get Many', value: 'getAll', description: 'List files in /var/log', action: 'List log files' },
			{ name: 'Read', value: 'read', description: 'Read lines of a log file, optionally filtered and analysed', action: 'Read a log file' },
		],
		default: 'read',
	},
	{
		displayName: 'Log File Name or ID',
		name: 'logPath',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getLogFiles' },
		required: true,
		displayOptions: show('logFile', ['read']),
		default: '/var/log/syslog',
		description: 'File in /var/log. Choose from the list, or specify a path using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Lines',
		name: 'lines',
		type: 'number',
		typeOptions: { minValue: 1 },
		displayOptions: show('logFile', ['read']),
		default: 200,
		description: 'Number of lines to read: the last N lines, or N lines from Start Line',
	},

	// ---------------- shared log options
	{
		displayName: 'Options',
		name: 'logOptions',
		type: 'collection',
		placeholder: 'Add Option',
		displayOptions: { show: { resource: ['logFile', 'dockerContainer'], operation: ['read', 'getLogs'] } },
		default: {},
		options: [
			{ displayName: 'Analyze', name: 'analyze', type: 'boolean', default: true, description: 'Whether to tag lines with severity, category and suggested next steps' },
			{ displayName: 'Filter Pattern', name: 'pattern', type: 'string', default: '', placeholder: 'error|fail|warn', description: 'Case-insensitive regular expression; only matching lines are returned' },
			{ displayName: 'Minimum Severity', name: 'minSeverity', type: 'options', options: severityOptions, default: 'all', description: 'With Analyze on: drop lines below this severity' },
			{
				displayName: 'Output',
				name: 'output',
				type: 'options',
				options: [
					{ name: 'Single Item', value: 'single', description: 'One item holding all lines' },
					{ name: 'One Item per Line', value: 'lines' },
				],
				default: 'single',
			},
			{ displayName: 'Since', name: 'since', type: 'dateTime', default: '', description: 'Container logs only: lines after this time' },
			{ displayName: 'Start Line', name: 'startLine', type: 'number', default: 0, description: 'Log files only: 1-based line to start from. 0 reads the last lines.' },
		],
	},

	// ---------------- Notification
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('notification'),
		options: [
			{ name: 'Archive', value: 'archive', action: 'Archive a notification' },
			{ name: 'Archive All', value: 'archiveAll', action: 'Archive all notifications' },
			{ name: 'Create', value: 'create', description: 'Send an Unraid notification (also forwarded to configured agents)', action: 'Create a notification' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many notifications' },
			{ name: 'Get Overview', value: 'getOverview', description: 'Unread / archived counts per importance', action: 'Get notification overview' },
			{ name: 'Get Warnings and Alerts', value: 'getWarningsAndAlerts', description: 'Unread warnings and alerts, latest first', action: 'Get warnings and alerts' },
		],
		default: 'getWarningsAndAlerts',
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		required: true,
		displayOptions: show('notification', ['create']),
		default: 'n8n',
		description: 'Event / source name shown in the notification',
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		required: true,
		displayOptions: show('notification', ['create']),
		default: '',
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		displayOptions: show('notification', ['create']),
		default: '',
	},
	{
		displayName: 'Importance',
		name: 'importance',
		type: 'options',
		displayOptions: show('notification', ['create']),
		options: [
			{ name: 'Alert', value: 'ALERT' },
			{ name: 'Info', value: 'INFO' },
			{ name: 'Warning', value: 'WARNING' },
		],
		default: 'WARNING',
	},
	{
		displayName: 'Options',
		name: 'notificationOptions',
		type: 'collection',
		placeholder: 'Add Option',
		displayOptions: show('notification', ['create']),
		default: {},
		options: [
			{ displayName: 'Link', name: 'link', type: 'string', default: '', description: 'URL opened from the notification' },
			{ displayName: 'Only If Unique', name: 'onlyIfUnique', type: 'boolean', default: true, description: 'Whether to skip creating it when an identical unread notification exists' },
		],
	},
	{
		displayName: 'Notification ID',
		name: 'notificationId',
		type: 'string',
		required: true,
		displayOptions: show('notification', ['archive']),
		default: '',
	},
	{
		displayName: 'Type',
		name: 'notificationType',
		type: 'options',
		displayOptions: show('notification', ['getAll']),
		options: [
			{ name: 'Unread', value: 'UNREAD' },
			{ name: 'Archived', value: 'ARCHIVE' },
		],
		default: 'UNREAD',
	},
	{
		displayName: 'Importance',
		name: 'importanceFilter',
		type: 'options',
		displayOptions: show('notification', ['getAll', 'archiveAll']),
		options: [
			{ name: 'Any', value: '' },
			{ name: 'Alert', value: 'ALERT' },
			{ name: 'Info', value: 'INFO' },
			{ name: 'Warning', value: 'WARNING' },
		],
		default: '',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		displayOptions: show('notification', ['getAll']),
		default: 50,
		description: 'Max number of results to return',
	},

	// ---------------- Custom GraphQL
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('custom'),
		options: [{ name: 'Execute', value: 'execute', description: 'Run any query or mutation from the Unraid schema', action: 'Execute a graph ql request' }],
		default: 'execute',
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		typeOptions: { rows: 8 },
		required: true,
		displayOptions: show('custom'),
		default: '{\n  online\n  info { os { hostname uptime } }\n}',
		description: 'GraphQL document. Browse the schema in the API sandbox at &lt;server&gt;/graphql.',
	},
	{
		displayName: 'Variables (JSON)',
		name: 'variables',
		type: 'json',
		displayOptions: show('custom'),
		default: '{}',
	},
];

function toList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).filter(Boolean);
	return String(value ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export class Unraid implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Unraid',
		name: 'unraid',
		icon: { light: 'file:unraid.svg', dark: 'file:unraid.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Monitor and control an Unraid server through its GraphQL API',
		defaults: { name: 'Unraid' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'unraidApi', required: true }],
		properties,
	};

	methods = {
		loadOptions: {
			async getContainers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return containerOptions.call(this);
			},
			async getVms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const data = await unraidGraphql.call(this, Q.vms);
				const domains = (((data.vms as IDataObject)?.domains as IDataObject[]) ?? []) as Array<{ id: string; name?: string; state: string }>;
				return domains.map((d) => ({ name: `${d.name ?? d.id} (${d.state.toLowerCase()})`, value: d.id }));
			},
			async getLogFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const data = await unraidGraphql.call(this, Q.logFiles);
				const files = (data.logFiles as unknown as Array<{ name: string; path: string; size: number }>) ?? [];
				return files
					.map((f) => ({ name: f.name, value: f.path, description: `${Math.round(f.size / 1024)} KB` }))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		const cache: ContainerCache = {};

		const push = (i: number, data: IDataObject | IDataObject[]) => {
			for (const json of Array.isArray(data) ? data : [data]) out.push({ json, pairedItem: { item: i } });
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const gql = (query: string, variables?: IDataObject) => unraidGraphql.call(this, query, variables);
				const containerId = async () => (await resolveContainerIds.call(this, [this.getNodeParameter('container', i) as string], cache))[0];

				if (resource === 'system') {
					if (operation === 'getInfo') {
						const data = await gql(Q.info);
						push(i, { online: data.online, ...(data.info as IDataObject) });
					} else if (operation === 'getMetrics') {
						push(i, (await gql(Q.metrics)).metrics as IDataObject);
					} else if (operation === 'getHealthReport') {
						const o = this.getNodeParameter('healthOptions', i, {}) as IDataObject;
						const snapshot = (await gql(Q.health)) as unknown as HealthSnapshot & { info?: { os?: { hostname?: string; uptime?: string } } };
						const minSeverity = (o.minSeverity as Severity | 'all') ?? 'all';
						const findings = analyzeHealth(snapshot, {
							...(o as object),
							ignoreContainers: toList(o.ignoreContainers),
						}).filter((f) => minSeverity === 'all' || severityAtLeast(f.severity, minSeverity));
						const hostname = snapshot.info?.os?.hostname;
						if (this.getNodeParameter('healthOutput', i) === 'findings') {
							push(i, findings.map((f) => ({ hostname, ...f }) as unknown as IDataObject));
						} else {
							push(i, {
								hostname,
								uptime: snapshot.info?.os?.uptime,
								checkedAt: new Date().toISOString(),
								...summarizeFindings(findings),
								arrayState: snapshot.array?.state,
								findings: findings as unknown as IDataObject[],
							});
						}
					}
				} else if (resource === 'array') {
					if (operation === 'getStatus') {
						push(i, (await gql(Q.array)).array as IDataObject);
					} else if (operation === 'getParityHistory') {
						push(i, ((await gql(Q.parityHistory)).parityHistory as IDataObject[]) ?? []);
					} else if (operation === 'start' || operation === 'stop') {
						const input: IDataObject = { desiredState: operation === 'start' ? 'START' : 'STOP' };
						const password = operation === 'start' ? (this.getNodeParameter('decryptionPassword', i, '') as string) : '';
						if (password) input.decryptionPassword = password;
						push(i, ((await gql(M.arraySetState, { input })).array as IDataObject).setState as IDataObject);
					} else {
						const mutation = { startParityCheck: M.parityStart, pauseParityCheck: M.parityPause, resumeParityCheck: M.parityResume, cancelParityCheck: M.parityCancel }[operation];
						if (!mutation) throw new NodeOperationError(this.getNode(), `Unknown operation ${operation}`);
						const vars = operation === 'startParityCheck' ? { correct: this.getNodeParameter('correct', i) as boolean } : undefined;
						const result = (await gql(mutation, vars)).parityCheck as IDataObject;
						push(i, { operation, result: Object.values(result)[0] as IDataObject });
					}
				} else if (resource === 'disk') {
					push(i, ((await gql(Q.disks)).disks as IDataObject[]) ?? []);
				} else if (resource === 'share') {
					push(i, ((await gql(Q.shares)).shares as IDataObject[]) ?? []);
				} else if (resource === 'dockerContainer') {
					if (operation === 'getAll') {
						const f = this.getNodeParameter('containerFilters', i, {}) as IDataObject;
						let list = (((await gql(Q.containers)).docker as IDataObject).containers as unknown as Array<IDataObject & { names: string[] }>).map(withName);
						if (f.state === 'NOT_RUNNING') list = list.filter((c) => c.state !== 'RUNNING');
						else if (f.state) list = list.filter((c) => c.state === f.state);
						if (f.updatesOnly) list = list.filter((c) => c.isUpdateAvailable === true);
						if (f.autoStartOnly) list = list.filter((c) => c.autoStart === true);
						if (f.nameContains) list = list.filter((c) => c.name.toLowerCase().includes(String(f.nameContains).toLowerCase()));
						push(i, list.sort((a, b) => a.name.localeCompare(b.name)));
					} else if (operation === 'get') {
						const c = ((await gql(Q.container, { id: await containerId() })).docker as IDataObject).container as IDataObject & { names: string[] };
						push(i, withName(c));
					} else if (operation === 'getLogs') {
						const o = this.getNodeParameter('logOptions', i, {}) as IDataObject;
						const badPattern = invalidPatternReason(o.pattern as string);
						if (badPattern) throw new NodeOperationError(this.getNode(), badPattern, { itemIndex: i });
						const vars: IDataObject = { id: await containerId(), tail: this.getNodeParameter('tail', i) as number };
						if (o.since) vars.since = new Date(o.since as string).toISOString();
						const logs = ((await gql(Q.containerLogs, vars)).docker as IDataObject).logs as { containerId: string; cursor?: string; lines: Array<{ timestamp: string; message: string }> };
						const container = this.getNodeParameter('container', i) as string;
						const lines = filterLogLines(
							logs.lines.map((l) => ({ timestamp: l.timestamp, line: l.message })),
							{ pattern: o.pattern as string, analyze: o.analyze !== false, minSeverity: (o.minSeverity as Severity | 'all') ?? 'all' },
						);
						if (o.output === 'lines') push(i, lines.map((l) => ({ container, containerId: logs.containerId, ...l }) as IDataObject));
						else push(i, { container, containerId: logs.containerId, cursor: logs.cursor, count: lines.length, lines: lines as unknown as IDataObject[] });
					} else if (operation === 'getUpdateStatus') {
						push(i, ((await gql(Q.containerUpdateStatuses)).docker as IDataObject).containerUpdateStatuses as IDataObject[]);
					} else if (operation === 'checkForUpdates') {
						const refreshed = (await gql(M.dockerRefreshDigests)).refreshDockerDigests;
						const statuses = ((await gql(Q.containerUpdateStatuses)).docker as IDataObject).containerUpdateStatuses as IDataObject[];
						push(i, { refreshed, updatesAvailable: statuses.filter((s) => s.updateStatus === 'UPDATE_AVAILABLE').map((s) => s.name), statuses });
					} else if (operation === 'update') {
						const ids = await resolveContainerIds.call(this, toList(this.getNodeParameter('containers', i)), cache);
						if (!ids.length) throw new NodeOperationError(this.getNode(), 'No containers selected', { itemIndex: i });
						const updated = ((await gql(M.dockerUpdateMany, { ids })).docker as IDataObject).updateContainers as unknown as Array<IDataObject & { names: string[] }>;
						push(i, updated.map(withName));
					} else if (operation === 'updateAll') {
						const updated = ((await gql(M.dockerUpdateAll)).docker as IDataObject).updateAllContainers as unknown as Array<IDataObject & { names: string[] }>;
						push(i, updated.length ? updated.map(withName) : [{ updated: 0, message: 'No containers had updates available' }]);
					} else {
						const action = operation as 'start' | 'stop' | 'restart' | 'pause' | 'unpause';
						const result = ((await gql(M.dockerAction(action), { id: await containerId() })).docker as IDataObject)[action] as IDataObject & { names: string[] };
						push(i, withName(result));
					}
				} else if (resource === 'vm') {
					if (operation === 'getAll') {
						push(i, (((await gql(Q.vms)).vms as IDataObject)?.domains as IDataObject[]) ?? []);
					} else {
						const id = this.getNodeParameter('vmId', i) as string;
						const action = operation as 'start' | 'stop' | 'forceStop' | 'pause' | 'resume' | 'reboot' | 'reset';
						const ok = ((await gql(M.vmAction(action), { id })).vm as IDataObject)[action];
						push(i, { id, operation, success: ok === true });
					}
				} else if (resource === 'logFile') {
					if (operation === 'getAll') {
						push(i, (await gql(Q.logFiles)).logFiles as IDataObject[]);
					} else {
						const o = this.getNodeParameter('logOptions', i, {}) as IDataObject;
						const badPattern = invalidPatternReason(o.pattern as string);
						if (badPattern) throw new NodeOperationError(this.getNode(), badPattern, { itemIndex: i });
						const vars: IDataObject = { path: this.getNodeParameter('logPath', i) as string, lines: this.getNodeParameter('lines', i) as number };
						if (Number(o.startLine) > 0) vars.startLine = Number(o.startLine);
						const file = (await gql(Q.logFile, vars)).logFile as { path: string; content: string; totalLines: number; startLine?: number };
						const lines = filterLogLines(splitLogContent(file.content, file.startLine), {
							pattern: o.pattern as string,
							analyze: o.analyze !== false,
							minSeverity: (o.minSeverity as Severity | 'all') ?? 'all',
						});
						if (o.output === 'lines') push(i, lines.map((l) => ({ path: file.path, ...l }) as IDataObject));
						else push(i, { path: file.path, totalLines: file.totalLines, startLine: file.startLine, count: lines.length, lines: lines as unknown as IDataObject[] });
					}
				} else if (resource === 'notification') {
					if (operation === 'create') {
						const o = this.getNodeParameter('notificationOptions', i, {}) as IDataObject;
						const input: IDataObject = {
							title: this.getNodeParameter('title', i) as string,
							subject: this.getNodeParameter('subject', i) as string,
							description: this.getNodeParameter('description', i) as string,
							importance: this.getNodeParameter('importance', i) as string,
						};
						if (o.link) input.link = o.link;
						const unique = o.onlyIfUnique !== false;
						const data = await gql(unique ? M.notifyIfUnique : M.createNotification, { input });
						const created = (unique ? data.notifyIfUnique : data.createNotification) as IDataObject | null;
						push(i, created ?? { skipped: true, reason: 'An identical unread notification already exists', ...input });
					} else if (operation === 'getAll') {
						const filter: IDataObject = { type: this.getNodeParameter('notificationType', i), offset: 0, limit: this.getNodeParameter('limit', i) };
						const importance = this.getNodeParameter('importanceFilter', i, '') as string;
						if (importance) filter.importance = importance;
						push(i, ((await gql(Q.notifications, { filter })).notifications as IDataObject).list as IDataObject[]);
					} else if (operation === 'getOverview') {
						push(i, ((await gql(Q.notificationOverview)).notifications as IDataObject).overview as IDataObject);
					} else if (operation === 'getWarningsAndAlerts') {
						push(i, ((await gql(Q.warningsAndAlerts)).notifications as IDataObject).warningsAndAlerts as IDataObject[]);
					} else if (operation === 'archive') {
						push(i, (await gql(M.archiveNotification, { id: this.getNodeParameter('notificationId', i) as string })).archiveNotification as IDataObject);
					} else if (operation === 'archiveAll') {
						const importance = this.getNodeParameter('importanceFilter', i, '') as string;
						push(i, (await gql(M.archiveAll, importance ? { importance } : {})).archiveAll as IDataObject);
					}
				} else if (resource === 'custom') {
					const raw = this.getNodeParameter('variables', i, '{}') as string | IDataObject;
					let variables: IDataObject;
					try {
						variables = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : {}) : raw;
					} catch {
						throw new NodeOperationError(this.getNode(), 'Variables must be valid JSON', { itemIndex: i });
					}
					push(i, await gql(this.getNodeParameter('query', i) as string, variables));
				}
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// Keep NodeApiError (it carries the HTTP details); wrap anything else so n8n shows it per item.
				const nodeError = error instanceof NodeApiError ? error : new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				if (nodeError.context.itemIndex === undefined) nodeError.context.itemIndex = i;
				throw nodeError;
			}
		}
		return [out];
	}
}
