import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Webhook, FileUp, Plus } from "lucide-react";
import { useLocation } from "wouter";
import TriggerCreationDialog from "@/components/TriggerCreationDialog";

const triggers = [
  {
    id: "time-trigger",
    name: "Time Trigger",
    icon: Clock,
    description: "Run at specific times or intervals",
    details: "Schedule workflows to run at specific times, intervals, or using cron expressions.",
  },
  {
    id: "webhook-trigger",
    name: "Webhook",
    icon: Webhook,
    description: "Trigger on HTTP webhook",
    details: "Start workflows when an HTTP request is received at your webhook URL.",
  },
  {
    id: "file-upload-trigger",
    name: "File Upload",
    icon: FileUp,
    description: "Trigger when file is uploaded",
    details: "Automatically start workflows when files are uploaded to your workspace.",
  },
];

export default function TriggersStore() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleNewTrigger = () => {
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Triggers Store</h1>
          <p className="text-muted-foreground mt-2">
            Browse and learn about available workflow triggers
          </p>
        </div>
        <Button onClick={handleNewTrigger} size="lg">
          <Plus className="h-5 w-5 mr-2" />
          New Trigger
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {triggers.map((trigger) => {
          const Icon = trigger.icon;
          return (
            <Card key={trigger.id} className="hover:border-primary transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{trigger.name}</CardTitle>
                    <CardDescription className="text-sm">{trigger.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{trigger.details}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TriggerCreationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
