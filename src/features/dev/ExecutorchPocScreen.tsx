/**
 * ExecutorchPocScreen — dev-only proof-of-concept for the ExecuTorch runtime
 * (openspec change `executorch-runtime-bootstrap`, group D).
 *
 * Loads the Gemma-4 E2B multimodal model via `useLLM`, shows download / ready /
 * error state, and runs vision inference over a decodable local `file://` image
 * (a bundled test JPEG written to disk with `@dr.pogodin/react-native-fs`).
 *
 * ISOLATION: this screen does NOT import or touch `ProcessingService`, the
 * ML-Kit `Promise.all` seam, the `ProcessingResult` contract, or the database.
 * It is reachable only through `__DEV__`-gated surfaces (the DevPocLauncher
 * modal or the `DevPoc` route) and never from the production flow.
 *
 * Copied from src/screens/Dev for rebuild-ui-foundation; the original stays
 * untouched until cutover. Dev-only surface: plain RN styles are deliberate.
 */
import {
	DocumentDirectoryPath,
	exists,
	mkdir,
	writeFile,
} from "@dr.pogodin/react-native-fs";
import { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { models, useLLM } from "react-native-executorch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { POC_TEST_IMAGES, type PocTestImage } from "./pocTestImages";

const PROMPT = "What is in this image? List the main objects.";
const POC_DIR = `${DocumentDirectoryPath}/executorch-poc`;

function errorText(error: unknown): string {
	if (error instanceof Error) {
		return error.message || String(error);
	}
	return String(error);
}

/**
 * Writes the bundled (base64) test JPEG to a real local file and returns a
 * `file://` path. NEVER returns a `content://` URI — the ExecuTorch image
 * decoder cannot read MediaStore content URIs.
 */
async function ensureLocalImage(image: PocTestImage): Promise<string> {
	if (!(await exists(POC_DIR))) {
		await mkdir(POC_DIR);
	}
	const filePath = `${POC_DIR}/${image.id}.jpg`;
	if (!(await exists(filePath))) {
		await writeFile(filePath, image.base64, "base64");
	}
	return `file://${filePath}`;
}

interface PocRunnerProps {
	onClose: () => void;
	onReloadModel: () => void;
}

/**
 * Inner runner. Remounted (via a `key` bump from the parent) to retry a failed
 * model load, since `useLLM` starts loading on mount.
 */
function PocRunner({ onClose, onReloadModel }: PocRunnerProps) {
	const insets = useSafeAreaInsets();
	const llm = useLLM({ model: models.llm.gemma4_e2b_multimodal() });

	const [selected, setSelected] = useState<PocTestImage>(POC_TEST_IMAGES[0]);
	const [imagePath, setImagePath] = useState<string | null>(null);
	const [prepError, setPrepError] = useState<string | null>(null);
	const [runError, setRunError] = useState<string | null>(null);

	// Materialize the selected bundled image to a decodable local file path.
	useEffect(() => {
		let cancelled = false;
		setImagePath(null);
		setPrepError(null);
		ensureLocalImage(selected)
			.then((path) => {
				if (!cancelled) {
					setImagePath(path);
				}
			})
			.catch((error) => {
				if (!cancelled) {
					setPrepError(errorText(error));
				}
			});
		return () => {
			cancelled = true;
		};
	}, [selected]);

	const runInference = useCallback(async () => {
		if (!imagePath) {
			return;
		}
		setRunError(null);
		try {
			await llm.sendMessage(PROMPT, { imagePath });
		} catch (error) {
			setRunError(errorText(error));
		}
	}, [imagePath, llm]);

	const downloadPct = Math.round(llm.downloadProgress * 100);
	const loadError = llm.error ? errorText(llm.error) : null;
	const canRun = llm.isReady && imagePath !== null && !llm.isGenerating;
	const assistantMessages = llm.messageHistory.filter(
		(message) => message.role === "assistant",
	);
	const finalCaption = assistantMessages[assistantMessages.length - 1];

	return (
		<View style={[styles.root, { paddingTop: insets.top }]}>
			<View style={styles.header}>
				<Text style={styles.title}>ExecuTorch POC</Text>
				<Pressable
					accessibilityRole="button"
					onPress={onClose}
					style={styles.closeButton}
					testID="executorch-poc-close"
				>
					<Text style={styles.closeButtonText}>Close</Text>
				</Pressable>
			</View>

			<ScrollView
				contentContainerStyle={[
					styles.scrollContent,
					{ paddingBottom: insets.bottom + 32 },
				]}
			>
				<View style={styles.card}>
					<Text style={styles.sectionTitle}>Model</Text>
					<Text style={styles.mono}>gemma4_e2b_multimodal (vision)</Text>
					{loadError ? (
						<View style={styles.errorBox}>
							<Text style={styles.errorText}>
								Model load failed: {loadError}
							</Text>
							<Pressable
								accessibilityRole="button"
								onPress={onReloadModel}
								style={styles.primaryButton}
								testID="executorch-poc-reload"
							>
								<Text style={styles.primaryButtonText}>Reload model</Text>
							</Pressable>
						</View>
					) : llm.isReady ? (
						<Text style={styles.readyText}>Model ready.</Text>
					) : (
						<View style={styles.statusRow}>
							<ActivityIndicator />
							<View style={styles.statusTextWrap}>
								<Text style={styles.statusText}>
									Downloading / loading model… {downloadPct}%
								</Text>
								<View style={styles.progressTrack}>
									<View
										style={[styles.progressFill, { width: `${downloadPct}%` }]}
									/>
								</View>
							</View>
						</View>
					)}
				</View>

				<View style={styles.card}>
					<Text style={styles.sectionTitle}>Test image</Text>
					<View style={styles.imageChoices}>
						{POC_TEST_IMAGES.map((image) => {
							const active = image.id === selected.id;
							return (
								<Pressable
									accessibilityRole="button"
									disabled={llm.isGenerating}
									key={image.id}
									onPress={() => setSelected(image)}
									style={[styles.choice, active && styles.choiceActive]}
									testID={`executorch-poc-image-${image.id}`}
								>
									<Text
										style={[
											styles.choiceText,
											active && styles.choiceTextActive,
										]}
									>
										{image.label}
									</Text>
								</Pressable>
							);
						})}
					</View>
					<Image
						resizeMode="cover"
						source={{ uri: `data:image/jpeg;base64,${selected.base64}` }}
						style={styles.preview}
					/>
					<Text style={styles.caption}>{selected.description}</Text>
					<Text style={styles.pathText}>
						{imagePath ? imagePath : "Preparing local file…"}
					</Text>
					{prepError ? (
						<Text style={styles.errorText}>Image prep failed: {prepError}</Text>
					) : null}
				</View>

				<Pressable
					accessibilityRole="button"
					disabled={!canRun}
					onPress={runInference}
					style={[styles.runButton, !canRun && styles.runButtonDisabled]}
					testID="executorch-poc-run"
				>
					<Text style={styles.runButtonText}>
						{llm.isGenerating ? "Generating…" : "Run inference"}
					</Text>
				</Pressable>

				<Text style={styles.promptLabel}>Prompt: {PROMPT}</Text>

				<View style={styles.card}>
					<Text style={styles.sectionTitle}>Streamed response</Text>
					<Text style={styles.responseText}>
						{llm.response ? llm.response : "—"}
					</Text>
				</View>

				<View style={styles.card}>
					<Text style={styles.sectionTitle}>
						Final caption (messageHistory)
					</Text>
					<Text style={styles.responseText}>
						{finalCaption ? finalCaption.content : "—"}
					</Text>
				</View>

				{runError ? (
					<View style={styles.errorBox}>
						<Text style={styles.errorText}>Inference failed: {runError}</Text>
						<Pressable
							accessibilityRole="button"
							onPress={runInference}
							style={styles.primaryButton}
							testID="executorch-poc-retry"
						>
							<Text style={styles.primaryButtonText}>Retry inference</Text>
						</Pressable>
					</View>
				) : null}
			</ScrollView>
		</View>
	);
}

/**
 * Public entry. Holds the reload key so a failed model load can be retried by
 * remounting the runner (which restarts `useLLM`).
 */
export function ExecutorchPocScreen({ onClose }: { onClose: () => void }) {
	const [reloadKey, setReloadKey] = useState(0);
	return (
		<PocRunner
			key={reloadKey}
			onClose={onClose}
			onReloadModel={() => setReloadKey((key) => key + 1)}
		/>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#0d1117",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingVertical: 14,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "#30363d",
	},
	title: {
		color: "#f0f6fc",
		fontSize: 20,
		fontWeight: "700",
	},
	closeButton: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 8,
		backgroundColor: "#21262d",
	},
	closeButtonText: {
		color: "#f0f6fc",
		fontSize: 15,
		fontWeight: "600",
	},
	scrollContent: {
		padding: 20,
		alignSelf: "center",
		width: "100%",
		maxWidth: 640,
		gap: 16,
	},
	card: {
		backgroundColor: "#161b22",
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#30363d",
		padding: 16,
		gap: 10,
	},
	sectionTitle: {
		color: "#8b949e",
		fontSize: 13,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	mono: {
		color: "#f0f6fc",
		fontSize: 15,
		fontFamily: "Courier",
	},
	readyText: {
		color: "#3fb950",
		fontSize: 15,
		fontWeight: "600",
	},
	statusRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	statusTextWrap: {
		flex: 1,
		gap: 8,
	},
	statusText: {
		color: "#f0f6fc",
		fontSize: 15,
	},
	progressTrack: {
		height: 6,
		borderRadius: 3,
		backgroundColor: "#30363d",
		overflow: "hidden",
	},
	progressFill: {
		height: 6,
		borderRadius: 3,
		backgroundColor: "#2f81f7",
	},
	imageChoices: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
	},
	choice: {
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 20,
		backgroundColor: "#21262d",
		borderWidth: 1,
		borderColor: "#30363d",
	},
	choiceActive: {
		backgroundColor: "#1f6feb",
		borderColor: "#1f6feb",
	},
	choiceText: {
		color: "#c9d1d9",
		fontSize: 14,
		fontWeight: "600",
	},
	choiceTextActive: {
		color: "#ffffff",
	},
	preview: {
		width: "100%",
		aspectRatio: 1,
		borderRadius: 10,
		backgroundColor: "#0d1117",
	},
	caption: {
		color: "#8b949e",
		fontSize: 13,
		lineHeight: 18,
	},
	pathText: {
		color: "#6e7681",
		fontSize: 11,
		fontFamily: "Courier",
	},
	runButton: {
		backgroundColor: "#238636",
		borderRadius: 12,
		paddingVertical: 16,
		alignItems: "center",
	},
	runButtonDisabled: {
		backgroundColor: "#21262d",
	},
	runButtonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
	},
	promptLabel: {
		color: "#8b949e",
		fontSize: 13,
		fontStyle: "italic",
	},
	responseText: {
		color: "#f0f6fc",
		fontSize: 15,
		lineHeight: 22,
	},
	primaryButton: {
		backgroundColor: "#1f6feb",
		borderRadius: 10,
		paddingVertical: 12,
		alignItems: "center",
	},
	primaryButtonText: {
		color: "#ffffff",
		fontSize: 15,
		fontWeight: "700",
	},
	errorBox: {
		gap: 12,
	},
	errorText: {
		color: "#f85149",
		fontSize: 14,
		lineHeight: 20,
	},
});
