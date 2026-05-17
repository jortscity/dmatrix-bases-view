import { BasesViewConfig, BasesEntryGroup } from 'obsidian';
import type { QueryController } from 'obsidian';
import type DecisionMatrixPlugin from './main.ts';
import type { DecisionItem, ItemGroup, ScoreScale } from './types.ts';
import { detectCriteria, detectCriteriaFromFiles, extractItem } from './field-mapping.ts';
import { buildMatrixScaffold, renderRawTable, renderWeightedTable, computeRankedScores, renderToolbar, normalizeScores } from './renderer.ts';
import { DecisionMatrixBaseView } from './base-view.ts';

export class DecisionMatrixView extends DecisionMatrixBaseView {
	type = 'decision-matrix';
	private scrollEl: HTMLElement;
	private rootEl: HTMLElement;
	private plugin: DecisionMatrixPlugin;

	private _collapsedGroups: Set<string> = new Set();
	private _rankRawsColumns: Set<string> = new Set();
	private _foldColsActive = false;
	private _foldColsCount = 3;

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

	protected _render(): void {
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

		const rankedScores = this._rankRawsColumns.size > 0
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
		renderToolbar(toolbar, {
			currentScale: scale,
			onScaleChange: (s) => { this.plugin.settings.scale = s; this.plugin.saveSettings(); this._render(); },
			onReloadWeights: () => this._reloadWeightsFromNote(criteria),
			foldColsActive: this._foldColsActive,
			foldColsCount: this._foldColsCount,
			onFoldToggle: () => { this._foldColsActive = !this._foldColsActive; this._render(); },
			onFoldCountChange: (n) => { this._foldColsCount = n; if (this._foldColsActive) this._render(); },
			rankRawsActive: this._rankRawsColumns.size > 0,
			onNormalize: () => normalizeScores(this.app, items, criteria, scale),
		});

		const scorePrefix = this.plugin.settings.scorePrefix;

		const foldedColCount = this._foldColsActive ? Math.min(this._foldColsCount, criteria.length) : 0;

		// Raw scores table — hidden entirely when columns are folded
		if (foldedColCount > 0) {
			rawSection.style.display = 'none';
		}

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
			this._rankRawsColumns,
			rankedScores,
			foldedColCount,
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
			this._rankRawsColumns,
			rankedScores,
			foldedColCount,
			(criterion, checked) => {
				if (checked) {
					this._rankRawsColumns.add(criterion);
				} else {
					this._rankRawsColumns.delete(criterion);
				}
				this._render();
			},
		);
	}

	private _openNote(item: DecisionItem, e?: MouseEvent): void {
		const leaf = this.app.workspace.getLeaf(e ? (e.ctrlKey || e.metaKey) : false);
		if (leaf) leaf.openFile(item.file);
	}

}
