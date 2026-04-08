/**
 * Plugin Registry — type-safe, self-registering plugin system.
 *
 * Inspired by prompts.chat's plugin architecture. Defines plugin contracts
 * for SRL's integrations so providers can be swapped without touching core code.
 *
 * Usage:
 *   // Register a plugin
 *   registry.register("vetting", "fmcsa", fmcsaPlugin);
 *
 *   // Get a plugin
 *   const plugin = registry.get<VettingPlugin>("vetting", "fmcsa");
 *
 *   // List all plugins of a type
 *   const allVetting = registry.listByType("vetting");
 */

// ─── Plugin Interfaces ──────────────────────────────────

export interface BasePlugin {
  id: string;
  name: string;
  type: PluginType;
  isConfigured: () => boolean;
}

export interface VettingPlugin extends BasePlugin {
  type: "vetting";
  check: (carrierId: string) => Promise<VettingResult>;
}

export interface ELDPlugin extends BasePlugin {
  type: "eld";
  getLocation: (vehicleId: string) => Promise<ELDLocation | null>;
  listVehicles: () => Promise<ELDVehicle[]>;
}

export interface StoragePlugin extends BasePlugin {
  type: "storage";
  upload: (file: Buffer, filename: string, contentType: string) => Promise<{ url: string; key: string }>;
  delete: (key: string) => Promise<void>;
  getSignedUrl: (key: string, expiresInSeconds?: number) => Promise<string>;
}

export interface NotificationPlugin extends BasePlugin {
  type: "notification";
  send: (to: string, subject: string, body: string, opts?: Record<string, any>) => Promise<void>;
}

// ─── Result Types ───────────────────────────────────────

export interface VettingResult {
  passed: boolean;
  score: number;
  checks: { name: string; passed: boolean; detail: string }[];
  warnings: string[];
  blockers: string[];
}

export interface ELDLocation {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  address: string;
  timestamp: string;
}

export interface ELDVehicle {
  id: string;
  name: string;
  vin?: string;
  lastLocation?: ELDLocation;
}

// ─── Plugin Types ───────────────────────────────────────

export type PluginType = "vetting" | "eld" | "storage" | "notification";

type PluginMap = {
  vetting: VettingPlugin;
  eld: ELDPlugin;
  storage: StoragePlugin;
  notification: NotificationPlugin;
};

// ─── Registry ───────────────────────────────────────────

class PluginRegistry {
  private plugins = new Map<string, BasePlugin>();

  /** Register a plugin. Key is "type:id" */
  register<T extends PluginType>(type: T, id: string, plugin: PluginMap[T]) {
    const key = `${type}:${id}`;
    this.plugins.set(key, plugin);
    const configured = plugin.isConfigured() ? "configured" : "NOT configured";
    console.log(`[Plugin] Registered ${key} (${plugin.name}) — ${configured}`);
  }

  /** Get a specific plugin by type and id */
  get<T extends PluginType>(type: T, id: string): PluginMap[T] | undefined {
    return this.plugins.get(`${type}:${id}`) as PluginMap[T] | undefined;
  }

  /** List all plugins of a given type */
  listByType<T extends PluginType>(type: T): PluginMap[T][] {
    const results: PluginMap[T][] = [];
    for (const [key, plugin] of this.plugins) {
      if (key.startsWith(`${type}:`)) {
        results.push(plugin as PluginMap[T]);
      }
    }
    return results;
  }

  /** List all configured plugins of a given type */
  listConfigured<T extends PluginType>(type: T): PluginMap[T][] {
    return this.listByType(type).filter((p) => p.isConfigured());
  }

  /** Get all registered plugins */
  listAll(): BasePlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const registry = new PluginRegistry();
