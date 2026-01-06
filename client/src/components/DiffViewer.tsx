import { useState } from "react";
import { diffLines } from "diff";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

interface DiffViewerProps {
  oldValue: string;
  newValue: string;
  oldLabel?: string;
  newLabel?: string;
  viewMode?: "split" | "unified";
}

export function DiffViewer({
  oldValue,
  newValue,
  oldLabel = "Original",
  newLabel = "Current",
  viewMode = "split",
}: DiffViewerProps) {
  const [mode, setMode] = useState<"split" | "unified">(viewMode);
  const [expanded, setExpanded] = useState(true);
  const changes = diffLines(oldValue, newValue);

  // Count changes
  const addedCount = changes.filter((c) => c.added).length;
  const removedCount = changes.filter((c) => c.removed).length;

  return (
    <Card className="p-0 overflow-hidden border border-border">
      {/* Header */}
      <div className="bg-muted p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Badge variant="outline">{oldLabel}</Badge>
            <span className="text-muted-foreground">→</span>
            <Badge variant="outline">{newLabel}</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {removedCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                {removedCount} removed
              </span>
            )}
            {addedCount > 0 && (
              <span className="flex items-center gap-1 text-green-600">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                {addedCount} added
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 border border-border rounded-md p-1 bg-background">
            <Button
              variant={mode === "split" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("split")}
              className="text-xs"
            >
              Split
            </Button>
            <Button
              variant={mode === "unified" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("unified")}
              className="text-xs"
            >
              Unified
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Diff Content */}
      {expanded && (
        <div className="overflow-x-auto bg-background">
          {mode === "split" ? (
            <div className="grid grid-cols-2">
              {/* Left Side (Old) */}
              <div className="border-r font-mono text-sm">
                {changes.map((change, index) => {
                  if (change.removed) {
                    return (
                      <div
                        key={index}
                        className="bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-100 px-4 py-1 border-l-4 border-red-500"
                      >
                        {change.value.split("\n").map((line, lineIndex) =>
                          line ? (
                            <div key={lineIndex} className="whitespace-pre-wrap break-all">
                              <span className="text-red-500 dark:text-red-400 mr-2 select-none font-bold">−</span>
                              {line}
                            </div>
                          ) : null
                        )}
                      </div>
                    );
                  } else if (!change.added) {
                    return (
                      <div key={index} className="px-4 py-1 text-muted-foreground hover:bg-muted">
                        {change.value.split("\n").map((line, lineIndex) =>
                          line ? (
                            <div key={lineIndex} className="whitespace-pre-wrap break-all">
                              <span className="mr-2 select-none"> </span>
                              {line}
                            </div>
                          ) : null
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>

              {/* Right Side (New) */}
              <div className="font-mono text-sm">
                {changes.map((change, index) => {
                  if (change.added) {
                    return (
                      <div
                        key={index}
                        className="bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-100 px-4 py-1 border-l-4 border-green-500"
                      >
                        {change.value.split("\n").map((line, lineIndex) =>
                          line ? (
                            <div key={lineIndex} className="whitespace-pre-wrap break-all">
                              <span className="text-green-500 dark:text-green-400 mr-2 select-none font-bold">+</span>
                              {line}
                            </div>
                          ) : null
                        )}
                      </div>
                    );
                  } else if (!change.removed) {
                    return (
                      <div key={index} className="px-4 py-1 text-muted-foreground hover:bg-muted">
                        {change.value.split("\n").map((line, lineIndex) =>
                          line ? (
                            <div key={lineIndex} className="whitespace-pre-wrap break-all">
                              <span className="mr-2 select-none"> </span>
                              {line}
                            </div>
                          ) : null
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ) : (
            /* Unified view */
            <div className="font-mono text-sm">
              {changes.map((change, index) => {
                if (change.added) {
                  return (
                    <div
                      key={index}
                      className="bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-100 px-4 py-1 border-l-4 border-green-500"
                    >
                      {change.value.split("\n").map((line, lineIndex) =>
                        line ? (
                          <div key={lineIndex} className="whitespace-pre-wrap break-all">
                            <span className="text-green-500 dark:text-green-400 mr-2 select-none font-bold">+</span>
                            {line}
                          </div>
                        ) : null
                      )}
                    </div>
                  );
                } else if (change.removed) {
                  return (
                    <div
                      key={index}
                      className="bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-100 px-4 py-1 border-l-4 border-red-500"
                    >
                      {change.value.split("\n").map((line, lineIndex) =>
                        line ? (
                          <div key={lineIndex} className="whitespace-pre-wrap break-all">
                            <span className="text-red-500 dark:text-red-400 mr-2 select-none font-bold">−</span>
                            {line}
                          </div>
                        ) : null
                      )}
                    </div>
                  );
                } else {
                  return (
                    <div key={index} className="px-4 py-1 text-muted-foreground hover:bg-muted">
                      {change.value.split("\n").map((line, lineIndex) =>
                        line ? (
                          <div key={lineIndex} className="whitespace-pre-wrap break-all">
                            <span className="mr-2 select-none"> </span>
                            {line}
                          </div>
                        ) : null
                      )}
                    </div>
                  );
                }
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

interface AgentDiffViewerProps {
  sandboxAgent: any;
  governedAgent: any;
}

export function AgentDiffViewer({ sandboxAgent, governedAgent }: AgentDiffViewerProps) {
  const sandboxSpec = JSON.stringify(
    {
      name: sandboxAgent.name,
      version: sandboxAgent.version,
      roleClass: sandboxAgent.roleClass,
      anatomy: sandboxAgent.anatomy,
      sandboxConstraints: sandboxAgent.sandboxConstraints,
    },
    null,
    2
  );

  const governedSpec = JSON.stringify(
    {
      name: governedAgent.name,
      version: governedAgent.version,
      roleClass: governedAgent.roleClass,
      anatomy: governedAgent.anatomy,
      governance: governedAgent.governance,
    },
    null,
    2
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Agent Specification Comparison</h3>
        <DiffViewer
          oldValue={sandboxSpec}
          newValue={governedSpec}
          oldLabel="Sandbox Version"
          newLabel="Governed Version"
        />
      </div>

      {/* System Prompt Diff */}
      {sandboxAgent.anatomy?.systemPrompt && governedAgent.anatomy?.systemPrompt && (
        <div>
          <h3 className="text-lg font-semibold mb-4">System Prompt Changes</h3>
          <DiffViewer
            oldValue={sandboxAgent.anatomy.systemPrompt}
            newValue={governedAgent.anatomy.systemPrompt}
            oldLabel="Sandbox Prompt"
            newLabel="Governed Prompt"
          />
        </div>
      )}

      {/* Tools Diff */}
      {sandboxAgent.anatomy?.tools && governedAgent.anatomy?.tools && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Tools Changes</h3>
          <DiffViewer
            oldValue={JSON.stringify(sandboxAgent.anatomy.tools, null, 2)}
            newValue={JSON.stringify(governedAgent.anatomy.tools, null, 2)}
            oldLabel="Sandbox Tools"
            newLabel="Governed Tools"
          />
        </div>
      )}
    </div>
  );
}
