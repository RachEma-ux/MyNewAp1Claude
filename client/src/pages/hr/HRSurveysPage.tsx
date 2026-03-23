/**
 * HR Surveys Page — Survey Campaigns and Responses
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";

const statusColor: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-400",
  active: "bg-green-500/10 text-green-500",
  closed: "bg-blue-500/10 text-blue-500",
  cancelled: "bg-red-500/10 text-red-500",
};

export default function HRSurveysPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const campaigns = trpc.hr.engagement.listSurveyCampaigns.useQuery({
    limit: 50,
    ...(statusFilter && statusFilter !== "all" ? { status: statusFilter } : {}),
  });
  const responses = trpc.hr.engagement.listSurveyResponses.useQuery({ limit: 50 });

  if (campaigns.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-36" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Surveys</h1>
          <p className="text-muted-foreground">Employee survey campaigns and responses</p>
        </div>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="responses">Responses</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {campaigns.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No survey campaigns yet.</CardContent></Card>
            )}
            {campaigns.data?.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{c.title}</div>
                    <div className="text-sm text-muted-foreground">
                      Type: {c.surveyType}
                      {c.isAnonymous && " | Anonymous"}
                      <span> | Responses: {c.totalResponses}/{c.totalInvited}</span>
                    </div>
                    {c.startDate && <div className="text-xs text-muted-foreground">{c.startDate} – {c.endDate ?? "ongoing"}</div>}
                  </div>
                  <Badge className={statusColor[c.status] ?? "bg-gray-500/10 text-gray-400"}>{c.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="responses" className="space-y-4">
          <div className="grid gap-3">
            {responses.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No survey responses yet.</CardContent></Card>
            )}
            {responses.data?.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">Campaign #{r.campaignId} {r.workerId ? `— Worker #${r.workerId}` : "— Anonymous"}</div>
                    <div className="text-sm text-muted-foreground">
                      {r.overallRating && <span>Rating: {r.overallRating}/5</span>}
                      <span> | Submitted: {new Date(r.submittedAt).toLocaleDateString()}</span>
                    </div>
                    {r.comments && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.comments}</div>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
