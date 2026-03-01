/**
 * PmCentralSidebarLayout — Simple flex layout for sidebar + main content
 *
 * The sidebar component itself manages its own collapsed/expanded state.
 */

interface PmCentralSidebarLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export default function PmCentralSidebarLayout({ sidebar, children }: PmCentralSidebarLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] -mx-6 -mt-6">
      {/* Sidebar (manages its own collapse) */}
      {sidebar}

      {/* Main content area */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
