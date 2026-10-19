import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Long-form write-ups, one Markdown file each, rendered at /work/<file name>
const caseStudies = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/case-studies' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    order: z.number(),
    date: z.string(),
    stack: z.array(z.string()),
  }),
});

export const collections = { caseStudies };
