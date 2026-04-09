/**
 * DOM scaffold and table rendering for the decision matrix view.
 */
import type { DecisionItem, ItemGroup, ScoreScale } from './types.ts';

export interface MatrixScaffold {
	toolbar: HTMLElement;
	body: HTMLElement;
	rawSection: HTMLElement;
	weightedSection: HTMLElement;
}

export function buildMatrixScaffold(container: HTMLElement): MatrixScaffold {
	const toolbar = container.createEl('div', { cls: 'dmv-toolbar' });
	const body = container.createEl('div', { cls: 'dmv-body' });
	const rawSection = body.createEl('div', { cls: 'dmv-section' });
	const weightedSection = body.createEl('div', { cls: 'dmv-section' });
	return { toolbar, body, rawSection, weightedSection };
}

export function computeRankedScores(
	groups: ItemGroup[],
	criteria: string[],
	scale: ScoreScale,
): Map<string, Record<string, number>> {
	const allItems = groups.flatMap(g => g.items);
	const result = new Map<string, Record<string, number>>();
	for (const item of allItems) result.set(item.id, {});

	for (const c of criteria) {
		let colMax = 0;
		for (const item of allItems) {
			const v = item.scores[c] ?? 0;
			if (v > colMax) colMax = v;
		}

		if (colMax === 0) {
			for (const item of allItems) result.get(item.id)![c] = 1;
			continue;
		}

		// Step 1: normalize (keep as float so close values stay distinct)
		const normMap = new Map<string, number>();
		for (const item of allItems) {
			normMap.set(item.id, ((item.scores[c] ?? 0) / colMax) * scale);
		}

		// Step 2: competition rank top-down, floor at 0 for sets larger than scale
		const distinctDesc = [...new Set(normMap.values())].sort((a, b) => b - a);
		const valToRank = new Map<number, number>();
		for (let i = 0; i < distinctDesc.length; i++) {
			valToRank.set(distinctDesc[i], Math.max(1, scale - i));
		}

		for (const item of allItems) {
			result.get(item.id)![c] = valToRank.get(normMap.get(item.id)!)!;
		}
	}

	return result;
}

/**
 * Raw scores table — criteria names in header, editable score cells, clickable item names.
 */
export function renderRawTable(
	container: HTMLElement,
	groups: ItemGroup[],
	criteria: string[],
	scale: ScoreScale,
	onScoreEdit: (item: DecisionItem, criterion: string, newValue: number) => void,
	onItemClick: (item: DecisionItem, e: MouseEvent) => void,
	scorePrefix?: string,
	collapsedGroups?: Set<string>,
	onToggleGroup?: (key: string) => void,
	rankRaws?: boolean,
	rankedScores?: Map<string, Record<string, number>>,
	columnsFolded?: boolean,
): void {
	container.createEl('h3', { text: 'Raw Scores', cls: 'dmv-section-title' });

	const wrap = container.createEl('div', { cls: 'dmv-table-wrap' });
	const table = wrap.createEl('table', { cls: rankRaws ? 'dmv-table dmv-table--rank-raws' : 'dmv-table' });
	const thead = table.createEl('thead');

	const headerRow = thead.createEl('tr');
	headerRow.createEl('th', { text: 'Item', cls: 'dmv-th dmv-th-item' });

	if (!columnsFolded) {
		for (const c of criteria) {
			const th = headerRow.createEl('th', { cls: 'dmv-th dmv-th-criterion' });
			th.createEl('span', { text: formatCriterionName(c, scorePrefix), cls: 'dmv-criterion-label' });
			if (rankRaws) {
				headerRow.createEl('th', { text: 'N', cls: 'dmv-th dmv-th-rank-col' });
			}
		}
	}

	const tbody = table.createEl('tbody');

	for (const group of groups) {
		const hasGroupKey = group.key !== '';
		const isCollapsed = hasGroupKey && (collapsedGroups?.has(group.key) ?? false);

		// Render group header row for named groups
		if (hasGroupKey) {
			const groupTr = tbody.createEl('tr', { cls: 'dmv-group-header' });
			const colCount = columnsFolded ? 1 : (rankRaws ? criteria.length * 2 + 1 : criteria.length + 1);
			const groupTd = groupTr.createEl('td', {
				attr: { colspan: String(colCount) },
			});
			const caret = groupTd.createEl('span', {
				cls: 'dmv-group-caret',
				text: isCollapsed ? '▶' : '▼',
			});
			groupTd.appendChild(document.createTextNode(group.key));
			groupTr.addEventListener('click', () => {
				if (onToggleGroup) onToggleGroup(group.key);
			});
		}

		if (isCollapsed) continue;

		for (const item of group.items) {
			const tr = tbody.createEl('tr', { cls: 'dmv-row' });

			const nameTd = tr.createEl('td', { cls: 'dmv-td dmv-td-item dmv-td-link' });
			nameTd.textContent = item.title;
			nameTd.addEventListener('click', (e: MouseEvent) => onItemClick(item, e));

			if (!columnsFolded) {
				for (const c of criteria) {
					const score = item.scores[c] ?? null;
					const td = tr.createEl('td', { cls: 'dmv-td dmv-td-score dmv-td-editable' });
					renderEditableScore(td, score, scale, (newVal) => onScoreEdit(item, c, newVal), rankRaws);
					if (rankRaws) {
						const rankVal = rankedScores?.get(item.id)?.[c] ?? 0;
						const rankTd = tr.createEl('td', { cls: 'dmv-td dmv-td-score dmv-td-rank-raw' });
						rankTd.createEl('span', { text: String(rankVal), cls: 'dmv-score-display' });
						colorScoreCell(rankTd, rankVal, scale);
					}
				}
			}
		}
	}

	requestAnimationFrame(() => {
		if (table.scrollWidth > wrap.clientWidth) {
			table.classList.add('dmv-table--compact');
		}
	});
}

