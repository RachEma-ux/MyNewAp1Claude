/**
 * CatalogModelSelect — Catalog-backed Model selector for app usage.
 *
 * Sources ONLY from Catalog-available Models (active + approved).
 * Does NOT query raw model domain tables.
 */

import { Package } from "lucide-react";
import { useCatalogAvailableModels } from "@/hooks/useCatalogAvailable";
import { CatalogAvailableSelect, type CatalogAvailableSelectProps } from "./CatalogAvailableSelect";

type Props = Omit<CatalogAvailableSelectProps, "options" | "isLoading" | "icon">;

export function CatalogModelSelect(props: Props) {
  const { options, isLoading } = useCatalogAvailableModels();

  return (
    <CatalogAvailableSelect
      options={options}
      isLoading={isLoading}
      icon={Package}
      placeholder="Select Model..."
      showBadge
      {...props}
    />
  );
}
