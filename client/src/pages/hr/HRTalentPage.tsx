/**
 * HR Talent Page — Talent Reviews (9-Box) and Succession Planning
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const statusColor: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-400",
  submitted: "bg-blue-500/10 text-blue-500",
  calibrated: "bg-purple-500/10 text-purple-500",
  finalized: "bg-green-500/10 text-green-500",
  active: "bg-green-500/10 text-green-500",
  archived: "bg-gray-500/10 text-gray-400",
  completed: "bg-blue-500/10 text-blue-500",
  nominated: "bg-yellow-500/10 text-yellow-500",
  approved: "bg-blue-500/10 text-blue-500",
  developing: "bg-purple-500/10 text-purple-500",
  ready: "bg-green-500/10 text-green-500",
  withdrawn: "bg-red-500/10 text-red-500",
};

const criticalityColor: Record<string, string> = {
  low: "bg-green-500/10 text-green-500",
  medium: "bg-yellow-500/10 text-yellow-500",
  high: "bg-orange-500/10 text-orange-500",
  critical: "bg-red-500/10 text-red-500",
};

const riskColor: Record<string, string> = {
  low: "bg-green-500/10 text-green-500",
  medium: "bg-yellow-500/10 text-yellow-500",
  high: "bg-orange-500/10 text-orange-500",
  critical: "bg-red-500/10 text-red-500",
};

export default function HRTalentPage() {
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>("");
  const [planStatusFilter, setPlanStatusFilter] = useState<string>("");

  const reviews = trpc.hr.talent.listTalentReviews.useQuery({
    limit: 50,
    ...(reviewStatusFilter ? { status: reviewStatusFilter } : {}),
  });
  const plans = trpc.hr.talent.listSuccessionPlans.useQuery({
    limit: 50,
    ...(planStatusFilter ? { status: planStatusFilter } : {}),
  });
  const candidates = trpc.hr.talent.listSuccessionCandidates.useQuery({ limit: 50 });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Talent Management</h1>
        <p className="text-muted-foreground">Talent reviews, 9-box positioning, and succession planning</p>
      </div>

      <Tabs defaultValue="reviews">
        <TabsList>
          <TabsTrigger value="reviews">Talent Reviews</TabsTrigger>
          <TabsTrigger value="succession">Succession Plans</TabsTrigger>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Select value={reviewStatusFilter} onValueChange={setReviewStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="calibrated">Calibrated</SelectItem>
                <SelectItem value="finalized">Finalized</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {reviews.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No talent reviews yet.</CardContent></Card>
            )}
            {reviews.data?.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium">Worker #{r.workerId} — {r.reviewDate}</div>
                    <div className="flex gap-2">
                      {r.retentionRisk && <Badge className={riskColor[r.retentionRisk] ?? ""}>Risk: {r.retentionRisk}</Badge>}
                      <Badge className={statusColor[r.status] ?? "bg-gray-500/10 text-gray-400"}>{r.status}</Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {r.performanceRating && <span>Performance: {r.performanceRating.replace(/_/g, " ")}</span>}
                    {r.potentialRating && <span> | Potential: {r.potentialRating}</span>}
                    {r.nineBoxPosition && <span> | 9-Box: {r.nineBoxPosition.replace(/_/g, " ")}</span>}
                  </div>
                  {r.readinessForPromotion && (
                    <div className="text-xs text-muted-foreground">Promotion readiness: {r.readinessForPromotion.replace(/_/g, " ")}</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="succession" className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Select value={planStatusFilter} onValueChange={setPlanStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {plans.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No succession plans yet.</CardContent></Card>
            )}
            {plans.data?.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{p.positionTitle}</div>
                    <div className="text-sm text-muted-foreground">
                      {p.currentIncumbentId && <span>Incumbent: Worker #{p.currentIncumbentId}</span>}
                      {p.nextReviewDate && <span> | Next review: {p.nextReviewDate}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={criticalityColor[p.criticality] ?? ""}>{p.criticality}</Badge>
                    <Badge className={statusColor[p.status] ?? "bg-gray-500/10 text-gray-400"}>{p.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="candidates" className="space-y-4">
          <div className="grid gap-3">
            {candidates.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No succession candidates yet.</CardContent></Card>
            )}
            {candidates.data?.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">Worker #{c.candidateWorkerId} — Plan #{c.successionPlanId}</div>
                    <div className="text-sm text-muted-foreground">
                      Readiness: {c.readiness.replace(/_/g, " ")}
                      <span> | Priority: {c.priority}</span>
                    </div>
                    {c.developmentNeeds && <div className="text-xs text-muted-foreground mt-1">{c.developmentNeeds}</div>}
                  </div>
                  <Badge className={statusColor[c.status] ?? "bg-gray-500/10 text-gray-400"}>{c.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
