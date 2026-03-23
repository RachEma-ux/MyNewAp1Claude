/**
 * HR Compensation Page — Salary Bands, Comp Records, Review Cycles, Bonuses
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";

const statusColor: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  pending: "bg-yellow-500/10 text-yellow-500",
  approved: "bg-blue-500/10 text-blue-500",
  paid: "bg-emerald-500/10 text-emerald-500",
  draft: "bg-gray-500/10 text-gray-400",
  open: "bg-blue-500/10 text-blue-500",
  in_review: "bg-purple-500/10 text-purple-500",
  completed: "bg-green-500/10 text-green-500",
  cancelled: "bg-red-500/10 text-red-500",
  superseded: "bg-gray-500/10 text-gray-400",
};

export default function HRCompensationPage() {
  const [bandFilter, setBandFilter] = useState<string>("");
  const [bonusStatusFilter, setBonusStatusFilter] = useState<string>("all");

  const salaryBands = trpc.hr.compensation.listSalaryBands.useQuery({ limit: 50, isActive: true });
  const compRecords = trpc.hr.compensation.listCompensationRecords.useQuery({ limit: 50 });
  const reviewCycles = trpc.hr.compensation.listSalaryReviewCycles.useQuery({ limit: 50 });
  const bonuses = trpc.hr.compensation.listBonusRecords.useQuery({
    limit: 50,
    ...(bonusStatusFilter && bonusStatusFilter !== "all" ? { status: bonusStatusFilter } : {}),
  });

  const isLoading = salaryBands.isLoading || compRecords.isLoading;
  const isError = salaryBands.isError || compRecords.isError;

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
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
          <h1 className="text-2xl font-bold">Compensation</h1>
          <p className="text-muted-foreground">Salary structures, compensation records, reviews, and bonuses</p>
        </div>
      </div>

      {isError && (
        <Card className="border-red-500/50">
          <CardContent className="p-4 text-red-500 text-sm">Failed to load compensation data.</CardContent>
        </Card>
      )}

      <Tabs defaultValue="bands">
        <TabsList>
          <TabsTrigger value="bands">Salary Bands</TabsTrigger>
          <TabsTrigger value="records">Comp Records</TabsTrigger>
          <TabsTrigger value="reviews">Review Cycles</TabsTrigger>
          <TabsTrigger value="bonuses">Bonuses</TabsTrigger>
        </TabsList>

        <TabsContent value="bands" className="space-y-4">
          <div className="grid gap-3">
            {salaryBands.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No salary bands defined yet.</CardContent></Card>
            )}
            {salaryBands.data?.map((band) => (
              <Card key={band.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{band.name} {band.code && <span className="text-muted-foreground">({band.code})</span>}</div>
                    <div className="text-sm text-muted-foreground">
                      {band.currency} {band.minAmount} – {band.maxAmount}
                      {band.jobLevel && <span> | Level: {band.jobLevel}</span>}
                      {band.jobFamily && <span> | Family: {band.jobFamily}</span>}
                    </div>
                  </div>
                  <Badge className={band.isActive ? "bg-green-500/10 text-green-500" : "bg-gray-500/10 text-gray-400"}>
                    {band.isActive ? "Active" : "Inactive"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
          <div className="grid gap-3">
            {compRecords.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No compensation records yet.</CardContent></Card>
            )}
            {compRecords.data?.map((rec) => (
              <Card key={rec.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">Worker #{rec.workerId}</div>
                    <div className="text-sm text-muted-foreground">
                      {rec.currency} {rec.baseSalary} / {rec.payFrequency}
                      {rec.changeReason && <span> | Reason: {rec.changeReason}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">Effective: {rec.effectiveFrom}</div>
                  </div>
                  <Badge className={statusColor[rec.status] ?? "bg-gray-500/10 text-gray-400"}>{rec.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <div className="grid gap-3">
            {reviewCycles.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No salary review cycles yet.</CardContent></Card>
            )}
            {reviewCycles.data?.map((cycle) => (
              <Card key={cycle.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{cycle.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {cycle.startDate} to {cycle.endDate}
                      {cycle.budgetPercent && <span> | Budget: {cycle.budgetPercent}%</span>}
                    </div>
                  </div>
                  <Badge className={statusColor[cycle.status] ?? "bg-gray-500/10 text-gray-400"}>{cycle.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bonuses" className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Select value={bonusStatusFilter} onValueChange={setBonusStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {bonuses.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No bonus records yet.</CardContent></Card>
            )}
            {bonuses.data?.map((bonus) => (
              <Card key={bonus.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">Worker #{bonus.workerId} — {bonus.bonusType}</div>
                    <div className="text-sm text-muted-foreground">
                      {bonus.currency} {bonus.amount}
                      {bonus.period && <span> | Period: {bonus.period}</span>}
                    </div>
                  </div>
                  <Badge className={statusColor[bonus.status] ?? "bg-gray-500/10 text-gray-400"}>{bonus.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
