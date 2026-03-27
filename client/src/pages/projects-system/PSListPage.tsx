/**
 * PS List — Validation workspace for PS Projects.
 *
 * Displays all PS projects with status filters, lifecycle actions,
 * and a detail panel for admin validation (approve/reject/override).
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ClipboardList,
  Loader2,
  FolderOpen,
  Eye,
  Send,
  CheckCircle,
  XCircle,
  ArrowUpCircle,
  BookOpen,
  X,
} from "lucide-react";

// ── Status badge colors (per spec) ──────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-500/10 text-gray-500 border-gray-500/30",
  SUBMITTED: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  VALIDATED: "bg-green-500/10 text-green-600 border-green-500/30",
  REJECTED: "bg-red-500/10 text-red-600 border-red-500/30",
  PUBLISHED: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  SENT_TO_PM: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  High: "text-green-400",
  Medium: "text-yellow-400",
  Low: "text-red-400",
};

const FILTER_OPTIONS = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Validated", value: "VALIDATED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Published", value: "PUBLISHED" },
];

type Project = {
  id: number;
  name: string;
  scenario: string;
  contextJson: Record<string, string> | null;
  selectedScopeCode: string;
  topScopesJson: Array<{ scopeCode: string; scopeLabel: string; score: number }> | null;
  confidence: string | null;
  explainabilityJson: { positiveContributors: string[]; negativeContributors: string[] } | null;
  templateBundleJson: Record<string, unknown> | null;
  matrixVersionId: number | null;
  status: string;
  validationNote: string | null;
  validatedBy: number | null;
  validatedAt: string | Date | null;
  createdBy: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  [key: string]: unknown;
};

export function PSListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideScopeCode, setOverrideScopeCode] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [actionError, setActionError] = useState("");

  const utils = trpc.useUtils();

  const { data: projects, isLoading } = trpc.ps.projects.list.useQuery(
    statusFilter ? { status: statusFilter } : {},
  );

  // ── Mutations ──────────────────────────────────────────────────────────

  const submitMut = trpc.ps.lifecycle.submit.useMutation({
    onSuccess: () => { utils.ps.projects.list.invalidate(); setActionError(""); },
    onError: (e) => setActionError(e.message),
  });

  const approveMut = trpc.ps.governance.approve.useMutation({
    onSuccess: (data) => {
      utils.ps.projects.list.invalidate();
      setSelectedProject(data as unknown as Project);
      setActionError("");
    },
    onError: (e) => setActionError(e.message),
  });

  const rejectMut = trpc.ps.governance.reject.useMutation({
    onSuccess: (data) => {
      utils.ps.projects.list.invalidate();
      setSelectedProject(data as unknown as Project);
      setRejectMode(false);
      setRejectReason("");
      setActionError("");
    },
    onError: (e) => setActionError(e.message),
  });

  const overrideMut = trpc.ps.governance.overrideScope.useMutation({
    onSuccess: (data) => {
      utils.ps.projects.list.invalidate();
      setSelectedProject(data as unknown as Project);
      setOverrideMode(false);
      setOverrideScopeCode("");
      setOverrideReason("");
      setActionError("");
    },
    onError: (e) => setActionError(e.message),
  });

  const publishMut = trpc.ps.lifecycle.publish.useMutation({
    onSuccess: (data) => {
      utils.ps.projects.list.invalidate();
      setSelectedProject(data as unknown as Project);
      setActionError("");
    },
    onError: (e) => setActionError(e.message),
  });

  // ── Handlers ───────────────────────────────────────────────────────────

  function handleSubmit(id: number) {
    setActionError("");
    submitMut.mutate({ projectId: id });
  }

  function handleApprove() {
    if (!selectedProject) return;
    setActionError("");
    approveMut.mutate({ id: selectedProject.id, note: null });
  }

  function handleReject() {
    if (!selectedProject || !rejectReason.trim()) return;
    setActionError("");
    rejectMut.mutate({ id: selectedProject.id, note: rejectReason.trim() });
  }

  function handleOverride() {
    if (!selectedProject || !overrideScopeCode.trim() || !overrideReason.trim()) return;
    setActionError("");
    overrideMut.mutate({
      id: selectedProject.id,
      newScopeCode: overrideScopeCode.trim(),
      reason: overrideReason.trim(),
    });
  }

  function handlePublish() {
    if (!selectedProject) return;
    setActionError("");
    publishMut.mutate({ projectId: selectedProject.id });
  }

  function openDetail(project: Project) {
    setSelectedProject(project);
    setOverrideMode(false);
    setRejectMode(false);
    setActionError("");
    setOverrideScopeCode("");
    setOverrideReason("");
    setRejectReason("");
  }

  function closeDetail() {
    setSelectedProject(null);
    setOverrideMode(false);
    setRejectMode(false);
    setActionError("");
  }

  const isMutating =
    submitMut.isPending ||
    approveMut.isPending ||
    rejectMut.isPending ||
    overrideMut.isPending ||
    publishMut.isPending;

  return (
    <div className="space-y-6 p-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PS Projects</h1>
        <Badge variant="secondary">{projects?.length ?? 0} projects</Badge>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((f) => (
          <Button
            key={f.value}
            variant={statusFilter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="w-4 h-4 text-indigo-500" />
            {statusFilter ? `${statusFilter} Projects` : "All Projects"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !projects || projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mb-2" />
              <p className="text-sm">No projects found. Use the PS Wizard to create one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Name</th>
                    <th className="pb-2 font-medium text-muted-foreground">Scope</th>
                    <th className="pb-2 font-medium text-muted-foreground">Confidence</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 font-medium text-muted-foreground">Created</th>
                    <th className="pb-2 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(projects as Project[]).map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5">
                        <span className="font-medium">{p.name}</span>
                      </td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-xs">
                          {p.selectedScopeCode}
                        </Badge>
                      </td>
                      <td className="py-2.5">
                        <span className={`text-sm font-medium ${CONFIDENCE_COLORS[p.confidence ?? ""] || "text-muted-foreground"}`}>
                          {p.confidence ?? "\u2014"}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <Badge className={`text-xs ${STATUS_COLORS[p.status] || ""}`}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {p.createdAt ? new Date(p.createdAt as string).toLocaleDateString() : "\u2014"}
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-1.5">
                          {/* View button — always visible */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => openDetail(p)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> View
                          </Button>

                          {/* Submit — user can submit DRAFT */}
                          {p.status === "DRAFT" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              disabled={isMutating}
                              onClick={() => handleSubmit(p.id)}
                            >
                              <Send className="w-3.5 h-3.5 mr-1" /> Submit
                            </Button>
                          )}

                          {/* Publish — admin can publish VALIDATED */}
                          {isAdmin && p.status === "VALIDATED" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-purple-600"
                              disabled={isMutating}
                              onClick={() => {
                                setSelectedProject(p);
                                publishMut.mutate({ projectId: p.id });
                              }}
                            >
                              <BookOpen className="w-3.5 h-3.5 mr-1" /> Publish
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Detail / Validation Panel (Modal Overlay) ────────────────── */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">{selectedProject.name}</h2>
              <Button variant="ghost" size="sm" onClick={closeDetail}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Status:</span>
                <Badge className={`text-xs ${STATUS_COLORS[selectedProject.status] || ""}`}>
                  {selectedProject.status}
                </Badge>
              </div>

              {/* Scenario */}
              <div>
                <h3 className="text-sm font-semibold mb-1">Scenario</h3>
                <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">
                  {selectedProject.scenario}
                </p>
              </div>

              {/* Context */}
              {selectedProject.contextJson && Object.keys(selectedProject.contextJson).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">Context</h3>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(selectedProject.contextJson).map(([k, v]) =>
                      v ? (
                        <div key={k} className="bg-muted/30 p-1.5 rounded">
                          <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1").trim()}:</span>{" "}
                          <span className="font-medium">{v}</span>
                        </div>
                      ) : null,
                    )}
                  </div>
                </div>
              )}

              {/* Selected Scope */}
              <div>
                <h3 className="text-sm font-semibold mb-1">Selected Scope</h3>
                <Badge variant="outline">{selectedProject.selectedScopeCode}</Badge>
              </div>

              {/* Confidence */}
              <div>
                <h3 className="text-sm font-semibold mb-1">Confidence</h3>
                <span className={`text-sm font-medium ${CONFIDENCE_COLORS[selectedProject.confidence ?? ""] || "text-muted-foreground"}`}>
                  {selectedProject.confidence ?? "\u2014"}
                </span>
              </div>

              {/* Top 3 Scopes */}
              {selectedProject.topScopesJson && selectedProject.topScopesJson.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">Top Scopes</h3>
                  <div className="space-y-1">
                    {selectedProject.topScopesJson.slice(0, 3).map((s, i) => (
                      <div key={s.scopeCode} className="flex items-center justify-between text-xs bg-muted/30 p-1.5 rounded">
                        <span>
                          <span className="font-medium">#{i + 1}</span> {s.scopeLabel}{" "}
                          <span className="text-muted-foreground">({s.scopeCode})</span>
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {s.score.toFixed(1)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Explainability */}
              {selectedProject.explainabilityJson && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">Explainability</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-green-500 font-medium">Positive Contributors</span>
                      <ul className="list-disc list-inside mt-1 text-muted-foreground">
                        {(selectedProject.explainabilityJson.positiveContributors || []).map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                        {(!selectedProject.explainabilityJson.positiveContributors?.length) && (
                          <li>None</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <span className="text-red-500 font-medium">Negative Contributors</span>
                      <ul className="list-disc list-inside mt-1 text-muted-foreground">
                        {(selectedProject.explainabilityJson.negativeContributors || []).map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                        {(!selectedProject.explainabilityJson.negativeContributors?.length) && (
                          <li>None</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Answers (from template bundle) */}
              {selectedProject.templateBundleJson && (selectedProject.templateBundleJson as any).answers && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">Answers</h3>
                  <div className="grid grid-cols-2 gap-1 text-xs max-h-32 overflow-y-auto">
                    {Object.entries((selectedProject.templateBundleJson as any).answers).map(([k, v]) => (
                      <div key={k} className="bg-muted/30 p-1.5 rounded truncate">
                        <span className="text-muted-foreground">{k}:</span>{" "}
                        <span className="font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Note */}
              {selectedProject.validationNote && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">Validation Note</h3>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">
                    {selectedProject.validationNote}
                  </p>
                </div>
              )}

              {/* Error display */}
              {actionError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-500 text-sm p-2 rounded">
                  {actionError}
                </div>
              )}

              {/* ── Action Buttons ──────────────────────────────────────── */}
              <div className="border-t pt-4 space-y-3">
                {/* Submit — user can submit DRAFT */}
                {selectedProject.status === "DRAFT" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={isMutating}
                    onClick={() => {
                      setActionError("");
                      submitMut.mutate(
                        { projectId: selectedProject.id },
                        {
                          onSuccess: (data) => {
                            setSelectedProject(data as unknown as Project);
                          },
                        },
                      );
                    }}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {submitMut.isPending ? "Submitting..." : "Submit for Validation"}
                  </Button>
                )}

                {/* Admin actions for SUBMITTED projects */}
                {isAdmin && selectedProject.status === "SUBMITTED" && !rejectMode && !overrideMode && (
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      disabled={isMutating}
                      onClick={handleApprove}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {approveMut.isPending ? "Approving..." : "Approve"}
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      disabled={isMutating}
                      onClick={() => setRejectMode(true)}
                    >
                      <XCircle className="w-4 h-4 mr-2" /> Reject
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={isMutating}
                      onClick={() => setOverrideMode(true)}
                    >
                      <ArrowUpCircle className="w-4 h-4 mr-2" /> Override Scope
                    </Button>
                  </div>
                )}

                {/* Reject form */}
                {isAdmin && rejectMode && (
                  <div className="space-y-2">
                    <textarea
                      className="w-full p-2 border rounded text-sm bg-background"
                      placeholder="Rejection reason (required)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        className="flex-1"
                        disabled={!rejectReason.trim() || isMutating}
                        onClick={handleReject}
                      >
                        {rejectMut.isPending ? "Rejecting..." : "Confirm Reject"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => { setRejectMode(false); setRejectReason(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Override form */}
                {isAdmin && overrideMode && (
                  <div className="space-y-2">
                    <input
                      className="w-full p-2 border rounded text-sm bg-background"
                      placeholder="New scope code"
                      value={overrideScopeCode}
                      onChange={(e) => setOverrideScopeCode(e.target.value)}
                    />
                    <textarea
                      className="w-full p-2 border rounded text-sm bg-background"
                      placeholder="Override reason (required)"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        className="flex-1"
                        disabled={!overrideScopeCode.trim() || !overrideReason.trim() || isMutating}
                        onClick={handleOverride}
                      >
                        {overrideMut.isPending ? "Overriding..." : "Confirm Override"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => { setOverrideMode(false); setOverrideScopeCode(""); setOverrideReason(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Publish — admin can publish VALIDATED */}
                {isAdmin && selectedProject.status === "VALIDATED" && (
                  <Button
                    variant="default"
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    disabled={isMutating}
                    onClick={handlePublish}
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    {publishMut.isPending ? "Publishing..." : "Publish to Catalog"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PSListPage;
