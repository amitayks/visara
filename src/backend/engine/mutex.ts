/**
 * Promise-chain mutex (ported from the legacy GemmaMultimodalService
 * `runExclusive` pattern): each task waits for the previous one to SETTLE
 * (fulfil or reject) before running, and the chain never carries a rejection
 * forward, so one failed task cannot poison later ones.
 *
 * Used by both Gemma engines — a llama.rn context must never run two
 * generations/embeddings concurrently, and dispose() must wait for the
 * in-flight call to settle (design D10).
 */

export type Mutex = <T>(task: () => Promise<T>) => Promise<T>;

export function createMutex(): Mutex {
	let tail: Promise<unknown> = Promise.resolve();

	return <T>(task: () => Promise<T>): Promise<T> => {
		// Run `task` whether the previous task fulfilled or rejected.
		const run = tail.then(task, task);
		// Next caller waits on this one's settlement only (result/rejection
		// swallowed here so the chain itself never rejects).
		tail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};
}
