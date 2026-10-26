// GraphQL documents used by the Unraid nodes, written against api/generated-schema.graphql from github.com/unraid/api.

export const CONTAINER_FIELDS = `
	id names image imageId state status created autoStart autoStartOrder
	isUpdateAvailable isRebuildReady isOrphaned webUiUrl iconUrl projectUrl
	ports { ip privatePort publicPort type }`;

export const ARRAY_DISK_FIELDS = `
	id idx name device size status type temp warning critical rotational isSpinning
	numReads numWrites numErrors fsSize fsFree fsUsed fsType comment`;

export const PARITY_FIELDS = 'date duration speed status errors progress correcting paused running';

export const ARRAY_FIELDS = `
	id state
	capacity { kilobytes { free used total } disks { free used total } }
	parityCheckStatus { ${PARITY_FIELDS} }
	parities { ${ARRAY_DISK_FIELDS} }
	disks { ${ARRAY_DISK_FIELDS} }
	caches { ${ARRAY_DISK_FIELDS} }
	boot { ${ARRAY_DISK_FIELDS} }`;

export const PHYSICAL_DISK_FIELDS = 'id device type name vendor size firmwareRevision serialNum interfaceType smartStatus temperature isSpinning';

export const NOTIFICATION_FIELDS = 'id title subject description importance link type timestamp formattedTimestamp';

export const METRICS_FIELDS = `
	cpu { percentTotal }
	memory { total used free available percentTotal swapTotal swapUsed percentSwapTotal }`;

export const Q = {
	online: '{ online }',
	info: `{
		online
		info {
			time
			os { platform distro release kernel arch hostname uptime }
			cpu { manufacturer brand cores threads speed speedmax }
			system { manufacturer model virtual }
		}
	}`,
	metrics: `{ metrics { ${METRICS_FIELDS} } }`,
	array: `{ array { ${ARRAY_FIELDS} } }`,
	parityHistory: `{ parityHistory { ${PARITY_FIELDS} } }`,
	disks: `{ disks { ${PHYSICAL_DISK_FIELDS} } }`,
	shares: '{ shares { id name free used size comment cache include exclude splitLevel } }',
	containers: `{ docker { containers { ${CONTAINER_FIELDS} } } }`,
	containerNames: '{ docker { containers { id names state } } }',
	container: `query ($id: PrefixedID!) { docker { container(id: $id) { ${CONTAINER_FIELDS} } } }`,
	containerLogs: `query ($id: PrefixedID!, $since: DateTime, $tail: Int) {
		docker { logs(id: $id, since: $since, tail: $tail) { containerId cursor lines { timestamp message } } }
	}`,
	containerUpdateStatuses: '{ docker { containerUpdateStatuses { name updateStatus } } }',
	vms: '{ vms { domains { id name state } } }',
	logFiles: '{ logFiles { name path size modifiedAt } }',
	logFile: `query ($path: String!, $lines: Int, $startLine: Int) {
		logFile(path: $path, lines: $lines, startLine: $startLine) { path content totalLines startLine }
	}`,
	notifications: `query ($filter: NotificationFilter!) { notifications { list(filter: $filter) { ${NOTIFICATION_FIELDS} } } }`,
	notificationOverview: `{ notifications { overview {
		unread { info warning alert total }
		archive { info warning alert total }
	} } }`,
	warningsAndAlerts: `{ notifications { warningsAndAlerts { ${NOTIFICATION_FIELDS} } } }`,
	health: `{
		info { os { hostname uptime } }
		array { ${ARRAY_FIELDS} }
		disks { ${PHYSICAL_DISK_FIELDS} }
		docker { containers { ${CONTAINER_FIELDS} } }
		notifications { warningsAndAlerts { ${NOTIFICATION_FIELDS} } }
		metrics { ${METRICS_FIELDS} }
	}`,
};

export const M = {
	arraySetState: `mutation ($input: ArrayStateInput!) { array { setState(input: $input) { id state } } }`,
	parityStart: 'mutation ($correct: Boolean!) { parityCheck { start(correct: $correct) } }',
	parityPause: 'mutation { parityCheck { pause } }',
	parityResume: 'mutation { parityCheck { resume } }',
	parityCancel: 'mutation { parityCheck { cancel } }',
	dockerAction: (action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'updateContainer') =>
		`mutation ($id: PrefixedID!) { docker { ${action}(id: $id) { ${CONTAINER_FIELDS} } } }`,
	dockerUpdateMany: `mutation ($ids: [PrefixedID!]!) { docker { updateContainers(ids: $ids) { ${CONTAINER_FIELDS} } } }`,
	dockerUpdateAll: `mutation { docker { updateAllContainers { ${CONTAINER_FIELDS} } } }`,
	dockerRefreshDigests: 'mutation { refreshDockerDigests }',
	vmAction: (action: 'start' | 'stop' | 'forceStop' | 'pause' | 'resume' | 'reboot' | 'reset') =>
		`mutation ($id: PrefixedID!) { vm { ${action}(id: $id) } }`,
	createNotification: `mutation ($input: NotificationData!) { createNotification(input: $input) { ${NOTIFICATION_FIELDS} } }`,
	notifyIfUnique: `mutation ($input: NotificationData!) { notifyIfUnique(input: $input) { ${NOTIFICATION_FIELDS} } }`,
	archiveNotification: `mutation ($id: PrefixedID!) { archiveNotification(id: $id) { ${NOTIFICATION_FIELDS} } }`,
	archiveAll: `mutation ($importance: NotificationImportance) { archiveAll(importance: $importance) {
		unread { info warning alert total } archive { info warning alert total }
	} }`,
};
