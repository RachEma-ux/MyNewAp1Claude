/**
 * Data Acquisition — navigation entries.
 *
 * Subdomain navigation under the Data Analysis group. Document
 * Intelligence is exposed as one item among many — it is not the
 * subdomain root.
 */

import type { ClientModuleNav } from "@/platform/modules/types";

export const dataAcquisitionNav: ClientModuleNav[] = [
  {
    group: "dataAnalysis",
    label: "Data Acquisition",
    icon: "Database",
    order: 10,
  },
];
