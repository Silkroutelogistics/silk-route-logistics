import { z } from "zod";

export const sendMessageSchema = z.object({
  receiverId: z.string(),
  content: z.string().min(1).max(2000),
  loadId: z.string().optional(),
});
