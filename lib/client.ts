// GraphQL transport for the Unraid API: POST <serverUrl>/graphql with the x-api-key credential.
import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions, IPollFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export type UnraidContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

interface GraphqlError {
	message: string;
	path?: Array<string | number>;
	extensions?: { code?: string };
}

interface GraphqlResponse<T> {
	data?: T | null;
	errors?: GraphqlError[];
}

export async function unraidGraphql(
	this: UnraidContext,
	query: string,
	variables: IDataObject = {},
): Promise<IDataObject> {
	const credentials = await this.getCredentials('unraidApi');
	const baseUrl = String(credentials.serverUrl ?? '').replace(/\/+$/, '');
	if (!/^https?:\/\//i.test(baseUrl)) {
		throw new NodeOperationError(this.getNode(), `Invalid Unraid server URL "${baseUrl}". It must start with http:// or https://.`);
	}

	let response: GraphqlResponse<IDataObject>;
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(this, 'unraidApi', {
			method: 'POST',
			url: `${baseUrl}/graphql`,
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: { query, variables },
			json: true,
			// allowUnauthorizedCerts: the field's name before 0.1.2, still set on older saved credentials.
			skipSslCertificateValidation: credentials.ignoreSslIssues === true || credentials.allowUnauthorizedCerts === true,
		})) as GraphqlResponse<IDataObject>;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			message: 'Unraid API request failed',
			description: baseUrl.startsWith('http://')
				? 'If SSL is enabled on Unraid, http:// is redirected to https:// and the request body is lost. Use the https:// URL (with Ignore SSL Issues for the self-signed certificate).'
				: 'Check the server URL, that the API is enabled (Unraid 7.2+ or the Unraid Connect plugin) and that the API key is valid.',
		});
	}

	if (response?.errors?.length) {
		const message = response.errors.map((e) => (e.path?.length ? `${e.path.join('.')}: ${e.message}` : e.message)).join('; ');
		const forbidden = response.errors.some((e) => e.extensions?.code === 'FORBIDDEN' || /forbidden|permission/i.test(e.message));
		const unauthenticated = response.errors.some((e) => e.extensions?.code === 'UNAUTHENTICATED');
		throw new NodeOperationError(this.getNode(), `Unraid API error: ${message}`, {
			description: unauthenticated
				? 'The API key is invalid or was revoked. Create a new one in Settings › Management Access › API Keys and update the Unraid API credential.'
				: forbidden
					? 'The API key lacks the permission for this operation. Give it the admin role, or the matching resource permission.'
					: undefined,
		});
	}
	if (!response?.data) {
		throw new NodeOperationError(this.getNode(), 'Unraid API returned no data');
	}
	return response.data;
}
