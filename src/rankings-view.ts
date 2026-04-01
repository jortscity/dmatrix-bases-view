import { BasesView, BasesViewConfig, BasesEntryGroup, Notice, setIcon } from 'obsidian';
import type { QueryController } from 'obsidian';
import type DecisionMatrixPlugin from './main.ts';
import type { DecisionItem } from './types.ts';
import { detectCriteria, extractItem } from './field-mapping.ts';

interface RankedItem {
	item: DecisionItem;
	avg: number;
	rank: number;
	cover: string;
}

export class DecisionMatrixRankingsView extends BasesView {
	type = 'decision-matrix-rankings';
	private rootEl: HTMLElement;
	private plugin: DecisionMatrixPlugin;

	private _weights: Record<string, number> = {};
	private _weightsFromNote = false;

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: DecisionMatrixPlugin) {
		super(controller);
		this.rootEl = containerEl.createDiv('dmr-root');
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
		const rawOrder: string[] = config.getOrder() ?? [];
		const allEntries = this.data.groupedData.flatMap((g: BasesEntryGroup) => g.entries);
		const criteria = detectCriteria(allEntries, rawOrder);

		if (criteria.length === 0) {
			container.createEl('div', {
				text: 'No numeric score properties found. Add number properties to your notes and include them in the base order.',
				cls: 'dmv-empty',
			});
			return;
		}

		this._initMissingWeights(criteria);

		const items: DecisionItem[] = allEntries.map(entry => extractItem(entry, criteria));
		const ranked = this._rankItems(items, criteria);

		// Toolbar — reload weights only
		const toolbar = container.createEl('div', { cls: 'dmv-toolbar' });
		const reloadBtn = toolbar.createEl('button', {
			cls: 'dmv-btn dmv-btn--icon',
			attr: { title: 'Reload weights from embedding note frontmatter (weight_*)' },
		});
		setIcon(reloadBtn, 'refresh-cw');
		reloadBtn.addEventListener('click', () => this._reloadWeightsFromNote(criteria));

		if (ranked.length === 0) {
			container.createEl('div', { text: 'No items to rank.', cls: 'dmv-empty' });
			return;
		}

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

	private _rankItems(items: DecisionItem[], criteria: string[]): RankedItem[] {
		const withAvgs = items.map(item => ({
			item,
			avg: this._computeAvg(item, criteria),
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

	private _computeAvg(item: DecisionItem, criteria: string[]): number {
		let sumWeighted = 0;
		let sumAbsWeights = 0;
		for (const c of criteria) {
			const w = this._weights[c] ?? 1;
			sumWeighted += (item.scores[c] ?? 0) * w;
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

	private _initMissingWeights(criteria: string[]): void {
		const activeFile = this.app.workspace.getActiveFile();
		const fm = activeFile
			? this.app.metadataCache.getFileCache(activeFile)?.frontmatter
			: null;

		let foundAny = this._weightsFromNote;

		for (const c of criteria) {
			if (this._weights[c] != null) continue;
			const fromNote = fm?.[`weight_${c}`];
			if (fromNote != null) {
				const n = Number(fromNote);
				if (!isNaN(n)) {
					this._weights[c] = n;
					foundAny = true;
					continue;
				}
			}
			this._weights[c] = 1;
		}

		this._weightsFromNote = foundAny;
	}

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
}
