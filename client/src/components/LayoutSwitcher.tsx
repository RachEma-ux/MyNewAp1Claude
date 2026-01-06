/**
 * Layout Switcher Component
 * Allows switching between Chat, Code, and Dashboard layouts
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Code2, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export type LayoutMode = "chat" | "code" | "dashboard";

interface LayoutSwitcherProps {
  currentMode: LayoutMode;
  onModeChange: (mode: LayoutMode) => void;
  className?: string;
}

export function LayoutSwitcher({ currentMode, onModeChange, className }: LayoutSwitcherProps) {
  const modes: Array<{ value: LayoutMode; label: string; icon: any }> = [
    { value: "chat", label: "Chat", icon: MessageSquare },
    { value: "code", label: "Code", icon: Code2 },
    { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  ];

  return (
    <div className={cn("inline-flex rounded-lg border bg-muted p-1", className)}>
      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <Button
            key={mode.value}
            variant={currentMode === mode.value ? "default" : "ghost"}
            size="sm"
            onClick={() => onModeChange(mode.value)}
            className={cn(
              "gap-2",
              currentMode === mode.value && "shadow-sm"
            )}
          >
            <Icon className="h-4 w-4" />
            {mode.label}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Layout Container Component
 * Wraps content with appropriate layout based on mode
 */

interface LayoutContainerProps {
  mode: LayoutMode;
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  header?: React.ReactNode;
}

export function LayoutContainer({ mode, children, sidebar, header }: LayoutContainerProps) {
  switch (mode) {
    case "chat":
      return (
        <div className="flex h-screen flex-col">
          {header && <div className="border-b">{header}</div>}
          <div className="flex flex-1 overflow-hidden">
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </div>
      );

    case "code":
      return (
        <div className="flex h-screen flex-col">
          {header && <div className="border-b">{header}</div>}
          <div className="flex flex-1 overflow-hidden">
            {sidebar && (
              <aside className="w-64 border-r bg-muted/50 overflow-auto">
                {sidebar}
              </aside>
            )}
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </div>
      );

    case "dashboard":
      return (
        <div className="flex h-screen flex-col">
          {header && <div className="border-b">{header}</div>}
          <div className="flex flex-1 overflow-hidden">
            {sidebar && (
              <aside className="w-64 border-r bg-muted/50 overflow-auto">
                {sidebar}
              </aside>
            )}
            <main className="flex-1 overflow-auto p-6">{children}</main>
          </div>
        </div>
      );

    default:
      return <>{children}</>;
  }
}
