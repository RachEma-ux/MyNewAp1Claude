import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileStack, Sparkles, ClipboardList } from "lucide-react";
import { PMTProjectTemplatesPage } from "../workspace/PMTProjectTemplatesPage";
import { PMTWorkItemTemplatesPage } from "../workspace/PMTWorkItemTemplatesPage";
import { PMTExamplesPage } from "../workspace/PMTExamplesPage";

export default function TemplatesPanel({ defaultTab }: { defaultTab?: string }) {
  const [, setLocation] = useLocation();
  const { data: workspaces, isLoading } = trpc.workspaces.list.useQuery();

  const projectWorkspaces = (workspaces || []).filter((w: any) => w.type === "project");
  const workspaceId = projectWorkspaces[0]?.id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Templates & Examples</h1>
        <p className="text-muted-foreground mt-1">
          PM project templates, work item templates, and ready-to-use example projects
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !workspaceId ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-3">No project workspace found. Create one first to use templates.</p>
          <Button variant="outline" onClick={() => setLocation("/workspaces")}>
            Create a Project Workspace
          </Button>
        </div>
      ) : (
        <Tabs defaultValue={defaultTab || "project-templates"}>
          <TabsList>
            <TabsTrigger value="project-templates" className="flex items-center gap-1.5">
              <FileStack className="h-4 w-4" />
              Project Templates
            </TabsTrigger>
            <TabsTrigger value="examples" className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" />
              Examples
            </TabsTrigger>
            <TabsTrigger value="work-item-templates" className="flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4" />
              Work Item Templates
            </TabsTrigger>
          </TabsList>
          <TabsContent value="project-templates">
            <PMTProjectTemplatesPage workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="examples">
            <PMTExamplesPage workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="work-item-templates">
            <PMTWorkItemTemplatesPage workspaceId={workspaceId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
