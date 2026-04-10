import KGIAShell from "@/components/kgia/KGIAShell";

export default function KGIAShellPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <KGIAShell />
    </div>
  );
}
