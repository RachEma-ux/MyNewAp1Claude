import type { Agent, AgentMode, GovernanceStatus, AgentRoleClass } from "@shared/types";
/**
 * Promotion Requests Dashboard
 * 
 * Shows pending/approved/rejected promotion requests with SLA tracking
 */

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { Clock, CheckCircle, XCircle, AlertTriangle, User, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function PromotionRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");

  const { data: requests, isLoading, refetch } = trpc.agentPromotions.listRequests.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const approveMutation = trpc.agentPromotions.approve.useMutation({
    onSuccess: () => {
      refetch();
      setApprovalDialogOpen(false);
      setComment("");
    },
  });

  const rejectMutation = trpc.agentPromotions.reject.useMutation({
    onSuccess: () => {
      refetch();
      setRejectDialogOpen(false);
      setReason("");
    },
  });

  const executeMutation = trpc.agentPromotions.execute.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleApprove = () => {
    if (!selectedRequest) return;
    approveMutation.mutate({
      id: selectedRequest.id,
      comment,
    });
  };

  const handleReject = () => {
    if (!selectedRequest) return;
    rejectMutation.mutate({
      id: selectedRequest.id,
      reason,
    });
  };

  const handleExecute = (requestId: string) => {
    executeMutation.mutate({ id: parseInt(requestId) });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50"><CheckCircle className="w-3 h-3 mr-1" /> Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      case "executed":
        return <Badge variant="outline" className="bg-blue-50"><CheckCircle className="w-3 h-3 mr-1" /> Executed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSLAStatus = (createdAt: Date, deadline: Date) => {
    const now = new Date();
    const timeRemaining = deadline.getTime() - now.getTime();
    const hoursRemaining = timeRemaining / (1000 * 60 * 60);

    if (hoursRemaining < 0) {
      return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> Overdue</Badge>;
    } else if (hoursRemaining < 4) {
      return <Badge variant="outline" className="bg-orange-50"><Clock className="w-3 h-3 mr-1" /> {Math.floor(hoursRemaining)}h left</Badge>;
    } else {
      return <Badge variant="outline" className="bg-green-50"><Clock className="w-3 h-3 mr-1" /> {Math.floor(hoursRemaining)}h left</Badge>;
    }
  };

  if (isLoading) {
    return <div className="p-8">Loading promotion requests...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Promotion Requests</h1>
          <p className="text-muted-foreground">Review and approve agent promotions to governed status</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="executed">Executed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Requests List */}
      <div className="space-y-4">
        {requests && requests.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No promotion requests found</p>
          </Card>
        )}

        {requests?.map((request: any) => (
          <Card key={request.id} className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{request.agent?.name || "Unknown Agent"}</h3>
                  {getStatusBadge(request.status)}
                  {request.status === "pending" && getSLAStatus(request.createdAt, request.deadline)}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Requested by:</span>
                    <span>{request.requestedBy}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Created:</span>
                    <span>{formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}</span>
                  </div>
                </div>

                {request.approvers && request.approvers.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Approvers:</span>
                    <span className="ml-2">{request.approvers.join(", ")}</span>
                  </div>
                )}

                {request.comment && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Comment:</span>
                    <p className="mt-1 text-sm">{request.comment}</p>
                  </div>
                )}

                {request.reason && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <strong>Rejection Reason:</strong> {request.reason}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="flex gap-2">
                {request.status === "pending" && (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        setSelectedRequest(request);
                        setApprovalDialogOpen(true);
                      }}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setSelectedRequest(request);
                        setRejectDialogOpen(true);
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </>
                )}

                {request.status === "approved" && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleExecute(request.id)}
                    disabled={executeMutation.isPending}
                  >
                    Execute Promotion
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Promotion Request</DialogTitle>
            <DialogDescription>
              Add an optional comment explaining your approval decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Comment (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={approveMutation.isPending}>
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Promotion Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this promotion request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Rejection reason (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!reason || rejectMutation.isPending}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
