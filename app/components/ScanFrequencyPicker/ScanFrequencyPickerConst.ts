import { ScanFrequencyOption } from "./ScanFrequencyPicker";

export const SCAN_FREQUENCY_OPTIONS: ScanFrequencyOption[] = [
	{
		value: "on_new_image",
		label: "When New Images Added",
		icon: "camera-outline",
		badge: "Real-time",
	},
	{
		value: "hourly",
		label: "Every Hour",
		icon: "time-outline",
		badge: "Frequent",
	},
	{
		value: "daily",
		label: "Once Daily",
		icon: "calendar-outline",
		badge: "Recommended",
	},
	{
		value: "weekly",
		label: "Once a Week",
		icon: "calendar-number-outline",
		badge: "Battery Efficient",
	},
];
