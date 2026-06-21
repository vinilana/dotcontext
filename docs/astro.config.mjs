// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Deploys at the site root by default (custom domain, Vercel, Netlify, or a
// GitHub Pages user/org site). For GitHub Pages PROJECT pages, also set
// `base: '/dotcontext'` and prefix internal links accordingly.
export default defineConfig({
  site: 'https://dotcontext.dev',
  integrations: [
    starlight({
      title: 'dotcontext',
      description:
        'dotcontext is a harness for your harness — the contextual layer that keeps your work going no matter which AI tool you use: shared context, PREVC workflow, sensors, policies, task contracts, replay, and MCP/CLI surfaces.',
      logo: { src: './src/assets/logo.svg', alt: 'dotcontext' },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/vinilana/dotcontext',
        },
      ],
      defaultLocale: 'en',
      locales: {
        en: { label: 'English', lang: 'en' },
        'pt-br': { label: 'Português (BR)', lang: 'pt-BR' },
      },
      editLink: {
        baseUrl: 'https://github.com/vinilana/dotcontext/edit/main/docs/',
      },
      sidebar: [
        {
          label: 'Getting Started',
          translations: { 'pt-BR': 'Primeiros Passos' },
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Concepts',
          translations: { 'pt-BR': 'Conceitos' },
          autogenerate: { directory: 'concepts' },
        },
        {
          label: 'Guides',
          translations: { 'pt-BR': 'Guias' },
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'Reference',
          translations: { 'pt-BR': 'Referência' },
          autogenerate: { directory: 'reference' },
        },
        {
          label: 'About',
          translations: { 'pt-BR': 'Sobre' },
          autogenerate: { directory: 'about' },
        },
      ],
    }),
  ],
});
