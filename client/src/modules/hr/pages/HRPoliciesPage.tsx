/**
 * HR Policies Page — Policies and Acknowledgements
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
  published: "bg-green-500/10 text-green-500",
  archived: "bg-gray-500/10 text-gray-400",
  superseded: "bg-yellow-500/10 text-yellow-500",
  pending: "bg-yellow-500/10 text-yellow-500",
  acknowledged: "bg-green-500/10 text-green-500",
  declined: "bg-red-500/10 text-red-500",
  expired: "bg-gray-500/10 text-gray-400",
};

export default function HRPoliciesPage() {
  const [policyStatusFilter, setPolicyStatusFilter] = useState<string>("all");

  const policies = trpc.hr.relations.listPolicies.useQuery({
    limit: 50,
    ...(policyStatusFilter && policyStatusFilter !== "all" ? { status: policyStatusFilter } : {}),
  });
  const acknowledgements = trpc.hr.relations.listPolicyAcknowledgements.useQuery({ limit: 50 });

  if (policies.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-36" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Policies</h1>
          <p className="text-muted-foreground">HR policies and employee acknowledgements</p>
        </div>
      </div>

      {policies.isError && (
        <Card className="border-red-500/50"><CardContent className="p-4 text-red-500 text-sm">Failed to load policies data.</CardContent></Card>
      )}

      <Tabs defaultValue="policies">
        <TabsList>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="acknowledgements">Acknowledgements</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Select value={policyStatusFilter} onValueChange={setPolicyStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {policies.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No policies yet.</CardContent></Card>
            )}
            {policies.data?.map((policy) => (
              <Card key={policy.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{policy.title} {policy.code && <span className="text-muted-foreground">({policy.code})</span>}</div>
                    <div className="text-sm text-muted-foreground">
                      {policy.category && <span>Category: {policy.category}</span>}
                      <span> | Version: {policy.version}</span>
                      {policy.requiresAcknowledgement && <span> | Requires acknowledgement</span>}
                    </div>
                  </div>
                  <Badge className={statusColor[policy.status] ?? "bg-gray-500/10 text-gray-400"}>{policy.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="acknowledgements" className="space-y-4">
          <div className="grid gap-3">
            {acknowledgements.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No acknowledgements yet.</CardContent></Card>
            )}
            {acknowledgements.data?.map((ack) => (
              <Card key={ack.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">Policy #{ack.policyId} — Worker #{ack.workerId}</div>
                    <div className="text-sm text-muted-foreground">
                      {ack.acknowledgedAt ? `Acknowledged: ${new Date(ack.acknowledgedAt).toLocaleDateString()}` : "Not yet acknowledged"}
                    </div>
                  </div>
                  <Badge className={statusColor[ack.status] ?? "bg-gray-500/10 text-gray-400"}>{ack.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
