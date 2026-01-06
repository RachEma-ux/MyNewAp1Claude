import { useParams } from "wouter";
import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import MobilesPage from "./hardware/MobilesPage";
import PersonalComputersPage from "./hardware/PersonalComputersPage";
import ServersPage from "./hardware/ServersPage";
import CensorsPage from "./hardware/CensorsPage";
import MachinesPage from "./hardware/MachinesPage";
import RobotsPage from "./hardware/RobotsPage";

export default function HardwarePage() {
  const params = useParams<{ category?: string }>();
  const category = params.category || "hardware";
  
  // Route to specific hardware pages
  switch (category) {
    case "mobiles":
      return <MobilesPage />;
    case "pcs":
      return <PersonalComputersPage />;
    case "servers":
      return <ServersPage />;
    case "censors":
      return <CensorsPage />;
    case "machines":
      return <MachinesPage />;
    case "robots":
      return <RobotsPage />;
    default:
      return <ComingSoonPage category={category} />;
  }
}

function ComingSoonPage({ category }: { category: string }) {
  const categoryNames: Record<string, string> = {
    servers: "Servers",
    censors: "Censors",
    machines: "Machines",
    robots: "Robots",
  };

  const displayName = categoryNames[category] || category;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Hardware: {displayName}</h1>
        <p className="text-muted-foreground">
          Infrastructure management for {displayName.toLowerCase()}
        </p>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Construction className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground text-center">
            {displayName} management features are currently under development.
            <br />
            Check back soon for updates!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
