import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Zap, Mail, Code, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ActionCreationDialog from "@/components/ActionCreationDialog";
import { useState } from "react";

const actions = [
  {
    id: "database-action",
    name: "Database Query",
    icon: Database,
    description: "Query or update database",
    details: "Execute SQL queries, insert, update, or delete records in your database.",
  },
  {
    id: "ai-action",
    name: "AI Processing",
    icon: Zap,
    description: "Process with AI agent",
    details: "Use AI agents to analyze data, generate content, or make intelligent decisions.",
  },
  {
    id: "email-action",
    name: "Send Email",
    icon: Mail,
    description: "Send email notification",
    details: "Send automated emails with custom templates and dynamic content.",
  },
  {
    id: "code-action",
    name: "Run Code",
    icon: Code,
    description: "Execute custom JavaScript",
    details: "Run custom JavaScript code to transform data or perform complex operations.",
  },
  {
    id: "chat-action",
    name: "Send Message",
    icon: MessageSquare,
    description: "Send chat message",
    details: "Send messages to chat channels, Slack, Discord, or other messaging platforms.",
  },
];

export default function ActionsStore() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Actions Store</h1>
          <p className="text-muted-foreground mt-2">
            Browse and learn about available workflow actions
          </p>
        </div>
        <Button size="lg" onClick={() => setDialogOpen(true)}>
          <Plus className="h-5 w-5 mr-2" />
          New Action
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Card key={action.id} className="hover:border-primary transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{action.name}</CardTitle>
                    <CardDescription className="text-sm">{action.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{action.details}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ActionCreationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
