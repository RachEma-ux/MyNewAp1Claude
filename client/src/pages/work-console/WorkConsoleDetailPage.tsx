/**
 * AI Work Console — Detail Page
 *
 * Renders the status bar + center tab workspace for a specific job.
 * Shell owns the polling query (`trpc.orchestrator.getJob`), passes
 * the live job data + active tab into this page.
 */
import WorkConsoleCenterTabs from "@/components/work-console/WorkConsoleCenterTabs";
import WorkConsoleStatusBar from "@/components/work-console/WorkConsoleStatusBar";

interface Props {
  jobId: string;
  job: any | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function WorkConsoleDetailPage({
  jobId,
  job,
  activeTab,
  onTabChange,
}: Props) {
  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <WorkConsoleStatusBar job={job} />
      <WorkConsoleCenterTabs
        jobId={jobId}
        job={job}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
    </div>
  );
}
