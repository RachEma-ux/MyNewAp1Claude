/**
 * PMT Engine — iCal Export Router
 * Generates iCal (.ics) string from tasks with due dates
 */
import { z } from "zod";
import { eq, and, isNotNull } from "drizzle-orm";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule } from "../registry";
import { tasks } from "./schema";

function formatICalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export const icalRouter = router({
  export: protectedProcedure
    .input(z.object({ workspaceId: z.number(), projectId: z.number().optional() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return "";
      const conditions = [
        eq(tasks.workspaceId, input.workspaceId),
        isNotNull(tasks.dueDate),
      ];
      if (input.projectId) conditions.push(eq(tasks.projectId, input.projectId));
      const rows = await db.select().from(tasks).where(and(...conditions));

      const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//PMT Engine//EN",
      ];
      for (const t of rows) {
        if (!t.dueDate) continue;
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:pmt-task-${t.id}@pmt`);
        lines.push(`DTSTART:${formatICalDate(t.dueDate)}`);
        lines.push(`DTEND:${formatICalDate(t.dueDate)}`);
        lines.push(`SUMMARY:${(t.title || "").replace(/\n/g, "\\n")}`);
        if (t.description) lines.push(`DESCRIPTION:${t.description.replace(/\n/g, "\\n").slice(0, 500)}`);
        lines.push(`STATUS:${t.status === "done" ? "COMPLETED" : "NEEDS-ACTION"}`);
        lines.push("END:VEVENT");
      }
      lines.push("END:VCALENDAR");
      return lines.join("\r\n");
    }),
});
