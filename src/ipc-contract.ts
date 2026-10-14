import type { CaptureStage, CaptureTurn } from "./day-state";
import type { ApplicableJob } from "./job-application";
import type { RecordItem, Store } from "./model";
import type { Preferences } from "./preferences";

export type Attachment = NonNullable<RecordItem["attachments"]>[number];
export type PersonalResponse = {
  revision: number;
  libraryId: string;
  store: Store;
};
export type ConnectionConfig = {
  enabled: boolean;
  paused?: boolean;
  disconnected?: boolean;
  connectionError?: string;
  library: string | null;
  roots: string[];
  instructionFiles?: string[];
  scopeMode?: string;
};
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
};
export type StatusJob = ApplicableJob & {
  startedAt?: string;
  model?: string;
  reasoningEffort?: string;
  state: "running" | "complete" | "failed" | "cancelled";
  error?: string;
  added?: number;
  replaced?: number;
  requestChars?: number;
  readStats?: { calls: number; chars: number };
  usage?: Usage | null;
  unprocessed?: string[];
  skippedSources?: string[];
};
export type Diagnostic = { code: string; folder?: string; file?: string };
export type Status = {
  config: ConnectionConfig;
  libraryHealth: {
    available: boolean;
    needsInitialization?: boolean;
    libraryId?: string;
    error?: string;
  };
  sourceHealth?: { available: boolean; error?: string };
  metadataHealth?: { available: boolean; errors: Diagnostic[] };
  stages: (CaptureStage & { at: string })[];
  turns: (CaptureTurn & {
    state:
      | "recorded"
      | "no_change"
      | "pending"
      | "missing"
      | "interrupted"
      | "working"
      | "unfinished";
  })[];
  errors: Diagnostic[];
  jobs: StatusJob[];
};
export type WorkspaceInfo = { id: string; name: string; workspace: string };
export type WorkspaceListing = WorkspaceInfo & { cwd: string; dirs: string[] };
export type PreviewMaterial = {
  id: string;
  cwd: string;
  project: WorkspaceInfo;
  at?: string;
  recovery?: boolean;
  items: {
    id: string;
    title: string;
    kind: string;
    used: boolean;
    protected?: boolean;
    groupOnly?: boolean;
  }[];
};
export type Candidate = {
  id: string;
  source: { cwd: string; session: string; turn: string; call?: string };
  items: { title: string; summary: string }[];
};
export type JobMaterials = {
  date: string;
  items: { id: string; title: string; summary: string; protected: boolean }[];
};
type Method<A extends unknown[], R> = { args: A; result: R };
export type OrganizerHistory = {
  id: string;
  date: string;
  state: string;
  startedAt?: string;
  model?: string;
  reasoningEffort?: string;
  requestText: string | null;
  directory: unknown[];
  sourceAliases: Record<string, string>;
  materials: {
    id: string;
    title: string;
    summary: string;
    groupOnly: boolean;
  }[];
  readStats: unknown;
  result: unknown;
  error: string | null;
  applied: boolean;
  unprocessed: string[];
  skippedSources: string[];
  usage: Usage | null;
};
export type SyncMethods = {
  "organizer-history": Method<
    [id: string, libraryId: string],
    OrganizerHistory
  >;
  load: Method<[legacy: Store | null, sample: Store], PersonalResponse>;
  save: Method<
    [store: Store, revision: number, libraryId: string],
    PersonalResponse
  >;
  status: Method<[], Status>;
  preferences: Method<[], Preferences>;
  "preferences-save": Method<
    [value: Preferences, libraryId: string],
    Preferences
  >;
  "view-state": Method<[], { date?: string }>;
  "view-state-save": Method<[date: string], true>;
  "workspace-list": Method<[], WorkspaceListing[]>;
  pause: Method<[paused: boolean], ConnectionConfig>;
  preview: Method<[date: string], PreviewMaterial[]>;
  organize: Method<
    [
      date: string,
      ids: string[],
      options: { dailySummary: boolean; expectedLibraryId: string },
    ],
    { id?: string; date?: string; skipped?: boolean; duplicate?: boolean }
  >;
  apply: Method<
    [id: string],
    PersonalResponse & { added: number; date: string }
  >;
  cancel: Method<[id: string, libraryId: string], void>;
  "job-materials": Method<[id: string], JobMaterials>;
  candidate: Method<[id: string], Candidate | undefined>;
  "candidate-review": Method<
    [id: string, decision: "accept" | "discard", libraryId: string],
    true
  >;
  visibility: Method<
    [id: string, hidden: boolean, libraryId: string],
    PersonalResponse
  >;
  "source-info": Method<
    [ids: string[]],
    NonNullable<RecordItem["sourceLinks"]>
  >;
  "open-source": Method<[id: string], true>;
};
export type ApiCall = <M extends keyof SyncMethods>(
  method: M,
  ...args: SyncMethods[M]["args"]
) => SyncMethods[M]["result"];
export type MaintenanceAction =
  | "library"
  | "scope"
  | "disconnect"
  | "backup"
  | "open-library"
  | "open-state"
  | "guide"
  | "licenses";
export type ConnectionResult = { cancelled?: boolean; needsTrust?: boolean };
export type ConnectionCheck = {
  checkedAt: string;
  available: boolean;
  version: string;
  login: "unknown" | "signed_in" | "signed_out";
  error: string;
};
export interface DesktopBridge {
  close(): void;
  integration: boolean;
  call: ApiCall;
  maintenance(action: MaintenanceAction): Promise<ConnectionResult>;
  connect(): Promise<ConnectionResult>;
  checkConnection(libraryId: string): Promise<ConnectionCheck>;
  attachment(libraryId: string): Promise<Attachment[]>;
  openAttachment(id: string): Promise<boolean>;
}
