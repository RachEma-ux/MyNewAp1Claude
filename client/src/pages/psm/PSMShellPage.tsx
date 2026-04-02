import PSMShell from "@/components/psm/PSMShell";

export default function PSMShellPage() {
  return (
    <div className="flex -mx-6 -mt-6 overflow-hidden" style={{ height: "calc(100vh - 4rem)" }}>
      <PSMShell />
    </div>
  );
}
