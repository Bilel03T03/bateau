import { TimetableImport } from "../assistant/TimetableImport";
import { QuickAddSheet } from "../layout/QuickAdd";
import { useUI } from "../uiStore";
import { EventEditor } from "./EventEditor";
import { ConflictSheet, DayPlanSheet, MoreSheet, WeekPlanSheet } from "./PlanSheets";
import { SetupSheet } from "./Setup";
import { ExamEditor, GoalEditor, RecurringEditor, ReminderEditor, SleepEditor, SubjectEditor } from "./SimpleEditors";
import { TaskEditor } from "./TaskEditor";

export function EditorHost() {
  const editor = useUI((s) => s.editor);
  if (!editor) return null;
  // La clé force un formulaire neuf quand on passe d'un élément à un autre.
  switch (editor.type) {
    case "event":
      return <EventEditor key={editor.key ?? "new"} eventKey={editor.key} draft={editor.draft} />;
    case "task":
      return <TaskEditor key={editor.id ?? "new"} id={editor.id} draft={editor.draft} />;
    case "exam":
      return <ExamEditor key={editor.id ?? "new"} id={editor.id} draft={editor.draft} />;
    case "goal":
      return <GoalEditor key={editor.id ?? "new"} id={editor.id} draft={editor.draft} />;
    case "reminder":
      return <ReminderEditor key={editor.id ?? "new"} id={editor.id} draft={editor.draft} />;
    case "sleep":
      return <SleepEditor key={editor.id ?? "new"} id={editor.id} date={editor.date} />;
    case "subject":
      return <SubjectEditor key={editor.id ?? "new"} id={editor.id} />;
    case "recurring":
      return <RecurringEditor key={editor.id ?? "new"} id={editor.id} draft={editor.draft} />;
    case "conflict":
      return <ConflictSheet conflict={editor.conflict} />;
    case "dayplan":
      return <DayPlanSheet date={editor.date} />;
    case "weekplan":
      return <WeekPlanSheet />;
    case "timetable":
      return <TimetableImport returnToSetup={editor.returnToSetup} />;
    case "setup":
      return <SetupSheet step={editor.step} />;
    case "quickadd":
      return <QuickAddSheet />;
    case "more":
      return <MoreSheet />;
  }
}
