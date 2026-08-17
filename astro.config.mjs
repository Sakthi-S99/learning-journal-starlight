// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';

// Only apply the GitHub Pages subpath during build/preview, so local dev
// stays at the plain http://localhost:4321/ root. Checking argv (rather than
// wrapping defineConfig in a function) keeps the config a plain object —
// wrapping it broke Starlight's content loading entirely.
const isDev = process.argv.includes('dev');
const base = isDev ? '/' : '/guidewire-learning-journal';

// https://astro.build/config
export default defineConfig({
	site: 'https://Sakthi-S99.github.io',
	base,
	prefetch: true,
	markdown: {
		shikiConfig: {
			// Shiki/TextMate has no "gosu" grammar — Groovy is the closest
			// syntax match (similar keywords/braces) for readable highlighting.
			langAlias: {
				gosu: 'groovy',
			},
		},
	},
	integrations: [
		mermaid({
			theme: 'neutral',
			autoTheme: true,
		}),
		starlight({
			title: 'Learning Journal',
			description:
				'Personal knowledge base — Guidewire BillingCenter, Gosu, architecture patterns, and privacy-focused local AI tooling.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/Sakthi-S99' },
				{ icon: 'linkedin', label: 'LinkedIn', href: 'https://linkedin.com/in/Sakthi-S99' },
			],
			customCss: ['./src/styles/custom.css'],
			components: {
				Footer: './src/components/Footer.astro',
			},
			head: [
				{
					tag: 'link',
					attrs: {
						rel: 'alternate',
						type: 'application/rss+xml',
						title: 'Learning Journal',
						href: `${base === '/' ? '' : base}/rss.xml`,
					},
				},
			],
			// Mirrors the mkdocs.yml nav structure from the source MkDocs site.
			sidebar: [
				{ label: 'About & Resume', slug: 'about' },
				{ label: 'Certifications', slug: 'certifications' },
				{
					label: 'Projects',
					items: [
						{ label: 'Overview', slug: 'projects' },
						{ label: 'Arivu RAG Pipeline', slug: 'projects/rag-pipeline' },
					],
				},
				{
					label: 'Architecture',
					items: [
						{ label: 'Overview', slug: 'architecture' },
						{ label: 'Design Decisions', slug: 'architecture/design-decisions' },
						{ label: 'Integration Patterns', slug: 'architecture/integration-patterns' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ label: 'Overview', slug: 'concepts' },
						{ label: 'BillingCenter Core', slug: 'concepts/billing-center-core' },
						{ label: 'Invoicing', slug: 'concepts/invoicing' },
						{ label: 'Payment Plans', slug: 'concepts/payment-plans' },
						{ label: 'Delinquency', slug: 'concepts/delinquency' },
					],
				},
				{
					label: 'Gosu Patterns',
					items: [
						{ label: 'Overview', slug: 'gosu-patterns' },
						{ label: 'Bundle Handling', slug: 'gosu-patterns/bundle-handling' },
						{ label: 'Query Patterns', slug: 'gosu-patterns/query-patterns' },
						{ label: 'Plugin Patterns', slug: 'gosu-patterns/plugin-patterns' },
						{ label: 'Common Pitfalls', slug: 'gosu-patterns/common-pitfalls' },
					],
				},
				{
					label: 'AI & Privacy',
					items: [
						{ label: 'Overview', slug: 'ai-privacy' },
						{ label: 'RAG Pipeline', slug: 'ai-privacy/rag-pipeline' },
						{ label: 'RAG Technical Reference', slug: 'ai-privacy/rag-reference' },
					],
				},
			],
		}),
	],
});
