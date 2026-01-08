/**
 * LLM Detail Page - Comprehensive view of an LLM and its versions
 *
 * Shows:
 * - LLM identity and metadata
 * - All versions across environments
 * - Create promotion requests
 * - Version history and status
 */

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowUpCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

type Environment = "sandbox" | "governed" | "production";

export default function LLMDetailPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/llm/:id");
  const llmId = params?.id ? parseInt(params.id, 10) : null;

  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [targetEnvironment, setTargetEnvironment] = useState<Environment | "">("");

  const { data: llm, isLoading: llmLoading } = trpc.llm.getById.useQuery(
    { id: llmId! },
    { enabled: !!llmId }
  );

  const { data: versions, isLoading: versionsLoading, refetch: refetchVersions } = trpc.llm.getVersions.useQuery(
    { llmId: llmId! },
    { enabled: !!llmId }
  );

  const { data: promotions, refetch: refetchPromotions } = trpc.llm.listPromotions.useQuery(
    {},
    { enabled: !!llmId }
  );

  const createPromotionMutation = trpc.llm.createPromotion.useMutation({
    onSuccess: () => {
      toast.success("Promotion request created successfully");
      setPromoteDialogOpen(false);
      setSelectedVersion(null);
      setTargetEnvironment("");
      refetchPromotions();
    },
    onError: (error) => {
      toast.error(`Failed to create promotion: ${error.message}`);
    },
  });

  const handlePromote = (version: any) => {
    setSelectedVersion(version);
    setTargetEnvironment("");
    setPromoteDialogOpen(true);
  };

  const confirmPromotion = async () => {
    if (!selectedVersion || !targetEnvironment) {
      toast.error("Please select target environment");
      return;
    }

    await createPromotionMutation.mutateAsync({
      llmVersionId: selectedVersion.id,
      fromEnvironment: selectedVersion.environment,
      toEnvironment: targetEnvironment,
    });
  };

  const getValidTargetEnvironments = (fromEnv: Environment): Environment[] => {
    const paths: Record<Environment, Environment[]> = {
      sandbox: ["governed", "production"],
      governed: ["production"],
      production: [],
    };
    return paths[fromEnv] || [];
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      planner: "bg-blue-500",
      executor: "bg-green-500",
      router: "bg-purple-500",
      guard: "bg-red-500",
      observer: "bg-yellow-500",
      embedder: "bg-pink-500",
    };
    return colors[role] || "bg-gray-500";
  };

  const getEnvironmentBadge = (env: string) => {
    const colors: Record<string, string> = {
      sandbox: "bg-amber-500",
      governed: "bg-blue-500",
      production: "bg-green-500",
    };
    return <Badge className={colors[env] || "bg-gray-500"}>{env}</Badge>;
  };

  const getAttestationBadge = (status: string) => {
    const badges: Record<string, JSX.Element> = {
      attested: (
        <Badge className="bg-green-500">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Attested
        </Badge>
      ),
      pending: (
        <Badge className="bg-yellow-500">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      ),
      failed: (
        <Badge className="bg-red-500">
          <XCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      ),
      revoked: (
        <Badge className="bg-gray-500">
          <XCircle className="mr-1 h-3 w-3" />
          Revoked
        </Badge>
      ),
    };
    return badges[status] || <Badge>{status}</Badge>;
  };

  const getPolicyBadge = (decision: string) => {
    const badges: Record<string, JSX.Element> = {
      pass: (
        <Badge className="bg-green-500">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Pass
        </Badge>
      ),
      warn: (
        <Badge className="bg-yellow-500">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Warn
        </Badge>
      ),
      deny: (
        <Badge className="bg-red-500">
          <XCircle className="mr-1 h-3 w-3" />
          Deny
        </Badge>
      ),
    };
    return badges[decision] || <Badge>{decision}</Badge>;
  };

  const getVersionPromotions = (versionId: number) => {
    return promotions?.filter((p) => p.llmVersionId === versionId) || [];
  };

  if (!llmId) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid LLM ID</h1>
          <Button onClick={() => setLocation("/llm/control-plane")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Control Plane
          </Button>
        </div>
      </div>
    );
  }

  if (llmLoading || versionsLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading LLM details...</p>
        </div>
      </div>
    );
  }

  if (!llm) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">LLM Not Found</h1>
          <Button onClick={() => setLocation("/llm/control-plane")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Control Plane
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/llm/control-plane")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{llm.name}</h1>
              <Badge className={getRoleBadgeColor(llm.role)}>{llm.role}</Badge>
              {llm.archived && <Badge variant="destructive">Archived</Badge>}
            </div>
            <p className="text-muted-foreground">
              {llm.description || "No description provided"}
            </p>
          </div>
        </div>
      </div>

      {/* LLM Metadata */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">LLM ID</p>
              <p className="font-medium">#{llm.id}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Owner Team</p>
              <p className="font-medium">{llm.ownerTeam || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium">{new Date(llm.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Latest Versions Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Sandbox</CardTitle>
          </CardHeader>
          <CardContent>
            {llm.latestVersions.sandbox ? (
              <div>
                <p className="text-2xl font-bold">v{llm.latestVersions.sandbox.version}</p>
                <p className="text-sm text-muted-foreground">
                  {llm.latestVersions.sandbox.callable ? "Callable" : "Not callable"}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">No version</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Governed</CardTitle>
          </CardHeader>
          <CardContent>
            {llm.latestVersions.governed ? (
              <div>
                <p className="text-2xl font-bold">v{llm.latestVersions.governed.version}</p>
                <p className="text-sm text-muted-foreground">
                  {llm.latestVersions.governed.callable ? "Callable" : "Not callable"}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">No version</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Production</CardTitle>
          </CardHeader>
          <CardContent>
            {llm.latestVersions.production ? (
              <div>
                <p className="text-2xl font-bold">v{llm.latestVersions.production.version}</p>
                <p className="text-sm text-muted-foreground">
                  {llm.latestVersions.production.callable ? "Callable" : "Not callable"}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">No version</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Version History */}
      <Card>
        <CardHeader>
          <CardTitle>Version History</CardTitle>
          <CardDescription>All versions across environments</CardDescription>
        </CardHeader>
        <CardContent>
          {versions && versions.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Attestation</TableHead>
                    <TableHead>Callable</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((version) => {
                    const config = version.config as any;
                    const versionPromotions = getVersionPromotions(version.id);
                    const hasPendingPromotion = versionPromotions.some((p) => p.status === "pending");

                    return (
                      <TableRow key={version.id}>
                        <TableCell className="font-medium">v{version.version}</TableCell>
                        <TableCell>{getEnvironmentBadge(version.environment)}</TableCell>
                        <TableCell className="text-sm">
                          {config?.model?.name || "—"}
                        </TableCell>
                        <TableCell>{getPolicyBadge(version.policyDecision || "pass")}</TableCell>
                        <TableCell>{getAttestationBadge(version.attestationStatus || "pending")}</TableCell>
                        <TableCell>
                          {version.callable ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-gray-400" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(version.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {getValidTargetEnvironments(version.environment as Environment).length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePromote(version)}
                                disabled={hasPendingPromotion || !version.callable}
                              >
                                <ArrowUpCircle className="h-4 w-4 mr-1" />
                                Promote
                              </Button>
                            )}
                            {versionPromotions.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLocation("/llm/promotions")}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                {versionPromotions.length} promotion{versionPromotions.length !== 1 ? "s" : ""}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No versions found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Promote Dialog */}
      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Promotion Request</DialogTitle>
            <DialogDescription>
              Promote version {selectedVersion?.version} to a higher environment
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Current Environment</p>
              <div className="flex items-center gap-2">
                {selectedVersion && getEnvironmentBadge(selectedVersion.environment)}
                <span className="text-muted-foreground">Version {selectedVersion?.version}</span>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Target Environment</p>
              <Select value={targetEnvironment} onValueChange={setTargetEnvironment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target environment" />
                </SelectTrigger>
                <SelectContent>
                  {selectedVersion &&
                    getValidTargetEnvironments(selectedVersion.environment as Environment).map((env) => (
                      <SelectItem key={env} value={env}>
                        {env.charAt(0).toUpperCase() + env.slice(1)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {selectedVersion && targetEnvironment && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Promotion Path</p>
                <div className="flex items-center gap-2">
                  {getEnvironmentBadge(selectedVersion.environment)}
                  <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
                  {getEnvironmentBadge(targetEnvironment)}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmPromotion}
              disabled={!targetEnvironment || createPromotionMutation.isPending}
            >
              {createPromotionMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Promotion Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
