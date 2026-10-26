// Container lookup: lets users pass either a container name ("plex") or its PrefixedID.
import type { IDataObject, INodePropertyOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { containerName } from './analysis';
import { unraidGraphql, type UnraidContext } from './client';
import { Q } from './queries';

export interface ContainerCache {
	refs?: ContainerRef[];
}

export interface ContainerRef {
	id: string;
	names: string[];
	state: string;
}

export async function listContainerRefs(this: UnraidContext): Promise<ContainerRef[]> {
	const data = await unraidGraphql.call(this, Q.containerNames);
	return ((data.docker as IDataObject).containers as unknown as ContainerRef[]) ?? [];
}

export function matchContainer(refs: ContainerRef[], value: string): ContainerRef | undefined {
	const v = value.trim();
	const lower = v.replace(/^\//, '').toLowerCase();
	return (
		refs.find((c) => c.id === v || c.id.endsWith(`:${v}`)) ??
		refs.find((c) => containerName(c).toLowerCase() === lower) ??
		refs.find((c) => c.names.some((n) => n.replace(/^\//, '').toLowerCase() === lower)) ??
		refs.find((c) => commandSafeName(containerName(c)) === commandSafeName(v))
	);
}

/** Telegram commands allow only [a-z0-9_], so "Plex-Media-Server" is sent as plex_media_server. */
export function commandSafeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

/** Resolves names/IDs, reusing one container listing per execution via the cache object. */
export async function resolveContainerIds(this: UnraidContext, values: string[], cache: ContainerCache): Promise<string[]> {
	cache.refs ??= await listContainerRefs.call(this);
	return values.map((value) => {
		const match = matchContainer(cache.refs!, value);
		if (!match) {
			throw new NodeOperationError(this.getNode(), `No Docker container named or with ID "${value}"`, {
				description: `Known containers: ${cache.refs!.map((c) => containerName(c)).join(', ') || 'none'}`,
			});
		}
		return match.id;
	});
}

export async function containerOptions(this: UnraidContext): Promise<INodePropertyOptions[]> {
	const refs = await listContainerRefs.call(this);
	return refs
		.map((c) => ({ name: `${containerName(c)} (${c.state.toLowerCase()})`, value: containerName(c) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Adds a plain `name` field next to Docker's `names` array. */
export function withName<T extends { names?: string[] | null; id?: string }>(container: T): T & { name: string } {
	return { name: containerName(container), ...container };
}
