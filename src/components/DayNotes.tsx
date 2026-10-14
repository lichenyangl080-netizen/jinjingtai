import { PencilSimple } from "@phosphor-icons/react";
import { Action } from "./Controls";
import type { DayNote } from "../model";

export type NoteEdit = { lesson: string; tomorrow: string; original: string };
export function DayNotes({
  notes,
  edit,
  onBegin,
  onChange,
  onCancel,
  onSave,
}: {
  notes: DayNote;
  edit: NoteEdit | null;
  onBegin: () => void;
  onChange: (edit: NoteEdit) => void;
  onCancel: () => void;
  onSave: () => boolean;
}) {
  return (
    <section className="review-notes">
      <div className="notes-toolbar">
        <span>本日回顾</span>
        {!edit && (
          <button className="text-button" onClick={onBegin}>
            <PencilSimple />
            编辑回顾
          </button>
        )}
      </div>
      <div className="day-notes">
        {(["lesson", "tomorrow"] as const).map((key) => (
          <section key={key}>
            <h3>{key === "lesson" ? "今日所得" : "留给明天"}</h3>
            {edit ? (
              <textarea
                aria-label={key === "lesson" ? "今日所得" : "留给明天"}
                autoFocus={key === "lesson"}
                value={edit[key]}
                onChange={(event) =>
                  onChange({ ...edit, [key]: event.target.value })
                }
              />
            ) : notes[key] ? (
              <p>{notes[key]}</p>
            ) : null}
          </section>
        ))}
      </div>
      {edit && (
        <div className="form-actions">
          <button className="text-button" onClick={onCancel}>
            取消
          </button>
          <Action onClick={onSave}>保存回顾</Action>
        </div>
      )}
    </section>
  );
}
