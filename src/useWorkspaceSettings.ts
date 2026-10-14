import { useRef, useState } from "react";
import type { PersonalResponse, Status } from "./ipc-contract";
import { defaultPreferences, type Preferences } from "./preferences";
import {
  api,
  connected,
  connectionErrorMessage,
  libraryId,
} from "./workspace-runtime";
import { sample } from "./model";

type SettingsOptions = {
  storageError: string;
  setStorageError: (error: string) => void;
  isDirty: () => boolean;
  notify: (text: string, undo?: () => void, scope?: "设置") => void;
  reload: (status: Status, response: PersonalResponse) => void;
};
export function useWorkspaceSettings({
  storageError,
  setStorageError,
  isDirty,
  notify,
  reload,
}: SettingsOptions) {
  const [prefs, setPrefs] = useState<Preferences>(() => {
    try {
      return connected ? api("preferences") : defaultPreferences;
    } catch {
      return defaultPreferences;
    }
  });
  const [initializingLibrary, setInitializingLibrary] = useState(false);
  const librarySetupBusy = useRef(false);
  function libraryChanged() {
    setStorageError("LIBRARY_CHANGED");
    notify(
      "资料库已切换，设置尚未保存；目录名称输入已保留，请先保留所需文字再重新读取资料库。",
    );
    return false;
  }
  function savePrefs(value: Preferences) {
    if (connected && storageError === "LIBRARY_CHANGED")
      return libraryChanged();
    try {
      setPrefs(connected ? api("preferences-save", value, libraryId) : value);
      notify("设置已保存", undefined, "设置");
      return true;
    } catch (error) {
      if ((error as Error).message === "LIBRARY_CHANGED")
        return libraryChanged();
      notify("设置未保存，请检查输入或资料库写入权限。");
      return false;
    }
  }
  function refreshSettings() {
    if (isDirty()) {
      notify("请先保存或保留输入并放弃当前修改，再重新读取资料库。");
      return false;
    }
    try {
      const status = api("status");
      const response = api("load", null, sample);
      if (
        status.libraryHealth.libraryId &&
        status.libraryHealth.libraryId !== response.libraryId
      )
        throw Error("LIBRARY_CHANGED");
      const preferences = api("preferences");
      reload(status, response);
      setPrefs(preferences);
      setStorageError("");
      return true;
    } catch (error) {
      setStorageError((error as Error).message);
      notify("刷新失败，原资料保留。");
      return false;
    }
  }
  async function connectSettings() {
    try {
      const result = await window.jinjingtai!.connect();
      if (!result.cancelled && refreshSettings())
        notify(
          result.needsTrust
            ? "连接已保存，请在 Codex 中审阅并信任新增 Hook，再重启 Codex。"
            : "连接设置已保存。",
        );
    } catch (error) {
      notify("连接未完成：" + connectionErrorMessage((error as Error).message));
    }
  }
  async function initializeLibrary() {
    if (librarySetupBusy.current) return;
    librarySetupBusy.current = true;
    setInitializingLibrary(true);
    try {
      const result = await window.jinjingtai!.maintenance("library");
      if (!result.cancelled && refreshSettings())
        notify("资料库已就绪，可以开始记录。");
    } catch (error) {
      notify(connectionErrorMessage((error as Error).message));
    } finally {
      librarySetupBusy.current = false;
      setInitializingLibrary(false);
    }
  }
  return {
    prefs,
    savePrefs,
    refreshSettings,
    connectSettings,
    initializeLibrary,
    initializingLibrary,
  };
}
