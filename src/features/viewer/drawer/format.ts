/**
 * Drawer-local formatting. Hand-rolled like the viewer's formatDate (no Intl
 * dependency — Hermes Intl coverage varies by platform) and deterministic.
 */

const WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

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

export interface DrawerDate {
	/** "Saturday, Jul 12, 2026" */
	title: string;
	/** "2:32 PM" */
	time: string;
}

export function formatDrawerDate(creationDateMs: number): DrawerDate | null {
	if (!Number.isFinite(creationDateMs) || creationDateMs <= 0) return null;
	const date = new Date(creationDateMs);
	if (Number.isNaN(date.getTime())) return null;

	const hours = date.getHours();
	const hour12 = hours % 12 === 0 ? 12 : hours % 12;
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const meridiem = hours < 12 ? "AM" : "PM";

	return {
		title: `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`,
		time: `${hour12}:${minutes} ${meridiem}`,
	};
}

export function formatBytes(bytes: number): string | null {
	if (!Number.isFinite(bytes) || bytes <= 0) return null;
	if (bytes < 1024) return `${Math.round(bytes)} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${Math.round(kb)} KB`;
	const mb = kb / 1024;
	if (mb < 1024) return `${mb.toFixed(1)} MB`;
	return `${(mb / 1024).toFixed(2)} GB`;
}
