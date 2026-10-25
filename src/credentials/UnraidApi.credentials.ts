import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class UnraidApi implements ICredentialType {
	name = 'unraidApi';

	displayName = 'Unraid API';

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
			name: 'allowUnauthorizedCerts',
			type: 'boolean',
			default: false,
			description: 'Whether to connect even if the server uses a self-signed or otherwise invalid certificate (the default for Unraid on a LAN IP)',
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
			skipSslCertificateValidation: '={{$credentials.allowUnauthorizedCerts}}',
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
