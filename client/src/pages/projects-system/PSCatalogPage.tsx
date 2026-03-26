/**
 * PS Catalog — Projects System module landing page
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ClipboardList, Settings, Wand2, List } from "lucide-react";

export function PSCatalogPage() {
  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects System</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="w-5 h-5 text-indigo-500" />
            PS Catalog
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Welcome to the Projects System. Manage project definitions, classifications, and lifecycle from a single control surface.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/ps/control-panel">
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-1.5" /> Control Panel
              </Button>
            </Link>
            <Link href="/ps/wizard">
              <Button variant="outline" size="sm">
                <Wand2 className="w-4 h-4 mr-1.5" /> PS Wizard
              </Button>
            </Link>
            <Link href="/ps/list">
              <Button variant="outline" size="sm">
                <List className="w-4 h-4 mr-1.5" /> PS List
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-indigo-500" />
              </div>
              <span className="text-2xl font-bold">0</span>
            </div>
            <p className="text-xs text-muted-foreground">Active Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Wand2 className="w-4 h-4 text-amber-500" />
              </div>
              <span className="text-2xl font-bold">0</span>
            </div>
            <p className="text-xs text-muted-foreground">Draft Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <List className="w-4 h-4 text-green-500" />
              </div>
              <span className="text-2xl font-bold">0</span>
            </div>
            <p className="text-xs text-muted-foreground">Completed Projects</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default PSCatalogPage;
