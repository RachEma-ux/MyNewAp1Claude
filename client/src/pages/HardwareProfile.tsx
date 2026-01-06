import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { 
  Cpu, 
  MemoryStick, 
  HardDrive, 
  Monitor, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Zap,
  AlertTriangle
} from "lucide-react";

export default function HardwareProfile() {
  const { data: profile, isLoading, refetch } = trpc.hardware.getProfile.useQuery();
  
  // Fetch all benchmarks
  const { data: benchmarks, isLoading: benchmarksLoading } = trpc.modelBenchmarks.getAll.useQuery();

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container py-8">
        <Card className="border-dashed">
          <CardHeader className="text-center py-12">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Hardware detection failed</CardTitle>
            <CardDescription>
              Unable to detect hardware information
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hardware Profile</h1>
          <p className="text-muted-foreground mt-2">
            System capabilities and model recommendations
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* GPU Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>GPU Information</CardTitle>
                <CardDescription>Graphics processing unit</CardDescription>
              </div>
            </div>
            {profile.hasGPU ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Available
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="mr-1 h-3 w-3" />
                Not detected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {profile.hasGPU ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">GPU Type</p>
                  <p className="text-lg font-semibold capitalize">{profile.gpuType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">GPU Name</p>
                  <p className="text-lg font-semibold">{profile.gpuName || "Unknown"}</p>
                </div>
                {profile.gpuVRAM && (
                  <div>
                    <p className="text-sm text-muted-foreground">VRAM</p>
                    <p className="text-lg font-semibold">{profile.gpuVRAM.toFixed(1)} GB</p>
                  </div>
                )}
                {profile.cudaVersion && (
                  <div>
                    <p className="text-sm text-muted-foreground">CUDA Version</p>
                    <p className="text-lg font-semibold">{profile.cudaVersion}</p>
                  </div>
                )}
                {profile.rocmVersion && (
                  <div>
                    <p className="text-sm text-muted-foreground">ROCm Version</p>
                    <p className="text-lg font-semibold">{profile.rocmVersion}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No GPU detected. Models will run on CPU only.</p>
              <p className="text-sm mt-2">Install NVIDIA drivers or AMD ROCm for GPU acceleration.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CPU Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>CPU Information</CardTitle>
              <CardDescription>Central processing unit</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">CPU Model</p>
              <p className="text-lg font-semibold">{profile.cpuModel}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Architecture</p>
              <p className="text-lg font-semibold">{profile.cpuArchitecture}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cores</p>
              <p className="text-lg font-semibold">{profile.cpuCores}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Threads</p>
              <p className="text-lg font-semibold">{profile.cpuThreads}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memory Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <MemoryStick className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Memory Information</CardTitle>
              <CardDescription>System RAM</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total RAM</p>
                <p className="text-lg font-semibold">{profile.totalRAM.toFixed(1)} GB</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available RAM</p>
                <p className="text-lg font-semibold">{profile.availableRAM.toFixed(1)} GB</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Memory Usage</span>
                <span className="font-medium">
                  {((profile.totalRAM - profile.availableRAM) / profile.totalRAM * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-accent rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${((profile.totalRAM - profile.availableRAM) / profile.totalRAM * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platform Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Platform Information</CardTitle>
              <CardDescription>Operating system</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Platform</p>
              <p className="text-lg font-semibold capitalize">{profile.platform}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Version</p>
              <p className="text-lg font-semibold">{profile.platformVersion}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model Recommendations */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Model Recommendations</CardTitle>
              <CardDescription>
                Based on your hardware capabilities
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2 p-3 bg-primary/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Maximum Recommended Model Size</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Models larger than this may cause out-of-memory errors
                </p>
              </div>
              <Badge variant="default" className="text-lg px-3 py-1">
                {profile.maxModelSize} GB
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium mb-3">Recommended Models:</p>
              <div className="flex flex-wrap gap-2">
                {profile.recommendedModels.map((model, index) => (
                  <Badge key={index} variant="outline" className="px-3 py-1">
                    {model}
                  </Badge>
                ))}
              </div>
            </div>

            {!profile.hasGPU && (
              <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-500">CPU-Only Mode</p>
                    <p className="text-sm text-yellow-500/80 mt-1">
                      No GPU detected. Inference will be significantly slower. Consider installing:
                    </p>
                    <ul className="text-sm text-yellow-500/80 mt-2 space-y-1 list-disc list-inside">
                      <li>NVIDIA CUDA drivers for NVIDIA GPUs</li>
                      <li>AMD ROCm for AMD GPUs</li>
                      <li>Apple Metal is built-in on macOS</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Model Performance Benchmarks */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Model Performance Benchmarks</CardTitle>
              <CardDescription>
                Inference speed and memory usage for downloaded models
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {benchmarksLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : benchmarks && benchmarks.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Model ID</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Benchmark</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Tokens/sec</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Memory (MB)</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Run Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarks.slice(0, 10).map((benchmark) => (
                      <tr key={benchmark.id} className="border-b hover:bg-accent/50">
                        <td className="py-3 px-4">
                          <Badge variant="outline">Model {benchmark.modelId}</Badge>
                        </td>
                        <td className="py-3 px-4 text-sm">{benchmark.benchmarkName}</td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-mono text-sm">
                            {benchmark.tokensPerSecond}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-mono text-sm">
                            {benchmark.memoryUsageMb?.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {new Date(benchmark.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="text-xs text-muted-foreground text-center pt-2">
                Showing {Math.min(10, benchmarks.length)} of {benchmarks.length} benchmark results
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No benchmark results yet.</p>
              <p className="text-sm mt-2">Benchmarks are automatically run after model downloads complete.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
