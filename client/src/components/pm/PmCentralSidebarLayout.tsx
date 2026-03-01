/**
 * PmCentralSidebarLayout — Handles collapsed/expanded sidebar + main content
 *
 * Wraps the project sidebar and the active content panel.
 * Provides a toggle to collapse the sidebar for more content space.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface PmCentralSidebarLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export default function PmCentralSidebarLayout({ sidebar, children }: PmCentralSidebarLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -mx-6 -mt-6">
      {/* Sidebar */}
      {!collapsed && sidebar}

      {/* Main content area */}
      <div className="flex-1 overflow-auto relative">
        {/* Collapse/expand toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 left-2 z-10 h-7 w-7 p-0"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>

        <div className={`p-6 ${collapsed ? "pl-12" : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
