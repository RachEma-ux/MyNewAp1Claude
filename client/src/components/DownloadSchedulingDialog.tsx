import { useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Slider } from "./ui/slider";
import { Calendar, Clock, Zap, Download } from "lucide-react";

interface DownloadSchedulingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: {
    id: number;
    displayName: string;
    size: string;
  };
  onConfirm: (options: {
    priority: number;
    scheduledFor?: Date;
    bandwidthLimit?: number;
  }) => void;
}

export function DownloadSchedulingDialog({
  open,
  onOpenChange,
  model,
  onConfirm,
}: DownloadSchedulingDialogProps) {
  const [priority, setPriority] = useState(0);
  const [scheduleType, setScheduleType] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [bandwidthLimit, setBandwidthLimit] = useState<number | undefined>(undefined);
  const [useBandwidthLimit, setUseBandwidthLimit] = useState(false);

  const handleConfirm = () => {
    let scheduledFor: Date | undefined;
    
    if (scheduleType === "scheduled" && scheduledDate && scheduledTime) {
      scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`);
    }

    onConfirm({
      priority,
      scheduledFor,
      bandwidthLimit: useBandwidthLimit ? bandwidthLimit : undefined,
    });

    onOpenChange(false);
  };

  const priorityLabels = ["Low", "Normal", "High", "Urgent"];
  const getPriorityLabel = (value: number) => {
    if (value <= 0) return priorityLabels[0];
    if (value <= 33) return priorityLabels[1];
    if (value <= 66) return priorityLabels[2];
    return priorityLabels[3];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule Download</DialogTitle>
          <DialogDescription>
            Configure download options for <strong>{model.displayName}</strong> ({model.size})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Priority */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Priority
              </Label>
              <span className="text-sm font-medium text-primary">
                {getPriorityLabel(priority)}
              </span>
            </div>
            <Slider
              value={[priority]}
              onValueChange={(values) => setPriority(values[0])}
              max={100}
              step={1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Higher priority downloads start first in the queue
            </p>
          </div>

          {/* Schedule Type */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              When to Download
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={scheduleType === "immediate" ? "default" : "outline"}
                onClick={() => setScheduleType("immediate")}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                Start Now
              </Button>
              <Button
                type="button"
                variant={scheduleType === "scheduled" ? "default" : "outline"}
                onClick={() => setScheduleType("scheduled")}
                className="w-full"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Schedule
              </Button>
            </div>
          </div>

          {/* Scheduled Date/Time */}
          {scheduleType === "scheduled" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Download will start automatically at the scheduled time
              </p>
            </div>
          )}

          {/* Bandwidth Limit */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="bandwidth-toggle">Bandwidth Limit</Label>
              <Button
                type="button"
                variant={useBandwidthLimit ? "default" : "outline"}
                size="sm"
                onClick={() => setUseBandwidthLimit(!useBandwidthLimit)}
              >
                {useBandwidthLimit ? "Enabled" : "Unlimited"}
              </Button>
            </div>

            {useBandwidthLimit && (
              <>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={bandwidthLimit || ""}
                    onChange={(e) => setBandwidthLimit(parseInt(e.target.value) || undefined)}
                    placeholder="1024"
                    min={1}
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground">KB/s</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Limit download speed to reduce network usage
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            {scheduleType === "immediate" ? "Start Download" : "Schedule Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
