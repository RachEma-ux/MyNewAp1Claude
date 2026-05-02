/**
 * HR Recruitment Page — Recruitment requests, candidate pipeline, interviews, offers
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Briefcase, Users, FileText, ArrowRight } from "lucide-react";
import { Link } from "wouter";

const stageBadgeColor = (stage: string) => {
  switch (stage) {
    case "applied": return "outline";
    case "screening": return "secondary";
    case "interview": return "default";
    case "assessment": return "default";
    case "offer": return "default";
    case "hired": return "default";
    case "rejected": return "destructive";
    case "withdrawn": return "secondary";
    default: return "outline";
  }
};

const statusBadgeColor = (s: string) => {
  switch (s) {
    case "draft": return "outline";
    case "open": case "sourcing": case "interviewing": return "default";
    case "offer_pending": return "secondary";
    case "filled": return "default";
    case "cancelled": return "destructive";
    default: return "outline";
  }
};

export default function HRRecruitmentPage() {
  const [tab, setTab] = useState("requests");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);

  const summaryQuery = trpc.hr.recruiting.summary.useQuery();
  const requestsQuery = trpc.hr.recruiting.listRequests.useQuery({
    limit: 100,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const candidatesQuery = trpc.hr.recruiting.listCandidates.useQuery(
    { recruitmentRequestId: selectedRequestId!, limit: 100 },
    { enabled: !!selectedRequestId }
  );
  const offersQuery = trpc.hr.recruiting.listOffers.useQuery(
    { recruitmentRequestId: selectedRequestId!, limit: 50 },
    { enabled: !!selectedRequestId }
  );

  const summary = summaryQuery.data ?? { openRequests: 0, activeCandidates: 0, pendingOffers: 0 };
  const requests = requestsQuery.data ?? [];

  if (requestsQuery.isLoading) {
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
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/hr">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Recruitment</h1>
          <p className="text-muted-foreground">Manage hiring requests, candidates, and offers</p>
        </div>
      </div>

      {requestsQuery.isError && (
        <Card className="border-red-500/50">
          <CardContent className="p-4 text-red-500 text-sm">Failed to load recruitment data.</CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.openRequests}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Candidates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.activeCandidates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Offers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.pendingOffers}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="requests">
            <Briefcase className="w-4 h-4 mr-1" /> Requests
          </TabsTrigger>
          <TabsTrigger value="candidates" disabled={!selectedRequestId}>
            <Users className="w-4 h-4 mr-1" /> Candidates
          </TabsTrigger>
          <TabsTrigger value="offers" disabled={!selectedRequestId}>
            <FileText className="w-4 h-4 mr-1" /> Offers
          </TabsTrigger>
        </TabsList>

        {/* Requests Tab */}
        <TabsContent value="requests">
          <div className="flex gap-3 mb-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="sourcing">Sourcing</SelectItem>
                <SelectItem value="interviewing">Interviewing</SelectItem>
                <SelectItem value="offer_pending">Offer Pending</SelectItem>
                <SelectItem value="filled">Filled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Headcount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {requestsQuery.isLoading ? "Loading..." : "No recruitment requests found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    requests.map((r: any) => (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50"
                        onClick={() => { setSelectedRequestId(r.id); setTab("candidates"); }}>
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell><Badge variant={r.priority === "urgent" ? "destructive" : "outline"}>{r.priority}</Badge></TableCell>
                        <TableCell>{r.headcount}</TableCell>
                        <TableCell>{r.employmentType?.replace("_", " ")}</TableCell>
                        <TableCell><Badge variant={statusBadgeColor(r.status)}>{r.status.replace("_", " ")}</Badge></TableCell>
                        <TableCell><ArrowRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Candidates Tab */}
        <TabsContent value="candidates">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Candidates {selectedRequestId ? `for Request #${selectedRequestId}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(candidatesQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {candidatesQuery.isLoading ? "Loading..." : "No candidates yet"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    (candidatesQuery.data ?? []).map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.firstName} {c.lastName}</TableCell>
                        <TableCell>{c.email}</TableCell>
                        <TableCell>{c.source || "—"}</TableCell>
                        <TableCell><Badge variant={stageBadgeColor(c.pipelineStage)}>{c.pipelineStage}</Badge></TableCell>
                        <TableCell>{c.rating ? `${c.rating}/5` : "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Offers Tab */}
        <TabsContent value="offers">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Offers {selectedRequestId ? `for Request #${selectedRequestId}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Offer Date</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(offersQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {offersQuery.isLoading ? "Loading..." : "No offers yet"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    (offersQuery.data ?? []).map((o: any) => (
                      <TableRow key={o.id}>
                        <TableCell>#{o.id}</TableCell>
                        <TableCell>Candidate #{o.candidateId}</TableCell>
                        <TableCell>{o.offerDate || "—"}</TableCell>
                        <TableCell>{o.proposedStartDate || "—"}</TableCell>
                        <TableCell><Badge variant={o.status === "accepted" ? "default" : o.status === "declined" ? "destructive" : "outline"}>{o.status}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
