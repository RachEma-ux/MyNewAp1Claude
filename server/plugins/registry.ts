import {
  IPlugin,
  PluginManifest,
  PluginContext,
  PluginStatus,
  PluginLifecycleHook,
  PluginError,
  PluginLogger,
  PluginStorage,
  PluginAPI,
} from "./types";
import { getDb } from "../db";
import { plugins } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Plugin Registry
 * Manages plugin lifecycle and state
 */
export class PluginRegistry {
  private plugins: Map<string, IPlugin> = new Map();
  private contexts: Map<string, PluginContext> = new Map();
  private lifecycleHooks: PluginLifecycleHook[] = [];
  
  constructor() {
    console.log("[PluginRegistry] Initialized");
  }
  
  /**
   * Register a plugin
   */
  async register(plugin: IPlugin, installedByUserId?: number): Promise<void> {
    const { id } = plugin.manifest;

    if (this.plugins.has(id)) {
      throw new PluginError(id, "Plugin already registered");
    }

    // Validate manifest
    this.validateManifest(plugin.manifest);

    // Create plugin context
    const context = this.createContext(plugin.manifest);

    // Initialize plugin
    await plugin.initialize(context);

    // Store plugin and context
    this.plugins.set(id, plugin);
    this.contexts.set(id, context);

    // Save to database
    await this.savePluginToDB(plugin.manifest, "installed", installedByUserId);

    console.log(`[PluginRegistry] Registered plugin: ${id}`);
  }
  
