/**
 * HR Performance Reviews Page — Performance cycles and reviews with self + manager flow
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { BarChart3, Star, ClipboardList } from "lucide-react";
import { Link } from "wouter";

const cycleStatusVariant = (s: string) => {
  switch (s) {
    case "draft": return "outline" as const;
    case "active": case "goal_setting": case "self_review": case "manager_review": case "calibration":
      return "default" as const;
    case "completed": return "default" as const;
    case "cancelled": return "destructive" as const;
    default: return "outline" as const;
  }
};

const reviewStatusVariant = (s: string) => {
  switch (s) {
    case "pending": return "outline" as const;
    case "self_review": return "default" as const;
    case "manager_review": return "default" as const;
    case "completed": return "default" as const;
    case "cancelled": return "destructive" as const;
    default: return "outline" as const;
  }
};

const ratingStars = (rating: number | null) => {
  if (!rating) return "—";
  return Array.from({ length: 5 }, (_, i) => (
    <Star key={i} className={`w-3 h-3 inline ${i < rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
  ));
};

export default function HRPerformanceReviewsPage() {
  const [tab, setTab] = useState("cycles");
  const [cycleStatusFilter, setCycleStatusFilter] = useState("all");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("all");
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);

  const summaryQuery = trpc.hr.performance.summary.useQuery();
  const cyclesQuery = trpc.hr.performance.listCycles.useQuery({
    limit: 100,
    status: cycleStatusFilter !== "all" ? cycleStatusFilter : undefined,
  });
  const reviewsQuery = trpc.hr.performance.listReviews.useQuery({
    limit: 100,
    status: reviewStatusFilter !== "all" ? reviewStatusFilter : undefined,
  });
  const reviewDetailQuery = trpc.hr.performance.getReview.useQuery(
    { id: selectedReviewId! },
    { enabled: !!selectedReviewId }
  );

  const summary = summaryQuery.data ?? { activeCycles: 0, pendingReviews: 0, activeGoals: 0 };
  const cycles = cyclesQuery.data ?? [];
  const reviews = reviewsQuery.data ?? [];
  const reviewDetail = reviewDetailQuery.data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Performance Reviews</h1>
          <p className="text-muted-foreground">Performance cycles, reviews, and ratings</p>
        </div>
        <Link href="/hr">
          <Button variant="outline" size="sm">Back to HR</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Active Cycles</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> {summary.activeCycles}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Pending Reviews</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> {summary.pendingReviews}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Active Goals</div>
            <div className="text-2xl font-bold">{summary.activeGoals}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cycles">Cycles</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="cycles" className="space-y-3">
          <div className="flex gap-3">
            <Select value={cycleStatusFilter} onValueChange={setCycleStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="goal_setting">Goal Setting</SelectItem>
                <SelectItem value="self_review">Self Review</SelectItem>
                <SelectItem value="manager_review">Manager Review</SelectItem>
                <SelectItem value="calibration">Calibration</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cycles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        {cyclesQuery.isLoading ? "Loading..." : "No performance cycles found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    cycles.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.cycleType}</TableCell>
                        <TableCell>{c.startDate} to {c.endDate}</TableCell>
                        <TableCell><Badge variant={cycleStatusVariant(c.status)}>{c.status.replace("_", " ")}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-3">
          <div className="flex gap-3">
            <Select value={reviewStatusFilter} onValueChange={setReviewStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="self_review">Self Review</SelectItem>
                <SelectItem value="manager_review">Manager Review</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Worker</TableHead>
                    <TableHead>Cycle</TableHead>
                    <TableHead>Self Rating</TableHead>
                    <TableHead>Manager Rating</TableHead>
                    <TableHead>Overall</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {reviewsQuery.isLoading ? "Loading..." : "No performance reviews found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    reviews.map((r: any) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedReviewId(r.id)}
                      >
                        <TableCell className="font-medium">#{r.id}</TableCell>
                        <TableCell>Worker #{r.workerId}</TableCell>
                        <TableCell>Cycle #{r.cycleId}</TableCell>
                        <TableCell>{ratingStars(r.selfRating)}</TableCell>
                        <TableCell>{ratingStars(r.managerRating)}</TableCell>
                        <TableCell>{ratingStars(r.overallRating)}</TableCell>
                        <TableCell><Badge variant={reviewStatusVariant(r.status)}>{r.status.replace("_", " ")}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!selectedReviewId} onOpenChange={(open) => !open && setSelectedReviewId(null)}>
        <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Performance Review #{selectedReviewId}</SheetTitle>
          </SheetHeader>
          {reviewDetail && (
            <div className="space-y-4 mt-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Worker:</span> #{reviewDetail.workerId}</div>
                <div><span className="text-muted-foreground">Reviewer:</span> #{reviewDetail.reviewerId || "—"}</div>
                <div><span className="text-muted-foreground">Cycle:</span> #{reviewDetail.cycleId}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={reviewStatusVariant(reviewDetail.status)}>{reviewDetail.status.replace("_", " ")}</Badge></div>
              </div>

              {/* Self Review */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Self Review</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>Rating: {ratingStars(reviewDetail.selfRating)}</div>
                  {reviewDetail.selfComments && <p className="text-muted-foreground">{reviewDetail.selfComments}</p>}
                  {reviewDetail.selfSubmittedAt && (
                    <div className="text-xs text-muted-foreground">
                      Submitted: {new Date(reviewDetail.selfSubmittedAt).toLocaleDateString()}
                    </div>
                  )}
                  {!reviewDetail.selfRating && <p className="text-muted-foreground italic">Not yet submitted</p>}
                </CardContent>
              </Card>

              {/* Manager Review */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Manager Review</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>Rating: {ratingStars(reviewDetail.managerRating)}</div>
                  {reviewDetail.managerComments && <p className="text-muted-foreground">{reviewDetail.managerComments}</p>}
                  {reviewDetail.managerSubmittedAt && (
                    <div className="text-xs text-muted-foreground">
                      Submitted: {new Date(reviewDetail.managerSubmittedAt).toLocaleDateString()}
                    </div>
                  )}
                  {!reviewDetail.managerRating && <p className="text-muted-foreground italic">Not yet submitted</p>}
                </CardContent>
              </Card>

              {/* Overall */}
              {reviewDetail.overallRating && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Overall Assessment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>Overall Rating: {ratingStars(reviewDetail.overallRating)}</div>
                    {reviewDetail.overallComments && <p>{reviewDetail.overallComments}</p>}
                    {reviewDetail.developmentPlan && (
                      <div>
                        <span className="font-medium">Development Plan:</span>
                        <p className="text-muted-foreground mt-1">{reviewDetail.developmentPlan}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
