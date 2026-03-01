import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { FolderOpen, Plus, FileStack, Sparkles } from "lucide-react";

export default function ProjectsPanel() {
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground mt-1">
          Create, manage, and track project portfolios
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation("/workspaces")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Project</CardTitle>
            <Plus className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Create a new project workspace from scratch with custom settings and team assignments.
            </p>
            <Button size="sm" className="mt-3">
              <Plus className="h-4 w-4 mr-1" />
              Create Project
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation("/pm-central/templates")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Templates</CardTitle>
            <FileStack className="h-5 w-5 text-blue-400" />
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Start from a PM template — PM², Scrum, Kanban, PRINCE2, Waterfall, and more.
            </p>
            <Button size="sm" variant="outline" className="mt-3">
              <FileStack className="h-4 w-4 mr-1" />
              Browse Templates
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation("/pm-central/examples")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Examples</CardTitle>
            <Sparkles className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Explore pre-built example projects to learn best practices and get inspired.
            </p>
            <Button size="sm" variant="outline" className="mt-3">
              <Sparkles className="h-4 w-4 mr-1" />
              View Examples
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Project List</CardTitle>
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No projects created yet. Use one of the options above to get started.</p>
        </CardContent>
      </Card>
    </div>
  );
}
