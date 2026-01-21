import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Info } from "lucide-react";
import { toast } from "sonner";

// Types matching server schema
type ProviderCapability = 'chat' | 'embeddings' | 'tools' | 'vision' | 'json_mode' | 'streaming';
type ProviderPolicyTag = 'no_egress' | 'pii_safe' | 'gpu_required' | 'hipaa_compliant' | 'gdpr_compliant';
type ProviderKind = 'local' | 'cloud' | 'hybrid';
type CostTier = 'free' | 'low' | 'medium' | 'high';

interface ProviderLimits {
  maxContext?: number;
  maxOutput?: number;
  rateLimit?: number;
  costTier?: CostTier;
}

interface Props {
  providerId: number;
  initialCapabilities?: ProviderCapability[];
  initialPolicyTags?: ProviderPolicyTag[];
  initialKind?: ProviderKind;
  initialLimits?: ProviderLimits;
  onSave?: () => void;
}

const CAPABILITIES: { value: ProviderCapability; label: string; description: string }[] = [
  { value: 'chat', label: 'Chat', description: 'Standard chat completions' },
  { value: 'embeddings', label: 'Embeddings', description: 'Text embeddings generation' },
  { value: 'tools', label: 'Tool Calling', description: 'Function/tool calling support' },
  { value: 'vision', label: 'Vision', description: 'Image understanding' },
  { value: 'json_mode', label: 'JSON Mode', description: 'Structured JSON output' },
  { value: 'streaming', label: 'Streaming', description: 'Token streaming support' },
];

const POLICY_TAGS: { value: ProviderPolicyTag; label: string; description: string }[] = [
  { value: 'no_egress', label: 'No Egress', description: 'Data stays local, no external calls' },
  { value: 'pii_safe', label: 'PII Safe', description: 'Safe for personal identifiable information' },
  { value: 'gpu_required', label: 'GPU Required', description: 'Requires GPU for operation' },
  { value: 'hipaa_compliant', label: 'HIPAA Compliant', description: 'Healthcare data compliance' },
  { value: 'gdpr_compliant', label: 'GDPR Compliant', description: 'EU data protection compliance' },
];

const COST_TIERS: { value: CostTier; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'low', label: 'Low ($0.001-0.01/1k)' },
  { value: 'medium', label: 'Medium ($0.01-0.05/1k)' },
  { value: 'high', label: 'High ($0.05+/1k)' },
];

export function ProviderCapabilitiesEditor({
  providerId,
  initialCapabilities = [],
  initialPolicyTags = [],
  initialKind = 'cloud',
  initialLimits = {},
  onSave,
}: Props) {
  const [capabilities, setCapabilities] = useState<ProviderCapability[]>(initialCapabilities);
  const [policyTags, setPolicyTags] = useState<ProviderPolicyTag[]>(initialPolicyTags);
  const [kind, setKind] = useState<ProviderKind>(initialKind);
  const [limits, setLimits] = useState<ProviderLimits>(initialLimits);

  const updateCapabilities = trpc.providers.capabilities.update.useMutation({
    onSuccess: () => {
      toast.success("Provider capabilities updated");
      onSave?.();
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const handleCapabilityToggle = (cap: ProviderCapability) => {
    setCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  };

  const handlePolicyTagToggle = (tag: ProviderPolicyTag) => {
    setPolicyTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSave = () => {
    updateCapabilities.mutate({
      id: providerId,
      capabilities,
      policyTags,
      kind,
      limits: {
        maxContext: limits.maxContext || undefined,
        maxOutput: limits.maxOutput || undefined,
        rateLimit: limits.rateLimit || undefined,
        costTier: limits.costTier || undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Provider Kind */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Provider Type</CardTitle>
          <CardDescription>How this provider connects and processes requests</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={kind} onValueChange={(v) => setKind(v as ProviderKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local - Runs on this machine</SelectItem>
              <SelectItem value="cloud">Cloud - Remote API endpoint</SelectItem>
              <SelectItem value="hybrid">Hybrid - Can run locally or remote</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Capabilities</CardTitle>
          <CardDescription>Features this provider supports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {CAPABILITIES.map(cap => (
              <div key={cap.value} className="flex items-start space-x-3">
                <Checkbox
                  id={`cap-${cap.value}`}
                  checked={capabilities.includes(cap.value)}
                  onCheckedChange={() => handleCapabilityToggle(cap.value)}
                />
                <div className="space-y-1">
                  <Label htmlFor={`cap-${cap.value}`} className="font-medium cursor-pointer">
                    {cap.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{cap.description}</p>
                </div>
              </div>
            ))}
          </div>
          {capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-4 pt-4 border-t">
              {capabilities.map(cap => (
                <Badge key={cap} variant="secondary" className="text-xs">
                  {CAPABILITIES.find(c => c.value === cap)?.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Policy Tags */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Policy Tags</CardTitle>
          <CardDescription>Compliance and security attributes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {POLICY_TAGS.map(tag => (
              <div key={tag.value} className="flex items-start space-x-3">
                <Checkbox
                  id={`tag-${tag.value}`}
                  checked={policyTags.includes(tag.value)}
                  onCheckedChange={() => handlePolicyTagToggle(tag.value)}
                />
                <div className="space-y-1">
                  <Label htmlFor={`tag-${tag.value}`} className="font-medium cursor-pointer">
                    {tag.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{tag.description}</p>
                </div>
              </div>
            ))}
          </div>
          {policyTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-4 pt-4 border-t">
              {policyTags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {POLICY_TAGS.find(t => t.value === tag)?.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Limits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Limits</CardTitle>
          <CardDescription>Provider constraints and cost tier</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxContext">Max Context (tokens)</Label>
              <Input
                id="maxContext"
                type="number"
                placeholder="128000"
                value={limits.maxContext || ''}
                onChange={(e) => setLimits({ ...limits, maxContext: parseInt(e.target.value) || undefined })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxOutput">Max Output (tokens)</Label>
              <Input
                id="maxOutput"
                type="number"
                placeholder="4096"
                value={limits.maxOutput || ''}
                onChange={(e) => setLimits({ ...limits, maxOutput: parseInt(e.target.value) || undefined })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rateLimit">Rate Limit (req/min)</Label>
              <Input
                id="rateLimit"
                type="number"
                placeholder="60"
                value={limits.rateLimit || ''}
                onChange={(e) => setLimits({ ...limits, rateLimit: parseInt(e.target.value) || undefined })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="costTier">Cost Tier</Label>
              <Select
                value={limits.costTier || ''}
                onValueChange={(v) => setLimits({ ...limits, costTier: v as CostTier })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select cost tier" />
                </SelectTrigger>
                <SelectContent>
                  {COST_TIERS.map(tier => (
                    <SelectItem key={tier.value} value={tier.value}>
                      {tier.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateCapabilities.isPending}>
          {updateCapabilities.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Capabilities
        </Button>
      </div>
    </div>
  );
}
