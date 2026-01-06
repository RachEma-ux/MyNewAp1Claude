import { useState } from "react";
import { AlertTriangle, CheckCircle2, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

export interface PolicyReloadResult {
  policyHash: string;
  reloadedAt: string;
  invalidatedAgents: number;
  restrictedAgents: number;
  validAgents: number;
}

interface PolicyHotReloadBannerProps {
  result: PolicyReloadResult | null;
  onDismiss: () => void;
}

export function PolicyHotReloadBanner({ result, onDismiss }: PolicyHotReloadBannerProps) {
  const [, setLocation] = useLocation();

  if (!result) return null;

  const totalAffected = result.invalidatedAgents + result.restrictedAgents;
  const hasIssues = totalAffected > 0;

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl ${
        hasIssues ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200"
      } border rounded-lg shadow-lg p-4`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {hasIssues ? (
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className={`font-semibold ${hasIssues ? "text-orange-900" : "text-green-900"}`}>
              Policy Hot Reload Complete
            </h3>
            <Badge variant="outline" className="font-mono text-xs">
              {result.policyHash.substring(0, 8)}...
            </Badge>
          </div>

          <p className={`text-sm mb-3 ${hasIssues ? "text-orange-800" : "text-green-800"}`}>
            {hasIssues
              ? `${totalAffected} agent${totalAffected !== 1 ? "s" : ""} affected by policy changes`
              : `All ${result.validAgents} agent${result.validAgents !== 1 ? "s" : ""} remain valid`}
          </p>

          {/* Stats */}
          {hasIssues && (
            <div className="flex flex-wrap gap-3 mb-3">
              {result.invalidatedAgents > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="destructive" className="text-xs">
                    {result.invalidatedAgents}
                  </Badge>
                  <span className="text-orange-700">Invalidated</span>
                </div>
              )}
              {result.restrictedAgents > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-300">
                    {result.restrictedAgents}
                  </Badge>
                  <span className="text-orange-700">Restricted</span>
                </div>
              )}
              {result.validAgents > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                    {result.validAgents}
                  </Badge>
                  <span className="text-orange-700">Still Valid</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={hasIssues ? "border-orange-300 hover:bg-orange-100" : "border-green-300 hover:bg-green-100"}
              onClick={() => {
                setLocation("/agents");
                onDismiss();
              }}
            >
              <ExternalLink className="w-3 h-3 mr-1.5" />
              View Agents
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={hasIssues ? "border-orange-300 hover:bg-orange-100" : "border-green-300 hover:bg-green-100"}
              onClick={() => {
                setLocation("/policies");
                onDismiss();
              }}
            >
              View Policy
            </Button>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onDismiss}
          className={`flex-shrink-0 p-1 rounded hover:bg-opacity-20 ${
            hasIssues ? "hover:bg-orange-900" : "hover:bg-green-900"
          }`}
        >
          <X className={`w-4 h-4 ${hasIssues ? "text-orange-600" : "text-green-600"}`} />
        </button>
      </div>
    </div>
  );
}

// Hook for managing banner state
export function usePolicyReloadBanner() {
  const [result, setResult] = useState<PolicyReloadResult | null>(null);

  const showBanner = (reloadResult: PolicyReloadResult) => {
    setResult(reloadResult);
  };

  const dismissBanner = () => {
    setResult(null);
  };

  return {
    result,
    showBanner,
    dismissBanner,
  };
}
