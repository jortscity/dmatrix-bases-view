import { BasesView, BasesViewConfig, BasesEntryGroup, Notice, setIcon } from 'obsidian';
import type { QueryController } from 'obsidian';
import type DecisionMatrixPlugin from './main.ts';
import type { DecisionItem, ItemGroup, ScoreScale } from './types.ts';
import { SCALES } from './types.ts';
import { detectCriteria, detectCriteriaFromFiles, extractItem } from './field-mapping.ts';
import { buildMatrixScaffold, renderRawTable, renderWeightedTable, computeRankedScores } from './renderer.ts';

export class DecisionMatrixView extends BasesView {
	type = 'decision-matrix';
	private scrollEl: HTMLElement;
	private rootEl: HTMLElement;
	private plugin: DecisionMatrixPlugin;

	// Session-only weights — never persisted. Initialized from embedding note
	// frontmatter on first use of each criterion; overridable by the user at any time.
	private _weights: Record<string, number> = {};
	private _weightsFromNote = false;
	private _collapsedGroups: Set<string> = new Set();
	private _rankRaws = false;

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: DecisionMatrixPlugin) {
		super(controller);
		this.scrollEl = containerEl;
		this.rootEl = containerEl.createDiv('dmv-root');
		this.plugin = plugin;
	}

	onDataUpdated(): void {
		this._render();
	}

	onunload(): void {}

	private _render(): void {
		const container = this.rootEl;
		if (!this.data) return;
		container.empty();

		const config: BasesViewConfig = this.config;
		const scale = this.plugin.settings.scale;

		// Detect score criteria from the order array; fall back to frontmatter scan
		// if getOrder() yields no numeric criteria (happens on non-primary views in multi-view bases)
		const rawOrder: string[] = config.getOrder() ?? [];
		const allEntries = this.data.groupedData.flatMap((g: BasesEntryGroup) => g.entries);
		let criteria = detectCriteria(allEntries, rawOrder);
		if (criteria.length === 0) {
			criteria = detectCriteriaFromFiles(allEntries, this.app);
		}

		if (criteria.length === 0) {
			container.createEl('div', {
				text: 'No numeric score properties found. Add number properties to your notes and include them in the base order.',
				cls: 'dmv-empty',
			});
			return;
		}

		// Initialize any new criteria we haven't seen yet this session
		this._initMissingWeights(criteria);

		// Extract items
		const groups: ItemGroup[] = this.data.groupedData.map((g: BasesEntryGroup) => ({
			key: g.hasKey() ? String(g.key) : '',
			items: g.entries.map(entry => extractItem(entry, criteria)),
		}));
		const items = groups.flatMap(g => g.items);

		const rankedScores = this._rankRaws
			? computeRankedScores(groups, criteria, scale)
			: undefined;

		// Build scaffold
		const { toolbar, body, rawSection, weightedSection } = buildMatrixScaffold(container);

		// Embedding hint — inserted between toolbar and body when no weight_ props on active note
		const weightsFromNote = this._hasNoteWeights(criteria);
		if (!weightsFromNote) {
			const hint = body.createEl('div', { cls: 'dmv-embed-hint' });
			body.insertBefore(hint, body.firstChild);
			const first = criteria[0] ?? 'criterion';
			hint.createEl('span', { text: '💡 Embed this base in a note and add ' });
			hint.createEl('code', { text: `weight_${first}: 3` });
			hint.createEl('span', { text: ' (one per criterion) to that note\'s frontmatter to pre-fill weights. Edits here are session-only.' });
		}

		// Toolbar
		this._renderToolbar(toolbar, items, criteria, scale, () => this._reloadWeightsFromNote(criteria));

		const scorePrefix = this.plugin.settings.scorePrefix;

		// Raw scores table
		renderRawTable(rawSection, groups, criteria, scale,
			async (item, criterion, newVal) => {
				await this.app.fileManager.processFrontMatter(item.file, (fm: Record<string, unknown>) => {
					fm[criterion] = newVal;
				});
			},
			(item, e) => this._openNote(item, e),
			scorePrefix,
			this._collapsedGroups,
			(key) => {
				if (this._collapsedGroups.has(key)) {
					this._collapsedGroups.delete(key);
				} else {
					this._collapsedGroups.add(key);
				}
				this._render();
			},
			this._rankRaws,
			rankedScores,
		);

		// Weighted scores table
		renderWeightedTable(weightedSection, groups, criteria, scale,
			this._weights,
			weightsFromNote,
			(criterion, value) => {
				this._weights[criterion] = value;
				this._render();
			},
			(item, e) => this._openNote(item, e),
			scorePrefix,
			this._collapsedGroups,
			(key) => {
				if (this._collapsedGroups.has(key)) {
					this._collapsedGroups.delete(key);
				} else {
					this._collapsedGroups.add(key);
				}
				this._render();
			},
			this._rankRaws,
			rankedScores,
		);
	}

	/**
	 * For any criterion not yet in _weights, read weight_<criterion> from the
	 * active file. Falls back to 1. Tracks whether the note supplied any weights.
	 * Negative weights are allowed.
	 */
	private _initMissingWeights(criteria: string[]): void {
		const activeFile = this.app.workspace.getActiveFile();
		const fm = activeFile
			? this.app.metadataCache.getFileCache(activeFile)?.frontmatter
			: null;

		let foundAny = this._weightsFromNote;

		for (const c of criteria) {
			if (this._weights[c] != null) continue; // already set this session

			const fromNote = fm?.[`weight_${c}`];
			if (fromNote != null) {
				const n = Number(fromNote);
				if (!isNaN(n)) {
					this._weights[c] = n;
					foundAny = true;
					continue;
				}
			}
			this._weights[c] = 1; // default
		}

		this._weightsFromNote = foundAny;
	}

	/**
	 * Force-reload weights from the active file for the given criteria,
	 * overwriting any in-session edits for criteria that have note props.
	 */
	private _reloadWeightsFromNote(criteria: string[]): void {
		const activeFile = this.app.workspace.getActiveFile();
		const fm = activeFile
			? this.app.metadataCache.getFileCache(activeFile)?.frontmatter
			: null;

		let foundAny = false;
		for (const c of criteria) {
			const val = fm?.[`weight_${c}`];
			if (val != null) {
				const n = Number(val);
				if (!isNaN(n)) {
					this._weights[c] = n;
					foundAny = true;
				}
			}
		}

		this._weightsFromNote = foundAny;

		if (!foundAny) {
			new Notice('No weight_* properties found on the active note.');
		}
		this._render();
	}

	/** Returns true if the currently active note has at least one weight_<criterion> property. */
	private _hasNoteWeights(criteria: string[]): boolean {
		const activeFile = this.app.workspace.getActiveFile();
		const fm = activeFile
			? this.app.metadataCache.getFileCache(activeFile)?.frontmatter
			: null;
		if (!fm) return false;
		return criteria.some(c => fm[`weight_${c}`] != null);
	}

	private _openNote(item: DecisionItem, e?: MouseEvent): void {
		const leaf = this.app.workspace.getLeaf(e ? (e.ctrlKey || e.metaKey) : false);
		if (leaf) leaf.openFile(item.file);
	}

	private _renderToolbar(
		toolbar: HTMLElement,
		items: DecisionItem[],
		criteria: string[],
		currentScale: ScoreScale,
		onReloadWeights: () => void,
	): void {
		// Scale button group
		const scaleGroup = toolbar.createEl('div', { cls: 'dmv-scale-group' });
		scaleGroup.createEl('span', { text: 'Scale:', cls: 'dmv-toolbar-label' });
		for (const s of SCALES) {
			const btn = scaleGroup.createEl('button', {
				text: `/ ${s}`,
				cls: s === currentScale ? 'dmv-scale-btn is-active' : 'dmv-scale-btn',
			});
			btn.addEventListener('click', () => {
				if (s !== this.plugin.settings.scale) {
					this.plugin.settings.scale = s;
					this.plugin.saveSettings();
					this._render();
				}
			});
		}

		toolbar.createEl('div', { cls: 'dmv-toolbar-separator' });

		// Reload weights from embedding note
		const reloadBtn = toolbar.createEl('button', {
			cls: 'dmv-btn dmv-btn--icon',
			attr: { title: 'Reload weights from embedding note frontmatter (weight_*)' },
		});
		setIcon(reloadBtn, 'refresh-cw');
		reloadBtn.addEventListener('click', onReloadWeights);

		toolbar.createEl('div', { cls: 'dmv-toolbar-separator' });

		const rankRawsBtn = toolbar.createEl('button', {
			text: 'Rank Raws',
			cls: this._rankRaws ? 'dmv-btn dmv-btn--toggle is-active' : 'dmv-btn dmv-btn--toggle',
			attr: { title: 'Rank each criterion relative to its column max; use ranks in weighted scoring' },
		});
		rankRawsBtn.addEventListener('click', () => {
			this._rankRaws = !this._rankRaws;
			this._render();
		});

		toolbar.createEl('div', { cls: 'dmv-toolbar-separator' });

		// Normalize button — disabled while Rank Raws is active
		const normalizeBtn = toolbar.createEl('button', {
			text: 'Normalize',
			cls: this._rankRaws ? 'dmv-btn dmv-btn--disabled' : 'dmv-btn',
			attr: {
				title: this._rankRaws
					? 'Disabled while Rank Raws is active'
					: `Per-criterion: any value exceeding /${currentScale} is scaled down by that criterion's max`,
			},
		});
		if (this._rankRaws) {
			normalizeBtn.setAttribute('disabled', 'true');
		} else {
			normalizeBtn.addEventListener('click', async () => {
				await this._normalizeScores(items, criteria, currentScale);
			});
		}
	}

	/**
	 * Per-criterion normalization: for each criterion whose max value exceeds
	 * targetScale, divide every score by that criterion's max and scale up to
	 * targetScale. Criteria already within range are untouched.
	 */
	private async _normalizeScores(
		items: DecisionItem[],
		criteria: string[],
		targetScale: ScoreScale,
	): Promise<void> {
		// Determine which criteria need normalization and by what factor
		const scalingMap = new Map<string, number>(); // criterion → divisor
		for (const c of criteria) {
			let max = 0;
			for (const item of items) {
				const v = item.scores[c] ?? 0;
				if (v > max) max = v;
			}
			if (max > targetScale) {
				scalingMap.set(c, max);
			}
		}

		if (scalingMap.size === 0) {
			new Notice(`All scores are already within the /${targetScale} scale.`);
			return;
		}

		for (const item of items) {
			await this.app.fileManager.processFrontMatter(item.file, (fm: Record<string, unknown>) => {
				for (const [c, divisor] of scalingMap) {
					const raw = item.scores[c];
					if (raw == null) continue;
					fm[c] = Math.max(0, Math.round((raw / divisor) * targetScale));
				}
			});
		}

		const criteriaNames = [...scalingMap.keys()].join(', ');
		new Notice(`Normalized ${scalingMap.size} criterion${scalingMap.size > 1 ? 'a' : ''}: ${criteriaNames}`);
	}
}
