/**
 * CatalogBotSelect — Catalog-backed Bot selector for app usage.
 *
 * Sources ONLY from Catalog-available Bots (active + approved).
 * Does NOT query raw bot domain tables.
 */

import { Bot } from "lucide-react";
import { useCatalogAvailableBots } from "@/hooks/useCatalogAvailable";
import { CatalogAvailableSelect, type CatalogAvailableSelectProps } from "./CatalogAvailableSelect";

type Props = Omit<CatalogAvailableSelectProps, "options" | "isLoading" | "icon">;

export function CatalogBotSelect(props: Props) {
  const { options, isLoading } = useCatalogAvailableBots();

  return (
    <CatalogAvailableSelect
      options={options}
      isLoading={isLoading}
      icon={Bot}
      placeholder="Select Bot..."
      showBadge
      {...props}
    />
  );
}
