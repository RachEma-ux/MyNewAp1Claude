/**
 * ModuleDisabled — Screen shown when a module is not enabled
 */

import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface ModuleDisabledProps {
  moduleName: string;
  workspaceId: number;
}

export function ModuleDisabled({ moduleName, workspaceId }: ModuleDisabledProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-6">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">Module Not Enabled</h2>
      <p className="text-muted-foreground max-w-md">
        The <strong>{moduleName}</strong> module is not enabled for this workspace.
        Contact a workspace administrator to enable it.
      </p>
      <Link href={`/w/${workspaceId}`}>
        <Button variant="outline">Back to Overview</Button>
      </Link>
    </div>
  );
}
