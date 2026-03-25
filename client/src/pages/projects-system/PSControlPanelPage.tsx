/**
 * PS Control Panel — Quick actions and module health overview
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Activity, ShieldCheck, Zap } from "lucide-react";

export function PSControlPanelPage({ workspaceId }: { workspaceId: number }) {
  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PS Control Panel</h1>
        <Badge variant="outline" className="text-green-600">Healthy</Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-amber-500" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Settings className="w-4 h-4 mr-2" /> Configure Project Templates
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start">
              <ShieldCheck className="w-4 h-4 mr-2" /> Review Project Policies
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Activity className="w-4 h-4 mr-2" /> View Activity Log
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-green-500" />
              Module Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className="text-green-600">Active</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Projects</span>
              <span className="font-medium">0</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last Updated</span>
              <span className="text-muted-foreground text-xs">—</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default PSControlPanelPage;
