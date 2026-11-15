/** How a DPS alert looks on the map: the more serious, the bigger and redder its zone. */
import type { SafetyAlert } from "./types";

export const ALERT_STYLE: Record<SafetyAlert["severity"], { radiusM: number; rgb: [number, number, number]; fill: number; line: number }> = {
  high: { radiusM: 55, rgb: [185, 28, 28], fill: 0.34, line: 0.95 }, // deep red
  medium: { radiusM: 38, rgb: [220, 38, 38], fill: 0.2, line: 0.7 },
  low: { radiusM: 26, rgb: [248, 113, 113], fill: 0.13, line: 0.5 }, // light red
};
export const alertStyle = (a: Pick<SafetyAlert, "severity">) => ALERT_STYLE[a.severity] ?? ALERT_STYLE.medium;
