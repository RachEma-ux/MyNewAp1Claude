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
    <div className="flex -mx-6 -mt-6 overflow-hidden" style={{ height: "calc(100vh - 4rem)" }}>
      {/* Sidebar (manages its own collapse) */}
      {sidebar}

      {/* Main content area — scrolls independently from sidebar */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