  /**
   * Unregister a plugin
   */
  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(pluginId, "Plugin not found");
    }
    
    // Deactivate if enabled
    const status = await this.getPluginStatus(pluginId);
    if (status === "enabled") {
      await this.disable(pluginId);
    }
    
    // Cleanup plugin
    await plugin.cleanup();
    
    // Remove from registry
    this.plugins.delete(pluginId);
    this.contexts.delete(pluginId);
    
    // Remove from database
    await this.deletePluginFromDB(pluginId);
    
    console.log(`[PluginRegistry] Unregistered plugin: ${pluginId}`);
  }
  
  /**
   * Enable a plugin
   */
  async enable(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(pluginId, "Plugin not found");
    }
    
    await this.runLifecycleHooks("beforeEnable", pluginId);
    
    try {
      await plugin.activate();
      await this.updatePluginStatus(pluginId, "enabled");
      await this.runLifecycleHooks("afterEnable", pluginId);
      
      console.log(`[PluginRegistry] Enabled plugin: ${pluginId}`);
    } catch (error) {
      await this.updatePluginStatus(pluginId, "error");
      throw new PluginError(pluginId, `Failed to enable: ${error}`);
    }
  }
  
  /**
   * Disable a plugin
   */
  async disable(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(pluginId, "Plugin not found");
    }
    
    await this.runLifecycleHooks("beforeDisable", pluginId);
    
    try {
      await plugin.deactivate();
      await this.updatePluginStatus(pluginId, "disabled");
      await this.runLifecycleHooks("afterDisable", pluginId);
      
      console.log(`[PluginRegistry] Disabled plugin: ${pluginId}`);
    } catch (error) {
      throw new PluginError(pluginId, `Failed to disable: ${error}`);
    }
  }
  
  /**
   * Get a plugin by ID
   */
  get(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId);
  }
  
  /**
   * Get all plugins
   */
  getAll(): IPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Get enabled plugins
   */
  async getEnabled(): Promise<IPlugin[]> {
    const enabled: IPlugin[] = [];
    const entries = Array.from(this.plugins.entries());
    for (const [id, plugin] of entries) {
      const status = await this.getPluginStatus(id);
      if (status === "enabled") {
        enabled.push(plugin);
      }
    }
    return enabled;
  }
  
  /**
   * Add lifecycle hook
   */
  addLifecycleHook(hook: PluginLifecycleHook): void {
    this.lifecycleHooks.push(hook);
  }
  
  /**
   * Run lifecycle hooks
   */
  private async runLifecycleHooks(
    event: PluginLifecycleHook["event"],
    pluginId: string
  ): Promise<void> {
    const hooks = this.lifecycleHooks.filter((h) => h.event === event);
    for (const hook of hooks) {
      await hook.handler(pluginId);
    }
  }
  
  /**
   * Validate plugin manifest
   */
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id || !manifest.name || !manifest.version) {
      throw new Error("Invalid plugin manifest: missing required fields");
    }
    
    // Validate version format (semver)
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(manifest.version)) {
      throw new Error("Invalid plugin version: must be semver format (x.y.z)");
    }
  }
  
  /**
   * Create plugin context
   */
  private createContext(manifest: PluginManifest): PluginContext {
    return {
      pluginId: manifest.id,
      config: {},
      logger: this.createLogger(manifest.id),
      storage: this.createStorage(manifest.id),
      api: this.createAPI(manifest),
    };
  }
  
  /**
   * Create plugin logger
   */
  private createLogger(pluginId: string): PluginLogger {
    return {
      debug: (message, ...args) => console.debug(`[Plugin:${pluginId}]`, message, ...args),
      info: (message, ...args) => console.info(`[Plugin:${pluginId}]`, message, ...args),
      warn: (message, ...args) => console.warn(`[Plugin:${pluginId}]`, message, ...args),
      error: (message, ...args) => console.error(`[Plugin:${pluginId}]`, message, ...args),
    };
  }
  
  /**
   * Create plugin storage
   */
  private createStorage(pluginId: string): PluginStorage {
    const storageKey = (key: string) => `plugin:${pluginId}:${key}`;
    const store = new Map<string, any>();
    
    return {
      get: async <T = any>(key: string): Promise<T | null> => {
        return store.get(storageKey(key)) ?? null;
      },
      set: async <T = any>(key: string, value: T): Promise<void> => {
        store.set(storageKey(key), value);
      },
      delete: async (key: string): Promise<void> => {
        store.delete(storageKey(key));
      },
      clear: async (): Promise<void> => {
        const keys = Array.from(store.keys()).filter((k) => k.startsWith(`plugin:${pluginId}:`));
        keys.forEach((k) => store.delete(k));
      },
      keys: async (): Promise<string[]> => {
        const prefix = `plugin:${pluginId}:`;
        return Array.from(store.keys())
          .filter((k) => k.startsWith(prefix))
          .map((k) => k.slice(prefix.length));
      },
    };
  }
  
  /**
   * Create plugin API
   */
  private createAPI(manifest: PluginManifest): PluginAPI {
    const api: PluginAPI = {};

    // Only expose APIs if plugin has permissions
    if (manifest.permissions?.llm) {
      api.llm = {
        invoke: async (messages, options) => {
          const { getProviderRegistry } = await import("../providers/registry");
          const registry = getProviderRegistry();
          const providers = registry.getAllProviders();

          if (providers.length === 0) {
            throw new Error("No LLM providers available");
          }

          const provider = providers[0];
          const response = await provider.generate({
            messages,
            model: options?.model,
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
          });

          return {
            content: response.content,
            model: response.model,
            usage: response.usage,
          };
        },
        stream: async function* (messages, options) {
          const { getProviderRegistry } = await import("../providers/registry");
          const registry = getProviderRegistry();
          const providers = registry.getAllProviders();

          if (providers.length === 0) {
            throw new Error("No LLM providers available");
          }

          const provider = providers[0];
          const stream = provider.generateStream({
            messages,
            model: options?.model,
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
          });

          for await (const token of stream) {
            yield token;
          }
        },
      };
    }

    if (manifest.permissions?.workspace) {
      api.workspace = {
        getCurrent: async () => {
          const db = getDb();
          if (!db) throw new Error("Database not available");

          const { workspaces } = await import("../../drizzle/schema");
          const [workspace] = await db.select().from(workspaces).limit(1);
          return workspace || null;
        },
        getDocuments: async () => {
          const { getDocumentsByWorkspace } = await import("../documents/db");
          const db = getDb();
          if (!db) throw new Error("Database not available");

          const { workspaces } = await import("../../drizzle/schema");
          const [workspace] = await db.select().from(workspaces).limit(1);
          if (!workspace) return [];

          return getDocumentsByWorkspace(workspace.id);
        },
        createDocument: async (data) => {
          const { createDocument } = await import("../documents/db");
          return createDocument(data);
        },
      };
    }

    return api;
  }
  
  /**
   * Get plugin status from database
   */
  private async getPluginStatus(pluginId: string): Promise<PluginStatus> {
    const db = getDb();
    if (!db) return "error";
    
    const [plugin] = await db
      .select()
      .from(plugins)
      .where(eq(plugins.name, pluginId))
      .limit(1);
    
    return (plugin?.enabled ? "enabled" : "disabled") as PluginStatus;
  }
  
  /**
   * Update plugin status in database
   */
  private async updatePluginStatus(pluginId: string, status: PluginStatus): Promise<void> {
    const db = getDb();
    if (!db) return;
    
    await db
      .update(plugins)
      .set({ enabled: status === "enabled" })
      .where(eq(plugins.name, pluginId));
  }
  
  /**
   * Save plugin to database
   */
  private async savePluginToDB(manifest: PluginManifest, status: PluginStatus, installedByUserId?: number): Promise<void> {
    const db = getDb();
    if (!db) return;

    await db.insert(plugins).values({
      name: manifest.id,
      displayName: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author || "Unknown",
      runtime: "node",
      entryPoint: manifest.main,
      permissions: manifest.permissions || {},
      enabled: status === "enabled",
      verified: false,
      installedBy: installedByUserId ?? 1,
    });
  }
  
  /**
   * Delete plugin from database
   */
  private async deletePluginFromDB(pluginId: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    
    await db.delete(plugins).where(eq(plugins.name, pluginId));
  }
}

// Global plugin registry instance
export const pluginRegistry = new PluginRegistry();
