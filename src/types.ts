import type { TFile, BasesEntry } from 'obsidian';

export type ScoreScale = 5 | 10 | 100;

export interface DecisionItem {
	id: string;
	file: TFile;
	title: string;
	scores: Record<string, number | null>;  // criterion name → raw score; null = not set
	entry: BasesEntry;
}

export interface ItemGroup {
	key: string;
	items: DecisionItem[];
}

export interface PluginSettings {
	scale: ScoreScale;
	scorePrefix: string;
}

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
	scale: 10,
	scorePrefix: '',
};

export const ROW_HEIGHT = 36;
export const HEADER_HEIGHT = 40;
export const SCALES: ScoreScale[] = [5, 10, 100];
