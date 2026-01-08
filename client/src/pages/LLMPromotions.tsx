/**
 * LLM Promotions - Promotion request list and approval interface
 *
 * Features:
 * - List all promotion requests with filters
 * - Approve/reject with comments
 * - Execution tracking
 * - Promotion timeline view
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Loader2,
  AlertTriangle,
  PlayCircle,
  Info,
} from "lucide-react";
import { toast } from "sonner";

export default function LLMPromotions() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedPromotion, setSelectedPromotion] = useState<any>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: promotions, isLoading, refetch } = trpc.llm.listPromotions.useQuery({
    status: statusFilter === "all" ? undefined : (statusFilter as any),
  });

  const approveMutation = trpc.llm.approvePromotion.useMutation({
    onSuccess: () => {
      toast.success("Promotion approved successfully");
      setApproveDialogOpen(false);
      setApprovalComment("");
      setSelectedPromotion(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  const rejectMutation = trpc.llm.rejectPromotion.useMutation({
    onSuccess: () => {
      toast.success("Promotion rejected");
      setRejectDialogOpen(false);
      setRejectionReason("");
      setSelectedPromotion(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });

  const executeMutation = trpc.llm.executePromotion.useMutation({
    onSuccess: () => {
      toast.success("Promotion executed successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to execute: ${error.message}`);
    },
  });

  const handleApprove = (promotion: any) => {
    setSelectedPromotion(promotion);
    setApproveDialogOpen(true);
  };

  const handleReject = (promotion: any) => {
    setSelectedPromotion(promotion);
    setRejectDialogOpen(true);
  };

  const handleExecute = async (promotionId: number) => {
    if (confirm("Execute this promotion? This will create a new version in the target environment.")) {
      executeMutation.mutate({ promotionId });
    }
  };

  const confirmApprove = () => {
    if (selectedPromotion) {
      approveMutation.mutate({
        promotionId: selectedPromotion.id,
        comment: approvalComment || undefined,
      });
    }
  };

  const confirmReject = () => {
    if (selectedPromotion && rejectionReason.trim()) {
      rejectMutation.mutate({
        promotionId: selectedPromotion.id,
        reason: rejectionReason,
      });
    } else {
      toast.error("Rejection reason is required");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      pending: { variant: "secondary", icon: Clock, label: "Pending" },
      simulated: { variant: "default", icon: Info, label: "Simulated" },
      approved: { variant: "default", icon: CheckCircle2, label: "Approved" },
      rejected: { variant: "destructive", icon: XCircle, label: "Rejected" },
      executed: { variant: "default", icon: CheckCircle2, label: "Executed" },
      failed: { variant: "destructive", icon: AlertTriangle, label: "Failed" },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getEnvironmentBadge = (env: string) => {
    const colors: Record<string, string> = {
      sandbox: "bg-blue-500",
      governed: "bg-purple-500",
      production: "bg-red-500",
    };

    return (
      <Badge className={`${colors[env] || "bg-gray-500"} text-white`}>
        {env}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto py-4 sm:py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/llm")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">LLM Promotions</h1>
            <p className="text-muted-foreground">Manage promotion requests between environments</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Status:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="simulated">Simulated</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="executed">Executed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            {statusFilter !== "all" && (
              <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")}>
                Clear Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Promotions List */}
      <Card>
        <CardHeader>
          <CardTitle>Promotion Requests</CardTitle>
          <CardDescription>
            {promotions?.length || 0} promotion{(promotions?.length || 0) !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading promotions...</p>
            </div>
          ) : promotions && promotions.length > 0 ? (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Promotion Path</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Requested At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promotions.map((promotion) => (
                    <TableRow key={promotion.id}>
                      <TableCell className="font-mono text-sm">#{promotion.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getEnvironmentBadge(promotion.fromEnvironment)}
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          {getEnvironmentBadge(promotion.toEnvironment)}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(promotion.status)}</TableCell>
                      <TableCell className="text-sm">User #{promotion.requestedBy}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(promotion.requestedAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {promotion.status === "pending" && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleApprove(promotion)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleReject(promotion)}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          {promotion.status === "approved" && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleExecute(promotion.id)}
                              disabled={executeMutation.isPending}
                            >
                              <PlayCircle className="h-4 w-4 mr-1" />
                              Execute
                            </Button>
                          )}
                          {promotion.status === "executed" && (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Complete
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No promotions found</h3>
              <p className="text-muted-foreground mb-4">
                {statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "No promotion requests yet"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Promotion</DialogTitle>
            <DialogDescription>
              Approve promotion #{selectedPromotion?.id} from{" "}
              <strong>{selectedPromotion?.fromEnvironment}</strong> to{" "}
              <strong>{selectedPromotion?.toEnvironment}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                After approval, you'll need to execute the promotion to create the new version in{" "}
                {selectedPromotion?.toEnvironment}.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="approval-comment">Comment (optional)</Label>
              <Textarea
                id="approval-comment"
                placeholder="Add approval notes or comments..."
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApproveDialogOpen(false);
                setApprovalComment("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmApprove} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Promotion</DialogTitle>
            <DialogDescription>
              Reject promotion #{selectedPromotion?.id} from{" "}
              <strong>{selectedPromotion?.fromEnvironment}</strong> to{" "}
              <strong>{selectedPromotion?.toEnvironment}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will permanently reject the promotion request. The requester will be notified.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="rejection-reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rejection-reason"
                placeholder="Explain why this promotion is being rejected..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                A clear reason helps the requester understand what needs to be fixed.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectionReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={rejectMutation.isPending || !rejectionReason.trim()}
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
