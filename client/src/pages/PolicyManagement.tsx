import { useState } from "react";
import { Upload, Download, RefreshCw, AlertTriangle, CheckCircle2, FileJson, Trash2 } from "lucide-react";
import { DiffViewer } from "@/components/DiffViewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface PolicyFile {
  id: string;
  name: string;
  content: string;
  uploadedAt: Date;
  size: number;
  hash: string;
  isActive: boolean;
}

interface PolicyDiff {
  field: string;
  oldValue: string;
  newValue: string;
  type: "added" | "removed" | "modified";
}

export default function PolicyManagement() {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<PolicyFile[]>([
    {
      id: "1",
      name: "default-governance-policy.json",
      content: JSON.stringify({
        version: "1.0",
        rules: {
          maxBudget: 1000,
          maxTokensPerRequest: 10000,
          allowedActions: ["read", "write"],
          deniedActions: ["delete", "admin"],
        },
      }, null, 2),
      uploadedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      size: 256,
      hash: "abc123def456",
      isActive: true,
    },
  ]);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyFile | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [policyDiffs, setPolicyDiffs] = useState<PolicyDiff[]>([]);
  const [newPolicyContent, setNewPolicyContent] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [activePolicyForDiff, setActivePolicyForDiff] = useState<PolicyFile | null>(null);

  const handlePolicyUpload = async () => {
    if (!newPolicyContent.trim()) {
      toast({ title: "Error", description: "Policy content cannot be empty", variant: "destructive" });
      return;
    }

    try {
      setIsUploading(true);
      // Validate JSON
      JSON.parse(newPolicyContent);

      // Create new policy
      const newPolicy: PolicyFile = {
        id: Date.now().toString(),
        name: `governance-policy-${new Date().toISOString().split('T')[0]}.json`,
        content: newPolicyContent,
        uploadedAt: new Date(),
        size: new TextEncoder().encode(newPolicyContent).length,
        hash: Math.random().toString(36).substring(7),
        isActive: false,
      };

      setPolicies([newPolicy, ...policies]);
      setNewPolicyContent("");
      setUploadDialogOpen(false);
      toast({ title: "Success", description: "Policy uploaded successfully" });
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid JSON format. Please check your policy file.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleViewDiff = (policy: PolicyFile) => {
    const activePolicy = policies.find((p) => p.isActive);
    
    if (!activePolicy) {
      toast({
        title: "Error",
        description: "No active policy to compare against",
        variant: "destructive",
      });
      return;
    }

    if (activePolicy.id === policy.id) {
      toast({
        title: "Info",
        description: "This is the active policy. Select another policy to compare.",
        variant: "default",
      });
      return;
    }

    try {
      const oldPolicy = JSON.parse(activePolicy.content);
      const newPolicy = JSON.parse(policy.content);
      const diffs: PolicyDiff[] = [];

      const allKeys = new Set([...Object.keys(oldPolicy), ...Object.keys(newPolicy)]);
      allKeys.forEach((key) => {
        const oldValue = JSON.stringify(oldPolicy[key] || "");
        const newValue = JSON.stringify(newPolicy[key] || "");

        if (oldValue !== newValue) {
          if (!oldPolicy[key]) {
            diffs.push({ field: key, oldValue: "", newValue, type: "added" });
          } else if (!newPolicy[key]) {
            diffs.push({ field: key, oldValue, newValue: "", type: "removed" });
          } else {
            diffs.push({ field: key, oldValue, newValue, type: "modified" });
          }
        }
      });

      setPolicyDiffs(diffs);
      setActivePolicyForDiff(activePolicy);
      setSelectedPolicy(policy);
      setDiffDialogOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to compare policies",
        variant: "destructive",
      });
    }
  };

  const handleActivatePolicy = (policy: PolicyFile) => {
    setPolicies(
      policies.map((p) => ({
        ...p,
        isActive: p.id === policy.id,
      }))
    );
    toast({ title: "Success", description: `Policy "${policy.name}" is now active` });
  };

  const handleDeletePolicy = (policyId: string) => {
    if (policies.find((p) => p.id === policyId)?.isActive) {
      toast({
        title: "Error",
        description: "Cannot delete the active policy",
        variant: "destructive",
      });
      return;
    }

    setPolicies(policies.filter((p) => p.id !== policyId));
    toast({ title: "Success", description: "Policy deleted successfully" });
  };

  const handleHotReload = async () => {
    try {
      setIsReloading(true);
      // Simulate hot reload
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast({ title: "Success", description: "Policies reloaded successfully" });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reload policies",
        variant: "destructive",
      });
    } finally {
      setIsReloading(false);
    }
  };

  const handleDownloadPolicy = (policy: PolicyFile) => {
    const dataBlob = new Blob([policy.content], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = policy.name;
    link.click();
    toast({ title: "Success", description: `Downloaded ${policy.name}` });
  };

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Policy Management</h1>
          <p className="text-muted-foreground mt-1">
            Upload, manage, and apply governance policies to agents
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleHotReload} disabled={isReloading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isReloading ? "animate-spin" : ""}`} />
            {isReloading ? "Reloading..." : "Hot Reload"}
          </Button>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Policy
          </Button>
        </div>
      </div>

      {/* Active Policy Section */}
      {policies.find((p) => p.isActive) && (
        <Card className="mb-6 p-6 border-green-500/20 bg-green-500/5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-green-900">Active Policy</h3>
                <p className="text-sm text-green-800 mt-1">
                  {policies.find((p) => p.isActive)?.name}
                </p>
                <p className="text-xs text-green-700 mt-2">
                  Activated {format(policies.find((p) => p.isActive)?.uploadedAt || new Date(), "PPp")}
                </p>
              </div>
            </div>
            <Badge className="bg-green-600">Active</Badge>
          </div>
        </Card>
      )}

      {/* Policies List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">All Policies</h2>
        {policies.length === 0 ? (
          <Card className="p-12 text-center">
            <FileJson className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No policies found</h3>
            <p className="text-muted-foreground mb-4">
              Upload your first governance policy to get started
            </p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Policy
            </Button>
          </Card>
        ) : (
          policies.map((policy) => (
            <Card key={policy.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold">{policy.name}</h3>
                    {policy.isActive && (
                      <Badge className="bg-green-600">Active</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground mb-4">
                    <div>
                      <span className="font-medium">Size:</span> {(policy.size / 1024).toFixed(2)} KB
                    </div>
                    <div>
                      <span className="font-medium">Hash:</span> {policy.hash}
                    </div>
                    <div>
                      <span className="font-medium">Uploaded:</span> {format(policy.uploadedAt, "PPp")}
                    </div>
                  </div>
                  <div className="bg-muted p-3 rounded-md max-h-40 overflow-y-auto font-mono text-xs">
                    <pre>{policy.content}</pre>
                  </div>
                </div>
                <div className="flex flex-col gap-2 ml-4">
                  {!policy.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleActivatePolicy(policy)}
                    >
                      Activate
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDiff(policy)}
                  >
                    View Diff
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadPolicy(policy)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  {!policy.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePolicy(policy.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Upload Policy Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload New Policy</DialogTitle>
            <DialogDescription>
              Upload a JSON governance policy file. It will be validated before upload.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Policy Content (JSON)</label>
              <textarea
                value={newPolicyContent}
                onChange={(e) => setNewPolicyContent(e.target.value)}
                placeholder={`{
  "version": "1.0",
  "rules": {
    "maxBudget": 1000,
    "maxTokensPerRequest": 10000,
    "allowedActions": ["read", "write"],
    "deniedActions": ["delete", "admin"]
  }
}`}
                className="w-full h-64 p-3 border rounded-md font-mono text-sm bg-muted"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePolicyUpload} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Policy Diff Dialog */}
      <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Policy Differences</DialogTitle>
            <DialogDescription>
              Comparing {selectedPolicy?.name} with {activePolicyForDiff?.name || "active policy"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Unified Diff View */}
            {activePolicyForDiff && selectedPolicy && (
              <DiffViewer
                oldValue={activePolicyForDiff.content}
                newValue={selectedPolicy.content}
                oldLabel={activePolicyForDiff.name}
                newLabel={selectedPolicy.name}
                viewMode="unified"
              />
            )}

            {/* Field-by-field breakdown */}
            {policyDiffs.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3">Field Changes Summary</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {policyDiffs.map((diff, index) => (
                    <div key={index} className="border rounded-md p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{diff.field}</span>
                        <Badge
                          variant={
                            diff.type === "added"
                              ? "default"
                              : diff.type === "removed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {diff.type}
                        </Badge>
                      </div>
                      {diff.oldValue && (
                        <div className="text-xs bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded p-2 mb-2">
                          <span className="text-red-700 dark:text-red-300">- {diff.oldValue}</span>
                        </div>
                      )}
                      {diff.newValue && (
                        <div className="text-xs bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded p-2">
                          <span className="text-green-700 dark:text-green-300">+ {diff.newValue}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {policyDiffs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No differences found</p>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setDiffDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
