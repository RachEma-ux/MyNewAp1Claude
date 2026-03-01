/**
 * ShellNewPage — Create a new PM Shell (project inception wizard)
 *
 * Route: /pm-central/shell/new
 * After creation, redirects to /pm-central/p/:projectId/charter
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Terminal, ArrowRight, Loader2, BookOpen } from "lucide-react";
import { METHOD_CATEGORIES, ALL_METHODS, getMethodsByCategory } from "@shared/pm-methods-catalog";

export default function ShellNewPage() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState("low");
  const [methodology, setMethodology] = useState("");
  const [creating, setCreating] = useState(false);

  const createMutation = trpc.modules.pmt.shell.projects.create.useMutation({
    onSuccess: (data: any) => {
      setLocation(`/pm-central/p/${data.id}/wizard/start`);
    },
    onError: () => {
      setCreating(false);
    },
  });

  const handleCreate = () => {
    if (!name.trim()) return;
    setCreating(true);
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      riskLevel,
      methodology: methodology || undefined,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Terminal className="h-7 w-7" />
          Create PM Shell
        </h1>
        <p className="text-muted-foreground mt-1">
          Initialize a new project container. This creates a draft_shell that progresses through the governed lifecycle.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Project Name *</label>
            <Input
              placeholder="e.g., Platform Migration Q2"
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              placeholder="Brief description of the project scope and objectives..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Risk Level</label>
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium flex items-center gap-1">
                Methodology
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setLocation("/pm-central/methodes")} title="Browse all methods">
                  <BookOpen className="h-3 w-3" />
                </button>
              </label>
              <Select value={methodology} onValueChange={setMethodology}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select methodology..." />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_CATEGORIES.map((cat) => {
                    const methods = getMethodsByCategory(cat.id);
                    return methods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${cat.color}`} />
                          {m.name}
                        </span>
                      </SelectItem>
                    ));
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1">
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">draft_shell</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="px-2 py-0.5 bg-muted rounded text-xs">G0 Intake</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="px-2 py-0.5 bg-muted rounded text-xs">Planning</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="px-2 py-0.5 bg-muted rounded text-xs">...</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            The project will start as draft_shell. Submit for G0 intake review to progress to planning.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setLocation("/pm-central/dashboard")}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!name.trim() || creating}>
          {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Terminal className="h-4 w-4 mr-1" />}
          Create PM Shell
        </Button>
      </div>
    </div>
  );
}
