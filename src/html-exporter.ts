import type DecisionMatrixPlugin from './main.ts';

// Fallback values for Obsidian CSS variables so exported HTML renders
// correctly in a plain browser without the Obsidian theme loaded.
const CSS_VAR_FALLBACKS = `
:root {
  --background-primary:          #ffffff;
  --background-secondary:        #f6f7f9;
  --background-modifier-border:  #dde1e6;
  --background-modifier-hover:   #eceef1;
  --text-normal:                 #1a1a1a;
  --text-muted:                  #6b7280;
  --text-faint:                  #9ca3af;
  --text-on-accent:              #ffffff;
  --interactive-accent:          #7b6cd8;
  --font-ui-small:               13px;
  --font-ui-smaller:             11px;
  --font-ui-medium:              14px;
  --radius-s:                    4px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--background-primary);
  color: var(--text-normal);
}
h2.dmv-export-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text-normal);
}
p.dmv-export-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0 0 14px;
}
/* Strip toolbar controls — they don't function outside Obsidian */
.dmv-toolbar, .dmv-btn, .dmv-scale-group, .dmv-toolbar-separator,
.dmv-embed-hint, .dmv-btn--icon { display: none !important; }
/* Weight inputs become read-only display values */
.dmv-weight-input { pointer-events: none; border-color: transparent; background: transparent; }
/* Score cells are not editable in the export */
.dmv-score-cell--editing { cursor: default; }
`;

async function readPluginCss(plugin: DecisionMatrixPlugin): Promise<string> {
	const dir = (plugin.manifest as unknown as Record<string, unknown>).dir as string | undefined;
	if (!dir) return '';
	try {
		return await plugin.app.vault.adapter.read(`${dir}/styles.css`);
	} catch {
		return '';
	}
}

function escHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export async function exportViewAsHtml(
	viewEl: HTMLElement,
	title: string,
	plugin: DecisionMatrixPlugin,
): Promise<string> {
	const pluginCss = await readPluginCss(plugin);
	const date = new Date().toLocaleDateString(undefined, { dateStyle: 'medium' });

	// Clone so we can scrub live event listeners without touching the DOM
	const clone = viewEl.cloneNode(true) as HTMLElement;

	// Remove elements that are only useful inside Obsidian (toolbar, hint banners)
	clone.querySelectorAll('.dmv-toolbar, .dmv-embed-hint').forEach(el => el.remove());

	// Convert weight inputs to plain text spans so values are visible
	clone.querySelectorAll<HTMLInputElement>('input.dmv-weight-input').forEach(input => {
		const span = document.createElement('span');
		span.className = 'dmv-weight-input';
		span.textContent = input.value;
		input.replaceWith(span);
	});

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <style>${CSS_VAR_FALLBACKS}</style>
  <style>${pluginCss}</style>
</head>
<body>
  <h2 class="dmv-export-title">${escHtml(title)}</h2>
  <p class="dmv-export-meta">Published ${date}</p>
  ${clone.outerHTML}
</body>
</html>`;
}
