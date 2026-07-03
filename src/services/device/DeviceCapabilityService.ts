/** biome-ignore-all lint/complexity/noStaticOnlyClass: matches sibling all-static services */
import { ThermalService } from "@services/device/ThermalService";
import { storage } from "@services/storage/mmkv";
import { STORAGE_KEYS } from "@utils/constants/storage-keys";
import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";

/**
 * Minimum total RAM for Tier-1 eligibility. Gemma-4 E2B is ~3.2–4.4 GB
 * resident; 6 GiB leaves OS + app headroom (D2). Tunable.
 */
export const TIER1_MIN_TOTAL_MEMORY_BYTES = 6 * 1024 * 1024 * 1024;

/**
 * Minimum free disk to admit a Tier-1 pass, checked LIVE (storage fills and
 * empties). Default 6 GiB (D2). Tunable.
 */
export const TIER1_MIN_FREE_DISK_BYTES = 6 * 1024 * 1024 * 1024;

/**
 * POC-DEPENDENT (design D6): minimum total RAM to admit the embedding pass —
 * far lower than the Tier-1 Gemma floor because the embedding model
 * (~90 MB MiniLM) is light, so Tier-0-only devices can still embed their
 * available text. The exact floor is decided by the chosen model's measured
 * footprint.
 */
export const EMBEDDING_MIN_TOTAL_MEMORY_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * POC-DEPENDENT (design D6): minimum free disk to fetch + cache the embedding
 * model, checked LIVE. Far lower than the Tier-1 disk floor. Tunable.
 */
export const EMBEDDING_MIN_FREE_DISK_BYTES = 512 * 1024 * 1024;

/** The ABI the RNE runtime ships on Android. */
const REQUIRED_ANDROID_ABI = "arm64-v8a";

/**
 * The cached device-lifetime capability verdict plus its diagnostic inputs.
 * Persisted in MMKV under {@link STORAGE_KEYS.DEVICE_CAPABILITY_SNAPSHOT},
 * invalidated when the app version changes.
 */
export interface CapabilitySnapshot {
	totalMemory: number;
	supportedAbis: string[];
	isLowRam: boolean;
	deviceId: string;
	model: string;
	classEligible: boolean;
	appVersion: string;
}

/**
 * The JS-only capability gate (D2): a coarse RAM/ABI/low-RAM device-class
 * verdict (cached for the device lifetime, keyed on app version) plus a LIVE
 * free-disk headroom check, composed with the thermal gate into the single
 * `canRunTier1()` seam the future Tier-1 selection will consult.
 *
 * FAIL CLOSED throughout: any error or unknown value yields ineligible —
 * running a ~4 GB model on a misread device is the dangerous direction (D2/D7).
 */
export class DeviceCapabilityService {
	/**
	 * The static device-class verdict: RAM ≥ floor AND not low-RAM AND (Android)
	 * arm64-v8a present. Cached in MMKV and reused until the app version changes.
	 * Fail closed: any error ⇒ `false`.
	 */
	static async isDeviceClassEligible(): Promise<boolean> {
		try {
			const appVersion = DeviceInfo.getVersion();

			const cached = this.readSnapshot();
			if (cached && cached.appVersion === appVersion) {
				return cached.classEligible;
			}

			const [totalMemory, abis] = await Promise.all([
				DeviceInfo.getTotalMemory(),
				DeviceInfo.supportedAbis(),
			]);
			const isLowRam = DeviceInfo.isLowRamDevice();
			const deviceId = DeviceInfo.getDeviceId();
			const model = DeviceInfo.getModel();

			const hasRequiredAbi =
				Platform.OS !== "android" || abis.includes(REQUIRED_ANDROID_ABI);
			const classEligible =
				totalMemory >= TIER1_MIN_TOTAL_MEMORY_BYTES &&
				!isLowRam &&
				hasRequiredAbi;

			this.writeSnapshot({
				totalMemory,
				supportedAbis: abis,
				isLowRam,
				deviceId,
				model,
				classEligible,
				appVersion,
			});

			return classEligible;
		} catch (error) {
			console.warn(
				"DeviceCapabilityService.isDeviceClassEligible failed (fail-closed)",
				error,
			);
			return false;
		}
	}

