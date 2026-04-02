import type { App, BasesEntry, BasesPropertyId, NullValue } from 'obsidian';
import type { DecisionItem } from './types.ts';

const SKIP_PROPS = new Set(['title', 'name', 'status', 'tags', 'projects', 'file']);

/**
 * Detect which properties in the order array contain numeric values.
 * Returns bare property names (e.g. ['cost', 'quality']).
 * Skips formula properties, weight_* properties, and non-numeric fields.
 */
export function detectCriteria(
	entries: BasesEntry[],
	order: string[],
): string[] {
	const criteria: string[] = [];

	for (const prop of order) {
		if (prop.startsWith('formula.') || prop.startsWith('file.')) continue;

		const bare = prop.startsWith('note.') ? prop.slice(5) : prop;
		if (SKIP_PROPS.has(bare) || bare.startsWith('weight_')) continue;

		const propId = (prop.startsWith('note.') ? prop : `note.${prop}`) as BasesPropertyId;

		let hasNumeric = false;
		for (const entry of entries) {
			const val = entry.getValue(propId);
			if (val == null) continue;
			// getValue returns Bases Value objects — Number() uses their toString() path.
			// NullValue, ListValue, DateValue etc. all produce NaN; NumberValue produces the number.
			if (!isNaN(Number(val))) {
				hasNumeric = true;
				break;
			}
		}

		if (hasNumeric) criteria.push(bare);
	}

	return criteria;
}

/**
 * Detect numeric score criteria by scanning entry frontmatter directly.
 * Used by views that don't have a configured column order (e.g. Rankings view).
 * Skips weight_*, formula, and known non-score properties.
 */
export function detectCriteriaFromFiles(entries: BasesEntry[], app: App): string[] {
	const seen = new Set<string>();
	const criteria: string[] = [];

	for (const entry of entries) {
		const fm = app.metadataCache.getFileCache(entry.file)?.frontmatter;
		if (!fm) continue;
		for (const [key, val] of Object.entries(fm)) {
			if (seen.has(key)) continue;
			if (SKIP_PROPS.has(key) || key.startsWith('weight_')) continue;
			if (typeof val === 'number' || (typeof val === 'string' && val !== '' && !isNaN(Number(val)))) {
				seen.add(key);
				criteria.push(key);
			}
		}
	}

	return criteria;
}

/**
 * Extract a decision item from a Bases entry.
 */
export function extractItem(
	entry: BasesEntry,
	criteria: string[],
): DecisionItem {
	const title =
		parseString(entry.getValue('note.title' as BasesPropertyId)) ||
		entry.file.basename;

	const scores: Record<string, number | null> = {};
	for (const c of criteria) {
		const val = entry.getValue(`note.${c}` as BasesPropertyId);
		if (val == null) {
			scores[c] = null;
			continue;
		}
		const num = Number(val);
		scores[c] = isNaN(num) ? null : num;
	}

	return {
		id: entry.file.path,
		file: entry.file,
		title,
		scores,
		entry,
	};
}

function parseString(value: unknown): string {
	if (value == null) return '';
	const str = String(value).trim();
	if (str === 'null' || str === 'undefined') return '';
	return str;
}
