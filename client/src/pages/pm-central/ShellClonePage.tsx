/**
 * ShellClonePage — Clone an existing project as a new draft_shell
 *
 * Route: /pm-central/shell/clone/:sourceId
 * Loads the source project, shows a summary card, and provides a form
 * to customize the clone. On submit, creates a new project via lifecycle.clone.
 */

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2, Copy, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

export default function ShellClonePage() {
  const [, params] = useRoute("/pm-central/shell/clone/:sourceId");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const sourceId = params?.sourceId ? parseInt(params.sourceId, 10) : 0;

  const { data: source, isLoading } = trpc.modules.pmt.shell.projects.get.useQuery(
    { id: sourceId },
    { enabled: sourceId > 0 },
  );

  const cloneMutation = trpc.modules.pmt.shell.lifecycle.clone.useMutation({
    onSuccess: (newProject) => {
      toast({ title: "Project cloned", description: `Created "${newProject.name}"` });
      navigate(`/pm-central/p/${newProject.id}/wizard/method-confirmation`);
    },
    onError: (err) => {
      toast({ title: "Clone failed", description: err.message, variant: "destructive" });
    },
  });

  const [name, setName] = useState("");
  const [copyWizardData, setCopyWizardData] = useState(true);
  const [copyMethodPack, setCopyMethodPack] = useState(true);
  const [copyRiskLevel, setCopyRiskLevel] = useState(true);

  // Pre-fill name once source loads
  if (source && !name) {
    setName(`Copy of ${source.name}`);
  }

  if (!sourceId || isNaN(sourceId)) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Invalid source project ID
      </div>
    );
  }

  if (!source) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Source project not found
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    cloneMutation.mutate({
      sourceProjectId: sourceId,
      name: name.trim(),
      cloneOptions: { copyWizardData, copyMethodPack, copyRiskLevel },
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/pm-central/p/${sourceId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Clone Project</h1>
      </div>

      {/* Source project summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Source Project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div><span className="text-muted-foreground">Name:</span> {source.name}</div>
          <div><span className="text-muted-foreground">Status:</span> {source.status}</div>
          {source.description && (
            <div><span className="text-muted-foreground">Description:</span> {source.description}</div>
          )}
          {(source.metadata as any)?.methodPackId && (
            <div><span className="text-muted-foreground">Method Pack:</span> {(source.metadata as any).methodPackId}</div>
          )}
          {source.riskLevel && (
            <div><span className="text-muted-foreground">Risk Level:</span> {source.riskLevel}</div>
          )}
        </CardContent>
      </Card>

      {/* Clone form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="clone-name">New Project Name</Label>
          <Input
            id="clone-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter project name"
            required
            maxLength={255}
          />
        </div>

        <div className="space-y-3">
          <Label>Clone Options</Label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={copyWizardData} onCheckedChange={(v) => setCopyWizardData(!!v)} />
            Copy wizard data (charter fields, planning data)
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={copyMethodPack} onCheckedChange={(v) => setCopyMethodPack(!!v)} />
            Copy method pack assignment
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={copyRiskLevel} onCheckedChange={(v) => setCopyRiskLevel(!!v)} />
            Copy risk level ({source.riskLevel || "low"})
          </label>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={cloneMutation.isPending || !name.trim()}>
            {cloneMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Clone Project
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/pm-central/p/${sourceId}`)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
