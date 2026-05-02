/**
 * /pm-central/rtlm/projects — list & create projects.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PMProjectList } from "../components/PMProjectList";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function PMProjectsPage() {
  const workspaceId = useDefaultWorkspaceId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.pmCentral.projects.create.useMutation({
    onSuccess: () => {
      utils.pmCentral.projects.list.invalidate();
      setName("");
      setDescription("");
      toast.success("Project created");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!workspaceId)
    return (
      <div className="p-6 text-sm text-muted-foreground">Resolving workspace…</div>
    );

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">New project</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
            />
            <Button
              disabled={create.isPending || !name.trim()}
              onClick={() =>
                create.mutate({
                  workspaceId,
                  name,
                  description: description || undefined,
                })
              }
            >
              {create.isPending ? "Creating…" : "Create project"}
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <PMProjectList workspaceId={workspaceId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
