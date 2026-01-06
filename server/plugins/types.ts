/**
 * Plugin System Types
 * Defines interfaces and types for the plugin architecture
 */

export type PluginStatus = "installed" | "enabled" | "disabled" | "error";

export type PluginCategory = 
  | "model" 
  | "embedding" 
  | "tool" 
  | "integration" 
  | "ui" 
  | "automation";

/**
 * Plugin Manifest
 * Metadata and configuration for a plugin
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: PluginCategory;
  
  // Dependencies
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  
  // Entry points
  main: string; // Main entry file
  exports?: Record<string, string>; // Named exports
  
  // Permissions
  permissions?: PluginPermissions;
  
  // Configuration schema
  configSchema?: Record<string, any>;
  
  // Metadata
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
}

/**
 * Plugin Permissions
 * Controls what resources a plugin can access
 */
export interface PluginPermissions {
  network?: boolean; // Can make network requests
  filesystem?: boolean; // Can access filesystem
  database?: boolean; // Can access database
  llm?: boolean; // Can call LLM APIs
  workspace?: boolean; // Can access workspace data
  system?: boolean; // Can execute system commands
}

/**
 * Plugin Context
 * Runtime context provided to plugins
 */
export interface PluginContext {
  pluginId: string;
  config: Record<string, any>;
  logger: PluginLogger;
  storage: PluginStorage;
  api: PluginAPI;
}

/**
 * Plugin Logger
 * Logging interface for plugins
 */
export interface PluginLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * Plugin Storage
 * Key-value storage for plugin data
 */
export interface PluginStorage {
  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

/**
 * Plugin API
 * APIs exposed to plugins
 */
export interface PluginAPI {
  // LLM APIs
  llm?: {
    invoke(messages: any[], options?: any): Promise<any>;
    stream(messages: any[], options?: any): AsyncIterator<any>;
  };
  
  // Embedding APIs
  embedding?: {
    generate(texts: string[]): Promise<number[][]>;
  };
  
  // Vector DB APIs
  vectorDB?: {
    search(query: number[], limit?: number): Promise<any[]>;
    insert(vectors: number[][], metadata?: any[]): Promise<void>;
  };
  
  // Workspace APIs
  workspace?: {
    getCurrent(): Promise<any>;
    getDocuments(): Promise<any[]>;
    createDocument(data: any): Promise<any>;
  };
}

/**
 * Base Plugin Interface
 * All plugins must implement this interface
 */
export interface IPlugin {
  manifest: PluginManifest;
  
  /**
   * Initialize the plugin
   * Called when plugin is loaded
   */
  initialize(context: PluginContext): Promise<void>;
  
  /**
   * Activate the plugin
   * Called when plugin is enabled
   */
  activate(): Promise<void>;
  
  /**
   * Deactivate the plugin
   * Called when plugin is disabled
   */
  deactivate(): Promise<void>;
  
  /**
   * Cleanup plugin resources
   * Called when plugin is uninstalled
   */
  cleanup(): Promise<void>;
}

/**
 * Plugin Lifecycle Events
 */
export type PluginLifecycleEvent = 
  | "beforeInstall"
  | "afterInstall"
  | "beforeEnable"
  | "afterEnable"
  | "beforeDisable"
  | "afterDisable"
  | "beforeUninstall"
  | "afterUninstall";

export interface PluginLifecycleHook {
  event: PluginLifecycleEvent;
  handler: (pluginId: string) => Promise<void>;
}

/**
 * Plugin Error
 */
export class PluginError extends Error {
  constructor(
    public pluginId: string,
    message: string,
    public code?: string
  ) {
    super(`[Plugin:${pluginId}] ${message}`);
    this.name = "PluginError";
  }
}
