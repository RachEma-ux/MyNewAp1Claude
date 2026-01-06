/**
 * Creation Hub Landing Page
 * 
 * Entry point for agent creation with 7 creation modes
 */

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  FileText,
  Edit3,
  Copy,
  Workflow,
  MessageSquare,
  Zap,
  Upload,
  Clock,
} from "lucide-react";
import { useNavigate } from "wouter";

export interface CreationMode {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  badge?: string;
}

const creationModes: CreationMode[] = [
  {
    id: "template",
    title: "From Template",
    description: "Start with a pre-built agent template (Data Analyst, Support, Reviewer)",
    icon: <FileText className="w-6 h-6" />,
    path: "/agents/create/template",
    badge: "Recommended",
  },
  {
    id: "scratch",
    title: "From Scratch",
    description: "Manually configure all agent settings and capabilities",
    icon: <Edit3 className="w-6 h-6" />,
    path: "/agents/create/scratch",
  },
  {
    id: "clone",
    title: "Clone Existing",
    description: "Fork an existing agent and modify it",
    icon: <Copy className="w-6 h-6" />,
    path: "/agents/create/clone",
  },
  {
    id: "workflow",
    title: "From Workflow",
    description: "Generate agent from workflow automation step",
    icon: <Workflow className="w-6 h-6" />,
    path: "/agents/create/workflow",
  },
  {
    id: "conversation",
    title: "From Conversation",
    description: "Extract agent intent from conversation history",
    icon: <MessageSquare className="w-6 h-6" />,
    path: "/agents/create/conversation",
    badge: "AI-Powered",
  },
  {
    id: "event",
    title: "From Event Trigger",
    description: "Create event-driven agent from trigger conditions",
    icon: <Zap className="w-6 h-6" />,
    path: "/agents/create/event",
  },
  {
    id: "import",
    title: "Import Spec",
    description: "Upload agent specification (JSON/YAML)",
    icon: <Upload className="w-6 h-6" />,
    path: "/agents/create/import",
  },
];

export function CreationHub() {
  const [, navigate] = useNavigate();

  // Load incomplete drafts
  const drafts = []; // TODO: Load from backend

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create Agent</h1>
        <p className="text-muted-foreground">
          Choose how you'd like to create your agent
        </p>
      </div>

      {/* Resume Drafts */}
      {drafts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Resume Draft
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map((draft: any) => (
              <Card
                key={draft.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => navigate(`/agents/create/resume/${draft.id}`)}
              >
                <CardHeader>
                  <CardTitle className="text-lg">{draft.name || "Untitled"}</CardTitle>
                  <CardDescription>
                    Last edited {new Date(draft.updatedAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Creation Modes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {creationModes.map((mode) => (
          <Card
            key={mode.id}
            className="cursor-pointer hover:border-primary transition-colors relative"
            onClick={() => navigate(mode.path)}
          >
            {mode.badge && (
              <div className="absolute top-3 right-3">
                <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                  {mode.badge}
                </span>
              </div>
            )}
            <CardHeader>
              <div className="mb-4 text-primary">{mode.icon}</div>
              <CardTitle className="text-lg">{mode.title}</CardTitle>
              <CardDescription>{mode.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
