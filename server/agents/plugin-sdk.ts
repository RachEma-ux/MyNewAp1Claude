/**
 * Plugin SDK
 * Allows developers to create custom tools and extensions for agents
 */

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: "tool" | "integration" | "workflow" | "ui";
  tags: string[];
}

export interface PluginConfig {
  enabled: boolean;
  settings: Record<string, any>;
}

export interface PluginContext {
  agentId: string;
  workspaceId: number;
  userId: number;
  config: PluginConfig;
}

export interface PluginTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (params: any, context: PluginContext) => Promise<any>;
}

export interface PluginHooks {
  onLoad?: (context: PluginContext) => Promise<void>;
  onUnload?: (context: PluginContext) => Promise<void>;
  onAgentStart?: (context: PluginContext) => Promise<void>;
  onAgentStop?: (context: PluginContext) => Promise<void>;
  onMessage?: (message: any, context: PluginContext) => Promise<any>;
}

export interface Plugin {
  metadata: PluginMetadata;
  tools?: PluginTool[];
  hooks?: PluginHooks;
  config?: PluginConfig;
}

/**
 * Plugin Manager
 * Manages plugin lifecycle and execution
 */
class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private enabledPlugins: Set<string> = new Set();

  /**
   * Register a plugin
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    const { id } = plugin.metadata;

    if (this.plugins.has(id)) {
      throw new Error(`Plugin ${id} is already registered`);
    }

    this.plugins.set(id, plugin);

    // Enable by default
    if (plugin.config?.enabled !== false) {
      await this.enablePlugin(id);
    }

    console.log(`[PluginManager] Registered plugin: ${plugin.metadata.name} (${id})`);
  }

  /**
   * Unregister a plugin
   */
  async unregisterPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // Disable first
    if (this.enabledPlugins.has(pluginId)) {
      await this.disablePlugin(pluginId);
    }

    this.plugins.delete(pluginId);
    console.log(`[PluginManager] Unregistered plugin: ${pluginId}`);
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string, context?: PluginContext): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (this.enabledPlugins.has(pluginId)) {
      return; // Already enabled
    }

    // Call onLoad hook
    if (plugin.hooks?.onLoad && context) {
      await plugin.hooks.onLoad(context);
    }

    this.enabledPlugins.add(pluginId);
    console.log(`[PluginManager] Enabled plugin: ${pluginId}`);
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string, context?: PluginContext): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (!this.enabledPlugins.has(pluginId)) {
      return; // Already disabled
    }

    // Call onUnload hook
    if (plugin.hooks?.onUnload && context) {
      await plugin.hooks.onUnload(context);
    }

    this.enabledPlugins.delete(pluginId);
    console.log(`[PluginManager] Disabled plugin: ${pluginId}`);
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get enabled plugins
   */
  getEnabledPlugins(): Plugin[] {
    return Array.from(this.plugins.values()).filter((plugin) =>
      this.enabledPlugins.has(plugin.metadata.id)
    );
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all tools from enabled plugins
   */
  getPluginTools(): PluginTool[] {
    const tools: PluginTool[] = [];

    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.tools) {
        tools.push(...plugin.tools);
      }
    }

    return tools;
  }

  /**
   * Execute a plugin tool
   */
  async executePluginTool(
    toolName: string,
    params: any,
    context: PluginContext
  ): Promise<any> {
    // Find tool in enabled plugins
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.tools) {
        const tool = plugin.tools.find((t) => t.name === toolName);
        if (tool) {
          try {
            return await tool.execute(params, context);
          } catch (error) {
            console.error(`[PluginManager] Tool ${toolName} execution failed:`, error);
            throw error;
          }
        }
      }
    }

    throw new Error(`Tool ${toolName} not found in any enabled plugin`);
  }

  /**
   * Call plugin hooks
   */
  async callHook(
    hookName: keyof PluginHooks,
    context: PluginContext,
    ...args: any[]
  ): Promise<void> {
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.hooks && plugin.hooks[hookName]) {
        try {
          await (plugin.hooks[hookName] as any)(context, ...args);
        } catch (error) {
          console.error(
            `[PluginManager] Hook ${hookName} failed for plugin ${plugin.metadata.id}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Search plugins
   */
  searchPlugins(query: string): Plugin[] {
    const queryLower = query.toLowerCase();

    return Array.from(this.plugins.values()).filter((plugin) => {
      return (
        plugin.metadata.name.toLowerCase().includes(queryLower) ||
        plugin.metadata.description.toLowerCase().includes(queryLower) ||
        plugin.metadata.tags.some((tag) => tag.toLowerCase().includes(queryLower))
      );
    });
  }

  /**
   * Get plugins by category
   */
  getPluginsByCategory(category: PluginMetadata["category"]): Plugin[] {
    return Array.from(this.plugins.values()).filter(
      (plugin) => plugin.metadata.category === category
    );
  }
}

/**
 * Plugin Builder
 * Fluent API for building plugins
 */
export class PluginBuilder {
  private plugin: Partial<Plugin> = {
    tools: [],
    hooks: {},
    config: { enabled: true, settings: {} },
  };

  /**
   * Set plugin metadata
   */
  metadata(metadata: PluginMetadata): this {
    this.plugin.metadata = metadata;
    return this;
  }

  /**
   * Add a tool
   */
  addTool(tool: PluginTool): this {
    if (!this.plugin.tools) {
      this.plugin.tools = [];
    }
    this.plugin.tools.push(tool);
    return this;
  }

  /**
   * Add multiple tools
   */
  addTools(tools: PluginTool[]): this {
    if (!this.plugin.tools) {
      this.plugin.tools = [];
    }
    this.plugin.tools.push(...tools);
    return this;
  }

  /**
   * Add a hook
   */
  addHook<K extends keyof PluginHooks>(hookName: K, handler: NonNullable<PluginHooks[K]>): this {
    if (!this.plugin.hooks) {
      this.plugin.hooks = {};
    }
    this.plugin.hooks[hookName] = handler;
    return this;
  }

  /**
   * Set config
   */
  setConfig(config: PluginConfig): this {
    this.plugin.config = config;
    return this;
  }

  /**
   * Build the plugin
   */
  build(): Plugin {
    if (!this.plugin.metadata) {
      throw new Error("Plugin metadata is required");
    }

    return this.plugin as Plugin;
  }
}

/**
 * Example plugin: Weather Tool
 */
export const weatherPlugin: Plugin = new PluginBuilder()
  .metadata({
    id: "weather-tool",
    name: "Weather Tool",
    version: "1.0.0",
    author: "System",
    description: "Get current weather information for any location",
    category: "tool",
    tags: ["weather", "api", "data"],
  })
  .addTool({
    name: "get_weather",
    description: "Get current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City name or coordinates",
        },
        units: {
          type: "string",
          enum: ["metric", "imperial"],
          description: "Temperature units",
        },
      },
      required: ["location"],
    },
    execute: async (params, context) => {
      // In production, this would call a real weather API
      return {
        location: params.location,
        temperature: 72,
        conditions: "Sunny",
        humidity: 45,
        wind_speed: 10,
        units: params.units || "imperial",
      };
    },
  })
  .build();

/**
 * Example plugin: Database Query Tool
 */
export const databasePlugin: Plugin = new PluginBuilder()
  .metadata({
    id: "database-tool",
    name: "Database Tool",
    version: "1.0.0",
    author: "System",
    description: "Execute database queries safely",
    category: "integration",
    tags: ["database", "sql", "data"],
  })
  .addTool({
    name: "query_database",
    description: "Execute a read-only SQL query",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "SQL query to execute (SELECT only)",
        },
      },
      required: ["query"],
    },
    execute: async (params, context) => {
      // Validate query is read-only
      const query = params.query.trim().toLowerCase();
      if (!query.startsWith("select")) {
        throw new Error("Only SELECT queries are allowed");
      }

      // In production, execute against real database
      return {
        rows: [],
        rowCount: 0,
      };
    },
  })
  .build();

// Singleton plugin manager
export const pluginManager = new PluginManager();

// Register built-in plugins
pluginManager.registerPlugin(weatherPlugin);
pluginManager.registerPlugin(databasePlugin);
