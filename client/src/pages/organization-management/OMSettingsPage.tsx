/**
 * OM Settings — Module settings with internal tab navigation
 *
 * Tabs:
 * - General: Module info + feature flags (original content)
 * - Wizard: Alignment matrix version management + matrix editor
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Settings2, Wand2 } from "lucide-react";
import { OMWizardSettingsPage } from "./settings/OMWizardSettingsPage";
import { OMStructureTypesMatrixPage } from "./settings/OMStructureTypesMatrixPage";

type SettingsTab = "general" | "wizard" | "matrix";

export function OMSettingsPage({ workspaceId }: { workspaceId: number }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [matrixVersionId, setMatrixVersionId] = useState<number | null>(null);

  const settings = trpc.organizationManagement.settings.get.useQuery({ workspaceId });
  const features = settings.data?.features ?? {};
  const featureEntries = Object.entries(features) as [string, boolean][];

  function handleNavigateToMatrix(versionId: number) {
    setMatrixVersionId(versionId);
    setActiveTab("matrix");
  }

  function handleBackFromMatrix() {
    setActiveTab("wizard");
    setMatrixVersionId(null);
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Settings2 className="w-4 h-4" /> },
    { id: "wizard", label: "Wizard", icon: <Wand2 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">OM Settings</h1>

      {/* Tab navigation */}
      {activeTab !== "matrix" && (
        <div className="flex gap-1 border-b pb-0">
          {tabs.map(tab => (
            <Button
              key={tab.id}
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-b-none gap-1.5 ${activeTab === tab.id ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
            >
              {tab.icon} {tab.label}
            </Button>
          ))}
        </div>
      )}

      {/* General tab */}
      {activeTab === "general" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                Module Info
                <Badge variant="outline">{settings.data?.version ?? "..."}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Module: <span className="font-medium text-foreground">{settings.data?.module?.toUpperCase() ?? "OM"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Feature Flags</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {featureEntries.map(([key, enabled]) => (
                <div key={key} className="flex items-center justify-between py-1 text-sm">
                  <span className="capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                  {enabled ? (
                    <Badge variant="default" className="text-xs gap-1"><CheckCircle className="w-3 h-3" /> Enabled</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs gap-1"><XCircle className="w-3 h-3" /> Disabled</Badge>
                  )}
                </div>
              ))}
              {featureEntries.length === 0 && <p className="text-sm text-muted-foreground">Loading settings...</p>}
            </CardContent>
          </Card>
        </>
      )}

      {/* Wizard tab */}
      {activeTab === "wizard" && (
        <OMWizardSettingsPage workspaceId={workspaceId} onNavigateToMatrix={handleNavigateToMatrix} />
      )}

      {/* Matrix editor (sub-view of wizard tab) */}
      {activeTab === "matrix" && matrixVersionId && (
        <OMStructureTypesMatrixPage workspaceId={workspaceId} matrixVersionId={matrixVersionId} onBack={handleBackFromMatrix} />
      )}
    </div>
  );
}

export default OMSettingsPage;
