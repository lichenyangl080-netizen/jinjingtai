export type ApplicableJob = {
  id: string;
  date: string;
  state: string;
  applied?: boolean;
  saveBlocked?: boolean;
};

export type JobApplicationErrors = Readonly<Record<string, string>>;

// Keep a local write failure separate from the model job's state. Polling may
// continue to read status and apply other jobs, but retry requires user action.
export function createJobApplicationController() {
  let library = "";
  let errors: JobApplicationErrors = {};
  return {
    get errors() {
      return errors;
    },
    reconcile(libraryId: string, jobs: readonly ApplicableJob[]) {
      const pending = new Set(
        jobs.filter((job) => !job.applied).map((job) => job.id),
      );
      if (library !== libraryId) {
        library = libraryId;
        errors = {};
      } else if (Object.keys(errors).some((id) => !pending.has(id))) {
        errors = Object.fromEntries(
          Object.entries(errors).filter(([id]) => pending.has(id)),
        );
      }
      return errors;
    },
    apply<T>(
      job: ApplicableJob,
      write: (id: string) => T,
      editingDate: string | null,
      retry = false,
    ):
      | { state: "saved"; response: T }
      | { state: "failed"; error: string }
      | { state: "skipped" | "editing" | "blocked" } {
      if (job.state !== "complete" || job.applied) return { state: "skipped" };
      if (job.saveBlocked) return { state: "blocked" };
      if (editingDate === job.date) return { state: "editing" };
      if (errors[job.id] && !retry) return { state: "skipped" };
      try {
        const response = write(job.id);
        if (errors[job.id]) {
          const next = { ...errors };
          delete next[job.id];
          errors = next;
        }
        return { state: "saved", response };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const code =
          message.match(/\b[A-Z][A-Z_]{3,}\b/)?.[0] || "APPLY_FAILED";
        errors = { ...errors, [job.id]: code };
        return { state: "failed", error: code };
      }
    },
  };
}
