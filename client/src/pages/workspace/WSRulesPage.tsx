/**
 * WSRulesPage — Rules & Regulations surface
 *
 * Two levels:
 *   1. Shell-level summary — constraints for current participant
 *   2. Detailed page — permission model, lifecycle, module restrictions, governance
 */

import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  BookOpen,
  Zap,
  Globe,
} from "lucide-react";

const STATUS_DESCRIPTIONS: Record<string, string> = {
  draft: "This workspace is in draft mode. Only the manager can edit its definition.",
  ready_for_review: "This workspace is awaiting administrative review before it can proceed.",
  under_review: "This workspace is being reviewed. No modifications are allowed during review.",
  approved: "This workspace has been approved but is not yet published or active.",
  published: "This workspace is published and visible in the catalog but not yet executable.",
  active: "This workspace is fully active and executable. All operations are available.",
  rejected: "This workspace was rejected during review. It can be returned to draft for revision.",
  archived: "This workspace is archived. Read-only access is available.",
  deleted: "This workspace has been deleted and is no longer accessible.",
};

export function WSRulesPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = parseInt(params.workspaceId || "0", 10);

  const { data: context } = trpc.workspaces.getContext.useQuery(
    { id: workspaceId },
    { enabled: workspaceId > 0 }
  );

  const { data: lifecycle } = trpc.workspaces.getLifecycle.useQuery(
    { id: workspaceId },
    { enabled: workspaceId > 0 }
  );

  const caps = (context as any)?.effectiveCapabilities || [];
  const status = (context as any)?.status || "draft";
  const role = (context as any)?.role || "viewer";
  const modules = (context as any)?.enabledModules || [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5" /> Rules & Regulations
        </h2>
        <p className="text-sm text-muted-foreground">
          Constraints and permissions for your participation in this workspace
        </p>
      </div>

      {/* Lifecycle status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" /> Workspace Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-sm">{status.replace(/_/g, " ")}</Badge>
            {lifecycle?.isExecutable && <Badge className="bg-green-500/10 text-green-600 text-xs">Executable</Badge>}
            {lifecycle?.isPublished && <Badge className="bg-cyan-500/10 text-cyan-600 text-xs">Published</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{STATUS_DESCRIPTIONS[status] || "Unknown status"}</p>
          {lifecycle?.allowedTransitions && lifecycle.allowedTransitions.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium">Next possible transitions: </span>
              {lifecycle.allowedTransitions.map((t: string) => t.replace(/_/g, " ")).join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permission model */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="h-4 w-4" /> Your Permissions
          </CardTitle>
          <CardDescription>Role: {role}</CardDescription>
        </CardHeader>
        <CardContent>
          {caps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No capabilities resolved. Using default permissions.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {caps.map((cap: string) => (
                <div key={cap} className="flex items-center gap-1.5 text-xs">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  <span>{cap}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Module restrictions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Enabled Modules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {["pmt", "knowledge", "agents", "collaboration", "reporting"].map((mod) => {
              const enabled = modules.includes(mod);
              return (
                <Badge
                  key={mod}
                  variant={enabled ? "default" : "outline"}
                  className={`text-xs ${!enabled ? "text-muted-foreground" : ""}`}
                >
                  {enabled ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                  {mod}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Governance notices */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Governance Notices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>All activities within this workspace are logged and attributable.</p>
            <p>Workspace state is isolated — changes do not affect other workspaces.</p>
            <p>Workspace permissions are isolated — access is determined per workspace.</p>
            {status !== "active" && (
              <p className="text-amber-600">
                This workspace is not in an active state. Some operations may be restricted.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default WSRulesPage;
