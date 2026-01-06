import https from "https";
import http from "http";
import { storagePut } from "../storage";
import { 
  updateDownloadProgress, 
  updateDownloadStatus, 
  getModelDownload 
} from "./download-db";
import { runModelBenchmark } from "./benchmark-service";

/**
 * Real Model Download Service
 * Handles streaming HTTP downloads from HuggingFace and uploads to S3
 */

export interface DownloadProgress {
  downloadId: number;
  bytesDownloaded: number;
  totalBytes: number;
  progress: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
}

// Active downloads tracking
const activeDownloads = new Map<number, {
  abortController: AbortController;
  startTime: number;
  lastUpdate: number;
  bytesDownloaded: number;
}>();

/**
 * Start a model download from HuggingFace
 */
export async function startModelDownload(
  downloadId: number,
  sourceUrl: string,
  modelName: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ success: boolean; fileUrl?: string; error?: string }> {
  try {
    // Update status to downloading
    await updateDownloadStatus(downloadId, "downloading");
    
    // Create abort controller for cancellation
    const abortController = new AbortController();
    const startTime = Date.now();
    
    activeDownloads.set(downloadId, {
      abortController,
      startTime,
      lastUpdate: startTime,
      bytesDownloaded: 0,
    });

    // Start streaming download
    const result = await downloadWithStreaming(
      downloadId,
      sourceUrl,
      modelName,
      abortController.signal,
      onProgress
    );

    // Clean up
    activeDownloads.delete(downloadId);

    if (result.success) {
      // Update status to completed
      await updateDownloadStatus(downloadId, "completed");
      
      // Run automatic benchmark after successful download
      try {
        const download = await getModelDownload(downloadId);
        if (download) {
          console.log(`[Download] Starting automatic benchmark for model ${modelName}`);
          // Run benchmark in background (don't await)
          runModelBenchmark(download.modelId, modelName, download.userId).catch(err => {
            console.error(`[Download] Benchmark failed for model ${modelName}:`, err);
          });
        }
      } catch (benchmarkError) {
        console.error(`[Download] Failed to start benchmark:`, benchmarkError);
      }
      
      return { success: true, fileUrl: result.fileUrl };
    } else {
      // Update status to failed
      await updateDownloadStatus(downloadId, "failed", result.error);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    activeDownloads.delete(downloadId);
    await updateDownloadStatus(downloadId, "failed", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Download file with streaming and progress tracking
 */
async function downloadWithStreaming(
  downloadId: number,
  sourceUrl: string,
  modelName: string,
  signal: AbortSignal,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ success: boolean; fileUrl?: string; error?: string }> {
  return new Promise((resolve) => {
    const urlObj = new URL(sourceUrl);
    const protocol = urlObj.protocol === "https:" ? https : http;

    const request = protocol.get(sourceUrl, { signal }, (response) => {
      if (response.statusCode !== 200) {
        resolve({
          success: false,
          error: `HTTP ${response.statusCode}: ${response.statusMessage}`,
        });
        return;
      }

      const totalBytes = parseInt(response.headers["content-length"] || "0", 10);
      const chunks: Buffer[] = [];
      let bytesDownloaded = 0;
      const startTime = Date.now();
      let lastProgressUpdate = startTime;

      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        bytesDownloaded += chunk.length;

        // Update tracking
        const downloadInfo = activeDownloads.get(downloadId);
        if (downloadInfo) {
          downloadInfo.bytesDownloaded = bytesDownloaded;
          downloadInfo.lastUpdate = Date.now();
        }

        // Throttle progress updates (every 500ms)
        const now = Date.now();
        if (now - lastProgressUpdate >= 500) {
          const elapsed = (now - startTime) / 1000; // seconds
          const speed = bytesDownloaded / elapsed; // bytes per second
          const progress = totalBytes > 0 ? (bytesDownloaded / totalBytes) * 100 : 0;
          const eta = totalBytes > 0 ? (totalBytes - bytesDownloaded) / speed : 0;

          // Update database
          updateDownloadProgress(
            downloadId,
            Math.round(progress),
            formatBytes(bytesDownloaded)
          ).catch(console.error);

          // Call progress callback
          if (onProgress) {
            onProgress({
              downloadId,
              bytesDownloaded,
              totalBytes,
              progress,
              speed,
              eta,
            });
          }

          lastProgressUpdate = now;
        }
      });

      response.on("end", async () => {
        try {
          // Combine all chunks
          const fileBuffer = Buffer.concat(chunks);

          // Upload to S3
          const fileKey = `models/${modelName}-${Date.now()}.gguf`;
          const uploadResult = await storagePut(
            fileKey,
            fileBuffer,
            "application/octet-stream"
          );

          // Final progress update
          await updateDownloadProgress(downloadId, 100, formatBytes(bytesDownloaded));

          resolve({
            success: true,
            fileUrl: uploadResult.url,
          });
        } catch (error: any) {
          resolve({
            success: false,
            error: `Upload failed: ${error.message}`,
          });
        }
      });

      response.on("error", (error) => {
        resolve({
          success: false,
          error: `Download failed: ${error.message}`,
        });
      });
    });

    request.on("error", (error) => {
      resolve({
        success: false,
        error: `Request failed: ${error.message}`,
      });
    });

    // Handle abort
    signal.addEventListener("abort", () => {
      request.destroy();
      resolve({
        success: false,
        error: "Download cancelled by user",
      });
    });
  });
}

/**
 * Pause a download
 */
export async function pauseDownload(downloadId: number): Promise<boolean> {
  const downloadInfo = activeDownloads.get(downloadId);
  if (!downloadInfo) {
    return false;
  }

  // Abort the download
  downloadInfo.abortController.abort();
  activeDownloads.delete(downloadId);

  // Update status
  await updateDownloadStatus(downloadId, "paused");
  return true;
}

/**
 * Resume a paused download
 */
export async function resumeDownload(downloadId: number): Promise<boolean> {
  const download = await getModelDownload(downloadId);
  if (!download || download.status !== "paused") {
    return false;
  }

  // Restart the download
  // Note: For true resume support, we'd need to implement HTTP Range requests
  // For now, we'll restart from the beginning
  if (download.sourceUrl) {
    startModelDownload(downloadId, download.sourceUrl, `model-${download.modelId}`);
    return true;
  }

  return false;
}

/**
 * Cancel a download
 */
export async function cancelDownload(downloadId: number): Promise<boolean> {
  const downloadInfo = activeDownloads.get(downloadId);
  if (downloadInfo) {
    downloadInfo.abortController.abort();
    activeDownloads.delete(downloadId);
  }

  // Update status
  await updateDownloadStatus(downloadId, "failed", "Cancelled by user");
  return true;
}

/**
 * Get download progress
 */
export function getDownloadProgress(downloadId: number): DownloadProgress | null {
  const downloadInfo = activeDownloads.get(downloadId);
  if (!downloadInfo) {
    return null;
  }

  const elapsed = (Date.now() - downloadInfo.startTime) / 1000;
  const speed = downloadInfo.bytesDownloaded / elapsed;

  return {
    downloadId,
    bytesDownloaded: downloadInfo.bytesDownloaded,
    totalBytes: 0, // We don't store this in activeDownloads
    progress: 0,
    speed,
    eta: 0,
  };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Simulate download for testing (when real URL is not available)
 */
export async function simulateDownload(
  downloadId: number,
  modelName: string,
  sizeGB: number
): Promise<{ success: boolean; fileUrl?: string; error?: string }> {
  try {
    await updateDownloadStatus(downloadId, "downloading");

    // Simulate download progress
    const totalSteps = 20;
    for (let i = 0; i <= totalSteps; i++) {
      const progress = (i / totalSteps) * 100;
      const bytesDownloaded = (sizeGB * 1024 * 1024 * 1024 * i) / totalSteps;

      await updateDownloadProgress(
        downloadId,
        Math.round(progress),
        formatBytes(bytesDownloaded)
      );

      // Wait 500ms between updates
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if download was cancelled
      const download = await getModelDownload(downloadId);
      if (download?.status === "failed" || download?.status === "paused") {
        return { success: false, error: "Download cancelled" };
      }
    }

    // Create a small dummy file for S3
    const dummyContent = `Model: ${modelName}\nSize: ${sizeGB}GB\nDownloaded: ${new Date().toISOString()}`;
    const fileKey = `models/${modelName}-${Date.now()}.txt`;
    const uploadResult = await storagePut(
      fileKey,
      Buffer.from(dummyContent),
      "text/plain"
    );

    await updateDownloadStatus(downloadId, "completed");
    
    // Run automatic benchmark after successful download
    try {
      const download = await getModelDownload(downloadId);
      if (download) {
        console.log(`[Simulate] Starting automatic benchmark for model ${modelName}`);
        // Run benchmark in background (don't await)
        runModelBenchmark(download.modelId, modelName, download.userId).catch(err => {
          console.error(`[Simulate] Benchmark failed for model ${modelName}:`, err);
        });
      }
    } catch (benchmarkError) {
      console.error(`[Simulate] Failed to start benchmark:`, benchmarkError);
    }
    
    return { success: true, fileUrl: uploadResult.url };
  } catch (error: any) {
    await updateDownloadStatus(downloadId, "failed", error.message);
    return { success: false, error: error.message };
  }
}
