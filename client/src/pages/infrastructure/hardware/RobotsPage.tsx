import { useState } from "react";
import { Bot, Plus, Search, Battery, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

const mockRobots = [
  {
    id: 1,
    name: "WAREHOUSE-BOT-01",
    type: "AMR",
    model: "Fetch Freight 1500",
    status: "active",
    battery: 85,
    tasksCompleted: 142,
    currentTask: "Transporting pallet A3 to Zone 5",
    location: "Warehouse Floor 2",
  },
  {
    id: 2,
    name: "ASSEMBLY-ARM-02",
    type: "Robotic Arm",
    model: "UR10e",
    status: "active",
    battery: null,
    tasksCompleted: 1250,
    currentTask: "Assembly line station 3",
    location: "Production Line A",
  },
  {
    id: 3,
    name: "CLEANING-BOT-03",
    type: "Cleaning Robot",
    model: "Roomba i7+",
    status: "charging",
    battery: 45,
    tasksCompleted: 28,
    currentTask: "Charging at dock",
    location: "Office Floor 1",
  },
  {
    id: 4,
    name: "INSPECTION-DRONE-01",
    type: "Inspection Drone",
    model: "DJI Matrice 300",
    status: "idle",
    battery: 100,
    tasksCompleted: 87,
    currentTask: "Standby",
    location: "Hangar",
  },
];

export default function RobotsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredRobots = mockRobots.filter((robot) => {
    const matchesSearch =
      robot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      robot.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      robot.model.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || robot.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "idle":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "charging":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "error":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "offline":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getBatteryColor = (battery: number | null) => {
    if (battery === null) return "text-muted-foreground";
    if (battery < 20) return "text-red-500";
    if (battery < 50) return "text-yellow-500";
    return "text-green-500";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-8 w-8" />
            Robots
          </h1>
          <p className="text-muted-foreground mt-1">
            Autonomous robots and automated systems
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Robot
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Robots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockRobots.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {mockRobots.filter((r) => r.status === "active").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Tasks Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockRobots.reduce((sum, r) => sum + r.tasksCompleted, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Low Battery</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">
              {mockRobots.filter((r) => r.battery !== null && r.battery < 20).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Robot Fleet</CardTitle>
          <CardDescription>Control interface and task scheduling</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, type, or model..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("all")}
              >
                All
              </Button>
              <Button
                variant={statusFilter === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("active")}
              >
                Active
              </Button>
              <Button
                variant={statusFilter === "idle" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("idle")}
              >
                Idle
              </Button>
            </div>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Robot</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>Tasks Completed</TableHead>
                  <TableHead>Current Task</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRobots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No robots found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRobots.map((robot) => (
                    <TableRow key={robot.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{robot.name}</div>
                          <div className="text-sm text-muted-foreground">{robot.type}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{robot.model}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(robot.status)}>
                          {robot.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {robot.battery !== null ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Battery
                                className={`h-4 w-4 ${getBatteryColor(robot.battery)}`}
                              />
                              <span className={`text-sm font-medium ${getBatteryColor(robot.battery)}`}>
                                {robot.battery}%
                              </span>
                            </div>
                            <Progress value={robot.battery} className="h-1" />
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="font-medium">{robot.tasksCompleted}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {robot.currentTask}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{robot.location}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          Control
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
