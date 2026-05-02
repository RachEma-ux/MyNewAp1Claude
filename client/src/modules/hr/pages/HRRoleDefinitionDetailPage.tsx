/**
 * HR Role Definition Detail Page — View a single role definition with its current version
 *
 * Shows role identification, purpose, accountabilities, decision rights,
 * boundaries, requirements, success metrics, and governance metadata.
 * Restricted fields are masked by the backend based on caller role.
 * Lifecycle actions are conditionally rendered based on permissions.
 */

import { Link, useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useHrRole } from "@/hooks/useHrRole";
import { ArrowLeft, Edit, GitCompare, History, Link2, Send, Archive } from "lucide-react";

function SectionList({ title, items }: { title: string; items: string[] | null | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-medium mb-1">{title}</h4>
      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-0.5">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span>{String(value)}</span>
    </div>
  );
}

const statusVariant = (s: string) => {
  switch (s) {
    case "effective": case "published": return "default";
    case "approved": return "secondary";
    case "in_review": case "draft": return "outline";
    case "retired": case "superseded": return "destructive";
    default: return "outline";
  }
};

export default function HRRoleDefinitionDetailPage() {
  const [, params] = useRoute("/hr/role-definitions/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);
  const { can, isHrbp } = useHrRole();
  const utils = trpc.useUtils();

  const roleDefQuery = trpc.hr.roleDefinitions.getById.useQuery({ id }, { enabled: !!id });
  const versionsQuery = trpc.hr.roleDefinitions.listVersions.useQuery(
    { roleDefinitionId: id },
    { enabled: !!id }
  );
  const positionLinksQuery = trpc.hr.roleDefinitions.listPositionLinks.useQuery(
    { roleDefinitionId: id },
    { enabled: !!id }
  );

  const submitMutation = trpc.hr.roleDefinitions.submitForReview.useMutation({
    onSuccess: () => { utils.hr.roleDefinitions.getById.invalidate({ id }); utils.hr.roleDefinitions.listVersions.invalidate({ roleDefinitionId: id }); },
  });
  const publishMutation = trpc.hr.roleDefinitions.publish.useMutation({
    onSuccess: () => { utils.hr.roleDefinitions.getById.invalidate({ id }); utils.hr.roleDefinitions.listVersions.invalidate({ roleDefinitionId: id }); },
  });
  const retireMutation = trpc.hr.roleDefinitions.retire.useMutation({
    onSuccess: () => { utils.hr.roleDefinitions.getById.invalidate({ id }); },
  });

  if (roleDefQuery.isLoading) {
    return <div className="p-6 max-w-5xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  const rd = roleDefQuery.data;
  if (!rd) {
    return <div className="p-6 max-w-5xl mx-auto"><h1 className="text-xl font-bold">Role Definition Not Found</h1></div>;
  }

  const ver = rd.currentVersion as Record<string, any> | null;
  const verStatus = ver?.status ?? "no version";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
          <Link href="/hr"><a className="hover:text-foreground">HR</a></Link>
          <span className="mx-1">/</span>
          <Link href="/hr/role-definitions"><a className="hover:text-foreground">Role Definitions</a></Link>
          <span className="mx-1">/</span>
          <span className="text-foreground">{rd.roleCode}</span>
        </nav>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              {rd.title}
              <Badge variant={statusVariant(verStatus)}>{verStatus}</Badge>
              <Badge variant={rd.status === "active" ? "default" : "destructive"}>{rd.status}</Badge>
            </h1>
            <p className="text-muted-foreground font-mono">{rd.roleCode}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/hr/role-definitions">
              <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
            </Link>
            {can("hr.roledef.draft") && (verStatus === "draft" || verStatus === "changes_requested") && ver?.id && (
              <Link href={`/hr/role-definitions/${id}/edit`}>
                <Button variant="outline" size="sm"><Edit className="w-4 h-4 mr-1" /> Edit Draft</Button>
              </Link>
            )}
            {can("hr.roledef.submit") && verStatus === "draft" && ver?.id && (
              <Button size="sm" onClick={() => submitMutation.mutate({ versionId: ver.id })} disabled={submitMutation.isPending}>
                <Send className="w-4 h-4 mr-1" /> Submit for Review
              </Button>
            )}
            {can("hr.roledef.publish") && verStatus === "approved" && ver?.id && (
              <Button size="sm" onClick={() => publishMutation.mutate({ versionId: ver.id })} disabled={publishMutation.isPending}>
                Publish
              </Button>
            )}
            {can("hr.roledef.retire") && rd.status === "active" && (
              <Button variant="destructive" size="sm" onClick={() => {
                if (confirm("Are you sure you want to retire this role definition?")) {
                  retireMutation.mutate({ roleDefinitionId: id, reason: "Manual retirement" });
                }
              }}>
                <Archive className="w-4 h-4 mr-1" /> Retire
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Current Version Content */}
      {ver && (
        <>
          <Card>
            <CardHeader><CardTitle>Role Purpose</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm">{ver.purposeSummary || "No purpose summary defined."}</p>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <MetadataRow label="Reports to" value={ver.reportsToDescription} />
                <MetadataRow label="Location scope" value={ver.locationScope} />
                <MetadataRow label="Employment type" value={ver.employmentType} />
                <MetadataRow label="Visibility class" value={ver.visibilityClass} />
                <MetadataRow label="Effective from" value={ver.effectiveFrom} />
                <MetadataRow label="Effective to" value={ver.effectiveTo} />
                <MetadataRow label="Version" value={ver.versionNumber} />
                <MetadataRow label="Change type" value={ver.changeType} />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Core Accountabilities</CardTitle></CardHeader>
              <CardContent>
                <SectionList title="" items={ver.accountabilities} />
                {(!ver.accountabilities || ver.accountabilities.length === 0) && (
                  <p className="text-sm text-muted-foreground">No accountabilities defined.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Success Metrics</CardTitle></CardHeader>
              <CardContent>
                <SectionList title="" items={ver.successMetrics} />
                {(!ver.successMetrics || ver.successMetrics.length === 0) && (
                  <p className="text-sm text-muted-foreground">No metrics defined.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Can Decide Independently</CardTitle></CardHeader>
              <CardContent><SectionList title="" items={ver.decisionRightsIndependent} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Can Recommend</CardTitle></CardHeader>
              <CardContent><SectionList title="" items={ver.decisionRightsRecommend} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Requires Escalation</CardTitle></CardHeader>
              <CardContent><SectionList title="" items={ver.decisionRightsEscalate} /></CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Boundaries — In Scope</CardTitle></CardHeader>
              <CardContent><SectionList title="" items={ver.boundariesInScope} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Boundaries — Out of Scope</CardTitle></CardHeader>
              <CardContent><SectionList title="" items={ver.boundariesOutOfScope} /></CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Required Skills & Qualifications</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <SectionList title="Technical Skills" items={ver.requiredTechnicalSkills} />
                <SectionList title="Behavioral Skills" items={ver.requiredBehavioralSkills} />
                <SectionList title="Education" items={ver.requiredEducation} />
                <SectionList title="Experience" items={ver.requiredExperience} />
                <SectionList title="Preferred Qualifications" items={ver.preferredQualifications} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Collaboration Interfaces</CardTitle></CardHeader>
              <CardContent><SectionList title="" items={ver.collaborationInterfaces} /></CardContent>
            </Card>
          </div>

          {/* Governance metadata */}
          <Card>
            <CardHeader><CardTitle className="text-base">Governance Metadata</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-8 text-sm">
                <MetadataRow label="Change reason" value={ver.changeReason} />
                <MetadataRow label="Next review at" value={ver.nextReviewAt} />
                <MetadataRow label="Approved at" value={ver.approvedAt ? new Date(ver.approvedAt).toLocaleDateString() : null} />
                <MetadataRow label="Published at" value={ver.publishedAt ? new Date(ver.publishedAt).toLocaleDateString() : null} />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Version History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Version History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Change Type</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versionsQuery.data?.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono">v{v.versionNumber}</TableCell>
                  <TableCell><Badge variant={statusVariant(v.status)}>{v.status}</Badge></TableCell>
                  <TableCell>{v.changeType ?? "—"}</TableCell>
                  <TableCell>{v.effectiveFrom ?? "—"}</TableCell>
                  <TableCell className="text-sm">{new Date(v.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {versionsQuery.data && versionsQuery.data.length >= 2 && (
                      <Link href={`/hr/role-definitions/${id}/compare?a=${v.id}&b=${rd?.currentVersionId ?? versionsQuery.data[0].id}`}>
                        <Button variant="ghost" size="sm"><GitCompare className="w-3 h-3" /></Button>
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Position Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Linked Positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(positionLinksQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No positions linked to this role definition.</p>
          ) : (
            <div className="space-y-2">
              {positionLinksQuery.data?.map((pl) => (
                <div key={pl.id} className="flex items-center justify-between text-sm border rounded p-2">
                  <div>
                    <span className="font-mono">{pl.positionCode}</span>
                    <span className="mx-2">—</span>
                    <span>{pl.positionTitle}</span>
                  </div>
                  <Badge variant="outline">{pl.positionStatus}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
