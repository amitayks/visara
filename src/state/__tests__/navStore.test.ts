import { beforeEach, describe, expect, it } from "@jest/globals";
import { PAGE, transitions, useNavStore } from "../navStore";

const base = {
	currentPage: PAGE.gallery,
	searchMode: false,
	documentMode: false,
};

describe("navStore transition table (page-navigation-core spec)", () => {
	it("page change exits search mode", () => {
		const s = transitions.setPage({ ...base, searchMode: true }, PAGE.albums);
		expect(s.currentPage).toBe(PAGE.albums);
		expect(s.searchMode).toBe(false);
	});

	it("document mode persists across page changes", () => {
		const s = transitions.setPage({ ...base, documentMode: true }, PAGE.albums);
		expect(s.documentMode).toBe(true);
	});

	it("same-page set is a no-op that keeps search open", () => {
		const withSearch = { ...base, searchMode: true };
		const s = transitions.setPage(withSearch, PAGE.gallery);
		expect(s).toBe(withSearch);
	});

	it("search activation forces the gallery page", () => {
		const s = transitions.activateSearch({ ...base, currentPage: PAGE.albums });
		expect(s.currentPage).toBe(PAGE.gallery);
		expect(s.searchMode).toBe(true);
	});

	it("document toggle on gallery toggles", () => {
		const on = transitions.toggleDocuments(base);
		expect(on.documentMode).toBe(true);
		const off = transitions.toggleDocuments(on);
		expect(off.documentMode).toBe(false);
	});

	it("document toggle from albums redirects to gallery and forces on", () => {
		const s = transitions.toggleDocuments({
			...base,
			currentPage: PAGE.albums,
			documentMode: false,
		});
		expect(s.currentPage).toBe(PAGE.gallery);
		expect(s.documentMode).toBe(true);
	});

	it("document toggle from albums forces on even if already on", () => {
		const s = transitions.toggleDocuments({
			...base,
			currentPage: PAGE.albums,
			documentMode: true,
		});
		expect(s.currentPage).toBe(PAGE.gallery);
		expect(s.documentMode).toBe(true);
	});
});

describe("useNavStore integration", () => {
	beforeEach(() => useNavStore.setState({ ...base }));

	it("toggleSearch round-trips", () => {
		useNavStore.getState().toggleSearch();
		expect(useNavStore.getState().searchMode).toBe(true);
		useNavStore.getState().toggleSearch();
		expect(useNavStore.getState().searchMode).toBe(false);
	});
});
