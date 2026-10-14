import { useEffect, useRef } from "react";
import type { RecordItem, Store } from "../model";

export type PersonalEditor = {
  dirty: boolean;
  save: () => boolean;
  discard: () => void;
};
export type PersonalPanelProps = {
  store: Store;
  commit: (
    update: (current: Store) => Store,
    onError?: (text: string) => void,
  ) => boolean;
  safely: (action: () => void) => void;
  registerEditor: (editor: PersonalEditor | null) => void;
  openRecord: (record: RecordItem, sequence?: string[]) => void;
};

/** A deferred editor action must read the store after the guard has saved. */
export function usePersonalStore(
  store: Store,
  commit: PersonalPanelProps["commit"],
) {
  const current = useRef(store);
  current.current = store;
  const update: PersonalPanelProps["commit"] = (updater, onError) => {
    let next: Store | undefined;
    const saved = commit((latest) => {
      next = updater(latest);
      return next;
    }, onError);
    if (saved && next) current.current = next;
    return saved;
  };
  return { current, update };
}

/** Register only while editing. Ref-backed callbacks keep the guard current. */
export function usePersonalEditor(
  editing: boolean,
  dirty: boolean,
  save: () => boolean,
  discard: () => void,
  registerEditor: PersonalPanelProps["registerEditor"],
) {
  const latest = useRef({ save, discard });
  latest.current = { save, discard };
  useEffect(() => {
    if (!editing) return;
    registerEditor({
      dirty,
      save: () => latest.current.save(),
      discard: () => latest.current.discard(),
    });
    return () => registerEditor(null);
  }, [editing, dirty, registerEditor]);
}
