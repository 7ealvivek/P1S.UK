export const chartColors = {
  accent: "#6366f1",
  accentLight: "#818cf8",
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  info: "#3b82f6",
  grid: "rgba(30, 30, 46, 0.5)",
  text: "#8b8fa3",
  bg: "#12121a",
};

export const riskColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  standard: "#6b7280",
  low: "#22c55e",
  info: "#3b82f6",
};

export const statusCodeColor = (code: number | null | undefined): string => {
  if (!code) return "#5c5f73";
  if (code >= 200 && code < 300) return "#22c55e";
  if (code >= 300 && code < 400) return "#3b82f6";
  if (code >= 400 && code < 500) return "#eab308";
  if (code >= 500) return "#ef4444";
  return "#5c5f73";
};

export const statusCodeLabel = (code: number | null | undefined): string => {
  if (!code) return "N/A";
  return code.toString();
};

export const sourceColors: Record<string, string> = {
  ct_stream: "#6366f1",
  passive_enum: "#22c55e",
  subfinder: "#3b82f6",
  findomain: "#f97316",
  amass: "#eab308",
  hunterseye: "#ec4899",
  manual_sweep: "#8b5cf6",
  unknown: "#6b7280",
};
