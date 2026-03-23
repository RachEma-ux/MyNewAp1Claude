/**
 * HR Benefits Page — Benefit Plans and Employee Enrollments
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
  active: "bg-green-500/10 text-green-500",
  pending: "bg-yellow-500/10 text-yellow-500",
  cancelled: "bg-red-500/10 text-red-500",
  expired: "bg-gray-500/10 text-gray-400",
};

export default function HRBenefitsPage() {
  const [enrollStatusFilter, setEnrollStatusFilter] = useState<string>("");

  const plans = trpc.hr.compensation.listBenefitPlans.useQuery({ limit: 50, isActive: true });
  const enrollments = trpc.hr.compensation.listBenefitEnrollments.useQuery({
    limit: 50,
    ...(enrollStatusFilter ? { status: enrollStatusFilter } : {}),
  });

  if (plans.isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-36" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Benefits</h1>
          <p className="text-muted-foreground">Benefit plans and employee enrollments</p>
        </div>
      </div>

      {plans.isError && (
        <Card className="border-red-500/50">
          <CardContent className="p-4 text-red-500 text-sm">Failed to load benefits data.</CardContent>
        </Card>
      )}

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Benefit Plans</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-4">
          <div className="grid gap-3">
            {plans.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No benefit plans defined yet.</CardContent></Card>
            )}
            {plans.data?.map((plan) => (
              <Card key={plan.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{plan.name} {plan.code && <span className="text-muted-foreground">({plan.code})</span>}</div>
                    <div className="text-sm text-muted-foreground">
                      Category: {plan.category}
                      {plan.provider && <span> | Provider: {plan.provider}</span>}
                    </div>
                    {plan.description && <div className="text-xs text-muted-foreground mt-1">{plan.description}</div>}
                  </div>
                  <Badge className={plan.isActive ? "bg-green-500/10 text-green-500" : "bg-gray-500/10 text-gray-400"}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="enrollments" className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Select value={enrollStatusFilter} onValueChange={setEnrollStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {enrollments.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No enrollments yet.</CardContent></Card>
            )}
            {enrollments.data?.map((enr) => (
              <Card key={enr.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">Worker #{enr.workerId} — Plan #{enr.benefitPlanId}</div>
                    <div className="text-sm text-muted-foreground">
                      Enrolled: {enr.enrollmentDate}
                      {enr.coverageLevel && <span> | Coverage: {enr.coverageLevel}</span>}
                    </div>
                  </div>
                  <Badge className={statusColor[enr.status] ?? "bg-gray-500/10 text-gray-400"}>{enr.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
