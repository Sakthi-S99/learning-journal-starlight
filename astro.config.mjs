// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Learning Journal',
			description:
				'Personal knowledge base — Guidewire BillingCenter, Gosu, architecture patterns, and privacy-focused local AI tooling.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/Sakthi-S99' },
				{ icon: 'linkedin', label: 'LinkedIn', href: 'https://linkedin.com/in/Sakthi-S99' },
			],
			customCss: ['./src/styles/custom.css'],
			// Scaffold sidebar — mirrors the current MkDocs nav structure.
			// Only sections with real content are listed here; add sibling
			// entries as pages are migrated over from the MkDocs site.
			sidebar: [
				{
					label: 'Projects',
					items: [{ label: 'Arivu RAG Pipeline', slug: 'projects/rag-pipeline' }],
				},
				// Planned sections, not yet migrated:
				// - About & Resume
				// - Certifications
				// - Architecture (Overview, Design Decisions, Integration Patterns)
				// - Concepts (Overview, BillingCenter Core, Invoicing, Payment Plans, Delinquency)
				// - Gosu Patterns (Overview, Bundle Handling, Query Patterns, Plugin Patterns, Common Pitfalls)
				// - AI & Privacy (Overview, RAG Pipeline, RAG Technical Reference)
			],
		}),
	],
});
