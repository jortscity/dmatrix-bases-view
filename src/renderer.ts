/**
 * DOM scaffold and table rendering for the decision matrix view.
 */
import { App, Modal, Notice, setIcon } from 'obsidian';
import type { DecisionItem, ItemGroup, ScoreScale } from './types.ts';
import { SCALES } from './types.ts';

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
	rankRawsColumns?: Set<string>,
	rankedScores?: Map<string, Record<string, number>>,
	foldedColCount?: number,
): void {
	container.createEl('h3', { text: 'Raw Scores', cls: 'dmv-section-title' });

	const wrap = container.createEl('div', { cls: 'dmv-table-wrap' });
	const table = wrap.createEl('table', { cls: 'dmv-table' });
	const thead = table.createEl('thead');

	const headerRow = thead.createEl('tr');
	headerRow.createEl('th', { text: 'Item', cls: 'dmv-th dmv-th-item' });

	if (!foldedColCount) {
		for (const c of criteria) {
			const th = headerRow.createEl('th', { cls: 'dmv-th dmv-th-criterion' });
			th.createEl('span', { text: formatCriterionName(c, scorePrefix), cls: 'dmv-criterion-label' });
		}
	}

	const tbody = table.createEl('tbody');

	for (const group of groups) {
		const hasGroupKey = group.key !== '';
		const isCollapsed = hasGroupKey && (collapsedGroups?.has(group.key) ?? false);

		// Render group header row for named groups
		if (hasGroupKey) {
			const groupTr = tbody.createEl('tr', { cls: 'dmv-group-header' });
			const visRaw = foldedColCount ? Math.max(0, criteria.length - foldedColCount) : criteria.length;
			const colCount = foldedColCount ? visRaw + 2 : criteria.length + 1;
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

			if (!foldedColCount) {
				for (const c of criteria) {
					const score = item.scores[c] ?? null;
					const isRanked = rankRawsColumns?.has(c) ?? false;
					const rankVal = isRanked ? (rankedScores?.get(item.id)?.[c] ?? undefined) : undefined;
					const td = tr.createEl('td', { cls: 'dmv-td dmv-td-score dmv-td-editable' });
					renderEditableScore(td, score, scale, (newVal) => onScoreEdit(item, c, newVal), rankVal);
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
 * When rankDisplay is provided, shows the rank as the main value with the raw score below;
 * clicking still edits the underlying raw score.
 */
function renderEditableScore(
	td: HTMLElement,
	score: number | null,
	scale: ScoreScale,
	onCommit: (value: number) => void,
	rankDisplay?: number,
): void {
	td.empty();
	td.classList.remove('dmv-score--high', 'dmv-score--mid', 'dmv-score--low', 'dmv-score--over');

	if (rankDisplay !== undefined) {
		td.createEl('span', { text: String(rankDisplay), cls: 'dmv-score-display' });
		colorScoreCell(td, rankDisplay, scale);
		if (score !== null) {
			td.createEl('span', { text: String(score), cls: 'dmv-score-raw-sub' });
		}
	} else {
		td.createEl('span', { text: score === null ? '' : String(score), cls: 'dmv-score-display' });
		if (score !== null) colorScoreCell(td, score, scale);
	}

	td.addEventListener('click', () => {
		if (td.querySelector('input')) return;

		td.empty();
		td.classList.remove('dmv-score--high', 'dmv-score--mid', 'dmv-score--low', 'dmv-score--over');
		td.classList.add('dmv-td--editing');

		const input = td.createEl('input', {
			cls: 'dmv-score-input',
			type: 'number',
			attr: { min: '0', step: '1' },
		});
		input.value = score === null ? '' : String(score);
		input.select();

		const restore = () => {
			td.classList.remove('dmv-td--editing');
			renderEditableScore(td, score, scale, onCommit, rankDisplay);
		};

		const commit = () => {
			const v = parseFloat(input.value);
			if (isNaN(v)) {
				restore();
				return;
			}
			const val = Math.max(0, Math.round(v));
			restore();
			onCommit(val);
		};

		input.addEventListener('blur', commit);
		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
			if (e.key === 'Escape') { restore(); }
		});

		input.focus();
	});
}

function resolveScores(
	item: DecisionItem,
	criteria: string[],
	rankRawsColumns: Set<string>,
	rankedScores: Map<string, Record<string, number>> | undefined,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const c of criteria) {
		if (rankRawsColumns.has(c) && rankedScores) {
			out[c] = rankedScores.get(item.id)?.[c] ?? 0;
		} else {
			out[c] = item.scores[c] ?? 0;
		}
	}
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
	rankRawsColumns?: Set<string>,
	rankedScores?: Map<string, Record<string, number>>,
	foldedColCount?: number,
	onToggleRankRaw?: (criterion: string, checked: boolean) => void,
): void {
	container.createEl('h3', { text: 'Weighted Scores', cls: 'dmv-section-title' });

	const wrap = container.createEl('div', { cls: 'dmv-table-wrap' });
	const table = wrap.createEl('table', { cls: 'dmv-table' });
	const thead = table.createEl('thead');

	const visibleCount = foldedColCount ? Math.max(0, criteria.length - foldedColCount) : criteria.length;
	const visibleCriteria = criteria.slice(0, visibleCount);
	const hasVisibleCriteria = visibleCriteria.length > 0;
	const showRankRaws = !!onToggleRankRaw && visibleCriteria.length > 0;

	const buildWeightRow = (parent: HTMLElement) => {
		const weightRow = parent.createEl('tr', { cls: 'dmv-weight-row-header' });
		for (const c of visibleCriteria) {
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
	};

	if (showRankRaws) {
		// Three-row header: [rank-raws] | [criterion names] | [weight inputs]
		// W.A., Rank (and Folded if present) span all three rows from the rank-raws row.
		const rankRawsRow = thead.createEl('tr', { cls: 'dmv-rank-raws-row' });
		rankRawsRow.createEl('td', { text: 'Rank Raws', cls: 'dmv-td dmv-rank-raws-label' });
		for (const c of visibleCriteria) {
			const cell = rankRawsRow.createEl('td', { cls: 'dmv-td dmv-rank-raws-cell' });
			const cb = cell.createEl('input', { type: 'checkbox', cls: 'dmv-rank-raws-cb' });
			cb.checked = rankRawsColumns?.has(c) ?? false;
			cb.addEventListener('change', (e: Event) => {
				e.stopPropagation();
				onToggleRankRaw!(c, cb.checked);
			});
		}
		if (foldedColCount) {
			const foldedTh = rankRawsRow.createEl('th', { cls: 'dmv-th dmv-th-folded', attr: { rowspan: '3' } });
			foldedTh.createEl('span', { text: `${foldedColCount} col${foldedColCount > 1 ? 's' : ''} folded`, cls: 'dmv-folded-label' });
		}
		rankRawsRow.createEl('th', {
			text: 'W.A.',
			cls: 'dmv-th dmv-th-avg',
			attr: { title: 'Weighted average. Formula: Σ(score × weight) / Σ|weight|', rowspan: '3' },
		});
		rankRawsRow.createEl('th', { text: 'Rank', cls: 'dmv-th dmv-th-rank', attr: { rowspan: '3' } });

		// Row 2: criterion names; Item spans rows 2–3
		const nameRow = thead.createEl('tr');
		nameRow.createEl('th', { text: 'Item', cls: 'dmv-th dmv-th-item', attr: { rowspan: '2' } });
		for (const c of visibleCriteria) {
			const th = nameRow.createEl('th', { cls: 'dmv-th dmv-th-criterion' });
			th.createEl('span', { text: formatCriterionName(c, scorePrefix), cls: 'dmv-criterion-label' });
		}

		// Row 3: weight inputs
		buildWeightRow(thead);
	} else {
		// Two-row (or one-row when all cols folded) header
		const rowspan = hasVisibleCriteria ? '2' : '1';

		const nameRow = thead.createEl('tr');
		nameRow.createEl('th', { text: 'Item', cls: 'dmv-th dmv-th-item', attr: { rowspan } });
		for (const c of visibleCriteria) {
			const th = nameRow.createEl('th', { cls: 'dmv-th dmv-th-criterion' });
			th.createEl('span', { text: formatCriterionName(c, scorePrefix), cls: 'dmv-criterion-label' });
		}
		if (foldedColCount) {
			const foldedTh = nameRow.createEl('th', { cls: 'dmv-th dmv-th-folded', attr: { rowspan } });
			foldedTh.createEl('span', {
				text: `${foldedColCount} col${foldedColCount > 1 ? 's' : ''} folded`,
				cls: 'dmv-folded-label',
			});
		}
		nameRow.createEl('th', {
			text: 'W.A.',
			cls: 'dmv-th dmv-th-avg',
			attr: { title: 'Weighted average. Formula: Σ(score × weight) / Σ|weight|', rowspan },
		});
		nameRow.createEl('th', { text: 'Rank', cls: 'dmv-th dmv-th-rank', attr: { rowspan } });

		if (hasVisibleCriteria) {
			buildWeightRow(thead);
		}
	}

	// Compute ranks — standard competition ranking (ties share the same rank)
	// Flatten all items across groups for ranking purposes
	const allItems = groups.flatMap(g => g.items);
	const weightedAvgs = allItems.map(item => {
		const eff = resolveScores(item, criteria, rankRawsColumns ?? new Set(), rankedScores);
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
				attr: { colspan: String(visibleCriteria.length + (foldedColCount ? 1 : 0) + 3) },
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

			const effectiveScores = resolveScores(item, criteria, rankRawsColumns ?? new Set(), rankedScores);
			for (const c of visibleCriteria) {
				const score = effectiveScores[c];
				const w = weights[c] ?? 1;
				const weighted = round2(score * w);
				const td = tr.createEl('td', { text: String(weighted), cls: 'dmv-td dmv-td-score' });
				colorScoreCell(td, score, scale);
			}
			if (foldedColCount) {
				tr.createEl('td', { cls: 'dmv-td dmv-td-folded' });
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

// ── Shared toolbar ────────────────────────────────────────────

export interface ToolbarConfig {
	currentScale: ScoreScale;
	onScaleChange: (scale: ScoreScale) => void;
	onReloadWeights: () => void;
	foldColsActive: boolean;
	foldColsCount: number;
	onFoldToggle: () => void;
	onFoldCountChange: (count: number) => void;
	rankRawsActive: boolean;
	onNormalize: () => void;
}

export function renderToolbar(container: HTMLElement, cfg: ToolbarConfig): void {
	const scaleGroup = container.createEl('div', { cls: 'dmv-scale-group' });
	scaleGroup.createEl('span', { text: 'Scale:', cls: 'dmv-toolbar-label' });
	for (const s of SCALES) {
		const btn = scaleGroup.createEl('button', {
			text: `/ ${s}`,
			cls: s === cfg.currentScale ? 'dmv-scale-btn is-active' : 'dmv-scale-btn',
		});
		btn.addEventListener('click', () => { if (s !== cfg.currentScale) cfg.onScaleChange(s); });
	}

	container.createEl('div', { cls: 'dmv-toolbar-separator' });

	const reloadBtn = container.createEl('button', {
		cls: 'dmv-btn dmv-btn--icon',
		attr: { title: 'Reload weights from embedding note frontmatter (weight_*)' },
	});
	setIcon(reloadBtn, 'refresh-cw');
	reloadBtn.addEventListener('click', cfg.onReloadWeights);

	container.createEl('div', { cls: 'dmv-toolbar-separator' });

	const foldGroup = container.createEl('div', { cls: 'dmv-fold-group' });
	const foldColsBtn = foldGroup.createEl('button', {
		text: 'Fold Cols',
		cls: cfg.foldColsActive ? 'dmv-btn dmv-btn--toggle is-active' : 'dmv-btn dmv-btn--toggle',
		attr: { title: 'Hide N score columns; replaced by a folded column indicator' },
	});
	foldColsBtn.addEventListener('click', cfg.onFoldToggle);
	const foldInput = foldGroup.createEl('input', {
		cls: 'dmv-fold-input',
		type: 'number',
		attr: { min: '1', step: '1', title: 'Number of columns to fold' },
	});
	foldInput.value = String(cfg.foldColsCount);
	foldInput.addEventListener('change', () => {
		const v = parseInt(foldInput.value);
		if (!isNaN(v) && v >= 1) cfg.onFoldCountChange(v);
	});

	container.createEl('div', { cls: 'dmv-toolbar-separator' });

	const normalizeBtn = container.createEl('button', {
		text: 'Normalize',
		cls: cfg.rankRawsActive ? 'dmv-btn dmv-btn--disabled' : 'dmv-btn',
		attr: {
			title: cfg.rankRawsActive
				? 'Disabled while Rank Raws is active'
				: `Per-criterion: any value exceeding /${cfg.currentScale} is scaled down by that criterion's max`,
		},
	});
	if (cfg.rankRawsActive) {
		normalizeBtn.setAttribute('disabled', 'true');
	} else {
		normalizeBtn.addEventListener('click', cfg.onNormalize);
	}
}

// ── Normalize ─────────────────────────────────────────────────

export async function normalizeScores(
	app: App,
	items: DecisionItem[],
	criteria: string[],
	targetScale: ScoreScale,
): Promise<void> {
	const scalingMap = new Map<string, number>();
	for (const c of criteria) {
		let max = 0;
		for (const item of items) {
			const v = item.scores[c] ?? 0;
			if (v > max) max = v;
		}
		if (max > targetScale) scalingMap.set(c, max);
	}

	if (scalingMap.size === 0) {
		new Notice(`All scores are already within the /${targetScale} scale.`);
		return;
	}

	const criteriaNames = [...scalingMap.keys()].join(', ');
	const confirmed = await new Promise<boolean>(resolve => {
		new NormalizeConfirmModal(
			app,
			`This will overwrite raw scores for ${scalingMap.size} criterion${scalingMap.size > 1 ? 'a' : ''}: ${criteriaNames}. This cannot be undone.`,
			resolve,
		).open();
	});

	if (!confirmed) return;

	for (const item of items) {
		await app.fileManager.processFrontMatter(item.file, (fm: Record<string, unknown>) => {
			for (const [c, divisor] of scalingMap) {
				const raw = item.scores[c];
				if (raw == null) continue;
				fm[c] = Math.max(0, Math.round((raw / divisor) * targetScale));
			}
		});
	}

	new Notice(`Normalized ${scalingMap.size} criterion${scalingMap.size > 1 ? 'a' : ''}: ${criteriaNames}`);
}

class NormalizeConfirmModal extends Modal {
	private message: string;
	private onSubmit: (confirmed: boolean) => void;

	constructor(app: App, message: string, onSubmit: (confirmed: boolean) => void) {
		super(app);
		this.message = message;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('p', { text: this.message });
		const btnRow = contentEl.createEl('div', { cls: 'modal-button-container' });
		btnRow.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
			this.onSubmit(false);
			this.close();
		});
		btnRow.createEl('button', { text: 'Normalize', cls: 'mod-cta mod-warning' })
			.addEventListener('click', () => {
				this.onSubmit(true);
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
