/**
 * Auto-Update Service
 * Handles automatic application updates
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseNotes: string;
  downloadUrl: string;
  releaseDate: string;
}

export interface UpdateProgress {
  stage: "checking" | "downloading" | "installing" | "complete" | "error";
  progress: number;
  message: string;
  error?: string;
}

/**
 * Auto-Update Service
 */
class AutoUpdateService {
  private updateCheckInterval: NodeJS.Timeout | null = null;
  private currentVersion = "1.0.0"; // Read from package.json
  private updateUrl = "https://api.unified-llm.ai/updates";
  private listeners: Array<(progress: UpdateProgress) => void> = [];

  /**
   * Initialize auto-update service
   */
  initialize(checkIntervalHours = 24): void {
    // Check for updates on startup
    this.checkForUpdates();

    // Schedule periodic checks
    this.updateCheckInterval = setInterval(
      () => this.checkForUpdates(),
      checkIntervalHours * 60 * 60 * 1000
    );

    console.log(`[AutoUpdate] Initialized with ${checkIntervalHours}h check interval`);
  }

  /**
   * Check for updates
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      this.notifyListeners({
        stage: "checking",
        progress: 0,
        message: "Checking for updates...",
      });

      const response = await fetch(`${this.updateUrl}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentVersion: this.currentVersion }),
      });

      if (!response.ok) {
        throw new Error(`Update check failed: ${response.statusText}`);
      }

      const updateInfo: UpdateInfo = await response.json();

      if (updateInfo.updateAvailable) {
        console.log(`[AutoUpdate] Update available: ${updateInfo.latestVersion}`);
        this.notifyListeners({
          stage: "checking",
          progress: 100,
          message: `Update available: ${updateInfo.latestVersion}`,
        });
      } else {
        console.log("[AutoUpdate] No updates available");
      }

      return updateInfo;
    } catch (error) {
      console.error("[AutoUpdate] Check failed:", error);
      this.notifyListeners({
        stage: "error",
        progress: 0,
        message: "Update check failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  /**
   * Download and install update
   */
  async downloadAndInstall(updateInfo: UpdateInfo): Promise<boolean> {
    try {
      // Stage 1: Download
      this.notifyListeners({
        stage: "downloading",
        progress: 0,
        message: "Downloading update...",
      });

      const downloadPath = await this.downloadUpdate(updateInfo.downloadUrl);

      this.notifyListeners({
        stage: "downloading",
        progress: 100,
        message: "Download complete",
      });

      // Stage 2: Install
      this.notifyListeners({
        stage: "installing",
        progress: 0,
        message: "Installing update...",
      });

      await this.installUpdate(downloadPath);

      this.notifyListeners({
        stage: "installing",
        progress: 100,
        message: "Installation complete",
      });

      // Stage 3: Complete
      this.notifyListeners({
        stage: "complete",
        progress: 100,
        message: "Update installed successfully. Restart required.",
      });

      return true;
    } catch (error) {
      console.error("[AutoUpdate] Installation failed:", error);
      this.notifyListeners({
        stage: "error",
        progress: 0,
        message: "Update installation failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  /**
   * Download update file
   */
  private async downloadUpdate(url: string): Promise<string> {
    const downloadPath = `/tmp/unified-llm-update-${Date.now()}.tar.gz`;

    // Simulate download (in production, use proper download with progress)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // In production:
    // - Download file with progress tracking
    // - Verify checksum
    // - Save to temp directory

    return downloadPath;
  }

  /**
   * Install update
   */
  private async installUpdate(updatePath: string): Promise<void> {
    // In production:
    // - Extract update package
    // - Backup current version
    // - Apply update
    // - Run migrations
    // - Verify installation

    // For now, simulate installation
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(`[AutoUpdate] Installed from ${updatePath}`);
  }

  /**
   * Restart application
   */
  async restart(): Promise<void> {
    console.log("[AutoUpdate] Restarting application...");

    // In production:
    // - Save state
    // - Close connections
    // - Restart process

    if (process.env.NODE_ENV === "production") {
      // Use PM2 or systemd to restart
      try {
        await execAsync("pm2 restart unified-llm");
      } catch {
        // Fallback: exit and let process manager restart
        process.exit(0);
      }
    } else {
      console.log("[AutoUpdate] Restart skipped in development mode");
    }
  }

  /**
   * Get current version
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Set update URL
   */
  setUpdateUrl(url: string): void {
    this.updateUrl = url;
  }

  /**
   * Add progress listener
   */
  addListener(listener: (progress: UpdateProgress) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove progress listener
   */
  removeListener(listener: (progress: UpdateProgress) => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(progress: UpdateProgress): void {
    for (const listener of this.listeners) {
      try {
        listener(progress);
      } catch (error) {
        console.error("[AutoUpdate] Listener error:", error);
      }
    }
  }

  /**
   * Stop auto-update service
   */
  stop(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
    console.log("[AutoUpdate] Stopped");
  }

  /**
   * Enable/disable auto-updates
   */
  setEnabled(enabled: boolean): void {
    if (enabled) {
      if (!this.updateCheckInterval) {
        this.initialize();
      }
    } else {
      this.stop();
    }
  }
}

// Singleton instance
export const autoUpdateService = new AutoUpdateService();
