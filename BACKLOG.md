# Backlog — post RN-0.86 modernization (2026-07-03)

Carried out of the upgrade effort (see `openspec/changes/archive/2026-07-03-*`).
Items here are known, deliberate deferrals — none block the app.

## Needs a 10-second human check
- **Album drag-reorder** (reanimated-dnd 2.0.0): the Sortable tree mounts and
  renders crash-free on device, but long-press reorder couldn't be driven by adb
  synthetic gestures. Long-press an album card on the Albums page and drag —
  confirm reorder sticks.
- **Photo-viewer pinch/zoom feel** under reanimated 4's new spring physics
  (functionally verified; feel-parity with v3 was explicitly not a goal —
  `Reanimated3DefaultSpringConfig` is the escape hatch if it feels off).

## Product gaps (pre-existing, surfaced during upgrade QA)
- **Thumbnail pipeline is absent**: nothing populates `MediaFile.thumbnailUri`;
  the grid renders original `content://` URIs via expo-image (downscaled decode,
  works fine). A real thumbnail service would cut decode cost on huge libraries —
  the dead October branch (`f55d59d~..34c7e34`) contains a 3-tier caching
  implementation worth mining.
- **Documents mode** filters to `application/pdf` only (the old predicate matched
  every image — a no-op). If "documents" should include AI-labeled receipts/
  screenshots, wire the Label table into the filter.
- **VirtualizedLists-nested-in-ScrollView warning** on Main (pre-existing layout
  pattern in MainTemplate/PhotoGrid): benign but worth restructuring someday.

## Dependency watch
- **@notifee/react-native is archived upstream** (no maintenance). Works today on
  RN 0.86; plan a migration (e.g. expo-notifications) before the next major RN move.
- **reanimated 4.5.1 ↔ react-native-worklets 0.10.1 are lockstep-pinned** (exact).
  A future reanimated 4.6.x bump requires worklets 0.11.x in the same commit.
- **react-native-executorch pinned at 0.9.2** (project constraint). Its published
  compat table lags RN releases; re-verify before any future RN bump.
- `@bam.tech/react-native-image-resizer` needed a Podfile patch (stale manual
  New-Arch pod deps stripped at install time — see ios/Podfile). If a new release
  fixes the podspec, the patch block self-neutralizes and can be deleted.

## Dev-environment notes
- Local `android/gradle.properties` (untracked, holds signing secrets) needs
  `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1536m` — release-lint runs
  out of Metaspace at the old 512m with the expo module graph.
- Dev-mode Metro uses lazy bundles; rapid force-stop cycles can log transient
  `LoadBundleFromServerRequestError` — cosmetic, dev-only.
