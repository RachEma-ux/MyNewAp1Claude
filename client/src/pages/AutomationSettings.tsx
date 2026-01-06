import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Clock } from "lucide-react";

export default function AutomationSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Automation Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure automation preferences and defaults
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>Coming Soon</CardTitle>
              <CardDescription>Automation settings will be available soon</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>We're working on bringing you powerful automation configuration options.</span>
          </div>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>Upcoming features:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Default execution timeout settings</li>
              <li>Retry policies and error handling</li>
              <li>Notification preferences</li>
              <li>Workflow execution limits</li>
              <li>API rate limiting configuration</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
