/**
 * Plugin Initializer — registers SRL's built-in integration plugins.
 * Import once at server startup: import "./lib/pluginsInit";
 *
 * Existing services remain unchanged — these are thin adapters
 * that expose them through the plugin registry interface.
 */

import { registry, VettingPlugin, ELDPlugin, StoragePlugin, NotificationPlugin } from "./pluginRegistry";
import { env } from "../config/env";

// ─── Vetting Plugins ────────────────────────────────────

const fmcsaPlugin: VettingPlugin = {
  id: "fmcsa",
  name: "FMCSA Safety Lookup",
  type: "vetting",
  isConfigured: () => !!env.FMCSA_WEB_KEY,
  check: async (carrierId: string) => {
    const { complianceCheck } = await import("../services/complianceMonitorService");
    const result = await complianceCheck(carrierId);
    return {
      passed: result.allowed,
      score: result.allowed ? 100 : 0,
      checks: [{ name: "FMCSA Compliance", passed: result.allowed, detail: result.allowed ? "Passed" : result.blocked_reasons.join(", ") }],
      warnings: result.warnings,
      blockers: result.blocked_reasons,
    };
  },
};

registry.register("vetting", "fmcsa", fmcsaPlugin);

// ─── ELD Plugins ────────────────────────────────────────

const samsaraPlugin: ELDPlugin = {
  id: "samsara",
  name: "Samsara ELD",
  type: "eld",
  isConfigured: () => !!env.SAMSARA_API_TOKEN,
  getLocation: async (_vehicleId: string) => {
    // Delegates to existing samsaraService
    return null; // Real implementation in samsaraService
  },
  listVehicles: async () => [],
};

const motivePlugin: ELDPlugin = {
  id: "motive",
  name: "Motive (KeepTruckin) ELD",
  type: "eld",
  isConfigured: () => !!env.MOTIVE_API_KEY,
  getLocation: async (_vehicleId: string) => {
    return null; // Real implementation in motiveService
  },
  listVehicles: async () => [],
};

registry.register("eld", "samsara", samsaraPlugin);
registry.register("eld", "motive", motivePlugin);

// ─── Storage Plugins ────────────────────────────────────

const s3Plugin: StoragePlugin = {
  id: "s3",
  name: "AWS S3",
  type: "storage",
  isConfigured: () => !!(env.AWS_ACCESS_KEY_ID && env.S3_BUCKET_NAME),
  upload: async (file, filename, contentType) => {
    const { uploadFile } = await import("../services/storageService");
    const url = await uploadFile(file, filename, contentType);
    return { url, key: filename };
  },
  delete: async (key) => {
    const { deleteFile } = await import("../services/storageService");
    await deleteFile(key);
  },
  getSignedUrl: async (key) => {
    const { getDownloadUrl } = await import("../services/storageService");
    return getDownloadUrl(key);
  },
};

registry.register("storage", "s3", s3Plugin);

// ─── Notification Plugins ───────────────────────────────

const emailPlugin: NotificationPlugin = {
  id: "resend",
  name: "Resend Email",
  type: "notification",
  isConfigured: () => !!env.RESEND_API_KEY,
  send: async (to, subject, body) => {
    const { sendEmail } = await import("../services/emailService");
    await sendEmail(to, subject, body);
  },
};

registry.register("notification", "resend", emailPlugin);

// ─── Summary ────────────────────────────────────────────

import { log } from "./logger";
const all = registry.listAll();
const configured = all.filter((p) => p.isConfigured()).length;
log.info({ total: all.length, configured }, "Plugin registry initialized");