	/**
	 * LIVE free-disk headroom check (never cached — storage fills and empties).
	 * Fail closed: any error ⇒ `false`.
	 */
	static async hasDiskHeadroomForTier1(): Promise<boolean> {
		try {
			const freeDisk = await DeviceInfo.getFreeDiskStorage();
			return freeDisk >= TIER1_MIN_FREE_DISK_BYTES;
		} catch (error) {
			console.warn(
				"DeviceCapabilityService.hasDiskHeadroomForTier1 failed (fail-closed)",
				error,
			);
			return false;
		}
	}

	/** Static class eligibility AND live disk headroom (D2). */
	static async isTier1Eligible(): Promise<boolean> {
		const [classEligible, hasDisk] = await Promise.all([
			this.isDeviceClassEligible(),
			this.hasDiskHeadroomForTier1(),
		]);
		return classEligible && hasDisk;
	}

	/**
	 * The single seam the future OrchestratorService Tier-1 selection consults
	 * (D7): eligible hardware AND live disk AND not thermally throttled for
	 * Tier-1. FAIL CLOSED — unknown/error ⇒ `false` (never OOM a weak device on
	 * a guess). Note the deliberate asymmetry vs the drain pause: thermal admits
	 * fail-open, but Tier-1 *admission* fails closed on the capability axis.
	 *
	 * This change exposes the method but wires NO active consumer — there is no
	 * Gemma and no `tier1_gemma` drain here.
	 */
	static async canRunTier1(): Promise<boolean> {
		try {
			const eligible = await this.isTier1Eligible();
			return eligible && !ThermalService.isThrottledForTier1();
		} catch (error) {
			console.warn(
				"DeviceCapabilityService.canRunTier1 failed (fail-closed)",
				error,
			);
			return false;
		}
	}

	/**
	 * Admission gate for the embedding drain (design D6, POC-DEPENDENT floor).
	 * Composes the SAME #5 signals as {@link canRunTier1} but with a lighter,
	 * embedding-sized RAM/disk floor so Tier-0-only devices can still embed their
	 * available text, plus the earlier Tier-1 thermal threshold. FAIL CLOSED:
	 * unknown/error ⇒ `false`, so a misread device never loads the model. The
	 * user opt-in (`MODEL_ENABLED`) is enforced separately by the orchestrator, so
	 * this stays a pure capability + thermal check.
	 */
	static async canRunEmbeddings(): Promise<boolean> {
		try {
			// Prime/refresh the cached device-class snapshot (raw RAM/ABI/low-RAM
			// signals are cached in MMKV, keyed on app version), reused here with the
			// lighter embedding floor instead of the Tier-1 verdict.
			await this.isDeviceClassEligible();
			const snapshot = this.getSnapshot();
			if (!snapshot) return false;

			const hasRequiredAbi =
				Platform.OS !== "android" ||
				snapshot.supportedAbis.includes(REQUIRED_ANDROID_ABI);
			const classEligible =
				snapshot.totalMemory >= EMBEDDING_MIN_TOTAL_MEMORY_BYTES &&
				!snapshot.isLowRam &&
				hasRequiredAbi;
			if (!classEligible) return false;

			const freeDisk = await DeviceInfo.getFreeDiskStorage();
			if (freeDisk < EMBEDDING_MIN_FREE_DISK_BYTES) return false;

			return !ThermalService.isThrottledForTier1();
		} catch (error) {
			console.warn(
				"DeviceCapabilityService.canRunEmbeddings failed (fail-closed)",
				error,
			);
			return false;
		}
	}

	/** The cached capability snapshot, or `null` if none/stale-parse. */
	static getSnapshot(): CapabilitySnapshot | null {
		return this.readSnapshot();
	}

	// --- Internals ---------------------------------------------------------

	private static readSnapshot(): CapabilitySnapshot | null {
		try {
			const json = storage.getString(STORAGE_KEYS.DEVICE_CAPABILITY_SNAPSHOT);
			if (!json) return null;
			return JSON.parse(json) as CapabilitySnapshot;
		} catch (error) {
			console.warn("DeviceCapabilityService: snapshot read failed", error);
			return null;
		}
	}

	private static writeSnapshot(snapshot: CapabilitySnapshot): void {
		try {
			storage.set(
				STORAGE_KEYS.DEVICE_CAPABILITY_SNAPSHOT,
				JSON.stringify(snapshot),
			);
		} catch (error) {
			console.warn("DeviceCapabilityService: snapshot write failed", error);
		}
	}
}
