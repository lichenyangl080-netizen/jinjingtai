import type { ApiCall, Status } from "../ipc-contract";
import {
  organizerModels,
  organizerEfforts,
  type Preferences,
} from "../preferences";
import { OrganizerHistory } from "./OrganizerHistory";

export function OrganizerSettings({
  prefs,
  save,
  busy,
  api,
  capture,
  libraryId,
  jobApplyErrors,
  retryJobApply,
  inspectionDate,
}: {
  prefs: Preferences;
  save: (value: Preferences) => boolean;
  busy: string;
  api: ApiCall;
  capture: Status | null;
  libraryId: string;
  jobApplyErrors: Readonly<Record<string, string>>;
  retryJobApply: (id: string) => void;
  inspectionDate: string | null;
}) {
  return (
    <>
      <div className="setting-row">
        <div>
          <strong>整理模型</strong>
          <p>选择后自动保存，下次整理生效。</p>
        </div>
        <select
          aria-label="整理模型"
          value={prefs.organizerModel}
          disabled={!!busy}
          onChange={(e) =>
            save({
              ...prefs,
              organizerModel: e.target.value as Preferences["organizerModel"],
              organizerEffort:
                prefs.organizerEffort === "none" &&
                e.target.value !== "gpt-6-luna"
                  ? "medium"
                  : prefs.organizerEffort,
            })
          }
        >
          {organizerModels.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <div>
          <strong>推理强度</strong>
          <p>默认中等；强度更高可能耗时更长、用量更多。</p>
        </div>
        <select
          aria-label="推理强度"
          value={prefs.organizerEffort}
          disabled={!!busy}
          onChange={(e) =>
            save({
              ...prefs,
              organizerEffort: e.target.value as Preferences["organizerEffort"],
            })
          }
        >
          {organizerEfforts
            .filter(
              (effort) =>
                effort.value !== "none" ||
                prefs.organizerModel === "gpt-6-luna",
            )
            .map((effort) => (
              <option key={effort.value} value={effort.value}>
                {effort.label}
              </option>
            ))}
        </select>
      </div>
      <OrganizerHistory
        api={api}
        capture={capture}
        libraryId={libraryId}
        jobApplyErrors={jobApplyErrors}
        retryJobApply={retryJobApply}
        initialDate={inspectionDate}
      />
    </>
  );
}
