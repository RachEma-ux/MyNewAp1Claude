/**
 * HrGate — HR role gate for capsule-internal page wrappers.
 *
 * Renders an access-denied stub if the current user lacks the
 * required HR action. The gating logic was previously inlined in
 * `App.tsx`; it now lives inside the HR capsule so the capsule's
 * `mod.tsx` can wire its own gated routes without leaking helpers
 * into the platform shell.
 *
 * Consumes the platform `useHrRole` hook (which remains a shared
 * platform hook because non-module code — MainLayout, HRSideNav —
 * also reads it).
 */

import type { ComponentType, ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { useHrRole } from "@/hooks/useHrRole";

interface HrGateProps {
  action: string;
  children: ReactNode;
}

export function HrGate({ action, children }: HrGateProps) {
  const { can, isLoading } = useHrRole();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!can(action)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">
          You don't have permission to view this HR section.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

/** Wrap an HR page component with role gating. */
export function hrGated(Component: ComponentType, action: string) {
  return function HrGatedPage() {
    return (
      <HrGate action={action}>
        <Component />
      </HrGate>
    );
  };
}
