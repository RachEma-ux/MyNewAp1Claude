/**
 * HR Role Definition Review Queue Page — Lists versions pending review
 *
 * Allows HRBP/admin to view, approve, or request changes on submitted role definitions.
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useHrRole } from "@/hooks/useHrRole";
import { ArrowLeft, CheckCircle, MessageSquare, Eye } from "lucide-react";

export default function HRRoleDefinitionReviewPage() {
  const { can } = useHrRole();
  const utils = trpc.useUtils();
  const queueQuery = trpc.hr.roleDefinitions.reviewQueue.useQuery();

  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [dialogMode, setDialogMode] = useState<"approve" | "changes" | null>(null);
  const [comments, setComments] = useState("");

  const approveMutation = trpc.hr.roleDefinitions.approve.useMutation({
    onSuccess: () => { utils.hr.roleDefinitions.reviewQueue.invalidate(); closeDialog(); },
  });
  const requestChangesMutation = trpc.hr.roleDefinitions.requestChanges.useMutation({
    onSuccess: () => { utils.hr.roleDefinitions.reviewQueue.invalidate(); closeDialog(); },
  });

  const closeDialog = () => {
    setSelectedVersionId(null);
    setDialogMode(null);
    setComments("");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <Link href="/hr"><a className="hover:text-foreground">HR</a></Link>
            <span className="mx-1">/</span>
            <Link href="/hr/role-definitions"><a className="hover:text-foreground">Role Definitions</a></Link>
            <span className="mx-1">/</span>
            <span className="text-foreground">Review Queue</span>
          </nav>
          <h1 className="text-2xl font-bold">Review Queue</h1>
          <p className="text-muted-foreground">Role definition versions pending review</p>
        </div>
        <Link href="/hr/role-definitions">
          <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Change Type</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(queueQuery.data?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {queueQuery.isLoading ? "Loading..." : "No versions pending review"}
                  </TableCell>
                </TableRow>
              ) : (
                queueQuery.data?.map((item) => (
                  <TableRow key={item.versionId}>
                    <TableCell className="font-mono">{item.roleCode}</TableCell>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>v{item.versionNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.changeType ?? "material"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Link href={`/hr/role-definitions/${item.roleDefinitionId}`}>
                          <Button variant="ghost" size="sm"><Eye className="w-3 h-3 mr-1" /> View</Button>
                        </Link>
                        {can("hr.roledef.approve") && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => { setSelectedVersionId(item.versionId); setDialogMode("approve"); }}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Approve
                          </Button>
                        )}
                        {can("hr.roledef.review") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedVersionId(item.versionId); setDialogMode("changes"); }}
                          >
                            <MessageSquare className="w-3 h-3 mr-1" /> Request Changes
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "approve" ? "Approve Version" : "Request Changes"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder={dialogMode === "approve" ? "Optional approval comments..." : "Describe the changes needed..."}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            {dialogMode === "approve" ? (
              <Button
                onClick={() => selectedVersionId && approveMutation.mutate({ versionId: selectedVersionId, comments: comments || undefined })}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </Button>
            ) : (
              <Button
                onClick={() => selectedVersionId && comments && requestChangesMutation.mutate({ versionId: selectedVersionId, comments })}
                disabled={requestChangesMutation.isPending || !comments}
              >
                {requestChangesMutation.isPending ? "Submitting..." : "Request Changes"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
