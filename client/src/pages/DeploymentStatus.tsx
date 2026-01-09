/**
 * Simple status page to verify deployment
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";

export default function DeploymentStatus() {
  const { data: providers = [], isLoading } = trpc.llm.listProviders.useQuery();

  const ollama = providers.find(p => p.id === 'ollama');
  const hasDeviceDetection = typeof trpc.llm.getDeviceSpecs !== 'undefined';
  const hasInstallationCheck = typeof trpc.llm.checkProviderInstallation !== 'undefined';

  const buildVersion = "2026-01-09-v3-with-device-detection";
  const expectedSteps = ["select", "install", "models", "configure", "test", "review"];

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Deployment Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Build Version */}
          <div className="flex items-center justify-between p-3 border rounded">
            <span className="font-medium">Build Version:</span>
            <Badge variant="outline">{buildVersion}</Badge>
          </div>

          {/* Provider Count */}
          <div className="flex items-center justify-between p-3 border rounded">
            <span className="font-medium">Total Providers:</span>
            <Badge variant="outline">{isLoading ? "Loading..." : providers.length}</Badge>
          </div>

          {/* Ollama Provider */}
          <div className="p-3 border rounded">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Ollama Provider:</span>
              {ollama ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
            </div>
            {ollama && (
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>ID: {ollama.id}</div>
                <div>Name: {ollama.name}</div>
                <div className="flex items-center gap-2">
                  <span>Type:</span>
                  <Badge variant={ollama.type === 'local' ? 'default' : 'destructive'}>
                    {ollama.type || 'MISSING'}
                  </Badge>
                  {ollama.type === 'local' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
                <div>Has Installation: {ollama.installation ? '✅' : '❌'}</div>
                <div>Has Model Management: {ollama.modelManagement ? '✅' : '❌'}</div>
                <div>Models: {ollama.models?.length || 0}</div>
              </div>
            )}
          </div>

          {/* Expected Steps */}
          <div className="p-3 border rounded">
            <div className="font-medium mb-2">Expected Wizard Steps (6):</div>
            <div className="flex flex-wrap gap-2">
              {expectedSteps.map(step => (
                <Badge key={step} variant="outline">{step}</Badge>
              ))}
            </div>
          </div>

          {/* Feature Checks */}
          <div className="space-y-2">
            <div className="font-medium">Feature Availability:</div>

            <div className="flex items-center justify-between p-2 border rounded">
              <span className="text-sm">Device Detection Endpoint</span>
              {hasDeviceDetection ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>

            <div className="flex items-center justify-between p-2 border rounded">
              <span className="text-sm">Installation Check Endpoint</span>
              {hasInstallationCheck ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="mt-4 p-4 bg-muted rounded">
            <div className="font-semibold mb-2">Deployment Summary:</div>
            {ollama && ollama.type === 'local' && ollama.installation ? (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                <span>✅ All features deployed correctly!</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="h-5 w-5" />
                  <span>❌ Deployment incomplete</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {!ollama && "- Ollama provider not found"}
                  {ollama && ollama.type !== 'local' && "- Ollama type is not 'local'"}
                  {ollama && !ollama.installation && "- Installation metadata missing"}
                </div>
              </div>
            )}
          </div>

          {/* Debug Info */}
          <details className="text-xs">
            <summary className="cursor-pointer font-medium">Raw Provider Data</summary>
            <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">
              {JSON.stringify(ollama, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
