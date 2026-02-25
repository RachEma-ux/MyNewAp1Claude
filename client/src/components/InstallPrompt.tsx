import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    setInstalling(true);
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
    setInstalling(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-indigo-500/30 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-sm">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-zinc-400 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-indigo-600">
          <Download className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Install MyNewApp</p>
          <p className="text-xs text-zinc-400">Add to home screen for quick access</p>
        </div>
        <Button
          size="sm"
          onClick={handleInstall}
          disabled={installing}
          className="bg-indigo-600 hover:bg-indigo-500"
        >
          {installing ? "..." : "Install"}
        </Button>
      </div>
    </div>
  );
}
