import { BasesEntryGroup, setIcon } from 'obsidian';
import type { QueryController } from 'obsidian';
import type DecisionMatrixPlugin from './main.ts';
import type { DecisionItem, ItemGroup } from './types.ts';
import { detectCriteriaFromFiles, extractItem } from './field-mapping.ts';
import { computeRankedScores, renderWeightedTable, renderToolbar, normalizeScores } from './renderer.ts';
import { DecisionMatrixBaseView } from './base-view.ts';

interface RankedItem {
	item: DecisionItem;
	avg: number;
	rank: number;
	cover: string;
}

export class DecisionMatrixRankingsView extends DecisionMatrixBaseView {
	type = 'decision-matrix-rankings';
	private rootEl: HTMLElement;
	private plugin: DecisionMatrixPlugin;

	private _rankRawsColumns: Set<string> = new Set();
	private _foldColsActive = false;
	private _foldColsCount = 3;

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: DecisionMatrixPlugin) {
		super(controller);
		this.rootEl = containerEl.createDiv('dmr-root');
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

		const allEntries = this.data.groupedData.flatMap((g: BasesEntryGroup) => g.entries);
		const criteria = detectCriteriaFromFiles(allEntries, this.app);

		if (criteria.length === 0) {
			container.createEl('div', {
				text: 'No numeric score properties found. Add number properties to your notes and include them in the base order.',
				cls: 'dmv-empty',
			});
			return;
		}

		this._initMissingWeights(criteria);

		const items: DecisionItem[] = allEntries.map(entry => extractItem(entry, criteria));
		const groups: ItemGroup[] = [{ key: '', items }];
		const scale = this.plugin.settings.scale;
		const rankedScores = this._rankRawsColumns.size > 0
			? computeRankedScores(groups, criteria, scale)
			: undefined;
		const ranked = this._rankItems(items, criteria, rankedScores);

		const foldedColCount = this._foldColsActive ? Math.min(this._foldColsCount, criteria.length) : 0;

		// Toolbar
		const toolbar = container.createEl('div', { cls: 'dmv-toolbar' });
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

		if (ranked.length === 0) {
			container.createEl('div', { text: 'No items to rank.', cls: 'dmv-empty' });
			return;
		}

		// Weighted scores table
		const weightsFromNote = this._hasNoteWeights(criteria);
		const tableSection = container.createEl('div', { cls: 'dmv-section dmr-table-section' });
		renderWeightedTable(
			tableSection,
			groups,
			criteria,
			scale,
			this._weights,
			weightsFromNote,
			(criterion, value) => {
				this._weights[criterion] = value;
				this._render();
			},
			(item, e) => this._openNote(item, e),
			this.plugin.settings.scorePrefix,
			new Set(),
			undefined,
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

		const body = container.createEl('div', { cls: 'dmr-body' });
		const maxAvg = ranked[0].avg;

		// Podium — top 1–3
		this._renderPodium(body, ranked.slice(0, 3), maxAvg);

		// List — 4th onwards, 2-column grid
		const rest = ranked.slice(3);
		if (rest.length > 0) {
			this._renderList(body, rest, maxAvg);
		}
	}

	private _rankItems(
		items: DecisionItem[],
		criteria: string[],
		rankedScores?: Map<string, Record<string, number>>,
	): RankedItem[] {
		const withAvgs = items.map(item => ({
			item,
			avg: this._computeAvg(item, criteria, rankedScores),
			cover: this._getCover(item),
		}));
		withAvgs.sort((a, b) => b.avg - a.avg);

		const ranked: RankedItem[] = [];
		let pos = 1;
		for (let i = 0; i < withAvgs.length; i++) {
			const rank = (i > 0 && withAvgs[i].avg === withAvgs[i - 1].avg)
				? ranked[i - 1].rank
				: pos;
			ranked.push({ ...withAvgs[i], rank });
			pos++;
		}
		return ranked;
	}

	private _computeAvg(
		item: DecisionItem,
		criteria: string[],
		rankedScores?: Map<string, Record<string, number>>,
	): number {
		let sumWeighted = 0;
		let sumAbsWeights = 0;
		const ranked = rankedScores?.get(item.id);
		for (const c of criteria) {
			const w = this._weights[c] ?? 1;
			const score = (ranked && this._rankRawsColumns.has(c))
				? (ranked[c] ?? 0)
				: (item.scores[c] ?? 0);
			sumWeighted += score * w;
			sumAbsWeights += Math.abs(w);
		}
		return sumAbsWeights > 0 ? sumWeighted / sumAbsWeights : 0;
	}

	private _getCover(item: DecisionItem): string {
		const fm = this.app.metadataCache.getFileCache(item.file)?.frontmatter;
		if (!fm?.cover) return '';
		const val = String(fm.cover).trim();
		// Strip wikilink syntax if present: [[url]] or [[url|alias]]
		const wikiMatch = val.match(/^\[\[([^\]|]+)/);
		if (wikiMatch) return wikiMatch[1];
		return val;
	}

	private _renderPodium(body: HTMLElement, top3: RankedItem[], maxAvg: number): void {
		const podium = body.createEl('div', { cls: 'dmr-podium' });

		// Visual order: 2nd left, 1st center, 3rd right
		let visualOrder: Array<{ ri: RankedItem; mod: string }>;
		if (top3.length === 1) {
			visualOrder = [{ ri: top3[0], mod: 'dmr-pedestal--1st' }];
		} else if (top3.length === 2) {
			visualOrder = [
				{ ri: top3[1], mod: 'dmr-pedestal--2nd' },
				{ ri: top3[0], mod: 'dmr-pedestal--1st' },
			];
		} else {
			visualOrder = [
				{ ri: top3[1], mod: 'dmr-pedestal--2nd' },
				{ ri: top3[0], mod: 'dmr-pedestal--1st' },
				{ ri: top3[2], mod: 'dmr-pedestal--3rd' },
			];
		}

		for (const { ri, mod } of visualOrder) {
			const pedestal = podium.createEl('div', { cls: `dmr-pedestal ${mod}` });
			this._renderCard(pedestal, ri, maxAvg);
		}
	}

	private _renderCard(parent: HTMLElement, ri: RankedItem, maxAvg: number): void {
		const card = parent.createEl('div', { cls: 'dmr-card' });

		const header = card.createEl('div', { cls: 'dmr-card-header' });
		const badgeCls = `dmr-badge dmr-badge--${Math.min(ri.rank, 3)}`;
		header.createEl('div', { text: `#${ri.rank}`, cls: `dmr-card-badge ${badgeCls}` });

		if (ri.cover) {
			const img = header.createEl('img', { cls: 'dmr-card-cover' });
			(img as HTMLImageElement).src = ri.cover;
			(img as HTMLImageElement).alt = ri.item.title;
		} else {
			const fallback = header.createEl('div', { cls: 'dmr-card-cover dmr-cover-fallback' });
			setIcon(fallback, 'image');
		}

		const titleEl = card.createEl('div', { cls: 'dmr-card-title' });
		titleEl.textContent = ri.item.title;
		titleEl.addEventListener('click', (e: MouseEvent) => this._openNote(ri.item, e));

		const barWrap = card.createEl('div', {
			cls: 'dmr-bar-wrap',
			attr: { title: `W.A.: ${Number(ri.avg.toPrecision(2))}` },
		});
		const pct = maxAvg > 0 ? Math.round((ri.avg / maxAvg) * 100) : 0;
		const bar = barWrap.createEl('div', { cls: 'dmr-bar' });
		bar.style.setProperty('--dmr-bar-target', `${pct}%`);
	}

	private _renderList(body: HTMLElement, ranked: RankedItem[], maxAvg: number): void {
		const list = body.createEl('div', { cls: 'dmr-list' });

		for (let i = 0; i < ranked.length; i++) {
			const ri = ranked[i];
			const row = list.createEl('div', { cls: 'dmr-list-item' });
			row.style.animationDelay = `${0.3 + i * 0.04}s`;

			row.createEl('span', { text: `#${ri.rank}`, cls: 'dmr-list-badge dmr-badge dmr-badge--other' });

			if (ri.cover) {
				const img = row.createEl('img', { cls: 'dmr-list-cover' });
				(img as HTMLImageElement).src = ri.cover;
				(img as HTMLImageElement).alt = ri.item.title;
			} else {
				const fallback = row.createEl('div', { cls: 'dmr-list-cover dmr-cover-fallback' });
				setIcon(fallback, 'image');
			}

			const titleEl = row.createEl('span', { cls: 'dmr-list-title' });
			titleEl.textContent = ri.item.title;
			titleEl.addEventListener('click', (e: MouseEvent) => this._openNote(ri.item, e));

			const barWrap = row.createEl('div', {
				cls: 'dmr-list-bar-wrap',
				attr: { title: `W.A.: ${Number(ri.avg.toPrecision(2))}` },
			});
			const pct = maxAvg > 0 ? Math.round((ri.avg / maxAvg) * 100) : 0;
			const bar = barWrap.createEl('div', { cls: 'dmr-bar' });
			bar.style.setProperty('--dmr-bar-target', `${pct}%`);
		}
	}

	private _openNote(item: DecisionItem, e?: MouseEvent): void {
		const newTab = e ? (e.ctrlKey || e.metaKey) : false;
		const leaf = this.app.workspace.getLeaf(newTab);
		if (leaf) leaf.openFile(item.file);
	}

}
