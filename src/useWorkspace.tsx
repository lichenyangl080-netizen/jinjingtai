import {
  CalendarBlank,
  CalendarDots,
  ClockCounterClockwise,
  FolderSimple,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DayNotes, type NoteEdit } from "./components/DayNotes";
import { RecordRow, WorkRow } from "./components/Progress";
import { dayState, isValidDay, latestSavedDay } from "./day-state";
import {
  createJobApplicationController,
  type ApplicableJob,
  type JobApplicationErrors,
} from "./job-application";
import {
  canSavePlanningDraft,
  createPlanningDraft,
  type PlanningDraft,
} from "./planning-draft";
import {
  TODAY,
  sample,
  saveRecord,
  visibleRecords,
  workingDay,
  periodRange,
  type RecordItem,
  type Store,
  type WorkGroup,
} from "./model";
import type { Candidate, PreviewMaterial, Status } from "./ipc-contract";
import { useWorkspaceSettings } from "./useWorkspaceSettings";
import { useConnectionSession } from "./useConnectionSession";
import { connectionStatus } from "./connection-status";
import { PersonalValidationError } from "./personal-errors";
import { reviewOffset, type ReviewPeriod } from "./review-navigation";
import {
  restoreRecordReading,
  type RecordReadingContext,
} from "./record-reading";
import { createRecordAttachmentActions } from "./record-attachment-actions";
import { createCaptureActions } from "./capture-actions";
import { createPersonalActions } from "./personal-actions";
import { scopeProjects } from "./scope-projects";
import { groupProjectRecords, preferredProject } from "./project-display";
import type { Drawer, Page } from "./workspace-runtime";
import type { SearchResult } from "./search-index";
import {
  KEY,
  adopt,
  api,
  connected,
  applicationErrorMessage,
  describeError,
  formatDate,
  initialStorageError,
  libraryId,
  readStore,
  readViewDate,
  revision,
  sourceHealthMessage,
} from "./workspace-runtime";
export function useWorkspace() {
  const [store, setStore] = useState<Store>(readStore);
  const [storageError, setStorageError] = useState(initialStorageError);
  function readLocation() {
    try {
      return JSON.parse(
        localStorage.getItem(KEY + "-location-" + (libraryId || "prototype")) ||
          "{}",
      );
    } catch {
      return {};
    }
  }
  const location = useRef(readLocation()).current;
  const restoringLocation = useRef(false);
  const [page, setPage] = useState<Page>(
    ["今日", "日历", "项目", "回望", "设置"].includes(location.page)
      ? location.page
      : "今日",
  );
  const [today, setToday] = useState(TODAY);
  const [workbenchView, setWorkbenchView] = useState<"今日" | "日历">(
    location.workbenchView === "日历" || location.page === "日历"
      ? "日历"
      : "今日",
  );
  const [projectReading, setProjectReading] = useState<
    Record<
      string,
      {
        historyMonth: string;
        monthLimit: number;
        recentLimit: number;
        view?: string;
        threads?: Record<string, { open: boolean; limit: number }>;
      }
    >
  >(location.projectReading || {});
  function updateProjectReading(update: Partial<typeof reading>) {
    setProjectReading((current) => ({
      ...current,
      [projectId]: {
        ...(current[projectId] || {
          historyMonth: "",
          monthLimit: 3,
          recentLimit: 20,
        }),
        ...update,
      },
    }));
  }
  useEffect(() => {
    if (page === "今日" || page === "日历") setWorkbenchView(page);
  }, [page]);
  const [date, setDate] = useState(() =>
    isValidDay(location.date, today) ? location.date : readViewDate(today),
  );
  const latest = useRef(store);
  latest.current = store;
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => setToday(workingDay()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [calendarDate, setCalendarDate] = useState(
    isValidDay(location.calendarDate)
      ? location.calendarDate
      : connected
        ? date
        : "2026-10-03",
  );
  const [month, setMonth] = useState(
    typeof location.month === "string" &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(location.month)
      ? location.month
      : date.slice(0, 7),
  );
  function rememberedProject() {
    try {
      return (
        localStorage.getItem(KEY + "-project-" + (libraryId || "prototype")) ||
        undefined
      );
    } catch {
      return undefined;
    }
  }
  const [projectId, setProjectId] = useState(() =>
    preferredProject(store, rememberedProject()),
  );
  function setProjectView(view: string, forProject = projectId) {
    setProjectReading((current) => ({
      ...current,
      [forProject]: {
        ...(current[forProject] || {
          historyMonth: "",
          monthLimit: 3,
          recentLimit: 20,
        }),
        view: view === "事项主线" ? view : "全部历程",
      },
    }));
  }
  function updateThreadReading(
    id: string,
    patch: { open?: boolean; limit?: number },
  ) {
    setProjectReading((current) => {
      const previous = current[projectId] || {
        historyMonth: "",
        monthLimit: 3,
        recentLimit: 20,
      };
      const thread = previous.threads?.[id] || { open: false, limit: 50 };
      const next = { ...thread, ...patch };
      if (next.open === thread.open && next.limit === thread.limit)
        return current;
      return {
        ...current,
        [projectId]: {
          ...previous,
          threads: { ...previous.threads, [id]: next },
        },
      };
    });
  }
  const reading = projectReading[projectId] || {
    historyMonth: "",
    monthLimit: 3,
    recentLimit: 20,
  };
  const [targetThread, setTargetThread] = useState({ id: "", request: 0 });
  const projectView = reading.view === "事项主线" ? "事项主线" : "全部历程";
  function consumeThreadTarget(request: number) {
    setTargetThread((current) =>
      current.request === request ? { ...current, id: "" } : current,
    );
  }
  const [lastOrganized, setLastOrganized] = useState<{
    date: string;
    recordIds: string[];
  } | null>(null);
  const selectedLibraryRef = useRef(libraryId);
  const [period, setPeriod] = useState(
    ["周", "月", "年"].includes(location.period) ? location.period : "周",
  );
  const [offset, setOffset] = useState(
    Number.isInteger(location.offset) && location.offset <= 0
      ? location.offset
      : 0,
  );
  const [reviewReading, setReviewReading] = useState<Record<string, number>>(
    location.reviewReading || {},
  );
  const reviewKey = period + ":" + periodRange(period, offset, today)[0];
  const storedReviewLimit = reviewReading[reviewKey];
  const reviewLimit =
    Number.isInteger(storedReviewLimit) && storedReviewLimit >= 200
      ? storedReviewLimit
      : 200;
  function setReviewLimit(limit: number) {
    setReviewReading((current) => ({
      ...current,
      [reviewKey]: Math.max(200, limit),
    }));
  }
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [drawerSequence, setDrawerSequence] = useState<string[]>([]);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState<"input" | "result">("input");
  const [searchTarget, setSearchTarget] = useState<{
    selector: string;
    library: string;
    request: number;
  } | null>(null);
  const [fromSearch, setFromSearch] = useState(false);
  const [recordUse, setRecordUse] = useState<RecordReadingContext | null>(null);
  function openRecordUsage(recordId: string) {
    const context = {
      recordId,
      library: libraryId,
      sequence: drawerSequence,
      fromSearch,
      expanded: drawerExpanded,
    };
    safely(() => {
      if (!visibleRecords(latest.current).some((r) => r.id === recordId))
        return;
      setRecordUse(context);
    });
  }
  function dismissRecordUsage() {
    setRecordUse(null);
  }
  function closeRecordUsage() {
    const reading = restoreRecordReading(latest.current, libraryId, recordUse);
    dismissRecordUsage();
    if (!reading) return;
    setDrawerSequence(reading.sequence);
    setDrawerExpanded(reading.expanded);
    setFromSearch(reading.fromSearch);
    setDrawer({
      mode: "view",
      record: reading.record,
      original: JSON.stringify(reading.record),
    });
  }
  function recordUsageSaved(
    kind: "continuation" | "thread" | "review",
    reviewPeriod: "周" | "月" | "年",
    threadId: string,
  ) {
    const id = recordUse?.recordId;
    setNotice({
      text:
        kind === "continuation"
          ? "继续起点已保存"
          : kind === "thread"
            ? "主线关联已保存"
            : "引用已追加，原回望正文保留",
      label: kind === "review" ? "打开对应回望" : "打开项目",
      action: () =>
        safely(() => {
          const record = latest.current.records.find((r) => r.id === id);
          if (!record) return;
          if (kind !== "review") {
            setProjectId(record.project);
            setPage("项目");
            if (kind === "thread") {
              setProjectView("事项主线", record.project);
              setTargetThread((target) => ({
                id: threadId,
                request: target.request + 1,
              }));
            }
          } else {
            setPeriod(reviewPeriod);
            setOffset(reviewOffset(reviewPeriod, record.date, today));
            setPage("回望");
          }
          setNotice(null);
        }),
    });
  }
  const [featureEditor, setFeatureEditor] = useState<null | {
    dirty: boolean;
    save: () => boolean;
    discard: () => void;
  }>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const commitPersonal = useCallback(
    (update: (current: Store) => Store, onError?: (text: string) => void) => {
      try {
        return commitRef.current(update(latest.current), onError);
      } catch (error) {
        const message =
          error instanceof PersonalValidationError
            ? error.message
            : "保存失败：输入已保留，请检查关联记录后再保存。";
        onError ? onError(message) : notify(message);
        return false;
      }
    },
    [],
  );
  const safeRef = useRef(safely);
  safeRef.current = safely;
  const safelyPersonal = useCallback(
    (action: () => void) => safeRef.current(action),
    [],
  );
  const [guard, setGuard] = useState<null | (() => void)>(null);
  const [evidence, setEvidence] = useState(false);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    undo?: () => void;
    action?: () => void;
    label?: string;
    scope?: Page;
  } | null>(null);
  const [settingsTab, setSettingsTab] = useState("Codex连接");
  const [inspectionDate, setInspectionDate] = useState<string | null>(null);
  const [settingsEditor, setSettingsEditor] = useState<null | {
    dirty: boolean;
    save: () => boolean;
    discard: () => void;
  }>(null);
  const seenJobs = useRef<Map<string, string>>(new Map());
  const jobApplications = useRef(createJobApplicationController());
  const [jobApplyErrors, setJobApplyErrors] = useState<JobApplicationErrors>(
    {},
  );
  const [formError, setFormError] = useState("");
  const [projectFormError, setProjectFormError] = useState("");
  const [noteEdit, setNoteEdit] = useState<NoteEdit | null>(null);
  const [projectForm, setProjectForm] = useState<null | {
    name: string;
    id?: string;
  }>(null);
  const [projectText, setProjectText] = useState<null | {
    status: string;
    next: string;
    original: string;
  }>(null);
  const [planEdit, setPlanEdit] = useState<PlanningDraft | null>(null);
  const [query, setQuery] = useState("");
  const [capture, setCapture] = useState<Status | null>(() => {
    try {
      return connected ? api("status") : null;
    } catch {
      return null;
    }
  });
  const needsLibraryInitialization =
    !!capture?.libraryHealth?.needsInitialization;
  const connectionSession = useConnectionSession(
    libraryId,
    connectionStatus(capture).installed,
    capture,
  );
  const [captureError, setCaptureError] = useState(false);
  const captureLabel = captureError
    ? "采集状态读取失败"
    : !capture
      ? "正在读取采集状态"
      : capture.config.connectionError
        ? capture.config.connectionError === "CONNECTION_CONFIG_MISSING"
          ? "尚未设置采集连接"
          : "连接配置不可读取，采集暂停"
        : capture.config.paused
          ? "采集已暂停"
          : capture.sourceHealth?.available === false
            ? sourceHealthMessage(capture.sourceHealth.error)
            : capture.config.enabled
              ? "采集已配置"
              : "尚未启用采集";
  const [scope, setScope] = useState<null | {
    libraryId: string;
    date: string;
    materials: PreviewMaterial[];
    ids: string[];
    overviewOnly?: boolean;
  }>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [materialReview, setMaterialReview] = useState<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const recordOriginRef = useRef<HTMLElement | null>(null);
  const navigateRef = useRef<(date: string) => void>(() => {});
  const positions = useRef<Record<string, number>>(location.positions || {});
  const drawerDirty =
    !!drawer &&
    drawer.mode !== "view" &&
    JSON.stringify(drawer.record) !== drawer.original;
  const noteDirty =
    !!noteEdit &&
    JSON.stringify([noteEdit.lesson, noteEdit.tomorrow]) !== noteEdit.original;
  const projectDirty =
    !!projectText &&
    JSON.stringify([projectText.status, projectText.next]) !==
      projectText.original;
  const dirty =
    drawerDirty ||
    noteDirty ||
    projectDirty ||
    (!!planEdit && planEdit.text !== planEdit.original) ||
    (!!projectForm &&
      projectForm.name !==
        (store.projects.find((p) => p.id === projectForm.id)?.name || "")) ||
    !!settingsEditor?.dirty ||
    !!featureEditor?.dirty;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const {
    prefs,
    savePrefs,
    refreshSettings,
    connectSettings,
    initializeLibrary,
    initializingLibrary,
  } = useWorkspaceSettings({
    storageError,
    setStorageError,
    isDirty: () => dirtyRef.current,
    notify,
    reload: (status, response) => {
      const fresh = adopt(response);
      setNotice(null);
      setScope(null);
      latest.current = fresh;
      setStore(fresh);
      setCapture(status);
      setCaptureError(false);
      setJobApplyErrors(
        jobApplications.current.reconcile(libraryId, status.jobs),
      );
    },
  });
  const { attach, openAttachment } = createRecordAttachmentActions(
    drawer,
    setDrawer,
    notify,
  );
  const { openCandidate, reviewCandidate, toggleStageVisibility, cancelJob } =
    createCaptureActions({
      api,
      getLibraryId: () => libraryId,
      acceptStatus: acceptCaptureLibrary,
      publishStatus: setCapture,
      publishPersonal: (response) => {
        const fresh = adopt(response);
        latest.current = fresh;
        setStore(fresh);
      },
      publishCandidate: setCandidate,
      notify,
    });
  const { restoreRecord, restoreDay, toggleProjectArchive } =
    createPersonalActions({
      read: () => latest.current,
      commit,
      notify,
      safely,
    });
  const records = visibleRecords(store, date);
  const day = dayState(store, captureError ? null : capture, date);
  const lastSaved = latestSavedDay(store, today);
  const libraryFailure =
    storageError ||
    (capture?.libraryHealth?.available === false &&
      capture.libraryHealth.error) ||
    "";
  const project =
    store.projects.find((p) => p.id === projectId) || store.projects[0];
  const modalOpen = !!(
    guard ||
    projectForm ||
    scope ||
    candidate ||
    materialReview ||
    recordUse ||
    searchOpen
  );
  useEffect(() => {
    if (libraryFailure) return;
    if (selectedLibraryRef.current !== libraryId) {
      selectedLibraryRef.current = libraryId;
      setProjectId(preferredProject(store, rememberedProject()));
      const loc = readLocation();
      restoringLocation.current = true;
      const restoredDate = isValidDay(loc.date, today) ? loc.date : today;
      setDate(restoredDate);
      setCalendarDate(
        isValidDay(loc.calendarDate) ? loc.calendarDate : restoredDate,
      );
      setMonth(
        typeof loc.month === "string" &&
          /^\d{4}-(0[1-9]|1[0-2])$/.test(loc.month)
          ? loc.month
          : restoredDate.slice(0, 7),
      );
      setLastOrganized(null);
      setWorkbenchView(
        loc.workbenchView === "日历" || loc.page === "日历" ? "日历" : "今日",
      );
      setProjectReading(loc.projectReading || {});
      setReviewReading(loc.reviewReading || {});
      setDrawer(null);
      setDrawerSequence([]);
      setTargetThread({ id: "", request: 0 });
      setSearchOpen(false);
      setPage(
        ["今日", "日历", "项目", "回望", "设置"].includes(loc.page)
          ? loc.page
          : "今日",
      );
      setPeriod(["周", "月", "年"].includes(loc.period) ? loc.period : "周");
      setOffset(
        Number.isInteger(loc.offset) && loc.offset <= 0 ? loc.offset : 0,
      );
      positions.current = loc.positions || {};
      return;
    }
    if (!store.projects.some((p) => p.id === projectId)) {
      setProjectId(preferredProject(store));
      return;
    }
    try {
      localStorage.setItem(
        KEY + "-project-" + (libraryId || "prototype"),
        projectId,
      );
    } catch {
      /* 阅读偏好失败不影响资料。 */
    }
  }, [projectId, store.projects, libraryId, libraryFailure]);
  function persistLocation() {
    if (libraryFailure) return;
    if (restoringLocation.current) {
      restoringLocation.current = false;
      return;
    }
    try {
      localStorage.setItem(
        KEY + "-location-" + (libraryId || "prototype"),
        JSON.stringify({
          page,
          workbenchView,
          projectReading,
          reviewReading,
          period,
          offset,
          date,
          calendarDate,
          month,
          positions: positions.current,
        }),
      );
    } catch {}
  }
  useEffect(persistLocation, [
    page,
    workbenchView,
    projectReading,
    reviewReading,
    period,
    offset,
    date,
    calendarDate,
    month,
    libraryId,
  ]);
  useEffect(() => {
    setProjectFormError("");
  }, [projectForm?.id, !!projectForm]);
  useEffect(() => {
    if (modalOpen) return;
    if (drawer?.mode === "view")
      drawerRef.current?.focus({ preventScroll: true });
    else if (!drawer && recordOriginRef.current) {
      if (recordOriginRef.current.isConnected)
        recordOriginRef.current.focus({ preventScroll: true });
      recordOriginRef.current = null;
    }
  }, [drawer?.record.id, drawer?.mode, modalOpen]);
  const editing =
    (!!drawer && drawer.mode !== "view") || !!noteEdit || !!projectText;
  const activeEditDateRef = useRef<string | null>(null);
  activeEditDateRef.current =
    drawer?.mode === "edit" ? drawer.record.date : null;
  const scrollKey = `${page}:${page === "今日" ? date : page === "项目" ? `${projectId}:${projectView}` : page === "回望" ? `${period}:${offset}` : month}`;
  useEffect(() => {
    if (!connected && !localStorage.getItem(KEY))
      localStorage.setItem(KEY, JSON.stringify(store));
  }, []);
  useEffect(() => {
    if (!isValidDay(date, today) || storageError) return;
    try {
      if (connected) api("view-state-save", date);
      else localStorage.setItem(KEY + "-view-date", date);
    } catch {
      /* A view preference cannot affect the authoritative records. */
    }
  }, [date, today, storageError]);
  useEffect(() => {
    if (!connected) return;
    const poll = () => {
      let s;
      try {
        s = api("status");
        setCaptureError(false);
      } catch {
        setCaptureError(true);
        return;
      }
      if (!acceptCaptureLibrary(s)) return;
      setJobApplyErrors(jobApplications.current.reconcile(libraryId, s.jobs));
      for (const job of s.jobs) {
        const previous = seenJobs.current.get(job.id);
        if (job.state === "complete") applyCompletedJob(job);
        else if (previous === "running" && job.state === "failed")
          setNotice({
            text: `${formatDate(job.date)}整理失败：${describeError(job.error || "CODEX_UNAVAILABLE")}`,
            label: "回到这一天",
            action: () => navigateRef.current(job.date),
          });
        seenJobs.current.set(job.id, job.state);
      }
      setCapture(s);
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice || notice.undo) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (mainRef.current)
      mainRef.current.scrollTop =
        positions.current[scrollKey] ??
        (page === "项目" && projectView === "全部历程"
          ? positions.current[`项目:${projectId}`]
          : undefined) ??
        0;
  }, [scrollKey]);
  useEffect(() => {
    if (!searchTarget || searchTarget.library !== (libraryId || "")) return;
    const frame = requestAnimationFrame(() => {
      const element = mainRef.current?.querySelector<HTMLElement>(
        searchTarget.selector,
      );
      setSearchTarget(null);
      if (!element) return;
      element.tabIndex = -1;
      element.scrollIntoView({ block: "start" });
      element.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [searchTarget, scrollKey, libraryId]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  useEffect(() => {
    setNotice((current) =>
      current?.scope &&
      current.scope !== page &&
      !current.undo &&
      !current.action
        ? null
        : current,
    );
  }, [page]);
  function notify(text: string, undo?: () => void, scope?: Page) {
    setNotice({ text, undo, scope });
  }
  function acceptCaptureLibrary(s: Status) {
    if (
      libraryId &&
      s.libraryHealth?.libraryId &&
      s.libraryHealth.libraryId !== libraryId
    ) {
      setCapture(s);
      setStorageError("LIBRARY_CHANGED");
      return false;
    }
    return true;
  }
  function applyCompletedJob(
    job: ApplicableJob & { added?: number },
    retry = false,
  ) {
    const result = jobApplications.current.apply(
      job,
      (id) => api("apply", id),
      activeEditDateRef.current,
      retry,
    );
    setJobApplyErrors(jobApplications.current.errors);
    if (result.state === "saved") {
      const response = result.response;
      if (response.revision !== revision) {
        const fresh = adopt(response);
        latest.current = fresh;
        setStore(fresh);
        setDrawer((d) =>
          d?.mode === "view"
            ? {
                ...d,
                record:
                  fresh.records.find((r) => r.id === d.record.id) || d.record,
              }
            : d,
        );
      }
      job.applied = true;
      setLastOrganized({
        date: job.date,
        recordIds: result.response.store.records
          .filter(
            (r) =>
              r.organizeJob === job.id ||
              result.response.store.workAssignments?.[r.id]?.job === job.id,
          )
          .map((r) => r.id),
      });
      job.added = response.added;
      setNotice({
        text: `${formatDate(job.date)}已整理并保存，可查看本日进展。`,
        label: "查看结果",
        action: () => navigateRef.current(job.date),
      });
    } else if (result.state === "failed") {
      setNotice({
        text: `${formatDate(job.date)}整理结果未保存：${applicationErrorMessage(result.error)}。原材料保留，自动重试已停止。`,
        label: "查看保存问题",
        action: () => inspectDay(job.date),
      });
    }
    return result.state;
  }
  function retryJobApply(id: string) {
    let s;
    try {
      s = api("status");
      setCaptureError(false);
    } catch {
      setCaptureError(true);
      notify("采集状态读取失败，尚未重试保存。");
      return;
    }
    if (!acceptCaptureLibrary(s)) {
      notify("资料库已切换，请重新读取目标资料库后再重试保存。");
      return;
    }
    setJobApplyErrors(jobApplications.current.reconcile(libraryId, s.jobs));
    const job = s.jobs.find((j: ApplicableJob) => j.id === id);
    if (!job) notify("找不到这次整理任务，尚未重试保存。");
    else if (job.applied) notify("本次整理结果已经保存。");
    else {
      const state = applyCompletedJob(job, true);
      if (state === "editing")
        notify("请先保存或关闭当天记录的编辑，再重试保存。");
      else if (state === "blocked")
        notify("部分记录需修复，整理结果暂未保存。");
      else if (state === "skipped") notify("这次整理尚未产生可保存的结果。");
    }
    setCapture(s);
  }
  function commit(next: Store, onError?: (message: string) => void): boolean {
    if (libraryFailure) {
      const message = "资料库尚未恢复读取，输入已保留，请先检查资料库。";
      onError ? onError(message) : notify(message);
      return false;
    }
    try {
      if (connected) adopt(api("save", next, revision, libraryId));
      else localStorage.setItem(KEY, JSON.stringify(next));
      latest.current = next;
      setStore(next);
      return true;
    } catch (error) {
      const message =
        (error as Error).message === "LIBRARY_CHANGED"
          ? "资料库已切换，保存已停止。请保留输入，重新读取目标资料库后再编辑。"
          : "保存失败：输入已保留。请检查磁盘位置与权限，或检查其他窗口是否更新了资料后再保存。";
      onError ? onError(message) : notify(message);
      return false;
    }
  }
  function prepareDay() {
    prepareDayFor(date);
  }
  function prepareDayFor(forDate: string) {
    if (libraryFailure) {
      notify("请先恢复资料库读取，再整理这一天。");
      return;
    }
    safely(() => {
      try {
        const s = api("status");
        if (!acceptCaptureLibrary(s)) return;
        setCapture(s);
        setCaptureError(false);
        if (s.jobs.some((j) => j.date === forDate && j.state === "running")) {
          notify("这一天正在整理，可以继续浏览，或取消后重新选择材料。");
          return;
        }
        const response = api("load", null, sample);
        if (connected && response.libraryId !== libraryId) {
          setStorageError("LIBRARY_CHANGED");
          return;
        }
        if (response.revision !== revision) {
          const fresh = adopt(response);
          latest.current = fresh;
          setStore(fresh);
        }
        const materials = api("preview", forDate)
          .map((s) => ({
            ...s,
            items: s.items.filter((i) => !i.protected),
          }))
          .filter((s) => s.items.length);
        if (!materials.length) {
          notify("没有新的可整理材料。已保存和人工修改的内容保持原样。");
          return;
        }
        setScope({
          libraryId,
          date: forDate,
          materials,
          ids: materials.filter((s) => !s.recovery).map((s) => s.id),
        });
      } catch {
        setCaptureError(true);
        notify("读取整理范围失败，请检查接入状态。");
      }
    });
  }
  function launchDay() {
    if (!scope) return;
    if (scope.libraryId !== libraryId) {
      setScope(null);
      notify("资料库已切换，请重新选择整理范围。");
      return;
    }
    try {
      const result = api("organize", scope.date, scope.ids, {
        dailySummary: true,
        expectedLibraryId: scope.libraryId,
      });
      if (result.id && !result.skipped)
        seenJobs.current.set(result.id, "running");
      notify(
        result.skipped
          ? "没有新增材料，无需调用模型。"
          : result.duplicate
            ? "所选材料已有整理结果，没有重复调用模型。"
            : `${formatDate(scope.date)}正在整理，可以继续浏览和补记。`,
      );
      setScope(null);
    } catch (e) {
      notify("整理未启动：" + describeError((e as Error).message));
    }
  }
  function inspectDay(forDate = date) {
    safely(() => {
      setInspectionDate(forDate);
      setSettingsTab("Codex连接");
      setPage("设置");
    });
  }
  function safely(action: () => void) {
    if (dirtyRef.current) setGuard(() => action);
    else {
      clearEditors();
      action();
    }
  }
  useEffect(() => {
    const close = () => safely(() => window.jinjingtai?.close());
    window.addEventListener("jinjingtai-close", close);
    return () => window.removeEventListener("jinjingtai-close", close);
  }, [dirty]);
  useEffect(() => {
    if (
      !guard &&
      !projectForm &&
      !scope &&
      !candidate &&
      !materialReview &&
      !recordUse &&
      !searchOpen
    )
      return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(
      guard ? '[aria-labelledby="guard-title"]' : ".dialog",
    );
    dialog
      ?.querySelector<HTMLElement>(
        searchOpen && !guard ? 'input[type="search"]' : "input,button",
      )
      ?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button,input,textarea,select,summary",
        ),
      ].filter(
        (x) =>
          !(x as HTMLButtonElement).disabled && x.getClientRects().length > 0,
      );
      const first = items[0],
        last = items.at(-1);
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [
    !!guard,
    !!projectForm,
    !!scope,
    !!candidate,
    !!materialReview,
    !!recordUse,
    searchOpen,
  ]);
  function clearEditors(discardSettings = true) {
    dirtyRef.current = false;
    setDrawer(null);
    setRecordUse(null);
    setNoteEdit(null);
    setProjectText(null);
    setProjectForm(null);
    setEvidence(false);
    setMore(false);
    setFormError("");
    setPlanEdit(null);
    setSearchOpen(false);
    if (discardSettings) featureEditor?.discard();
    if (discardSettings && settingsEditor?.dirty) settingsEditor.discard();
  }
  function go(next: Page) {
    safely(() => {
      if (next === "设置") {
        setSettingsTab("Codex连接");
        setInspectionDate(null);
      }
      setPage(next);
    });
  }
  function chooseDate(next: string) {
    safely(() => {
      setDate(next);
      setPage("今日");
    });
  }
  navigateRef.current = chooseDate;
  function openRecord(
    record: RecordItem,
    sequence?: string[],
    keepSearchOrigin = false,
  ) {
    const origin = document.activeElement as HTMLElement | null;
    const ids = sequence || [record.id];
    safely(() => {
      const current = latest.current.records.find((r) => r.id === record.id);
      if (!current || current.removed || current.progressHidden) {
        setDrawer(null);
        return;
      }
      record = current;
      if (connected && record.sourceIds && !record.sourceLinks) {
        try {
          record = {
            ...record,
            sourceLinks: api("source-info", record.sourceIds),
          };
        } catch {}
      }
      setFromSearch(keepSearchOrigin);
      if (!drawer) {
        recordOriginRef.current = origin;
        setDrawerExpanded(false);
      }
      setDrawerSequence(
        ids.includes(record.id) ? [...new Set(ids)] : [record.id],
      );
      setDrawer({ mode: "view", record, original: JSON.stringify(record) });
      setEvidence(false);
    });
  }
  function adjacentRecord(delta: number) {
    if (!drawer) return;
    const index = drawerSequence.indexOf(drawer.record.id);
    if (index < 0) return;
    const r = store.records.find(
      (r) =>
        r.id === drawerSequence[index + delta] &&
        !r.removed &&
        !r.progressHidden,
    );
    if (r) openRecord(r, drawerSequence, fromSearch);
  }
  function cancelRecordEdit() {
    if (drawer?.mode === "edit")
      openRecord(drawer.record, drawerSequence, fromSearch);
    else closeDrawer();
  }
  function openRelatedRecord(record: RecordItem) {
    openRecord(record, [record.id], fromSearch);
  }
  function closeDrawer() {
    safely(() => {
      if (fromSearch) {
        setSearchFocus("result");
        setSearchOpen(true);
      }
    });
  }
  function launchSearch() {
    safely(() => {
      setSearchFocus("input");
      setSearchOpen(true);
    });
  }
  function openProject(project: string, threadId?: string) {
    safely(() => {
      setProjectId(project);
      if (threadId) {
        setProjectView("事项主线", project);
        setTargetThread((target) => ({
          id: threadId,
          request: target.request + 1,
        }));
      }
      setPage("项目");
    });
  }
  function openSearchResult(result: SearchResult, sequence: string[]) {
    safely(() => {
      setSearchOpen(false);
      const selector = {
        project: ".project-overview",
        continuation: ".continuation-panel",
        note: ".review-notes",
        review: ".period-review-panel",
      }[result.kind as "project" | "continuation" | "note" | "review"];
      if (selector)
        setSearchTarget((previous) => ({
          selector,
          library: libraryId || "",
          request: (previous?.request || 0) + 1,
        }));
      if (result.kind === "record") {
        const r = latest.current.records.find(
          (r) => r.id === (result.recordId || result.id),
        );
        if (r) {
          openRecord(r, sequence, true);
        }
      } else if (result.kind === "note") {
        setDate(result.date);
        setPage("今日");
      } else if (result.kind === "review") {
        const period: ReviewPeriod = result.period || "月";
        setPeriod(period);
        setOffset(reviewOffset(period, result.start || result.date, today));
        setPage("回望");
      } else {
        openProject(
          result.project || result.id,
          result.kind === "thread" ? result.id : undefined,
        );
      }
    });
  }
  function addRecord(forDate = date, forProject = project.id) {
    if (libraryFailure) {
      notify("请先恢复资料库读取，再添加记录。");
      return;
    }
    safely(() => {
      const r: RecordItem = {
        id: crypto.randomUUID(),
        date: forDate,
        project: store.projects.some((p) => p.id === forProject)
          ? forProject
          : project.id,
        title: "",
        change: "",
        next: "",
        kind: "进展",
        confirmed: true,
        manual: true,
      };
      setDrawerSequence([r.id]);
      setFromSearch(false);
      setDrawerExpanded(false);
      setEvidence(false);
      setMore(false);
      recordOriginRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setDrawer({
        mode: "add",
        editSession: crypto.randomUUID(),
        record: r,
        original: JSON.stringify(r),
      });
    });
  }
  function editRecord() {
    setDrawer((current) =>
      current
        ? {
            ...current,
            mode: "edit",
            editSession: crypto.randomUUID(),
            original: JSON.stringify(current.record),
          }
        : null,
    );
    setEvidence(false);
  }
  function changeField(field: keyof RecordItem, value: string) {
    setDrawer((d) =>
      d
        ? {
            ...d,
            record: {
              ...d.record,
              [field]: value,
              ...(field === "change" ? { summary: undefined } : {}),
            },
          }
        : d,
    );
    setFormError("");
  }
  function saveDrawer(): boolean {
    if (!drawer || drawer.mode === "view") return true;
    if (!drawer.record.title.trim()) {
      setFormError("写下做了什么，再保存这条记录。");
      return false;
    }
    if (!drawer.record.date || drawer.record.date > today) {
      setFormError("请选择今天或更早的日期。");
      return false;
    }
    const r = { ...drawer.record, title: drawer.record.title.trim() };
    const updated = saveRecord(latest.current, r);
    if (!commit(updated)) return false;
    const saved = updated.records.find((x) => x.id === r.id)!;
    setDrawer({ mode: "view", record: saved, original: JSON.stringify(saved) });
    if (page === "今日") setDate(saved.date);
    if (page === "项目") setProjectId(saved.project);
    if (page === "日历") {
      setCalendarDate(saved.date);
      setMonth(saved.date.slice(0, 7));
    }
    notify(drawer.mode === "add" ? "补记已保存" : "修改已保存");
    return true;
  }
  function saveNote(): boolean {
    if (!noteEdit) return true;
    const current = latest.current,
      previous = current.notes[date];
    const notes = {
      ...previous,
      lesson: noteEdit.lesson,
      tomorrow: noteEdit.tomorrow,
      reviewed: true,
    };
    if (!commit({ ...current, notes: { ...current.notes, [date]: notes } }))
      return false;
    setNoteEdit(null);
    notify("回顾已保存");
    return true;
  }
  function saveProjectText(): boolean {
    if (!projectText) return true;
    const current = latest.current;
    if (
      !commit({
        ...current,
        projects: current.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                status: projectText.status,
                next: projectText.next,
                overviewEditedAt: new Date().toISOString(),
                overviewRecordIds: current.records
                  .filter((r) => r.project === p.id)
                  .map((r) => r.id),
              }
            : p,
        ),
      })
    )
      return false;
    setProjectText(null);
    notify("项目说明已保存");
    return true;
  }
  function saveProjectForm(): boolean {
    if (!projectForm) return true;
    const name = projectForm.name.trim();
    if (!name) {
      setProjectFormError("写下项目名称，再保存项目。");
      return false;
    }
    const id = projectForm.id || crypto.randomUUID();
    const current = latest.current;
    const projects = projectForm.id
      ? current.projects.map((p) => (p.id === id ? { ...p, name } : p))
      : [...current.projects, { id, name, subject: "", status: "", next: "" }];
    if (!commit({ ...current, projects }, setProjectFormError)) return false;
    setProjectFormError("");
    setProjectId(id);
    setProjectForm(null);
    return true;
  }
  function saveAndLeave() {
    const action = guard;
    if (
      (drawerDirty && !saveDrawer()) ||
      (noteEdit && !saveNote()) ||
      (projectText && !saveProjectText()) ||
      (projectForm && !saveProjectForm()) ||
      (planEdit && !savePlan()) ||
      (settingsEditor?.dirty && !settingsEditor.save()) ||
      (featureEditor?.dirty && !featureEditor.save())
    ) {
      setGuard(null);
      return;
    }
    setGuard(null);
    clearEditors(false);
    action?.();
  }
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (guard) setGuard(null);
        else if (recordUse) safely(closeRecordUsage);
        else if (searchOpen) setSearchOpen(false);
        else if (scope) setScope(null);
        else if (candidate) setCandidate(null);
        else if (materialReview) setMaterialReview(null);
        else if (projectForm) safely(() => {});
        else if (evidence) setEvidence(false);
        else if (drawer) closeDrawer();
        else if (noteEdit || projectText || planEdit || featureEditor)
          safely(() => {});
      }
      if (
        e.ctrlKey &&
        e.key === "Enter" &&
        !guard &&
        !scope &&
        !candidate &&
        !projectForm &&
        !materialReview
      ) {
        e.preventDefault();
        if (drawer?.mode !== "view") saveDrawer();
        if (noteEdit) saveNote();
        if (planEdit) savePlan();
        if (projectText) saveProjectText();
        if (featureEditor) featureEditor.save();
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });
  function removeRecord() {
    if (!drawer) return;
    const id = drawer.record.id;
    const removedInLibrary = libraryId;
    if (
      !commit({
        ...store,
        records: store.records.map((r) =>
          r.id === id ? { ...r, removed: true } : r,
        ),
      })
    )
      return;
    clearEditors();
    notify("记录已移除", () => {
      if (libraryId !== removedInLibrary) {
        notify("资料库已切换，原资料库的撤销操作已失效。");
        return;
      }
      const s = latest.current;
      commit({
        ...s,
        records: s.records.map((r) =>
          r.id === id ? { ...r, removed: false } : r,
        ),
      });
    });
  }
  const status = needsLibraryInitialization
    ? "欢迎使用"
    : libraryFailure
      ? "资料读取异常"
      : day.materialCount
        ? "有新材料待整理"
        : "";
  const groups = groupProjectRecords(store.projects, records);
  function recordRow(r: RecordItem, withDate = false, sequence?: string[]) {
    return (
      <RecordRow
        key={r.id}
        store={store}
        record={r}
        withDate={withDate}
        selectedId={drawer?.record.id}
        onOpen={(record) => openRecord(record, sequence)}
      />
    );
  }
  function workRow(g: WorkGroup, withDate = false, sequence?: string[]) {
    return (
      <WorkRow
        key={g.id}
        store={store}
        group={g}
        withDate={withDate}
        selectedId={drawer?.record.id}
        onOpen={(record) =>
          openRecord(record, sequence || g.records.map((r) => r.id))
        }
      />
    );
  }
  function draftHistory(forDate?: string, forProject?: string) {
    const old = store.records.filter(
      (r) =>
        r.supersededDraftBy &&
        !r.removed &&
        (!forDate || r.date === forDate) &&
        (!forProject || r.project === forProject),
    );
    return old.length ? (
      <details className="remaining-progress draft-history">
        <summary>来源归并历程 · {old.length}条原始记录</summary>
        <div className="record-list">
          {old.map((r) =>
            recordRow(
              r,
              true,
              old.map((x) => x.id),
            ),
          )}
        </div>
      </details>
    ) : null;
  }
  function notesSection() {
    const notes = store.notes[date] || { lesson: "", tomorrow: "" };
    return (
      <DayNotes
        notes={notes}
        edit={noteEdit}
        onBegin={() =>
          safely(() =>
            setNoteEdit({
              ...notes,
              original: JSON.stringify([notes.lesson, notes.tomorrow]),
            }),
          )
        }
        onChange={setNoteEdit}
        onCancel={() => safely(() => {})}
        onSave={saveNote}
      />
    );
  }

  function editPlan(forDate: string) {
    const draft = createPlanningDraft(
      forDate,
      today,
      latest.current.plans?.[forDate],
    );
    if (!draft) {
      notify("只能新建或编辑未来一个月内的规划。");
      return;
    }
    safely(() => setPlanEdit(draft));
  }
  function savePlan(): boolean {
    if (!planEdit) return true;
    if (!canSavePlanningDraft(planEdit)) {
      notify("只能设置未来一个月内的规划。");
      return false;
    }
    const current = latest.current,
      plans = { ...current.plans };
    if (planEdit.text.trim()) plans[planEdit.date] = planEdit.text.trim();
    else delete plans[planEdit.date];
    if (!commit({ ...current, plans })) return false;
    setPlanEdit(null);
    notify("规划已保存");
    return true;
  }

  const icons = {
    今日: CalendarBlank,
    日历: CalendarDots,
    项目: FolderSimple,
    回望: ClockCounterClockwise,
  };

  return {
    connectionSession,
    currentLibraryId: libraryId,
    recordUse,
    openRecordUsage,
    closeRecordUsage,
    dismissRecordUsage,
    recordUsageSaved,
    projectView,
    targetThreadId: targetThread.id,
    targetThreadRequest: targetThread.request,
    consumeThreadTarget,
    setProjectView,
    lastOrganized,
    mainPage: page === "今日" || page === "日历" ? ("工作台" as const) : page,
    workbenchView,
    projectReading: reading,
    reviewLimit,
    setReviewLimit,
    updateProjectReading,
    updateThreadReading,
    launchSearch,
    searchFocus,
    commitPersonal,
    safelyPersonal,
    registerEditor: setFeatureEditor,
    searchOpen,
    setSearchOpen,
    openSearchResult,
    drawerExpanded,
    setDrawerExpanded,
    drawerSequence,
    adjacentRecord,
    persistLocation,
    closeDrawer,
    openProject,
    openRelatedRecord,
    store,
    storageError,
    page,
    setPage,
    prefs,
    savePrefs,
    refreshSettings,
    connectSettings,
    initializeLibrary,
    initializingLibrary,
    needsLibraryInitialization,
    today,
    setToday,
    date,
    setDate,
    calendarDate,
    setCalendarDate,
    month,
    setMonth,
    projectId,
    setProjectId,
    period,
    setPeriod,
    offset,
    setOffset,
    drawer,
    setDrawer,
    guard,
    setGuard,
    evidence,
    setEvidence,
    more,
    setMore,
    notice,
    setNotice,
    settingsTab,
    setSettingsTab,
    inspectionDate,
    setInspectionDate,
    settingsEditor,
    setSettingsEditor,
    jobApplyErrors,
    retryJobApply,
    formError,
    setFormError,
    noteEdit,
    setNoteEdit,
    projectForm,
    setProjectForm,
    projectFormError,
    setProjectFormError,
    projectText,
    setProjectText,
    planEdit,
    setPlanEdit,
    query,
    setQuery,
    capture,
    captureError,
    captureLabel,
    scope,
    scopeProjects: scopeProjects(
      scope?.materials.filter((s) => !scope.overviewOnly || !s.recovery) || [],
    ),
    setScope,
    candidate,
    setCandidate,
    openCandidate,
    reviewCandidate,
    toggleStageVisibility,
    cancelJob,
    materialReview,
    setMaterialReview,
    mainRef,
    drawerRef,
    modalOpen,
    positions,
    drawerDirty,
    noteDirty,
    projectDirty,
    dirty,
    records,
    day,
    lastSaved,
    libraryFailure,
    project,
    editing,
    activeEditDateRef,
    scrollKey,
    notify,
    prepareDay,
    prepareDayFor,
    launchDay,
    inspectDay,
    openAttachment,
    attach,
    safely,
    clearEditors,
    go,
    chooseDate,
    openRecord,
    cancelRecordEdit,
    editRecord,
    addRecord,
    changeField,
    saveDrawer,
    saveNote,
    saveProjectText,
    saveProjectForm,
    saveAndLeave,
    removeRecord,
    restoreRecord,
    restoreDay,
    toggleProjectArchive,
    status,
    groups,
    recordRow,
    workRow,
    draftHistory,
    notesSection,
    savePlan,
    editPlan,
    icons,
  };
}
export type WorkspaceContext = ReturnType<typeof useWorkspace>;
