import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Shield, Zap, Server, Cloud, Settings } from "lucide-react";
import { toast } from "sonner";

interface RoutingProfile {
  defaultRoute: 'AUTO' | 'LOCAL_ONLY' | 'CLOUD_ALLOWED';
  dataSensitivity: 'LOW' | 'MED' | 'HIGH';
  qualityTier: 'FAST' | 'BALANCED' | 'BEST';
  fallback: { enabled: boolean; maxHops: number };
  pinnedProviderId?: number | null;
}

interface Props {
  workspaceId: number;
  onSave?: () => void;
}

const ROUTE_OPTIONS = [
  {
    value: 'AUTO',
    label: 'Auto',
    description: 'Automatically choose best provider',
    icon: Settings,
  },
  {
    value: 'LOCAL_ONLY',
    label: 'Local Only',
    description: 'Only use local providers (no data leaves device)',
    icon: Server,
  },
  {
    value: 'CLOUD_ALLOWED',
    label: 'Cloud Allowed',
    description: 'Allow cloud providers when beneficial',
    icon: Cloud,
  },
];

const SENSITIVITY_OPTIONS = [
  { value: 'LOW', label: 'Low', description: 'General data, no restrictions' },
  { value: 'MED', label: 'Medium', description: 'Business data, prefer secure providers' },
  { value: 'HIGH', label: 'High', description: 'Sensitive data, local/no-egress only' },
];

const QUALITY_OPTIONS = [
  { value: 'FAST', label: 'Fast', description: 'Prioritize speed, use cheaper models' },
  { value: 'BALANCED', label: 'Balanced', description: 'Balance speed and quality' },
  { value: 'BEST', label: 'Best', description: 'Prioritize quality, use premium models' },
];

export function WorkspaceRoutingProfile({ workspaceId, onSave }: Props) {
  const [profile, setProfile] = useState<RoutingProfile>({
    defaultRoute: 'AUTO',
    dataSensitivity: 'LOW',
    qualityTier: 'BALANCED',
    fallback: { enabled: true, maxHops: 3 },
    pinnedProviderId: null,
  });

  const { data: currentProfile, isLoading } = trpc.workspaces.getRoutingProfile.useQuery(
    { id: workspaceId },
    { enabled: !!workspaceId }
  );

  const { data: providers } = trpc.providers.list.useQuery();

  const updateProfile = trpc.workspaces.updateRoutingProfile.useMutation({
    onSuccess: () => {
      toast.success("Routing profile updated");
      onSave?.();
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  useEffect(() => {
    if (currentProfile) {
      setProfile(currentProfile);
    }
  }, [currentProfile]);

  const handleSave = () => {
    updateProfile.mutate({
      id: workspaceId,
      routingProfile: profile,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Route Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            Default Route
          </CardTitle>
          <CardDescription>How requests should be routed by default</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {ROUTE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = profile.defaultRoute === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setProfile({ ...profile, defaultRoute: option.value as any })}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-medium">{option.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Data Sensitivity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Data Sensitivity
          </CardTitle>
          <CardDescription>Security level for data processed in this workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {SENSITIVITY_OPTIONS.map((option) => {
              const isSelected = profile.dataSensitivity === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setProfile({ ...profile, dataSensitivity: option.value as any })}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{option.label}</span>
                    {option.value === 'HIGH' && (
                      <Badge variant="destructive" className="text-xs">Restricted</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </button>
              );
            })}
          </div>
          {profile.dataSensitivity === 'HIGH' && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                <strong>Note:</strong> HIGH sensitivity restricts routing to local providers or those with the 'no_egress' policy tag.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quality Tier */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Quality Tier
          </CardTitle>
          <CardDescription>Balance between speed and output quality</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {QUALITY_OPTIONS.map((option) => {
              const isSelected = profile.qualityTier === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setProfile({ ...profile, qualityTier: option.value as any })}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="font-medium block mb-1">{option.label}</span>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Fallback Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fallback Configuration</CardTitle>
          <CardDescription>How to handle provider failures</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="fallback-enabled" className="font-medium">Enable Fallback</Label>
              <p className="text-xs text-muted-foreground">Automatically try other providers if primary fails</p>
            </div>
            <Switch
              id="fallback-enabled"
              checked={profile.fallback.enabled}
              onCheckedChange={(checked) =>
                setProfile({ ...profile, fallback: { ...profile.fallback, enabled: checked } })
              }
            />
          </div>
          {profile.fallback.enabled && (
            <div className="space-y-2">
              <Label htmlFor="max-hops">Maximum Fallback Attempts</Label>
              <Input
                id="max-hops"
                type="number"
                min={1}
                max={10}
                value={profile.fallback.maxHops}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    fallback: { ...profile.fallback, maxHops: parseInt(e.target.value) || 3 },
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Number of fallback providers to try before failing (1-10)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pinned Provider */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pinned Provider (Optional)</CardTitle>
          <CardDescription>Always use this provider when available</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={profile.pinnedProviderId?.toString() || "none"}
            onValueChange={(v) =>
              setProfile({ ...profile, pinnedProviderId: v === "none" ? null : parseInt(v) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="No pinned provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No pinned provider</SelectItem>
              {providers?.map((provider) => (
                <SelectItem key={provider.id} value={provider.id.toString()}>
                  {provider.name} ({provider.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateProfile.isPending}>
          {updateProfile.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Routing Profile
        </Button>
      </div>
    </div>
  );
}
