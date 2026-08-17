# Learning Journal

[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

A personal knowledge base built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build), covering Guidewire BillingCenter, Gosu, architecture patterns, and privacy-focused local AI tooling.

Live site: https://Sakthi-S99.github.io/learning-journal-starlight

## 🚀 Project Structure

```
.
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── content/
│   │   └── docs/
│   ├── pages/
│   ├── styles/
│   └── content.config.ts
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

Starlight looks for `.md` or `.mdx` files in `src/content/docs/`. Each file is exposed as a route based on its file name, and the sidebar structure is defined in `astro.config.mjs`.

Images can be added to `src/assets/` and embedded in Markdown with a relative link. Static assets, like favicons, go in `public/`.

Diagrams can be written as `mermaid` code blocks in any doc page (via [astro-mermaid](https://github.com/JuanM04/astro-mermaid)).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`              | Installs dependencies                            |
| `npm run dev`               | Starts local dev server at `localhost:4321`      |
| `npm run build`             | Build your production site to `./dist/`          |
| `npm run preview`           | Preview your build locally, before deploying     |
| `npm run astro ...`         | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help`   | Get help using the Astro CLI                     |

The site is deployed to GitHub Pages automatically on every push to `main` via `.github/workflows/deploy.yml`. `astro.config.mjs` conditionally sets the `base` path so local dev stays at the root (`/`) while production builds use `/learning-journal-starlight`.

## 👀 Want to learn more?

Check out [Starlight's docs](https://starlight.astro.build/), read [the Astro documentation](https://docs.astro.build), or jump into the [Astro Discord server](https://astro.build/chat).
