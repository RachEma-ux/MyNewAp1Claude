/**
 * PMT Examples — Permanent built-in project examples from OpenProject
 * These are concrete, real-world project examples that users can apply
 * to create fully populated demo projects in their workspace.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles, Calendar, Globe, Bug, Rocket, ListChecks, Clock, Copy } from "lucide-react";
import { toast } from "sonner";

interface ExampleProject {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  tags: string[];
  taskCount: number;
  estimatedHours: number;
  highlights: string[];
}

const EXAMPLES: ExampleProject[] = [
  {
    id: "conference",
    name: "Open Source Conference",
    description:
      "Organize an open source conference from scratch — venue booking, speaker invitations, sponsor outreach, website setup, and post-event follow-up. Based on OpenProject's demo project.",
    icon: <Calendar className="h-6 w-6 text-orange-500" />,
    tags: ["PM²", "Waterfall", "Event Management"],
    taskCount: 10,
    estimatedHours: 100,
    highlights: [
      "Venue booking for 200+ attendees",
      "Sponsor tiers: Gold €5,000 / Silver €2,500 / Bronze €1,000",
      "CFP with keynote, talk & lightning formats",
      "Conference website with agenda & speaker bios",
      "Post-event: upload presentations, supporter party",
    ],
  },
  {
    id: "website",
    name: "Company Website Rebuild",
    description:
      "Rebuild the company website using Scrum — product backlog with real user stories, sprint iterations, bug tracking, and release milestones from v1.0 to v2.0. Based on OpenProject's Scrum demo project.",
    icon: <Globe className="h-6 w-6 text-blue-500" />,
    tags: ["Scrum", "Agile", "Web Development"],
    taskCount: 28,
    estimatedHours: 240,
    highlights: [
      "Epic: New Website with 4 user stories + bugs",
      "Sprint 1: Landing page, carousel, contact form, navigation",
      "Sub-tasks: Figma wireframes, React + Tailwind implementation",
      "Real bugs: SMTP misconfiguration, rejected hover color report",
      "Releases: v1.0 → v1.1 → v2.0 with concrete scope per release",
    ],
  },
];

export function PMTExamplesPage({ workspaceId }: { workspaceId: number }) {
  const [applyDialog, setApplyDialog] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  const utils = trpc.useUtils();

  // We seed + apply in two steps: first seed the template, then apply it
  const seedMut = trpc.modules.pmt.templates.projectTemplates.seed.useMutation();
  const applyMut = trpc.modules.pmt.templates.projectTemplates.useTemplate.useMutation({
    onSuccess: () => {
      utils.modules.pmt.projects.list.invalidate();
      setApplyDialog(null);
      setProjectName("");
      toast.success("Example project created! Check All Projects to see it.");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleApply = async (exampleId: string) => {
    if (!projectName.trim()) return;

    try {
      // Seed templates first (idempotent — creates if not exists)
      const seeded = await seedMut.mutateAsync({ workspaceId });

      // Pick the right template ID
      const templateId = exampleId === "conference" ? seeded.pm.id : seeded.scrum.id;

      // Apply template to create concrete project
      await applyMut.mutateAsync({
        id: templateId,
        workspaceId,
        name: projectName.trim(),
      });
    } catch (e: any) {
      // If seed fails because templates already exist, try to find and apply existing
      try {
        const templates = await utils.modules.pmt.templates.projectTemplates.list.fetch({ workspaceId });
        const match = (templates as any[])?.find((t: any) =>
          exampleId === "conference"
            ? t.name.includes("Conference")
            : t.name.includes("Website")
        );
        if (match) {
          await applyMut.mutateAsync({
            id: match.id,
            workspaceId,
            name: projectName.trim(),
          });
        } else {
          toast.error("Could not find example template. Try again.");
        }
      } catch {
        toast.error(e.message || "Failed to create example project");
      }
    }
  };

  const openApply = (exampleId: string, defaultName: string) => {
    setApplyDialog(exampleId);
    setProjectName(defaultName);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6" />
          Project Examples
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ready-to-use project examples with concrete tasks, real descriptions, and realistic statuses.
          Click "Use Example" to create a fully populated project in your workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {EXAMPLES.map((example) => (
          <Card key={example.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-3">
                {example.icon}
                <span className="flex-1 min-w-0 truncate">{example.name}</span>
              </CardTitle>
              <div className="flex flex-wrap gap-1 mt-2">
                {example.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <p className="text-sm text-muted-foreground">{example.description}</p>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ListChecks className="h-3.5 w-3.5" />
                  {example.taskCount} tasks
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {example.estimatedHours}h estimated
                </span>
              </div>

              {/* Highlights */}
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">What's included:</span>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {example.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-primary mt-0.5 shrink-0">-</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button
                className="w-full"
                onClick={() => openApply(example.id, example.name)}
                disabled={applyMut.isPending || seedMut.isPending}
              >
                <Copy className="h-4 w-4 mr-1" />
                Use Example
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Apply Dialog */}
      <Dialog open={!!applyDialog} onOpenChange={(open) => !open && setApplyDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Project from Example</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Project"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && applyDialog) handleApply(applyDialog);
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => applyDialog && handleApply(applyDialog)}
              disabled={applyMut.isPending || seedMut.isPending || !projectName.trim()}
            >
              {applyMut.isPending || seedMut.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
