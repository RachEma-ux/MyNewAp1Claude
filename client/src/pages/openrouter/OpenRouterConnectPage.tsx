import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle, XCircle, Plug, Key, Globe, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function OpenRouterConnectPage() {
  const config = trpc.openRouter.config.get.useQuery();
  const saveConfig = trpc.openRouter.config.save.useMutation();
  const testConn = trpc.openRouter.config.testConnection.useMutation();
  const syncMut = trpc.openRouter.sync.run.useMutation();

  const [apiKey, setApiKey] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [siteName, setSiteName] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  const cfg = config.data;

  const handleTest = async () => {
    const result = await testConn.mutateAsync({ apiKey: apiKey || undefined });
    setTestResult(result);
    if (result.connected) toast.success(`Connected — ${result.modelsAvailable} models available`);
    else toast.error(result.error ?? "Connection failed");
  };

  const handleSave = async () => {
    try {
      await saveConfig.mutateAsync({
        apiKey: apiKey || undefined,
        siteUrl: siteUrl || undefined,
        siteName: siteName || undefined,
        enabled: true,
      });
      toast.success("Configuration saved");
      config.refetch();
      setApiKey("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleSync = async () => {
    try {
      const result = await syncMut.mutateAsync();
      if (result.error) toast.error(result.error);
      else toast.success(`Synced ${result.modelsFound} models (${result.modelsAdded} new, ${result.modelsUpdated} updated)`);
      config.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    await saveConfig.mutateAsync({ enabled });
    config.refetch();
  };

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold">Connect to OpenRouter</h3>
        <p className="text-sm text-muted-foreground">
          Configure your API key and connection. Keys are AES-256-GCM encrypted and stored server-side only — never exposed to the browser.
        </p>
      </div>

      {/* Current status */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs text-muted-foreground">Connection Status</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 flex items-center gap-3">
          {cfg?.configured ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <XCircle className="w-5 h-5 text-muted-foreground" />
          )}
          <div className="flex-1">
            <div className="text-sm font-medium">{cfg?.configured ? "Connected" : "Not Connected"}</div>
            <div className="text-xs text-muted-foreground">
              {cfg?.configured ? `Endpoint: ${cfg.endpoint}` : "Enter your API key below"}
            </div>
          </div>
          {cfg?.configured && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Enabled</span>
              <Switch checked={cfg.enabled} onCheckedChange={handleToggle} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Key */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" /> API Key
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          <Input
            type="password"
            placeholder={cfg?.hasApiKey ? "••••••••••• (key stored — enter new to rotate)" : "sk-or-v1-..."}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleTest} disabled={testConn.isPending || (!apiKey && !cfg?.hasApiKey)}>
              {testConn.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plug className="w-4 h-4 mr-1" />}
              Test
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saveConfig.isPending || !apiKey}>
              {saveConfig.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save Key
            </Button>
          </div>
          {testResult && (
            <div className={`text-xs p-2 rounded ${testResult.connected ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
              {testResult.connected
                ? `Connected in ${testResult.latencyMs}ms — ${testResult.modelsAvailable} models available`
                : `Failed: ${testResult.error}`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Site Identity */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Site Identity (optional)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          <div>
            <label className="text-xs font-medium">Site URL</label>
            <Input placeholder={cfg?.siteUrl ?? "https://myapp.example.com"} value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium">Site Name</label>
            <Input placeholder={cfg?.siteName ?? "MyNewAp1Claude"} value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          </div>
          {(siteUrl || siteName) && (
            <Button size="sm" variant="outline" onClick={() => saveConfig.mutateAsync({ siteUrl, siteName }).then(() => { config.refetch(); toast.success("Updated"); })}>
              Save Identity
            </Button>
          )}
          <p className="text-[10px] text-muted-foreground">Sent as HTTP-Referer and X-Title headers for OpenRouter rankings and analytics.</p>
        </CardContent>
      </Card>

      {/* Sync */}
      {cfg?.configured && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Model Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleSync} disabled={syncMut.isPending}>
                {syncMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Sync Models Now
              </Button>
              {cfg.lastSyncAt && (
                <span className="text-xs text-muted-foreground">Last: {new Date(cfg.lastSyncAt).toLocaleString()}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
