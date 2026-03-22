/**
 * CatalogAgentSelect — Catalog-backed Agent selector for app usage.
 *
 * Sources ONLY from Catalog-available Agents (active + approved).
 * Does NOT query raw agent domain tables.
 */

import { Workflow } from "lucide-react";
import { useCatalogAvailableAgents } from "@/hooks/useCatalogAvailable";
import { CatalogAvailableSelect, type CatalogAvailableSelectProps } from "./CatalogAvailableSelect";

type Props = Omit<CatalogAvailableSelectProps, "options" | "isLoading" | "icon">;

export function CatalogAgentSelect(props: Props) {
  const { options, isLoading } = useCatalogAvailableAgents();

  return (
    <CatalogAvailableSelect
      options={options}
      isLoading={isLoading}
      icon={Workflow}
      placeholder="Select Agent..."
      showBadge
      {...props}
    />
  );
}
