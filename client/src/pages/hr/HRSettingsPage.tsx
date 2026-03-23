/**
 * HR Settings Page — Module configuration and feature flags
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Settings } from "lucide-react";
import { Link } from "wouter";

export default function HRSettingsPage() {
  const settingsQuery = trpc.hr.settings.get.useQuery();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">HR Settings</h1>
        <Link href="/hr"><Button variant="outline" size="sm">Back to HR</Button></Link>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <span className="font-medium">Module: {settingsQuery.data?.module}</span>
            <Badge variant="outline">v{settingsQuery.data?.version}</Badge>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Feature Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {settingsQuery.data?.features && Object.entries(settingsQuery.data.features).map(([key, enabled]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <Badge variant={enabled ? "default" : "outline"} className="text-xs">
                    {enabled ? "ON" : "OFF"}
                  </Badge>
                  <span className="capitalize">{key}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
