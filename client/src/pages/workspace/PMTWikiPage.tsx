/**
 * PMT Wiki — Simple project-scoped wiki with markdown editing
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, Pencil, Eye, Save } from "lucide-react";
import { toast } from "sonner";

const STORAGE_PREFIX = "pmt-wiki-";

export function PMTWikiPage({ workspaceId }: { workspaceId: number }) {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const projectId = selectedProject || projects?.[0]?.id;

  const storageKey = `${STORAGE_PREFIX}${workspaceId}-${projectId || "none"}`;

  // Load from localStorage when project changes
  useEffect(() => {
    const stored = localStorage.getItem(storageKey) || "";
    setContent(stored);
    setSavedContent(stored);
    setEditing(false);
  }, [storageKey]);

  function handleSave() {
    localStorage.setItem(storageKey, content);
    setSavedContent(content);
    setEditing(false);
    toast.success("Wiki saved");
  }

  const hasChanges = content !== savedContent;

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Wiki
        </h1>
        <div className="flex items-center gap-2">
          {projects && projects.length > 0 && (
            <Select
              value={String(projectId || "")}
              onValueChange={(v) => setSelectedProject(parseInt(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setContent(savedContent);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!hasChanges}>
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects available. Create a project first.
        </div>
      ) : editing ? (
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your project wiki content here... (supports plain text / markdown)"
          className="flex-1 min-h-[400px] font-mono text-sm"
        />
      ) : savedContent ? (
        <div className="flex-1 border rounded-lg p-6 bg-background overflow-auto">
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
            {savedContent}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground space-y-2">
            <Eye className="h-12 w-12 mx-auto opacity-30" />
            <p>No wiki content yet.</p>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              Start Writing
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
