import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    /** Titre affiché dans <title> s'il doit différer du H1. */
    seoTitle: z.string().optional(),
    description: z.string().max(160),
    keywords: z.array(z.string()).default([]),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  }),
});

export const collections = { guides };
