import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const promos = defineCollection({
  loader: glob({ base: './src/content/promos', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    zalgo: z.object({
      intensity: z.number().min(1).max(8).default(3),
      charBack: z.boolean().optional(),
      backWords: z.boolean().optional(),
      terminal: z.boolean().optional(),
      layerMode: z
        .enum(['reverse-then-zalgo', 'zalgo-then-reverse', 'bleed'])
        .optional(),
      bleedDecay: z.number().min(0.1).max(0.5).optional(),
      seed: z.number().optional(),
    }).optional(),
  }),
});

export const collections = { promos };