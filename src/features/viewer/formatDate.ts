/**
 * Viewer-local date formatting. Hand-rolled (no Intl dependency — Hermes
 * Intl coverage varies by platform) and deterministic.
 */

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

/** "Jan 5, 2026 · 2:32 PM" from a creation-date ms timestamp. */
export function formatViewerDate(creationDateMs: number): string {
	if (!Number.isFinite(creationDateMs) || creationDateMs <= 0) return "";
	const date = new Date(creationDateMs);
	if (Number.isNaN(date.getTime())) return "";

	const month = MONTHS[date.getMonth()];
	const hours = date.getHours();
	const hour12 = hours % 12 === 0 ? 12 : hours % 12;
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const meridiem = hours < 12 ? "AM" : "PM";

	return `${month} ${date.getDate()}, ${date.getFullYear()} · ${hour12}:${minutes} ${meridiem}`;
}
