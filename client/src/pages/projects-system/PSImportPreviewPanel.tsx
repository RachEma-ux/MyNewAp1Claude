/**
 * PSImportPreviewPanel — Import tab
 *
 * JSON paste → preview → commit into draft version.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertTriangle,
  Download,
  Loader2,
  Upload,
} from "lucide-react";

export function PSImportPreviewPanel({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const [jsonInput, setJsonInput] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [commitVersion, setCommitVersion] = useState("");
  const [commitLabel, setCommitLabel] = useState("");

  const previewMut = trpc.ps.matrix.previewImport.useMutation({
    onSuccess: (data) => { setPreview(data); if (data.isValid) toast.success("Import preview valid"); else toast.error("Import has errors"); },
    onError: (e) => toast.error(e.message),
  });

  const commitMut = trpc.ps.matrix.commitImport.useMutation({
    onSuccess: (data) => {
      utils.ps.matrix.listVersions.invalidate();
      utils.ps.matrix.getOverview.invalidate();
      toast.success(`Imported: ${data.scopesCreated} scopes, ${data.questionsCreated} questions, ${data.cellsCreated} cells`);
      setPreview(null);
      setJsonInput("");
      setCommitVersion("");
      setCommitLabel("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePreview = () => {
    try {
      const payload = JSON.parse(jsonInput);
      if (!payload.scopes || !payload.questions || !payload.cells) {
        toast.error("JSON must have scopes, questions, and cells arrays");
        return;
      }
      previewMut.mutate({ workspaceId, sourceType: "json", sourceName: "manual-paste", payload });
    } catch {
      toast.error("Invalid JSON");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Import Center</h2>
      <p className="text-sm text-muted-foreground">
        Paste a JSON payload with <code>scopes</code>, <code>questions</code>, and <code>cells</code> arrays.
        Optionally include <code>dimensions</code> and <code>questionPresentations</code>.
      </p>

      <Textarea
        className="font-mono text-xs min-h-[200px]"
        placeholder={`{\n  "scopes": [{ "code": "SCOPE_A", "label": "Scope A" }],\n  "questions": [{ "code": "Q1", "label": "Question 1" }],\n  "cells": [{ "questionCode": "Q1", "scopeCode": "SCOPE_A", "weight": 3 }]\n}`}
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
      />

      <Button onClick={handlePreview} disabled={!jsonInput.trim() || previewMut.isPending}>
        {previewMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
        Preview Import
      </Button>

      {preview && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Import Preview</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-4 flex-wrap">
              <span>Scopes: <strong>{preview.scopesCount}</strong></span>
              <span>Questions: <strong>{preview.questionsCount}</strong></span>
              <span>Cells: <strong>{preview.cellsCount}</strong></span>
              {preview.dimensionsCount > 0 && <span>Dimensions: <strong>{preview.dimensionsCount}</strong></span>}
              {preview.questionPresentationsCount > 0 && <span>Presentations: <strong>{preview.questionPresentationsCount}</strong></span>}
            </div>
            {preview.warnings.length > 0 && (
              <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-2 space-y-1">
                {preview.warnings.map((w: string, i: number) => (
                  <p key={i} className="text-yellow-600 text-xs flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}</p>
                ))}
              </div>
            )}
            {preview.errors.length > 0 && (
              <div className="rounded border border-red-500/30 bg-red-500/5 p-2 space-y-1">
                {preview.errors.map((e: string, i: number) => (
                  <p key={i} className="text-red-600 text-xs">{e}</p>
                ))}
              </div>
            )}
            {preview.isValid && (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-xs text-muted-foreground">Create a new draft version for this import:</p>
                <div className="flex gap-2">
                  <Input placeholder="Version code" value={commitVersion} onChange={(e) => setCommitVersion(e.target.value)} className="max-w-[200px]" />
                  <Input placeholder="Label" value={commitLabel} onChange={(e) => setCommitLabel(e.target.value)} className="max-w-[300px]" />
                  <Button
                    onClick={() => commitMut.mutate({ workspaceId, importId: preview.importId, newVersion: commitVersion, newLabel: commitLabel })}
                    disabled={!commitVersion.trim() || !commitLabel.trim() || commitMut.isPending}
                  >
                    {commitMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
                    Commit
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
