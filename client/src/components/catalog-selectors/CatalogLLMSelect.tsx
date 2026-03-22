/**
 * CatalogLLMSelect — Catalog-backed LLM selector for app usage.
 *
 * Sources ONLY from Catalog-available LLMs (active + approved).
 * Does NOT query raw LLM domain tables.
 */

import { Brain } from "lucide-react";
import { useCatalogAvailableLLMs } from "@/hooks/useCatalogAvailable";
import { CatalogAvailableSelect, type CatalogAvailableSelectProps } from "./CatalogAvailableSelect";

type Props = Omit<CatalogAvailableSelectProps, "options" | "isLoading" | "icon">;

export function CatalogLLMSelect(props: Props) {
  const { options, isLoading } = useCatalogAvailableLLMs();

  return (
    <CatalogAvailableSelect
      options={options}
      isLoading={isLoading}
      icon={Brain}
      placeholder="Select LLM..."
      showBadge
      {...props}
    />
  );
}
