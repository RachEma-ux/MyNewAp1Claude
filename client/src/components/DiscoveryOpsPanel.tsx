/**
 * Discovery Ops Panel — Health monitoring + Promotion workflow UI.
 *
 * Two sections:
 *   1. Discovery Health Panel: stats, failure reasons, trending domains
 *   2. Promotion Review Drawer: candidate detail, signals, draft entry, actions
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  Loader2,
  Search,
  Shield,
  Trash2,
  XCircle,
} from "lucide-react";

// ── Status badge colors ──────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  OPEN: "border-yellow-600/30 text-yellow-400 bg-yellow-950/20",
  IN_REVIEW: "border-blue-600/30 text-blue-400 bg-blue-950/20",
  ACCEPTED: "border-green-600/30 text-green-400 bg-green-950/20",
  REJECTED: "border-red-600/30 text-red-400 bg-red-950/20",
};

const REJECT_CATEGORIES = [
  { value: "NOT_A_PROVIDER", label: "Not a provider" },
  { value: "TOO_NICHE", label: "Too niche" },
  { value: "DUPLICATE_OF_EXISTING", label: "Duplicate" },
  { value: "TEMPORARY_OUTAGE", label: "Temporary outage" },
  { value: "NEEDS_MANUAL_CONNECT_ONLY", label: "Manual connect only" },
  { value: "SECURITY_POLICY_BLOCK", label: "Security policy" },
  { value: "OTHER", label: "Other" },
];

// ── Discovery Health Panel ──────────────────────────────────────────

export function DiscoveryHealthPanel() {
  const [windowDays, setWindowDays] = useState(7);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const statsQuery = trpc.discoveryOps.stats.useQuery({ windowDays });
  const failureReasonsQuery = trpc.discoveryOps.topFailureReasons.useQuery({ windowDays });
  const candidatesQuery = trpc.discoveryOps.candidates.useQuery(
    statusFilter !== "all" ? { status: statusFilter as any } : undefined
  );

  const stats = statsQuery.data || [];
  const failureReasons = failureReasonsQuery.data || [];
  const candidates = candidatesQuery.data || [];

  // Summary stats
  const totalAttempts = stats.reduce((sum, s) => sum + s.attemptsTotal, 0);
  const totalFailed = stats.reduce((sum, s) => sum + s.attemptsFailed, 0);
  const failureRate = totalAttempts > 0 ? (totalFailed / totalAttempts * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Window</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Last {windowDays}d</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAttempts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failure Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${Number(failureRate) > 50 ? "text-red-400" : Number(failureRate) > 20 ? "text-yellow-400" : "text-green-400"}`}>
              {failureRate}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Promotion Candidates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{candidates.filter((c: any) => c.status === "OPEN").length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Top Failure Reasons */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Top Failure Reasons
            </CardTitle>
          </CardHeader>
          <CardContent>
            {failureReasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failures in window</p>
            ) : (
              <div className="space-y-2">
                {failureReasons.map((fr: any) => (
                  <div key={fr.reason} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{fr.reason}</span>
                    <Badge variant="outline">{fr.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Domains by Attempts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Top Domains
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No discovery attempts in window</p>
            ) : (
              <div className="space-y-2">
                {stats.slice(0, 8).map((s) => (
                  <div key={s.domain} className="flex items-center justify-between text-sm">
                    <button
                      className="text-left text-primary hover:underline truncate max-w-[200px]"
                      onClick={() => setSelectedDomain(s.domain)}
                    >
                      {s.domain}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{s.attemptsTotal} attempts</span>
                      {s.attemptsFailed > 0 && (
                        <Badge variant="outline" className="text-[10px] border-red-600/30 text-red-400">
                          {Math.round(s.attemptsFailed / s.attemptsTotal * 100)}% fail
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Promotion Candidates Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Promotion Candidates ({candidates.length})
            </CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_REVIEW">In Review</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No promotion candidates</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Fail Rate</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.domain}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[c.status] || ""}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.triggerType || "—"}</TableCell>
                    <TableCell>{c.attemptsTotal}</TableCell>
                    <TableCell>
                      {c.attemptsTotal > 0
                        ? `${Math.round(c.attemptsFailed / c.attemptsTotal * 100)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSelectedDomain(c.domain)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Promotion Review Drawer */}
      <PromotionReviewDrawer
        domain={selectedDomain}
        onClose={() => setSelectedDomain(null)}
        onAction={() => {
          candidatesQuery.refetch();
          statsQuery.refetch();
        }}
      />
    </div>
  );
}

// ── Promotion Review Drawer ─────────────────────────────────────────

function PromotionReviewDrawer({
  domain,
  onClose,
  onAction,
}: {
  domain: string | null;
  onClose: () => void;
  onAction: () => void;
}) {
  const [rejectCategory, setRejectCategory] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [draftSlug, setDraftSlug] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftApiUrl, setDraftApiUrl] = useState("");
  const [showRecentEvents, setShowRecentEvents] = useState(false);

  const candidateQuery = trpc.discoveryOps.candidateByDomain.useQuery(
    { domain: domain! },
    { enabled: !!domain }
  );
  const statsQuery = trpc.discoveryOps.domainStats.useQuery(
    { domain: domain!, windowDays: 7 },
    { enabled: !!domain }
  );
  const eventsQuery = trpc.discoveryOps.recentEvents.useQuery(
    { domain: domain!, limit: 10 },
    { enabled: !!domain && showRecentEvents }
  );
  const changeQuery = trpc.discoveryOps.materialChangeDiff.useQuery(
    { domain: domain! },
    { enabled: !!domain }
  );

  const markInReviewMut = trpc.discoveryOps.markInReview.useMutation();
  const rejectMut = trpc.discoveryOps.reject.useMutation();
  const acceptMut = trpc.discoveryOps.accept.useMutation();
  const reopenMut = trpc.discoveryOps.reopen.useMutation();

  const candidate = candidateQuery.data;
  const stats = statsQuery.data;
  const changeDiff = changeQuery.data;
  const events = eventsQuery.data || [];

  const handleMarkInReview = async () => {
    if (!domain) return;
    await markInReviewMut.mutateAsync({ domain });
    candidateQuery.refetch();
    onAction();
  };

  const handleReject = async () => {
    if (!domain || !rejectCategory) return;
    await rejectMut.mutateAsync({ domain, category: rejectCategory, notes: rejectNotes || undefined });
    setRejectCategory("");
    setRejectNotes("");
    candidateQuery.refetch();
    onAction();
  };

  const handleAccept = async () => {
    if (!domain) return;
    await acceptMut.mutateAsync({
      domain,
      draftRegistryEntry: {
        slug: draftSlug || domain.replace(/\.[^.]+$/, ""),
        name: draftName || domain,
        apiUrl: draftApiUrl || null,
        domains: [domain],
      },
      notes: `Promoted from discovery ops`,
    });
    candidateQuery.refetch();
    onAction();
  };

  const handleReopen = async () => {
    if (!domain) return;
    await reopenMut.mutateAsync({ domain, reason: "Manual reopen from review drawer" });
    candidateQuery.refetch();
    onAction();
  };

  return (
    <Sheet open={!!domain} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono">{domain}</span>
            {candidate && (
              <Badge variant="outline" className={STATUS_BADGE[candidate.status] || ""}>
                {candidate.status}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {candidate
              ? `First detected: ${new Date(candidate.firstDetectedAt).toLocaleDateString()} | Last seen: ${new Date(candidate.lastSeenAt).toLocaleDateString()}`
              : "Loading..."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {/* Summary Signals */}
          {stats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Summary Signals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total attempts</span>
                    <span className="font-medium">{stats.attemptsTotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Failed</span>
                    <span className="font-medium text-red-400">{stats.attemptsFailed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Partial</span>
                    <span className="font-medium text-yellow-400">{stats.attemptsPartial}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">bestUrl null rate</span>
                    <span className="font-medium">{(stats.bestUrlNullRate * 100).toFixed(0)}%</span>
                  </div>
                </div>
                {candidate?.triggerType && (
                  <div className="mt-2 text-xs">
                    <Badge variant="outline" className="border-orange-600/30 text-orange-400">
                      Trigger: {candidate.triggerType}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Material Change (if rejected) */}
          {changeDiff && changeDiff.reasons.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  Material Changes
                  {changeDiff.hasMaterialChange && (
                    <Badge variant="outline" className="border-green-600/30 text-green-400 text-[10px]">
                      Reopenable
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-xs">
                  {changeDiff.summary.map((s: string, i: number) => (
                    <p key={i} className="text-muted-foreground">{s}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Failure Breakdown */}
          {stats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Failure Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {[
                  { label: "No candidates", value: stats.noCandidates },
                  { label: "Probe all failed", value: stats.probeAllFailed },
                  { label: "SSRF blocked", value: stats.fetchBlocked },
                  { label: "Timeout", value: stats.fetchTimeout },
                ].filter((r) => r.value > 0).map((r) => (
                  <div key={r.label} className="flex justify-between">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span>{r.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Draft Registry Entry (for accept) */}
          {candidate && (candidate.status === "OPEN" || candidate.status === "IN_REVIEW") && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Draft Registry Entry</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Slug</Label>
                  <Input
                    value={draftSlug}
                    onChange={(e) => setDraftSlug(e.target.value)}
                    placeholder={domain?.replace(/\.[^.]+$/, "") || ""}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Display Name</Label>
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder={domain || ""}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">API URL</Label>
                  <Input
                    value={draftApiUrl}
                    onChange={(e) => setDraftApiUrl(e.target.value)}
                    placeholder={`https://api.${domain}`}
                    className="h-8 text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Events */}
          <Collapsible open={showRecentEvents} onOpenChange={setShowRecentEvents}>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-full">
              <ChevronDown className={`h-3 w-3 transition-transform ${showRecentEvents ? "rotate-180" : ""}`} />
              Recent Attempts
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recent events</p>
              ) : (
                <div className="space-y-1">
                  {events.map((ev: any) => (
                    <div key={ev.id} className="text-xs bg-muted/50 rounded px-2 py-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {ev.status === "ok" ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : ev.status === "failed" ? (
                          <XCircle className="h-3 w-3 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-yellow-500" />
                        )}
                        <span>{ev.status}</span>
                        {ev.failureReason && (
                          <span className="text-muted-foreground">{ev.failureReason}</span>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        {new Date(ev.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Reject form */}
          {candidate && (candidate.status === "OPEN" || candidate.status === "IN_REVIEW") && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-400">Reject</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={rejectCategory} onValueChange={setRejectCategory}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {REJECT_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    className="h-16 text-sm"
                    placeholder="Reason for rejection..."
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {candidate?.status === "OPEN" && (
              <Button size="sm" variant="outline" onClick={handleMarkInReview} disabled={markInReviewMut.isPending}>
                {markInReviewMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Mark In Review
              </Button>
            )}
            {(candidate?.status === "OPEN" || candidate?.status === "IN_REVIEW") && (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleReject}
                  disabled={!rejectCategory || rejectMut.isPending}
                >
                  {rejectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={handleAccept}
                  disabled={acceptMut.isPending}
                >
                  {acceptMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Accept & Create Patch
                </Button>
              </>
            )}
            {candidate?.status === "REJECTED" && (
              <Button size="sm" variant="outline" onClick={handleReopen} disabled={reopenMut.isPending}>
                {reopenMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Reopen
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
