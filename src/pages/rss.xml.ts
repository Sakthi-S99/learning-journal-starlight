import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
	const pages = await getCollection('docs');

	return rss({
		title: 'Sakthi’s Learning Journal',
		description:
			'Personal knowledge base — Guidewire BillingCenter, Gosu, architecture patterns, and privacy-focused local AI tooling.',
		site: context.site ?? 'https://Sakthi-S99.github.io',
		// Pages have no per-entry publish date in frontmatter yet, so every
		// item shares the build time — readers still get new/changed pages
		// surfaced on each deploy, just without per-page chronology.
		items: pages.map((page) => {
			// The docs collection's "index" entry is the homepage (served at
			// the site root), not a literal /index/ route. BASE_URL has no
			// trailing slash, so join it explicitly rather than concatenating.
			const base = import.meta.env.BASE_URL.replace(/\/$/, '');
			const path = page.id === 'index' ? '' : `${page.id}/`;
			return {
				title: page.data.title,
				description: page.data.description,
				link: `${base}/${path}`,
			};
		}),
		customData: `<language>en-us</language>`,
	});
}
