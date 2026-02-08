import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";

export async function getIntegrations(_req: AuthRequest, res: Response) {
  const integrations = await prisma.brokerIntegration.findMany({
    select: { id: true, name: true, provider: true, status: true, lastSyncAt: true },
    orderBy: { name: "asc" },
  });
  res.json(integrations);
}

export async function triggerSync(req: AuthRequest, res: Response) {
  const provider = req.params.provider;
  const integration = await prisma.brokerIntegration.findUnique({ where: { provider } });
  if (!integration) {
    res.status(404).json({ error: `Integration "${provider}" not found` });
    return;
  }

  console.log(`[Integration] Sync initiated for ${provider} at ${new Date().toISOString()}`);

  await prisma.brokerIntegration.update({
    where: { provider },
    data: { lastSyncAt: new Date() },
  });

  res.json({ message: `Sync initiated for ${provider}`, provider, syncedAt: new Date() });
}
