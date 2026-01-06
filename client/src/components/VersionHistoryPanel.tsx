import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { History, RotateCcw, Clock, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface WorkflowVersion {
  id: number;
  workflowId: number;
  version: number;
  nodes: string;
  edges: string;
  changeNotes: string | null;
  createdAt: Date;
  createdBy: number;
}

interface VersionHistoryPanelProps {
  versions: WorkflowVersion[];
  currentVersion?: number;
  onRollback: (versionId: number) => void;
  isLoading?: boolean;
}

export function VersionHistoryPanel({
  versions,
  currentVersion,
  onRollback,
  isLoading = false,
}: VersionHistoryPanelProps) {
  const [rollbackVersionId, setRollbackVersionId] = useState<number | null>(null);

  const handleRollbackClick = (versionId: number) => {
    setRollbackVersionId(versionId);
  };

  const confirmRollback = () => {
    if (rollbackVersionId) {
      onRollback(rollbackVersionId);
      setRollbackVersionId(null);
    }
  };

  if (versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </CardTitle>
          <CardDescription>No published versions yet</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Click the <strong>Publish</strong> button to create the first version of this workflow.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </CardTitle>
          <CardDescription>{versions.length} published version(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {versions.map((version) => {
                const isCurrent = currentVersion === version.version;
                const nodes = JSON.parse(version.nodes || "[]");
                const edges = JSON.parse(version.edges || "[]");

                return (
                  <Card key={version.id} className={isCurrent ? "border-primary" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={isCurrent ? "default" : "outline"}>
                              Version {version.version}
                            </Badge>
                            {isCurrent && (
                              <Badge variant="secondary">Current</Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <Clock className="h-3 w-3" />
                            <span>
                              {version.createdAt 
                                ? formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })
                                : 'Unknown date'
                              }
                            </span>
                          </div>

                          {version.changeNotes && (
                            <div className="flex items-start gap-2 text-xs text-muted-foreground mb-2">
                              <FileText className="h-3 w-3 mt-0.5" />
                              <span className="flex-1">{version.changeNotes}</span>
                            </div>
                          )}

                          <div className="text-xs text-muted-foreground">
                            {nodes.length} blocks • {edges.length} connections
                          </div>
                        </div>

                        {!isCurrent && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRollbackClick(version.id)}
                            disabled={isLoading}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <AlertDialog open={rollbackVersionId !== null} onOpenChange={() => setRollbackVersionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rollback to Previous Version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore the workflow to the selected version. Your current draft will be replaced
              with the content from that version. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRollback}>
              Rollback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
