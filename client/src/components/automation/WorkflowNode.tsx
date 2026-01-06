import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Settings } from "lucide-react";

export const WorkflowNode = memo(({ data, selected }: NodeProps) => {
  return (
    <div
      className={`
        px-4 py-2 shadow-md rounded-md bg-white border-2 transition-all
        ${selected ? "border-blue-500 shadow-lg" : "border-gray-300"}
        hover:shadow-lg relative group
      `}
      style={{ minWidth: 150 }}
    >
      {/* Top Handle (Target) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-transform"
        style={{ top: -6 }}
      />

      {/* Node Content */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-800">{data.label}</div>
        {/* Config Icon - shown on hover */}
        <Settings className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Bottom Handle (Source) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white hover:!scale-125 transition-transform"
        style={{ bottom: -6 }}
      />
    </div>
  );
});

WorkflowNode.displayName = "WorkflowNode";
