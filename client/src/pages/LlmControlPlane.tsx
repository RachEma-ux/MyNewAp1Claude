import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket, Wrench } from "lucide-react";

export default function LlmControlPlane() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">LLM Control Plane</h1>
        <p className="text-muted-foreground mt-2">
          Configure and manage LLM deployments with the step-by-step wizard
        </p>
      </div>

      {/* Placeholder Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Wizard Coming Soon
          </CardTitle>
          <CardDescription>
            The XState-based wizard for creating, editing, and cloning LLMs is under construction
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center space-y-4">
            <Rocket className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
            <div>
              <p className="text-lg font-medium">LLM Wizard</p>
              <p className="text-sm text-muted-foreground mt-1">
                Interactive wizard for LLM configuration management
              </p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Features:</p>
              <ul className="list-disc list-inside space-y-1 text-left max-w-md mx-auto">
                <li>Create mode: Build new LLM configurations from scratch</li>
                <li>Edit mode: Create new versions of existing LLMs (immutable)</li>
                <li>Clone mode: Duplicate and customize existing LLMs</li>
                <li>XState-powered state machine for deterministic flows</li>
                <li>Step-by-step configuration with validation</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
