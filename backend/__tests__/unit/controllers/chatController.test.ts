import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// Mock Gemini
vi.mock("@google/generative-ai", () => {
  const sendMessage = vi.fn().mockResolvedValue({
    response: { text: () => "Hello! I'm Marco Polo, your logistics assistant." },
  });
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        startChat: vi.fn().mockReturnValue({ sendMessage }),
      }),
    })),
  };
});

import { chat, publicChat } from "../../../src/controllers/chatController";

const mockPrisma = vi.mocked(prisma);

function mockReqRes(body: Record<string, any> = {}, user?: any) {
  const req: any = {
    body,
    user,
  };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

describe("chatController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("publicChat", () => {
    it("returns 400 when message is missing", async () => {
      const { req, res } = mockReqRes({});

      await publicChat(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Message is required" });
    });

    it("returns a reply on success", async () => {
      const { req, res } = mockReqRes({ message: "What is SRL?" });

      await publicChat(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          reply: expect.any(String),
          provider: "gemini",
        }),
      );
    });
  });

  describe("chat (authenticated)", () => {
    it("returns a reply with user context", async () => {
      const user = { id: "user-1", email: "test@test.com", role: "BROKER" };

      mockPrisma.user.findUnique.mockResolvedValue({
        firstName: "John",
        lastName: "Doe",
      } as any);
      mockPrisma.load.findMany.mockResolvedValue([]);
      mockPrisma.shipment.findMany.mockResolvedValue([]);
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const { req, res } = mockReqRes({ message: "Show my loads" }, user);

      await chat(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          reply: expect.any(String),
          provider: "gemini",
        }),
      );
    });
  });
});
