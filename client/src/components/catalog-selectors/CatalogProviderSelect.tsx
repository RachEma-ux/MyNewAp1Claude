/**
 * CatalogProviderSelect — Catalog-backed Provider selector for app usage.
 *
 * Sources ONLY from Catalog-available Providers (active + approved).
 * Does NOT query raw provider domain tables.
 */

import { Server } from "lucide-react";
import { useCatalogAvailableProviders } from "@/hooks/useCatalogAvailable";
import { CatalogAvailableSelect, type CatalogAvailableSelectProps } from "./CatalogAvailableSelect";

type Props = Omit<CatalogAvailableSelectProps, "options" | "isLoading" | "icon">;

export function CatalogProviderSelect(props: Props) {
  const { options, isLoading } = useCatalogAvailableProviders();

  return (
    <CatalogAvailableSelect
      options={options}
      isLoading={isLoading}
      icon={Server}
      placeholder="Select Provider..."
      showBadge
      {...props}
    />
  );
}
