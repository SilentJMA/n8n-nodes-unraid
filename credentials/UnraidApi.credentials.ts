import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

export class UnraidApi implements ICredentialType {
	name = 'unraidApi';

	displayName = 'Unraid API';

	icon: Icon = { light: 'file:../nodes/Unraid/unraid.svg', dark: 'file:../nodes/Unraid/unraid.svg' };

	documentationUrl = 'https://docs.unraid.net/API/how-to-use-the-api/';

	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'string',
			default: 'https://tower.local',
			placeholder: 'https://192.168.1.10',
			required: true,
			description: 'Base URL of the Unraid WebGUI; requests go to /graphql. Use https:// when SSL is enabled (Unraid redirects http:// and the request would fail).',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Created in Settings › Management Access › API Keys (or "unraid-api apikey --create"). Docker updates, array and VM control need the admin role.',
		},
		{
			displayName: 'Ignore SSL Issues',
			name: 'ignoreSslIssues',
			type: 'boolean',
			default: false,
			description: 'Whether to connect even if the server uses a self-signed or otherwise invalid certificate (the default for Unraid on a LAN IP)',
		},
		// Pre-0.1.2 name of "Ignore SSL Issues". Kept hidden so credentials saved with it keep working:
		// n8n only loads stored values for declared fields. The password option satisfies n8n's name-based
		// lint rule (the name contains "cert"); it has no effect on a hidden field.
		{
			displayName: 'Ignore SSL Issues (Legacy)',
			name: 'allowUnauthorizedCerts',
			type: 'hidden',
			typeOptions: { password: true },
			default: false,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.serverUrl.replace(/\\/+$/, "")}}',
			url: '/graphql',
			method: 'POST',
			skipSslCertificateValidation: '={{$credentials.ignoreSslIssues === true || $credentials.allowUnauthorizedCerts === true}}',
			headers: { 'Content-Type': 'application/json' },
			body: { query: '{ online info { os { hostname } } }' },
		},
		// Unraid answers HTTP 200 with a GraphQL error for a bad key, so check the body.
		rules: [
			{
				type: 'responseSuccessBody',
				properties: { key: 'errors[0].extensions.code', value: 'UNAUTHENTICATED', message: 'Invalid or revoked API key' },
			},
			{
				type: 'responseSuccessBody',
				properties: { key: 'errors[0].extensions.code', value: 'FORBIDDEN', message: 'The API key may not read server info; give it at least a read role' },
			},
		],
	};
}
