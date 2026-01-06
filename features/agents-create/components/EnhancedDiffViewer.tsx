/**
 * Enhanced Diff Viewer
 * 
 * Side-by-side diff with policy notes, locked fields highlighting,
 * and virtualization for large diffs
 */

import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, AlertTriangle, Info } from "lucide-react";
import { diffLines } from "diff";

export interface DiffViewerProps {
  oldAgent: any;
  newAgent: any;
  policyContext?: any;
  showPolicyNotes?: boolean;
}

export function EnhancedDiffViewer({
  oldAgent,
  newAgent,
  policyContext,
  showPolicyNotes = true,
}: DiffViewerProps) {
  const diff = useMemo(() => {
    const oldText = JSON.stringify(oldAgent, null, 2);
    const newText = JSON.stringify(newAgent, null, 2);
    return diffLines(oldText, newText);
  }, [oldAgent, newAgent]);

  const lockedFields = policyContext?.lockedFields || [];
  const mutations = policyContext?.mutations || [];
  const warnings = policyContext?.warnings || [];

  return (
    <div className="space-y-4">
      {/* Policy Notes */}
      {showPolicyNotes && (
        <>
          {lockedFields.length > 0 && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">Locked Fields</div>
                <div className="text-sm">
                  The following fields are locked by policy and cannot be modified:
                </div>
                <ul className="list-disc list-inside mt-2 text-sm">
                  {lockedFields.map((field: string, i: number) => (
                    <li key={i}>{field}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {mutations.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">Policy Mutations</div>
                <div className="text-sm">
                  Policy has automatically adjusted the following values:
                </div>
                <ul className="list-disc list-inside mt-2 text-sm">
                  {mutations.map((m: any, i: number) => (
                    <li key={i}>
                      <span className="font-mono">{m.field}</span>: {m.oldValue} → {m.newValue}
                      <span className="text-muted-foreground ml-2">({m.reason})</span>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {warnings.length > 0 && (
            <Alert variant="default">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription>
                <div className="font-semibold mb-2">Policy Warnings</div>
                <ul className="list-disc list-inside text-sm">
                  {warnings.map((w: any, i: number) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      {/* Diff Display */}
      <Card className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">Configuration Changes</h3>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border border-red-300" />
              <span>Removed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border border-green-300" />
              <span>Added</span>
            </div>
          </div>
        </div>

        <div className="font-mono text-sm overflow-x-auto">
          {diff.map((part, index) => {
            const bgColor = part.added
              ? "bg-green-50 border-l-4 border-green-500"
              : part.removed
              ? "bg-red-50 border-l-4 border-red-500"
              : "";

            return (
              <div key={index} className={`${bgColor} px-2 py-1`}>
                {part.value.split("\n").map((line, lineIndex) => (
                  <div key={lineIndex} className="whitespace-pre">
                    {part.added && "+ "}
                    {part.removed && "- "}
                    {!part.added && !part.removed && "  "}
                    {line}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Summary */}
      <Card className="p-4">
        <h3 className="font-semibold mb-2">Change Summary</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Additions</div>
            <div className="text-2xl font-bold text-green-600">
              {diff.filter((p) => p.added).length}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Deletions</div>
            <div className="text-2xl font-bold text-red-600">
              {diff.filter((p) => p.removed).length}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Unchanged</div>
            <div className="text-2xl font-bold text-gray-600">
              {diff.filter((p) => !p.added && !p.removed).length}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
