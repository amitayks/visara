import type { MediaRow as MediaFile } from "@backend/types";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { useSearchStore } from "../searchStore";

const media = (id: string) => ({ id }) as unknown as MediaFile;

describe("searchStore stale-response guard (search-experience spec)", () => {
	beforeEach(() => useSearchStore.getState().clear());

	it("an older response never overwrites a newer one", () => {
		const store = useSearchStore.getState();
		const first = store.beginRequest();
		const second = store.beginRequest();

		// Late arrival of the FIRST response after the second was issued:
		useSearchStore.getState().completeRequest(first, [media("stale")]);
		expect(useSearchStore.getState().results).toEqual([]);
		expect(useSearchStore.getState().status).toBe("searching");

		useSearchStore.getState().completeRequest(second, [media("fresh")]);
		expect(useSearchStore.getState().results.map((m) => m.id)).toEqual([
			"fresh",
		]);
		expect(useSearchStore.getState().status).toBe("done");
	});

	it("a stale failure does not clobber a newer request", () => {
		const store = useSearchStore.getState();
		const first = store.beginRequest();
		store.beginRequest();
		useSearchStore.getState().failRequest(first);
		expect(useSearchStore.getState().status).toBe("searching");
	});

	it("clear resets everything", () => {
		const store = useSearchStore.getState();
		store.setQuery("cats");
		const id = store.beginRequest();
		store.completeRequest(id, [media("a")]);
		useSearchStore.getState().clear();
		expect(useSearchStore.getState()).toMatchObject({
			query: "",
			status: "idle",
			results: [],
		});
	});
});
