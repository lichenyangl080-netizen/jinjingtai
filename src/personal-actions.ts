import type { Store } from "./model";

export function createPersonalActions({
  read,
  commit,
  notify,
  safely,
}: {
  read: () => Store;
  commit: (store: Store) => boolean;
  notify: (text: string) => void;
  safely: (action: () => void) => void;
}) {
  function restore(
    matches: (id: string, date: string) => boolean,
    message: string,
  ) {
    const current = read();
    if (
      !current.records.some(
        (record) => record.removed && matches(record.id, record.date),
      )
    )
      return false;
    if (
      !commit({
        ...current,
        records: current.records.map((record) =>
          matches(record.id, record.date)
            ? { ...record, removed: false }
            : record,
        ),
      })
    )
      return false;
    notify(message);
    return true;
  }
  return {
    restoreRecord: (id: string) =>
      restore((recordId) => recordId === id, "记录已恢复。"),
    restoreDay: (date: string) =>
      restore((_id, recordDate) => recordDate === date, "本日移除的记录已恢复"),
    toggleProjectArchive(id: string) {
      safely(() => {
        const current = read();
        if (!current.projects.some((project) => project.id === id)) return;
        commit({
          ...current,
          projects: current.projects.map((project) =>
            project.id === id
              ? { ...project, archived: !project.archived }
              : project,
          ),
        });
      });
    },
  };
}
