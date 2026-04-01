import { Plugin, PluginSettingTab, App, Setting, Notice } from 'obsidian';
import { DecisionMatrixView } from './matrix-view.ts';
import { DecisionMatrixRankingsView } from './rankings-view.ts';
import { getViewOptions } from './options.ts';
import type { PluginSettings } from './types.ts';
import { DEFAULT_PLUGIN_SETTINGS } from './types.ts';

export default class DecisionMatrixPlugin extends Plugin {
	settings: PluginSettings = { ...DEFAULT_PLUGIN_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerBasesView('decision-matrix', {
			name: 'Decision Matrix',
			icon: 'scale',
			factory: (controller, containerEl) => new DecisionMatrixView(controller, containerEl, this),
			options: (config) => getViewOptions(config),
		});
		this.registerBasesView('decision-matrix-rankings', {
			name: 'Decision Matrix Rankings',
			icon: 'award',
			factory: (controller, containerEl) => new DecisionMatrixRankingsView(controller, containerEl, this),
			options: (config) => getViewOptions(config),
		});
		this.addSettingTab(new DecisionMatrixSettingsTab(this.app, this));
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		if (data) {
			this.settings = { ...DEFAULT_PLUGIN_SETTINGS, ...data };
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

class DecisionMatrixSettingsTab extends PluginSettingTab {
	constructor(app: App, private plugin: DecisionMatrixPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h3', { text: 'Decision Matrix Settings' });

		new Setting(containerEl)
			.setName('Default scale')
			.setDesc('The default scoring scale for new views (5, 10, or 100).')
			.addDropdown(dd => {
				dd.addOption('5', '/ 5');
				dd.addOption('10', '/ 10');
				dd.addOption('100', '/ 100');
				dd.setValue(String(this.plugin.settings.scale));
				dd.onChange(async (value) => {
					this.plugin.settings.scale = Number(value) as 5 | 10 | 100;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Score prefix')
			.setDesc("Strip this prefix from property names before display (e.g. 'score_'). Leave blank to disable.")
			.addText(text => {
				text.setPlaceholder('e.g. score_')
					.setValue(this.plugin.settings.scorePrefix)
					.onChange(async (value) => {
						this.plugin.settings.scorePrefix = value;
						await this.plugin.saveSettings();
					});
			});

		containerEl.createEl('p', {
			text: 'Weights are session-only — set them in the view or pre-fill them via weight_<criterion> properties on the note that embeds the base.',
			cls: 'setting-item-description',
		});

		containerEl.createEl('h3', { text: 'Examples' });

		new Setting(containerEl)
			.setName('Create example notes')
			.setDesc('Creates sample decision notes with scores in a "Decision Matrix Examples" folder.')
			.addButton(btn => {
				btn.setButtonText('Create examples')
					.setCta()
					.onClick(() => this.createExampleNotes());
			});
	}

	private async createExampleNotes(): Promise<void> {
		const vault = this.app.vault;
		const folderPath = 'Decision Matrix Examples';

		if (!vault.getAbstractFileByPath(folderPath)) {
			await vault.createFolder(folderPath);
		}

		const notes: Array<{ name: string; content: string }> = [
			{
				name: 'Laptop A',
				content: [
					'---',
					'title: Laptop A',
					'cost: 8',
					'performance: 7',
					'portability: 6',
					'build_quality: 9',
					'battery: 7',
					'---',
					'',
					'High-end workstation laptop. Great build, decent battery.',
				].join('\n'),
			},
			{
				name: 'Laptop B',
				content: [
					'---',
					'title: Laptop B',
					'cost: 6',
					'performance: 9',
					'portability: 4',
					'build_quality: 8',
					'battery: 5',
					'---',
					'',
					'Gaming powerhouse. Heavy but fast.',
				].join('\n'),
			},
			{
				name: 'Laptop C',
				content: [
					'---',
					'title: Laptop C',
					'cost: 9',
					'performance: 5',
					'portability: 9',
					'build_quality: 7',
					'battery: 9',
					'---',
					'',
					'Ultra-portable with great battery. Budget-friendly.',
				].join('\n'),
			},
			{
				name: 'Laptop D',
				content: [
					'---',
					'title: Laptop D',
					'cost: 4',
					'performance: 8',
					'portability: 7',
					'build_quality: 9',
					'battery: 8',
					'---',
					'',
					'Premium all-rounder. Expensive but balanced.',
				].join('\n'),
			},
		];

		const baseContent = [
			'views:',
			'  - type: decision-matrix',
			'    name: Laptop Comparison',
			'    filters:',
			'      and:',
			`        - file.folder == "${folderPath}"`,
			'        - \'file.ext == "md"\'',
			'        - file.name != this.file.name',
			'    order:',
			'      - title',
			'      - cost',
			'      - performance',
			'      - portability',
			'      - build_quality',
			'      - battery',
			'',
		].join('\n');

		// Decision note lives OUTSIDE the folder so it doesn't appear in query results.
		// It embeds the base and provides weights via its frontmatter properties.
		const decisionNote = [
			'---',
			'title: Laptop Decision',
			'weight_cost: 3',
			'weight_performance: 5',
			'weight_portability: 2',
			'weight_build_quality: 4',
			'weight_battery: 3',
			'---',
			'',
			'# Laptop Decision',
			'',
			'My weighted criteria for choosing a laptop:',
			'- **Performance** is most important (weight 5)',
			'- **Build quality** matters a lot (weight 4)',
			'- **Cost** and **Battery** are moderate (weight 3)',
			'- **Portability** is nice-to-have (weight 2)',
			'',
			'## Decision Matrix',
			'',
			`![[${folderPath}/laptop-comparison.base]]`,
			'',
		].join('\n');

		const allFiles = [
			...notes.map(n => ({ path: `${folderPath}/${n.name}.md`, content: n.content })),
			{ path: `${folderPath}/laptop-comparison.base`, content: baseContent },
			{ path: 'Laptop Decision.md', content: decisionNote },
		];

		let created = 0;
		let skipped = 0;

		for (const file of allFiles) {
			if (vault.getAbstractFileByPath(file.path)) {
				skipped++;
			} else {
				await vault.create(file.path, file.content);
				created++;
			}
		}

		if (created > 0) {
			new Notice(`Created ${created} file${created > 1 ? 's' : ''} in "${folderPath}/"${skipped > 0 ? ` (${skipped} already existed)` : ''}`);
		} else {
			new Notice(`All example files already exist in "${folderPath}/"`);
		}
	}
}
