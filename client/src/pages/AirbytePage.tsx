import { Activity } from "lucide-react";

export default function AirbytePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12">
          <Activity className="mx-auto h-16 w-16 text-indigo-400 mb-6" />
          <h1 className="text-4xl font-bold text-indigo-400">Airbyte</h1>
          <p className="mt-4 text-lg text-white/60">Coming Soon</p>
          <div className="mt-8 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-6 py-4 text-sm text-white/50">
            Data integration and ELT pipeline management for syncing sources and destinations.
          </div>
        </div>
      </div>
    </div>
  );
}
