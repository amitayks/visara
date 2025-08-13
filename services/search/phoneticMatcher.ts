/**
 * Simple phonetic matching for React Native
 * Based on Soundex algorithm
 */
export class PhoneticMatcher {
	/**
	 * Generate Soundex code for a word
	 */
	static soundex(word: string): string {
		if (!word || word.length === 0) return "";

		const upperWord = word.toUpperCase();
		const firstLetter = upperWord[0];

		// Soundex mappings
		const mappings: Record<string, string> = {
			B: "1",
			F: "1",
			P: "1",
			V: "1",
			C: "2",
			G: "2",
			J: "2",
			K: "2",
			Q: "2",
			S: "2",
			X: "2",
			Z: "2",
			D: "3",
			T: "3",
			L: "4",
			M: "5",
			N: "5",
			R: "6",
		};

		let code = firstLetter;
		let previousCode = mappings[firstLetter] || "0";

		for (let i = 1; i < upperWord.length && code.length < 4; i++) {
			const currentLetter = upperWord[i];
			const currentCode = mappings[currentLetter] || "0";

			if (currentCode !== "0" && currentCode !== previousCode) {
				code += currentCode;
				previousCode = currentCode;
			} else if (currentCode === "0") {
				previousCode = "0";
			}
		}

		// Pad with zeros if needed
		return code.padEnd(4, "0");
	}

	/**
	 * Compare two words phonetically
	 */
	static compare(word1: string, word2: string): boolean {
		return this.soundex(word1) === this.soundex(word2);
	}

	/**
	 * Get phonetic similarity score
	 */
	static similarity(word1: string, word2: string): number {
		const code1 = this.soundex(word1);
		const code2 = this.soundex(word2);

		if (code1 === code2) return 1;

		// Calculate partial similarity
		let matches = 0;
		for (let i = 0; i < 4; i++) {
			if (code1[i] === code2[i]) matches++;
		}

		return matches / 4;
	}
}
