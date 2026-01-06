# Agent Governance - Missing UI Implementation Guide

**Status**: 5 UI components need implementation  
**Estimated Effort**: 2-3 days for complete implementation

---

## Overview

This guide provides step-by-step instructions for implementing the 5 missing UI components that have backend support but lack frontend integration.

---

## 1. DriftDetectionPage.tsx (HIGH PRIORITY)

### Purpose
Detect configuration drift across agents and suggest remediation

### Backend Procedures
- `trpc.agents.detectAllDrift()` - Scan all agents for drift
- `trpc.agents.runDriftDetection({ agentId })` - Scan specific agent

### Implementation Steps

#### Step 1: Create Component File
```bash
touch client/src/pages/DriftDetectionPage.tsx
```

#### Step 2: Component Structure
```typescript
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";

export default function DriftDetectionPage() {
  const [driftResults, setDriftResults] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // Mutations
  const detectAllMutation = trpc.agents.detectAllDrift.useMutation({
    onSuccess: (results) => {
      setDriftResults(results);
      setIsScanning(false);
    },
  });

  const runDetectionMutation = trpc.agents.runDriftDetection.useMutation({
    onSuccess: (result) => {
      // Update specific agent result
    },
  });

  const handleScanAll = async () => {
    setIsScanning(true);
    await detectAllMutation.mutateAsync();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Drift Detection</h1>
        <Button onClick={handleScanAll} disabled={isScanning}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {isScanning ? "Scanning..." : "Scan All Agents"}
        </Button>
      </div>

      {/* Drift Results Grid */}
      <div className="grid gap-4">
        {driftResults.map((result) => (
          <Card key={result.agentId} className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{result.agentName}</h3>
                <p className="text-sm text-gray-500">{result.driftType}</p>
              </div>
              <Badge variant={result.hasDrift ? "destructive" : "default"}>
                {result.hasDrift ? "Drift Detected" : "No Drift"}
              </Badge>
            </div>
            {result.changes && (
              <div className="mt-4 space-y-2">
                {result.changes.map((change: any, idx: number) => (
                  <div key={idx} className="text-sm bg-gray-50 p-2 rounded">
                    <span className="font-mono">{change.field}</span>: {change.oldValue} → {change.newValue}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
```

#### Step 3: Add Route to App.tsx
```typescript
import DriftDetectionPage from "@/pages/DriftDetectionPage";

// In routes array:
{
  path: "/agents/drift",
  component: DriftDetectionPage,
}
```

#### Step 4: Add Navigation Link
In `MainLayout.tsx`, add to Agents menu:
```typescript
{
  label: "Drift Detection",
  href: "/agents/drift",
  icon: AlertTriangle,
}
```

### Expected Backend Response
```typescript
{
  agentId: number;
  agentName: string;
  hasDrift: boolean;
  driftType: "configuration" | "policy" | "capability";
  changes: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  severity: "low" | "medium" | "high";
}[]
```

---

## 2. ToolsManagementPage.tsx (MEDIUM PRIORITY)

### Purpose
View available tools and manage tool access for agents

### Backend Procedure
- `trpc.agents.listTools()` - Get all available tools

### Implementation Steps

#### Step 1: Create Component
```bash
touch client/src/pages/ToolsManagementPage.tsx
```

#### Step 2: Component Structure
```typescript
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, Shield } from "lucide-react";

export default function ToolsManagementPage() {
  const { data: tools = [], isLoading } = trpc.agents.listTools.useQuery();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Available Tools</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool: any) => (
          <Card key={tool.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <Wrench className="h-5 w-5 text-blue-500 mt-1" />
                <div>
                  <h3 className="font-semibold">{tool.name}</h3>
                  <p className="text-sm text-gray-600">{tool.description}</p>
                </div>
              </div>
              <Badge variant={tool.isRestricted ? "destructive" : "default"}>
                {tool.isRestricted ? "Restricted" : "Available"}
              </Badge>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              <p>Category: {tool.category}</p>
              <p>Risk Level: {tool.riskLevel}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

#### Step 3: Add Route and Navigation
```typescript
// In App.tsx
import ToolsManagementPage from "@/pages/ToolsManagementPage";
{
  path: "/agents/tools",
  component: ToolsManagementPage,
}

