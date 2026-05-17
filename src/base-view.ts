import { BasesView, Notice } from 'obsidian';
import type { QueryController } from 'obsidian';

export abstract class DecisionMatrixBaseView extends BasesView {
	protected _weights: Record<string, number> = {};
	protected _weightsFromNote = false;

	constructor(controller: QueryController) {
		super(controller);
	}

	protected abstract _render(): void;

	protected _initMissingWeights(criteria: string[]): void {
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

	protected _hasNoteWeights(criteria: string[]): boolean {
		const activeFile = this.app.workspace.getActiveFile();
		const fm = activeFile
			? this.app.metadataCache.getFileCache(activeFile)?.frontmatter
			: null;
		if (!fm) return false;
		return criteria.some(c => fm[`weight_${c}`] != null);
	}

	protected _reloadWeightsFromNote(criteria: string[]): void {
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
