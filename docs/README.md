# dotcontext docs

Documentation site for **dotcontext**, built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build). Bilingual: English (`en`, default) and Portuguese (`pt-br`). Local search is provided by Pagefind (built into Starlight, no external service).

## Develop

```bash
cd docs
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run build    # static site in ./dist
npm run preview  # serve the built site locally
```

## Structure

```text
src/content/docs/
  en/            # English (default locale)
    index.mdx
    getting-started/
    concepts/
    guides/
    reference/
    about/
  pt-br/         # Portuguese (mirrors the en/ tree)
    ...
```

Every page under `en/` should have a mirrored page at the same path under `pt-br/`. The sidebar groups and their labels are configured in `astro.config.mjs` (`sidebar` + per-group `translations`).

## Deploy

The config is set up for GitHub Pages project pages (`site` + `base: '/dotcontext'`). For a root deploy (custom domain, Vercel, Netlify), set `base: '/'` in `astro.config.mjs`.