// In MainLayout.tsx Agents menu
{
  label: "Tools",
  href: "/agents/tools",
  icon: Wrench,
}
```

### Expected Backend Response
```typescript
{
  id: string;
  name: string;
  description: string;
  category: string;
  riskLevel: "low" | "medium" | "high";
  isRestricted: boolean;
  requiredCapabilities: string[];
  usageCount: number;
}[]
```

---

## 3. ComplianceExportPage.tsx (MEDIUM PRIORITY)

### Purpose
Export compliance reports in multiple formats

### Backend Procedure
- `trpc.agents.exportCompliance(config)` - Export compliance data

### Implementation Steps

#### Step 1: Create Component
```bash
touch client/src/pages/ComplianceExportPage.tsx
```

#### Step 2: Component Structure
```typescript
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, FileJson, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ComplianceExportPage() {
  const { toast } = useToast();
  const [exportFormat, setExportFormat] = useState<"json" | "csv" | "pdf">("json");
  const [isExporting, setIsExporting] = useState(false);

  const exportMutation = trpc.agents.exportCompliance.useMutation({
    onSuccess: (data) => {
      // Trigger download
      const blob = new Blob([data], { type: "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-report-${new Date().toISOString()}.${exportFormat}`;
      a.click();
      
      toast({ title: "Export successful" });
      setIsExporting(false);
    },
    onError: (error) => {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
      setIsExporting(false);
    },
  });

  const handleExport = async () => {
    setIsExporting(true);
    await exportMutation.mutateAsync({ format: exportFormat });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Compliance Export</h1>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Export Format</h2>
        <div className="space-y-3">
          {["json", "csv", "pdf"].map((format) => (
            <label key={format} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="format"
                value={format}
                checked={exportFormat === format}
                onChange={(e) => setExportFormat(e.target.value as any)}
              />
              <span className="capitalize">{format}</span>
            </label>
          ))}
        </div>
      </Card>

      <Button onClick={handleExport} disabled={isExporting} size="lg">
        <Download className="mr-2 h-4 w-4" />
        {isExporting ? "Exporting..." : "Export Compliance Report"}
      </Button>
    </div>
  );
}
```

#### Step 3: Add Route and Navigation
```typescript
// In App.tsx
import ComplianceExportPage from "@/pages/ComplianceExportPage";
{
  path: "/agents/compliance-export",
  component: ComplianceExportPage,
}

// In PolicyManagement.tsx, add button
<Button onClick={() => setLocation("/agents/compliance-export")}>
  <Download className="mr-2 h-4 w-4" />
  Export Compliance
</Button>
```

---

## 4. AutoRemediationPage.tsx (MEDIUM PRIORITY)

### Purpose
Configure and run automatic remediation for policy violations

### Backend Procedure
- `trpc.agents.autoRemediate(config)` - Run auto-remediation

### Implementation Steps

#### Step 1: Create Component
```bash
touch client/src/pages/AutoRemediationPage.tsx
```

#### Step 2: Component Structure
```typescript
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AutoRemediationPage() {
  const { toast } = useToast();
  const [remediationResults, setRemediationResults] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const remediateMutation = trpc.agents.autoRemediate.useMutation({
    onSuccess: (results) => {
      setRemediationResults(results);
      toast({ title: "Remediation completed" });
      setIsRunning(false);
    },
    onError: (error) => {
      toast({ title: "Remediation failed", description: error.message, variant: "destructive" });
      setIsRunning(false);
    },
  });

  const handleRunRemediation = async () => {
    setIsRunning(true);
    await remediateMutation.mutateAsync({
      scope: "all",
      dryRun: false,
      autoApprove: false,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Auto-Remediation</h1>
        <Button onClick={handleRunRemediation} disabled={isRunning} variant="destructive">
          <Zap className="mr-2 h-4 w-4" />
          {isRunning ? "Running..." : "Run Remediation"}
        </Button>
      </div>

      {remediationResults.length > 0 && (
        <div className="space-y-4">
          {remediationResults.map((result) => (
            <Card key={result.agentId} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{result.agentName}</h3>
                  <p className="text-sm text-gray-600">{result.violation}</p>
                </div>
                <Badge variant={result.success ? "default" : "destructive"}>
                  {result.success ? "Fixed" : "Failed"}
                </Badge>
              </div>
              {result.action && (
                <div className="mt-2 text-sm bg-blue-50 p-2 rounded">
                  <p className="font-mono">{result.action}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 5. AgentTemplatesPage.tsx (LOW PRIORITY)

### Purpose
Browse and deploy pre-built agent templates

### Backend Procedure
- `trpc.agents.deployTemplate(templateId)` - Deploy template

### Implementation Steps

#### Step 1: Create Component
```bash
touch client/src/pages/AgentTemplatesPage.tsx
```

#### Step 2: Component Structure
```typescript
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AgentTemplatesPage() {
  const { toast } = useToast();
  const [templates] = useState([
    {
      id: "1",
      name: "Data Analyst",
      description: "Analyze data and generate insights",
      roleClass: "analyst",
      tools: ["database", "analytics"],
      complexity: "medium",
    },
    {
      id: "2",
      name: "Code Reviewer",
      description: "Review code and suggest improvements",
      roleClass: "reviewer",
      tools: ["code-analysis"],
      complexity: "high",
    },
  ]);

  const deployMutation = trpc.agents.deployTemplate.useMutation({
    onSuccess: () => {
      toast({ title: "Template deployed successfully" });
    },
    onError: (error) => {
      toast({ title: "Deployment failed", description: error.message, variant: "destructive" });
    },
  });

  const handleDeploy = async (templateId: string) => {
    await deployMutation.mutateAsync({ templateId });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Agent Templates</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="p-4">
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">{template.name}</h3>
              <p className="text-sm text-gray-600">{template.description}</p>
              <div className="flex gap-2">
                <Badge>{template.roleClass}</Badge>
                <Badge variant="outline">{template.complexity}</Badge>
              </div>
              <Button onClick={() => handleDeploy(template.id)} className="w-full">
                <Zap className="mr-2 h-4 w-4" />
                Deploy Template
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

---

## Implementation Priority

### Phase 1 (This Week)
1. ✅ DriftDetectionPage - High impact, frequently used
2. ✅ ComplianceExportPage - Required for compliance workflows

### Phase 2 (Next Week)
3. ✅ AutoRemediationPage - Automation feature
4. ✅ ToolsManagementPage - Reference/documentation

### Phase 3 (Later)
5. ✅ AgentTemplatesPage - Nice-to-have feature

---

## Testing Checklist

For each component, verify:
- [ ] Component renders without errors
- [ ] tRPC procedures are called correctly
- [ ] Loading states display properly
- [ ] Error handling works
- [ ] Results display correctly
- [ ] Navigation works
- [ ] Mobile responsive
- [ ] Accessibility (keyboard navigation, screen readers)

---

## Summary

| Component | Status | Priority | Effort | Impact |
|-----------|--------|----------|--------|--------|
| DriftDetectionPage | ⏳ Pending | High | 2h | High |
| ComplianceExportPage | ⏳ Pending | High | 2h | High |
| AutoRemediationPage | ⏳ Pending | Medium | 2h | Medium |
| ToolsManagementPage | ⏳ Pending | Medium | 1h | Low |
| AgentTemplatesPage | ⏳ Pending | Low | 1h | Low |

**Total Estimated Effort**: 8 hours  
**Recommended Timeline**: 2-3 days with testing

---

**Last Updated**: January 4, 2026
