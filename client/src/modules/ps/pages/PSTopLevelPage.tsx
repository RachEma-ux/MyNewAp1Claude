/**
 * PS Top-Level Page — Standalone PS page accessible from the main hamburger menu
 *
 * Renders the appropriate PS sub-page based on the URL item parameter.
 */
import { useParams } from "wouter";
import { PSCatalogPage } from "./PSCatalogPage";
import { PSControlPanelPage } from "./PSControlPanelPage";
import PSWizardPage from "./PSWizardPage";
import { PSListPage } from "./PSListPage";
import { PSIdeationPage } from "./PSIdeationPage";


export function PSTopLevelPage() {
  const { item } = useParams<{ item?: string }>();
  switch (item) {
    case "control-panel": return <PSControlPanelPage />;
    case "wizard": return <PSWizardPage />;
    case "list": return <PSListPage />;
    case "ideation": return <PSIdeationPage />;
    case "catalog":
    default: return <PSCatalogPage />;
  }
}

export default PSTopLevelPage;
