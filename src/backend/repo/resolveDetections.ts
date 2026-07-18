/**
 * Case-insensitive resolution of model-reported entity names against the
 * store — unknown names are dropped (hallucination guard, user-entity-store
 * spec). Pure and dependency-free so jest exercises it without op-sqlite
 * (`src/backend/__tests__/resolveDetections.test.ts`); EntityRepo is the
 * only production caller.
 */
export function resolveDetectedNames(
	reported: readonly string[],
	known: readonly { id: string; name: string }[],
): string[] {
	const byName = new Map<string, string>();
	for (const entity of known) {
		const key = entity.name.trim().toLowerCase();
		if (key.length > 0 && !byName.has(key)) {
			byName.set(key, entity.id);
		}
	}
	const ids: string[] = [];
	const seen = new Set<string>();
	for (const name of reported) {
		const id = byName.get(name.trim().toLowerCase());
		if (id !== undefined && !seen.has(id)) {
			seen.add(id);
			ids.push(id);
		}
	}
	return ids;
}
