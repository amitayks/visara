/**
 * Token/theme resolution + a11y contract tests for the DS primitives.
 * The unistyles jest mock resolves StyleSheet.create against the FIRST
 * registered theme (light), so token assertions use lightColors.
 */
import "@ui/theme/unistyles";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { darkColors, lightColors, typography } from "@ui/theme";
import { StyleSheet } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import {
	Button,
	Chip,
	Dialog,
	Icon,
	ProgressBar,
	SegmentedControl,
	SwitchRow,
	Text,
} from "../index";

// The MDI package requires its .ttf font at module scope, which the jest
// preset cannot transform — stand in RN Text so Icon's own token-resolving
// style entry (the unit under test) still flows through.
jest.mock("@react-native-vector-icons/material-design-icons", () => ({
	__esModule: true,
	default:
		jest.requireActual<typeof import("react-native")>("react-native").Text,
}));

const sharedValue = (value: number) =>
	({ value }) as unknown as SharedValue<number>;

describe("design tokens", () => {
	it("keeps the light and dark palettes equally complete", () => {
		expect(Object.keys(lightColors).sort()).toEqual(
			Object.keys(darkColors).sort(),
		);
	});
});

describe("Text", () => {
	it("resolves default variant/color from tokens", async () => {
		const { getByText } = await render(<Text>hello</Text>);
		const flat = StyleSheet.flatten(getByText("hello").props.style);
		expect(flat.color).toBe(lightColors.textPrimary);
		expect(flat.fontSize).toBe(typography.body.fontSize);
		expect(flat.lineHeight).toBe(typography.body.lineHeight);
	});

	it("resolves explicit variant and semantic color tokens", async () => {
		const { getByText } = await render(
			<Text variant="caption" color="danger">
				warn
			</Text>,
		);
		const flat = StyleSheet.flatten(getByText("warn").props.style);
		expect(flat.color).toBe(lightColors.danger);
		expect(flat.fontSize).toBe(typography.caption.fontSize);
	});
});

describe("Icon", () => {
	it("resolves token colors and numeric size through the style entry", async () => {
		const { getByTestId } = await render(
			<Icon name="check" color="accent" size={32} testID="icon" />,
		);
		const flat = StyleSheet.flatten(getByTestId("icon").props.style);
		expect(flat.color).toBe(lightColors.accent);
		expect(flat.fontSize).toBe(32);
	});

	it("passes concrete color strings through unchanged", async () => {
		const { getByTestId } = await render(
			<Icon name="check" color="#123456" testID="icon" />,
		);
		const flat = StyleSheet.flatten(getByTestId("icon").props.style);
		expect(flat.color).toBe("#123456");
	});
});

describe("Button", () => {
	it("renders the primary variant from the accent token and fires onPress", async () => {
		const onPress = jest.fn();
		const { getByRole } = await render(
			<Button title="Save" onPress={onPress} />,
		);
		const button = getByRole("button", { name: "Save" });
		expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(
			lightColors.accent,
		);
		await fireEvent.press(button);
		expect(onPress).toHaveBeenCalledTimes(1);
	});

	it("announces and enforces the disabled state", async () => {
		const onPress = jest.fn();
		const { getByRole } = await render(
			<Button title="Save" onPress={onPress} disabled />,
		);
		const button = getByRole("button", { name: "Save" });
		expect(button.props.accessibilityState.disabled).toBe(true);
		await fireEvent.press(button);
		expect(onPress).not.toHaveBeenCalled();
	});
});

describe("Chip", () => {
	it("announces its selected state", async () => {
		const onPress = jest.fn();
		const { getByRole } = await render(
			<Chip label="Receipts" selected onPress={onPress} />,
		);
		const chip = getByRole("button", { name: "Receipts" });
		expect(chip.props.accessibilityState.selected).toBe(true);
		await fireEvent.press(chip);
		expect(onPress).toHaveBeenCalledTimes(1);
	});
});

describe("SwitchRow", () => {
	it("is one switch element announcing checked state; row tap toggles", async () => {
		const onValueChange = jest.fn();
		const { getByRole } = await render(
			<SwitchRow
				title="Battery saver"
				value={false}
				onValueChange={onValueChange}
			/>,
		);
		const row = getByRole("switch", { name: "Battery saver" });
		expect(row.props.accessibilityState.checked).toBe(false);
		await fireEvent.press(row);
		expect(onValueChange).toHaveBeenCalledWith(true);
	});
});

describe("SegmentedControl", () => {
	it("announces the checked segment and reports changes", async () => {
		const onChange = jest.fn();
		const { getByRole } = await render(
			<SegmentedControl
				options={[
					{ label: "Light", value: "light" },
					{ label: "Dark", value: "dark" },
				]}
				value="dark"
				onChange={onChange}
			/>,
		);
		expect(
			getByRole("radio", { name: "Dark" }).props.accessibilityState.checked,
		).toBe(true);
		await fireEvent.press(getByRole("radio", { name: "Light" }));
		expect(onChange).toHaveBeenCalledWith("light");
	});
});

describe("ProgressBar", () => {
	it("maps the SharedValue to a scaleX transform", async () => {
		const { getByTestId } = await render(
			<ProgressBar progress={sharedValue(0.5)} testID="progress" />,
		);
		const flat = StyleSheet.flatten(getByTestId("progress-fill").props.style);
		expect(flat.transform).toEqual([{ scaleX: 0.5 }]);
		expect(flat.backgroundColor).toBe(lightColors.accent);
	});

	it("clamps out-of-range progress on the UI thread", async () => {
		const { getByTestId } = await render(
			<ProgressBar progress={sharedValue(1.7)} testID="progress" />,
		);
		const flat = StyleSheet.flatten(getByTestId("progress-fill").props.style);
		expect(flat.transform).toEqual([{ scaleX: 1 }]);
	});
});

describe("Dialog", () => {
	it("renders title/message and routes confirm/cancel", async () => {
		const onConfirm = jest.fn();
		const onCancel = jest.fn();
		const { getByRole, getByText } = await render(
			<Dialog
				visible
				title="Delete photo?"
				message="This cannot be undone."
				confirmLabel="Delete"
				destructive
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);
		expect(getByText("Delete photo?")).toBeTruthy();
		await fireEvent.press(getByRole("button", { name: "Delete" }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
		await fireEvent.press(getByRole("button", { name: "Cancel" }));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