/**
 * Renders a score cell that toggles into an inline input on click.
 * No clamping — users can enter any value; color coding handles indication.
 * When allowDecimals is true, values are not rounded to integers.
 */
function renderEditableScore(
	td: HTMLElement,
	score: number | null,
	scale: ScoreScale,
	onCommit: (value: number) => void,
	allowDecimals = false,
): void {
	td.empty();
	td.createEl('span', { text: score === null ? '' : String(score), cls: 'dmv-score-display' });
	if (score !== null) colorScoreCell(td, score, scale);

	td.addEventListener('click', () => {
		if (td.querySelector('input')) return;

		td.empty();
		td.classList.add('dmv-td--editing');

		const input = td.createEl('input', {
			cls: 'dmv-score-input',
			type: 'number',
			attr: { min: '0', step: allowDecimals ? '0.01' : '1' },
		});
		input.value = score === null ? '' : String(score);
		input.select();

		const commit = () => {
			const v = parseFloat(input.value);
			if (isNaN(v)) {
				// Blank input — restore previous display without writing
				td.classList.remove('dmv-td--editing');
				td.empty();
				td.createEl('span', { text: score === null ? '' : String(score), cls: 'dmv-score-display' });
				if (score !== null) colorScoreCell(td, score, scale);
				return;
			}
			const val = allowDecimals ? Math.max(0, v) : Math.max(0, Math.round(v));
			td.classList.remove('dmv-td--editing');
			td.empty();
			td.createEl('span', { text: String(val), cls: 'dmv-score-display' });
			colorScoreCell(td, val, scale);
			onCommit(val);
		};

		input.addEventListener('blur', commit);
		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
			if (e.key === 'Escape') {
				td.classList.remove('dmv-td--editing');
				td.empty();
				td.createEl('span', { text: score === null ? '' : String(score), cls: 'dmv-score-display' });
				if (score !== null) colorScoreCell(td, score, scale);
			}
		});

		input.focus();
	});
}

function resolveScores(
	item: DecisionItem,
	criteria: string[],
	rankRaws: boolean,
	rankedScores: Map<string, Record<string, number>> | undefined,
): Record<string, number> {
	if (rankRaws && rankedScores) {
		const ranked = rankedScores.get(item.id) ?? {};
		const out: Record<string, number> = {};
		for (const c of criteria) out[c] = ranked[c] ?? 0;
		return out;
	}
	const out: Record<string, number> = {};
	for (const c of criteria) out[c] = item.scores[c] ?? 0;
	return out;
}

