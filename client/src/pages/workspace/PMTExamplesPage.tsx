/**
 * PMT Examples — Permanent built-in project examples
 * Concrete, real-world project examples that users can apply
 * to create fully populated demo projects in their workspace.
 * These use hardcoded data via the applyExample mutation (no DB template needed).
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
import {
  Sparkles,
  Calendar,
  Globe,
  Smartphone,
  Megaphone,
  Building2,
  UserPlus,
  ListChecks,
  Clock,
  Copy,
} from "lucide-react";
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
  {
    id: "mobile_app",
    name: "Mobile App Launch — TaskFlow",
    description:
      "Launch 'TaskFlow', a productivity app for iOS and Android. Covers beta testing with TestFlight, App Store submission, Product Hunt launch, press outreach, and post-launch iteration.",
    icon: <Smartphone className="h-6 w-6 text-purple-500" />,
    tags: ["Product Launch", "Mobile", "Agile"],
    taskCount: 18,
    estimatedHours: 160,
    highlights: [
      "App Store listing copy, demo video, and screenshots",
      "TestFlight & Google Play internal testing setup",
      "Beta bug fixes: device sync, Android back button",
      "Product Hunt launch + social media blitz",
      "Post-launch: Crashlytics monitoring, retention analysis",
    ],
  },
  {
    id: "marketing",
    name: "Spring SaaS Product Launch Campaign",
    description:
      "Execute the Q2 spring launch campaign for CloudSync Pro — a SaaS file collaboration platform. Content creation, paid ads, email drip sequences, influencer partnerships, and live webinar.",
    icon: <Megaphone className="h-6 w-6 text-pink-500" />,
    tags: ["Marketing", "SaaS", "Campaign"],
    taskCount: 16,
    estimatedHours: 100,
    highlights: [
      "3 audience segments with Google + LinkedIn + Facebook ads",
      "5-email drip sequence with conversion-optimized copy",
      "3 influencer partnerships ($1.5K–$700 each)",
      "Live webinar: 'Future of Team Collaboration' (500 target)",
      "ROI analysis: CAC, ROAS, channel breakdown",
    ],
  },
  {
    id: "office_relocation",
    name: "Office Relocation — 123 Innovation Way",
    description:
      "Relocate a 50-person team to new HQ at 123 Innovation Way. Covers lease signing, IT infrastructure (Cat6a cabling, Ubiquiti WiFi, server room), furniture procurement, weekend move, and first-week settling.",
    icon: <Building2 className="h-6 w-6 text-emerald-500" />,
    tags: ["Facilities", "IT Infrastructure", "Logistics"],
    taskCount: 22,
    estimatedHours: 210,
    highlights: [
      "Lease: 4,200 sq ft, $42/sq ft/yr, 3 months free",
      "IT: Cat6a cabling, Cisco switches, Ubiquiti WiFi, Kisi access",
      "Furniture: Uplift standing desks + Branch ergonomic chairs",
      "Weekend move: 3 trucks, 8 movers, IT cutover Saturday night",
      "First week: all-hands welcome, troubleshooting, office warming",
    ],
  },
  {
    id: "hr_onboarding",
    name: "90-Day New Hire Onboarding",
    description:
      "Structured 90-day onboarding program for new engineering hires. Pre-boarding setup, Day 1 orientation, buddy program, first 'good first issue' PR, and 30/60/90 day manager reviews.",
    icon: <UserPlus className="h-6 w-6 text-sky-500" />,
    tags: ["HR", "Onboarding", "People Ops"],
    taskCount: 24,
    estimatedHours: 80,
    highlights: [
      "Pre-boarding: laptop setup, account creation, swag kit",
      "Day 1: office tour, HR paperwork, team lunch at Milano's",
      "Week 1: shadow a senior engineer, first PR merged",
      "30/60/90 day check-ins with concrete milestones",
      "Buddy program: weekly 1:1s with assigned mentor",
    ],
  },
];

export function PMTExamplesPage({ workspaceId }: { workspaceId: number }) {
  const [applyDialog, setApplyDialog] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  const utils = trpc.useUtils();

  const applyMut = trpc.modules.pmt.templates.projectTemplates.applyExample.useMutation({
    onSuccess: () => {
      utils.modules.pmt.projects.list.invalidate();
      setApplyDialog(null);
      setProjectName("");
      toast.success("Example project created! Check All Projects to see it.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleApply = (exampleId: string) => {
    if (!projectName.trim()) return;
    applyMut.mutate({
      workspaceId,
      exampleId,
      name: projectName.trim(),
    });
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
                disabled={applyMut.isPending}
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
              disabled={applyMut.isPending || !projectName.trim()}
            >
              {applyMut.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
