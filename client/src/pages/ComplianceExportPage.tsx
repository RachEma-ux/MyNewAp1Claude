import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Download, FileText, Shield } from "lucide-react";
import { toast } from "sonner";

export default function ComplianceExportPage() {
  const [framework, setFramework] = useState<string>("SOC2");
  const [format, setFormat] = useState<string>("json");
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split("T")[0]);

  const exportMutation = trpc.agents.exportCompliance.useMutation();

  const handleExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({
        framework,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        format,
      });

      // Download file
      const blob = new Blob([typeof result === "string" ? result : JSON.stringify(result, null, 2)], {
        type: format === "json" ? "application/json" : "text/csv",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-${framework}-${startDate}-${endDate}.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Compliance report exported");
    } catch (error: any) {
      toast.error(`Export failed: ${error.message}`);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="w-8 h-8" />
          Compliance Export
        </h1>
        <p className="text-muted-foreground mt-2">
          Generate attestation reports for SOC2, ISO27001, HIPAA, and GDPR compliance
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Export Configuration</CardTitle>
          <CardDescription>Select framework, date range, and export format</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Framework Selection */}
          <div className="space-y-2">
            <Label htmlFor="framework">Compliance Framework</Label>
            <Select value={framework} onValueChange={setFramework}>
              <SelectTrigger id="framework">
                <SelectValue placeholder="Select framework" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SOC2">SOC 2 Type II</SelectItem>
                <SelectItem value="ISO27001">ISO 27001</SelectItem>
                <SelectItem value="HIPAA">HIPAA</SelectItem>
                <SelectItem value="GDPR">GDPR</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {framework === "SOC2" && "Service Organization Control 2 - Trust Services Criteria"}
              {framework === "ISO27001" && "Information Security Management System"}
              {framework === "HIPAA" && "Health Insurance Portability and Accountability Act"}
              {framework === "GDPR" && "General Data Protection Regulation"}
            </p>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
              />
            </div>
          </div>

          {/* Export Format */}
          <div className="space-y-2">
            <Label htmlFor="format">Export Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger id="format">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON (Structured)</SelectItem>
                <SelectItem value="csv">CSV (Spreadsheet)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Export Button */}
          <Button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="w-full"
            size="lg"
          >
            <Download className="w-4 h-4 mr-2" />
            {exportMutation.isPending ? "Generating Report..." : "Export Compliance Report"}
          </Button>
        </CardContent>
      </Card>

      {/* Report Contents Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Report Contents
          </CardTitle>
          <CardDescription>What's included in the compliance report</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Agent Governance Events</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Agent creation, promotion, and deletion events</li>
                <li>Governance status changes and transitions</li>
                <li>Approval workflow history with timestamps</li>
                <li>Actor attribution for all changes</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Policy Compliance</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Policy version history with change tracking</li>
                <li>Drift detection results and remediation actions</li>
                <li>Compliance rate and violation statistics</li>
                <li>Cosign signature verification records</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Cryptographic Proofs</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Agent spec hashes (SHA-256)</li>
                <li>Policy bundle hashes</li>
                <li>Digital signatures for governed agents</li>
                <li>Proof bundle verification status</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Audit Trail</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Complete chronological event log</li>
                <li>User actions with identity tracking</li>
                <li>System-initiated remediation actions</li>
                <li>SLA compliance metrics</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
