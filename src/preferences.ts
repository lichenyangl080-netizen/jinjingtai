export type Preferences = {
  organizerModel: "gpt-6-astra" | "gpt-6.1-sol" | "gpt-6-luna";
  organizerEffort: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  fontSize: number;
  density: string;
  decoration: boolean;
  workspaceNames: Record<string, string>;
};

// Retain legacy fields without exposing obsolete controls.
export const defaultPreferences: Preferences = {
  organizerModel: "gpt-6.1-sol",
  organizerEffort: "medium",
  fontSize: 16,
  density: "compact",
  decoration: true,
  workspaceNames: {},
};
export const organizerModels = [
  { value: "gpt-6-astra", label: "GPT-6 Astra" },
  { value: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
  { value: "gpt-6-luna", label: "GPT-6 Luna" },
] as const;
export const organizerEfforts = [
  { value: "none", label: "不推理" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "很高" },
  { value: "max", label: "最高" },
] as const;
