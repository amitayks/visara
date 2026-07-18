/**
 * GemmaPocScreen — dev-only smoke harness for the v2 backend
 * (rebuild-backend-gemma tasks 1.3/1.4): drives the REAL engines and the
 * REAL op-sqlite build on-device, no mocks.
 *
 *  · DB smoke:    open + FTS5 MATCH + vec0 KNN round-trip (task 1.4)
 *  · Vision:      bundled test image → GemmaVision.analyze (JSON contract)
 *  · Embeddings:  doc/query prompts → 256-d unit vectors + cosine sanity
 *
 * Results (timings, payloads, errors) render in-place and are also
 * console.logged for the headless QA driver. `__DEV__` only.
 */

import { getDb } from "@backend/db/open";
import { createGemmaEmbed } from "@backend/engine/GemmaEmbed";
import { createGemmaVision } from "@backend/engine/vision";
import { GemmaModelDeliveryService } from "@backend/facade";
import { getModelDir } from "@backend/model/Delivery";
// Namespace import on purpose: the package has no default export (a default
// import leaves RNFS undefined — "Cannot read property 'CachesDirectoryPath'").
import * as RNFS from "@dr.pogodin/react-native-fs";
import { Button, Text } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { useCallback, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { POC_TEST_IMAGES } from "./pocTestImages";

interface PocResult {
	title: string;
	body: string;
	ok: boolean;
}

async function writeTestImage(): Promise<string> {
	const image = POC_TEST_IMAGES[0];
	if (!image) throw new Error("no bundled test image");
	const path = `${RNFS.CachesDirectoryPath}/poc-${image.id}.jpg`;
	if (!(await RNFS.exists(path))) {
		await RNFS.writeFile(path, image.base64, "base64");
	}
	return path;
}

function cosine(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
	return dot;
}

export function GemmaPocScreen({ onClose }: { onClose: () => void }) {
	const [results, setResults] = useState<PocResult[]>([]);
	const [busy, setBusy] = useState<string | null>(null);
	const visionRef = useRef<ReturnType<typeof createGemmaVision> | null>(null);
	const embedRef = useRef<ReturnType<typeof createGemmaEmbed> | null>(null);

	const push = useCallback((result: PocResult) => {
		console.log(
			`[GemmaPoc] ${result.title}: ${result.ok ? "OK" : "FAIL"}`,
			result.body,
		);
		setResults((prev) => [result, ...prev]);
	}, []);

	const runDbSmoke = useCallback(async () => {
		setBusy("db");
		const started = Date.now();
		try {
			const db = getDb();
			await db.execute(
				"CREATE VIRTUAL TABLE IF NOT EXISTS poc_fts USING fts5(content)",
			);
			await db.execute("DELETE FROM poc_fts");
			await db.execute("INSERT INTO poc_fts(content) VALUES (?)", [
				"golden retriever on the beach",
			]);
			const fts = await db.execute(
				"SELECT content FROM poc_fts WHERE poc_fts MATCH ?",
				['"beach"'],
			);
			await db.execute(
				"CREATE VIRTUAL TABLE IF NOT EXISTS poc_vec USING vec0(id TEXT PRIMARY KEY, v float[4])",
			);
			await db.execute("DELETE FROM poc_vec");
			const vec = new Float32Array([1, 0, 0, 0]);
			await db.execute("INSERT INTO poc_vec(id, v) VALUES (?, ?)", [
				"a",
				new Uint8Array(vec.buffer),
			]);
			const query = new Float32Array([0.9, 0.1, 0, 0]);
			const knn = await db.execute(
				"SELECT id, distance FROM poc_vec WHERE v MATCH ? AND k = 1 ORDER BY distance",
				[new Uint8Array(query.buffer)],
			);
			const ftsHit = fts.rows.length === 1;
			const knnHit = knn.rows.length === 1 && knn.rows[0]?.id === "a";
			push({
				title: "DB smoke (FTS5 + vec0)",
				ok: ftsHit && knnHit,
				body: `fts=${ftsHit} knn=${knnHit} in ${Date.now() - started}ms`,
			});
		} catch (error) {
			push({
				title: "DB smoke (FTS5 + vec0)",
				ok: false,
				body: String(error),
			});
		} finally {
			setBusy(null);
		}
	}, [push]);

	const runVisionSmoke = useCallback(async () => {
		setBusy("vision");
		const started = Date.now();
		try {
			if (!GemmaModelDeliveryService.isReady()) {
				await GemmaModelDeliveryService.initialize();
			}
			const path = await writeTestImage();
			if (!visionRef.current) {
				visionRef.current = createGemmaVision(getModelDir());
			}
			const analysis = await visionRef.current.analyze(path);
			push({
				title: "Vision (Gemma 4 E2B)",
				ok: analysis.ok,
				body: analysis.ok
					? `${analysis.durationMs}ms → ${JSON.stringify(analysis.result)}`
					: `${analysis.durationMs}ms → ${analysis.error ?? "unknown"}`,
			});
		} catch (error) {
			push({ title: "Vision (Gemma 4 E2B)", ok: false, body: String(error) });
		} finally {
			setBusy(null);
			console.log(`[GemmaPoc] vision total ${Date.now() - started}ms`);
		}
	}, [push]);

	const runEmbedSmoke = useCallback(async () => {
		setBusy("embed");
		const started = Date.now();
		try {
			if (!GemmaModelDeliveryService.isReady()) {
				await GemmaModelDeliveryService.initialize();
			}
			if (!embedRef.current) {
				embedRef.current = createGemmaEmbed(getModelDir());
			}
			const doc = await embedRef.current.embedDoc(
				"a golden retriever playing on a sunny beach. dog, beach, sea.",
			);
			const near = await embedRef.current.embedQuery("dog at the seaside");
			const far = await embedRef.current.embedQuery(
				"quarterly financial report",
			);
			if (!doc || !near || !far) {
				push({
					title: "Embeddings (EmbeddingGemma)",
					ok: false,
					body: `null vector (doc=${!!doc} near=${!!near} far=${!!far})`,
				});
				return;
			}
			const simNear = cosine(doc, near);
			const simFar = cosine(doc, far);
			const ok =
				doc.length === 256 &&
				Math.abs(cosine(doc, doc) - 1) < 0.01 &&
				simNear > simFar;
			push({
				title: "Embeddings (EmbeddingGemma)",
				ok,
				body: `dims=${doc.length} near=${simNear.toFixed(3)} far=${simFar.toFixed(3)} in ${Date.now() - started}ms`,
			});
		} catch (error) {
			push({
				title: "Embeddings (EmbeddingGemma)",
				ok: false,
				body: String(error),
			});
		} finally {
			setBusy(null);
		}
	}, [push]);

	if (!__DEV__) return null;

	return (
		<View style={styles.root}>
			<Text variant="title2">Gemma backend smoke</Text>
			<Text variant="footnote" color="textSecondary">
				Delivery: {GemmaModelDeliveryService.getState().status} · dir:{" "}
				{getModelDir()}
			</Text>
			<View style={styles.buttonRow}>
				<Button
					title={busy === "db" ? "…" : "DB"}
					onPress={() => void runDbSmoke()}
					disabled={busy !== null}
					testID="poc-db"
				/>
				<Button
					title={busy === "vision" ? "…" : "Vision"}
					onPress={() => void runVisionSmoke()}
					disabled={busy !== null}
					testID="poc-vision"
				/>
				<Button
					title={busy === "embed" ? "…" : "Embed"}
					onPress={() => void runEmbedSmoke()}
					disabled={busy !== null}
					testID="poc-embed"
				/>
				<Button
					title="Close"
					variant="secondary"
					onPress={onClose}
					testID="poc-close"
				/>
			</View>
			<ScrollView style={styles.results}>
				{results.map((result, index) => (
					<View
						key={`${result.title}-${results.length - index}`}
						style={styles.resultCard}
					>
						<Text variant="headline" color={result.ok ? "success" : "danger"}>
							{result.ok ? "✓" : "✗"} {result.title}
						</Text>
						<Text variant="footnote" selectable>
							{result.body}
						</Text>
					</View>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		padding: theme.spacing.lg,
		gap: theme.spacing.md,
		backgroundColor: theme.colors.background,
	},
	buttonRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: theme.spacing.sm,
	},
	results: {
		flex: 1,
	},
	resultCard: {
		paddingVertical: theme.spacing.sm,
		gap: theme.spacing.xxs,
		borderBottomWidth: 1,
		borderBottomColor: theme.colors.separator,
	},
}));
