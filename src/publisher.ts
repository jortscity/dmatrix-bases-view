import type { PluginSettings } from './types.ts';

export interface PublishResult {
	url: string;
}

/**
 * POST { html, title } to the configured publish endpoint.
 * The endpoint must respond with JSON { url: "<public-url>" }.
 *
 * Reference server contract (Node/Express example):
 *
 *   app.post('/publish', (req, res) => {
 *     const { html, title } = req.body;
 *     const id = crypto.randomUUID();
 *     fs.writeFileSync(`public/${id}.html`, html);
 *     res.json({ url: `https://your-domain.com/${id}.html` });
 *   });
 */
export async function publishHtml(
	html: string,
	title: string,
	settings: PluginSettings,
): Promise<PublishResult> {
	if (!settings.publishEndpoint.trim()) {
		throw new Error('No publish endpoint configured. Add one under Settings → Decision Matrix → Publish.');
	}

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (settings.publishToken.trim()) {
		headers['Authorization'] = `Bearer ${settings.publishToken.trim()}`;
	}

	let response: Response;
	try {
		response = await fetch(settings.publishEndpoint.trim(), {
			method: 'POST',
			headers,
			body: JSON.stringify({ html, title }),
		});
	} catch (err) {
		throw new Error(`Network error contacting publish endpoint: ${String(err)}`);
	}

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(`Publish endpoint returned ${response.status}: ${body || response.statusText}`);
	}

	let data: Record<string, unknown>;
	try {
		data = await response.json() as Record<string, unknown>;
	} catch {
		throw new Error('Publish endpoint did not return valid JSON');
	}

	if (typeof data.url !== 'string' || !data.url) {
		throw new Error('Publish endpoint response missing "url" field');
	}

	return { url: data.url };
}

/**
 * Build the iframe snippet that gets appended to the note.
 */
export function buildEmbed(url: string, height: string): string {
	return `\n<iframe src="${url}" width="100%" height="${height}" frameborder="0" loading="lazy"></iframe>\n`;
}
