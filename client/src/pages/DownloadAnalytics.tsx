import { trpc } from "../lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Download, TrendingUp, Clock, HardDrive } from "lucide-react";

/**
 * Download Analytics Dashboard
 * Shows bandwidth metrics, usage patterns, and download statistics
 */

export default function DownloadAnalytics() {
  const { data: stats, isLoading: statsLoading } = trpc.downloadAnalytics.getStats.useQuery();
  const { data: peakTimes } = trpc.downloadAnalytics.getPeakTimes.useQuery();
  const { data: bandwidthPerModel } = trpc.downloadAnalytics.getBandwidthPerModel.useQuery();

  const formatBytes = (bytes: string) => {
    const b = parseFloat(bytes);
    if (isNaN(b)) return "0 B";
    if (b < 1024) return `${b.toFixed(2)} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatSpeed = (speed: string) => {
    const s = parseFloat(speed);
    if (isNaN(s)) return "0 KB/s";
    if (s < 1024) return `${s.toFixed(2)} KB/s`;
    return `${(s / 1024).toFixed(2)} MB/s`;
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  if (statsLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Download Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Track bandwidth usage, download speeds, and usage patterns
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Downloads</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDownloads || 0}</div>
            <p className="text-xs text-muted-foreground">Completed downloads</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Data</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(stats?.totalBytesDownloaded || "0")}
            </div>
            <p className="text-xs text-muted-foreground">Downloaded</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Speed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatSpeed(stats?.averageSpeed || "0")}
            </div>
            <p className="text-xs text-muted-foreground">Across all downloads</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Peak Speed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatSpeed(stats?.peakSpeed || "0")}
            </div>
            <p className="text-xs text-muted-foreground">Maximum recorded</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Peak Usage Times */}
        <Card>
          <CardHeader>
            <CardTitle>Peak Usage Times</CardTitle>
            <CardDescription>Download activity by hour of day</CardDescription>
          </CardHeader>
          <CardContent>
            {!peakTimes || peakTimes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No usage data available yet. Start downloading models to see patterns.
              </p>
            ) : (
              <div className="space-y-3">
                {peakTimes.slice(0, 5).map((time) => (
                  <div key={time.hour} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {time.hour.toString().padStart(2, "0")}:00 - {(time.hour + 1).toString().padStart(2, "0")}:00
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{time.downloadCount} downloads</Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatSpeed(time.averageSpeed)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bandwidth Per Model */}
        <Card>
          <CardHeader>
            <CardTitle>Bandwidth by Model</CardTitle>
            <CardDescription>Data consumption per model</CardDescription>
          </CardHeader>
          <CardContent>
            {!bandwidthPerModel || bandwidthPerModel.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bandwidth data available yet. Download models to see consumption.
              </p>
            ) : (
              <div className="space-y-3">
                {bandwidthPerModel.slice(0, 5).map((model) => (
                  <div key={model.modelId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Model {model.modelId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatBytes(model.totalBytes)}
                      </span>
                      <Badge variant="outline">{formatSpeed(model.averageSpeed)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Time Spent */}
      {stats && stats.totalTimeSpent > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Total Time Spent</CardTitle>
            <CardDescription>Cumulative download time across all models</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatTime(stats.totalTimeSpent)}</div>
            <p className="text-sm text-muted-foreground mt-2">
              Average: {formatTime(Math.floor(stats.totalTimeSpent / (stats.totalDownloads || 1)))} per download
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
