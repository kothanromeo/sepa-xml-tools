// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';

// Par défaut : https://sepa-xml-tools.kothanromeo.dev (GitHub Pages + domaine personnalisé).
// Pour un autre hébergement : SITE_URL=https://exemple.fr SITE_BASE=/sous-dossier npm run build
const site = process.env.SITE_URL ?? 'https://sepa-xml-tools.kothanromeo.dev';
const base = process.env.SITE_BASE ?? '/';

/**
 * Dans les articles Markdown, on écrit les liens internes sans la base (« /valider-factur-x/ »).
 * Ce plugin ajoute la base au moment du build, pour que le site marche aussi bien sur
 * GitHub Pages (sous-dossier) que sur un nom de domaine.
 */
function rehypeBaseLinks() {
  const prefix = base.replace(/\/$/, '');
  /** @param {any} node */
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'a') {
      const h = node.properties?.href;
      if (typeof h === 'string' && h.startsWith('/') && !h.startsWith('//') && !h.startsWith(prefix + '/')) {
        node.properties.href = prefix + h;
      }
    }
    node.children?.forEach(walk);
  };
  return (/** @type {any} */ tree) => walk(tree);
}

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
      changefreq: 'monthly',
      lastmod: new Date(),
    }),
  ],
  markdown: { processor: unified({ rehypePlugins: [rehypeBaseLinks] }) },
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
