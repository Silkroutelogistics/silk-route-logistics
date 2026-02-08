import { z } from "zod";

export const createSOPSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  version: z.string().min(1),
  author: z.string().min(1),
  description: z.string().optional(),
  content: z.string().optional(),
  pages: z.number().int().positive().default(1),
});

export const updateSOPSchema = createSOPSchema.partial();

export const sopQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});