function computeWeightedAvgFromScores(
	effectiveScores: Record<string, number>,
	criteria: string[],
	weights: Record<string, number>,
): number {
	let sumWeighted = 0, sumAbsWeights = 0;
	for (const c of criteria) {
		const w = weights[c] ?? 1;
		sumWeighted += (effectiveScores[c] ?? 0) * w;
		sumAbsWeights += Math.abs(w);
	}
	return sumAbsWeights > 0 ? sumWeighted / sumAbsWeights : 0;
}

/**
 * Weighted scores table — editable weight inputs in a sub-header row, rank column.
 * Weights are always editable regardless of source.
 */
export function renderWeightedTable(
	container: HTMLElement,
	groups: ItemGroup[],
	criteria: string[],
	scale: ScoreScale,
	weights: Record<string, number>,
	weightsFromNote: boolean,
	onWeightChange: (criterion: string, value: number) => void,
	onItemClick: (item: DecisionItem, e: MouseEvent) => void,
	scorePrefix?: string,
	collapsedGroups?: Set<string>,
	onToggleGroup?: (key: string) => void,
	rankRaws?: boolean,
	rankedScores?: Map<string, Record<string, number>>,
	columnsFolded?: boolean,
): void {
	container.createEl('h3', { text: 'Weighted Scores', cls: 'dmv-section-title' });

	const wrap = container.createEl('div', { cls: 'dmv-table-wrap' });
	const table = wrap.createEl('table', { cls: 'dmv-table' });
	const thead = table.createEl('thead');

	if (columnsFolded) {
		// Single header row with only the always-visible columns
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Item', cls: 'dmv-th dmv-th-item' });
		headerRow.createEl('th', {
			text: 'W.A.',
			cls: 'dmv-th dmv-th-avg',
			attr: { title: 'Weighted average. Formula: Σ(score × weight) / Σ|weight|' },
		});
		headerRow.createEl('th', { text: 'Rank', cls: 'dmv-th dmv-th-rank' });
	} else {
		// Row 1: criterion names
		const nameRow = thead.createEl('tr');
		nameRow.createEl('th', { text: 'Item', cls: 'dmv-th dmv-th-item', attr: { rowspan: '2' } });
		for (const c of criteria) {
			const th = nameRow.createEl('th', { cls: 'dmv-th dmv-th-criterion' });
			th.createEl('span', { text: formatCriterionName(c, scorePrefix), cls: 'dmv-criterion-label' });
		}
		nameRow.createEl('th', {
			text: 'W.A.',
			cls: 'dmv-th dmv-th-avg',
			attr: { title: 'Weighted average. Formula: Σ(score × weight) / Σ|weight|', rowspan: '2' },
		});
		nameRow.createEl('th', { text: 'Rank', cls: 'dmv-th dmv-th-rank', attr: { rowspan: '2' } });

		// Row 2: weight inputs
		const weightRow = thead.createEl('tr', { cls: 'dmv-weight-row-header' });
		for (const c of criteria) {
			const wTh = weightRow.createEl('th', { cls: 'dmv-th dmv-th-weight dmv-th-weight--compact' });
			const input = wTh.createEl('input', {
				cls: 'dmv-weight-input',
				type: 'number',
				attr: { step: '0.1' }, // no min — negatives allowed
			});
			input.value = String(weights[c] ?? 1);
			if (weightsFromNote) {
				input.title = `From note: weight_${c}. Edit here to override for this session.`;
			}
			input.addEventListener('change', () => {
				const v = parseFloat(input.value);
				onWeightChange(c, isNaN(v) ? 1 : v); // negatives allowed
			});
		}
	}

	// Compute ranks — standard competition ranking (ties share the same rank)
	// Flatten all items across groups for ranking purposes
	const allItems = groups.flatMap(g => g.items);
	const weightedAvgs = allItems.map(item => {
		const eff = resolveScores(item, criteria, rankRaws ?? false, rankedScores);
		return { item, avg: computeWeightedAvgFromScores(eff, criteria, weights) };
	});
	weightedAvgs.sort((a, b) => b.avg - a.avg);

	// Assign ranks: items with the same avg get the same rank; next rank skips
	const rankMap = new Map<string, number>();
	const tieMap = new Map<string, boolean>(); // id → is tied with another item
	let pos = 1;
	for (let i = 0; i < weightedAvgs.length; i++) {
		if (i > 0 && weightedAvgs[i].avg === weightedAvgs[i - 1].avg) {
			// Tied with previous — give same rank, mark both as tied
			const prevRank = rankMap.get(weightedAvgs[i - 1].item.id)!;
			rankMap.set(weightedAvgs[i].item.id, prevRank);
			tieMap.set(weightedAvgs[i].item.id, true);
			tieMap.set(weightedAvgs[i - 1].item.id, true);
		} else {
			rankMap.set(weightedAvgs[i].item.id, pos);
		}
		pos++;
	}

	// Data rows
	const tbody = table.createEl('tbody');

	for (const group of groups) {
		const hasGroupKey = group.key !== '';
		const isCollapsed = hasGroupKey && (collapsedGroups?.has(group.key) ?? false);

		// Render group header row for named groups
		if (hasGroupKey) {
			const groupTr = tbody.createEl('tr', { cls: 'dmv-group-header' });
			const groupTd = groupTr.createEl('td', {
				attr: { colspan: String(columnsFolded ? 3 : criteria.length + 3) },
			});
			const caret = groupTd.createEl('span', {
				cls: 'dmv-group-caret',
				text: isCollapsed ? '▶' : '▼',
			});
			groupTd.appendChild(document.createTextNode(group.key));
			groupTr.addEventListener('click', () => {
				if (onToggleGroup) onToggleGroup(group.key);
			});
		}

		if (isCollapsed) continue;

		for (const item of group.items) {
			const tr = tbody.createEl('tr', { cls: 'dmv-row' });
			const rank = rankMap.get(item.id) ?? 0;
			if (rank <= 3) tr.classList.add(`dmv-row--rank-${rank}`);

			const nameTd = tr.createEl('td', { cls: 'dmv-td dmv-td-item dmv-td-link' });
			nameTd.textContent = item.title;
			nameTd.addEventListener('click', (e: MouseEvent) => onItemClick(item, e));

			const effectiveScores = resolveScores(item, criteria, rankRaws ?? false, rankedScores);
			if (!columnsFolded) {
				for (const c of criteria) {
					const score = effectiveScores[c];
					const w = weights[c] ?? 1;
					const weighted = round2(score * w);
					const td = tr.createEl('td', { text: String(weighted), cls: 'dmv-td dmv-td-score' });
					colorScoreCell(td, score, scale);
				}
			}

			const avg = computeWeightedAvgFromScores(effectiveScores, criteria, weights);
			const avgTd = tr.createEl('td', { text: to2SigFigs(avg), cls: 'dmv-td dmv-td-avg' });
			colorScoreCell(avgTd, avg, scale);

			const isTied = tieMap.get(item.id) ?? false;
			const rankLabel = isTied ? `=${rank}` : `#${rank}`;
			const rankTd = tr.createEl('td', { text: rankLabel, cls: 'dmv-td dmv-td-rank' });
			if (rank <= 3) rankTd.classList.add(`dmv-rank--top-${rank}`);
		}
	}

	requestAnimationFrame(() => {
		if (table.scrollWidth > wrap.clientWidth) {
			table.classList.add('dmv-table--compact');
		}
	});
}


function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/** Format to 2 significant figures without scientific notation. */
function to2SigFigs(n: number): string {
	if (n === 0) return '0';
	return Number(n.toPrecision(2)).toString();
}

export function formatCriterionName(name: string, prefix?: string): string {
	let n = name;
	if (prefix && n.startsWith(prefix)) {
		n = n.slice(prefix.length);
	}
	return n
		.replace(/[_-]/g, ' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/\b\w/g, c => c.toUpperCase());
}

function colorScoreCell(td: HTMLElement, score: number, scale: ScoreScale): void {
	td.classList.remove('dmv-score--high', 'dmv-score--mid', 'dmv-score--low', 'dmv-score--over');
	const pct = score / scale;
	if (pct > 1) td.classList.add('dmv-score--over');
	else if (pct >= 0.8) td.classList.add('dmv-score--high');
	else if (pct >= 0.5) td.classList.add('dmv-score--mid');
	else if (pct > 0) td.classList.add('dmv-score--low');
}
