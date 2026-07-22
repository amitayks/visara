# Releasing Visara

One command ships to **both stores**:

```bash
npm run release 3.0.2
```

That bumps every version anchor, commits, tags `v3.0.2`, and pushes. The tag
triggers [`.github/workflows/release.yml`](.github/workflows/release.yml),
which in parallel:

| Platform | Builds | Uploads to | Then you… |
|----------|--------|------------|-----------|
| Android  | signed `.aab` (ubuntu runner) | Google Play **internal** track | promote in Play Console, or `npm run deploy:play:production` |
| iOS      | signed archive (macOS 26 runner, cloud-managed signing) | App Store Connect → **TestFlight** | submit for review in App Store Connect |

Watch runs at <https://github.com/amitayks/visara/actions> (or `gh run watch`).

- **Version rules** (`bump-version.js`): build number = `major*10000 + minor*100 + patch`
  (3.0.2 → 30002); minor/patch ≤ 99. One build number per marketing version —
  re-releasing the same x.y.z needs a manual counter bump.
- **Release notes**: Play reads `release-notes/<version>.md` (≤ 500 chars).
  `npm run release` creates a placeholder if missing — write real notes first.
- A manual **workflow_dispatch** run of "Release" defaults to **dry-run**: it
  builds both apps and validates store credentials but publishes nothing.
  Use it to test the pipeline.

---

## One-time setup

### GitHub Actions secrets

| Secret | Contents | Status |
|--------|----------|--------|
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | `base64 < android/app/visara.keystore` | ✅ set |
| `ANDROID_UPLOAD_STORE_PASSWORD` | keystore password | ✅ set |
| `ANDROID_UPLOAD_KEY_ALIAS` | key alias | ✅ set |
| `ANDROID_UPLOAD_KEY_PASSWORD` | key password | ✅ set |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | raw JSON of the Play service-account key (see [DEPLOY.md](DEPLOY.md)) | ✅ set |
| `ASC_KEY_ID` | App Store Connect API key ID | ⚠️ **needs you** |
| `ASC_ISSUER_ID` | App Store Connect issuer ID | ⚠️ **needs you** |
| `ASC_API_KEY_P8` | full contents of the `AuthKey_<ID>.p8` file | ⚠️ **needs you** |

Until the three `ASC_*` secrets exist, the iOS job **skips with a warning**
(Android still ships), so the pipeline is usable immediately.

### iOS (the part only a human can do)

1. **Create an App Store Connect API key** —
   [App Store Connect](https://appstoreconnect.apple.com) → **Users and
   Access** → **Integrations** → **App Store Connect API** → **Team Keys** →
   **Generate API Key**, role **App Manager** (needed for cloud signing to
   create the distribution cert/profile automatically). Download the
   `AuthKey_<KEYID>.p8` — it can be downloaded **once**. Note the **Key ID**
   and the **Issuer ID** (top of that page).
2. **Create the app record** (first release only) — App Store Connect →
   **Apps** → **+** → New App: platform iOS, bundle ID `com.visara.app`
   (register it at <https://developer.apple.com/account/resources/identifiers>
   if it's not in the dropdown), SKU e.g. `visara`.
3. **Set the secrets:**

   ```bash
   gh secret set ASC_KEY_ID --body "ABC123DEFG"
   gh secret set ASC_ISSUER_ID --body "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   gh secret set ASC_API_KEY_P8 < AuthKey_ABC123DEFG.p8
   ```

No manual certificate work is needed: `xcodebuild -allowProvisioningUpdates`
with the API key creates/renews the cloud-managed **Apple Distribution**
certificate and App Store profile on its own, in CI and locally.

### Android

Fully configured. Signing lives in the gitignored `android/gradle.properties`
locally (built from
[`android/gradle.properties.example`](android/gradle.properties.example) +
the four `VISARA_UPLOAD_*` values) and in Actions secrets for CI. Play upload
uses the service account from [DEPLOY.md](DEPLOY.md).

---

## Local (no-CI) deploys

Both store uploads also run from a dev machine — same scripts CI uses:

```bash
node scripts/deploy-play.mjs --dry-run        # Android: plan + auth check
npm run deploy:play:build                     # Android: build AAB + upload to internal

npm run deploy:appstore -- --dry-run          # iOS: archive + export IPA, no upload
npm run deploy:appstore                       # iOS: archive + upload to ASC
```

The iOS script reads `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_API_KEY_PATH` from
`.env` (see `.env.example`). Requires Xcode 26+.

---

## Promoting to production

The pipeline deliberately stops at **internal / TestFlight** — going public is
an explicit human step:

- **Google Play**: Play Console → promote the internal release, or
  `npm run deploy:play:production` (creates a **draft** production release to
  review in the console), or staged rollout:
  `node scripts/deploy-play.mjs --track production --status inProgress --rollout 0.1`.
- **App Store**: App Store Connect → your app → select the TestFlight build →
  fill the version page → **Submit for Review**.

First-ever public release on each store additionally needs the store listing
done once in each console: screenshots, descriptions, content rating
questionnaire, data-safety / privacy-nutrition forms, and a privacy policy URL.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Version guard fails on tag push | An anchor disagrees with the tag — run `node scripts/check-version-reconciliation.js <x.y.z>` locally; always release via `npm run release`. |
| Play: `versionCode already used` | That code was uploaded before. Release the **next** patch version instead (see version rules above). |
| iOS job "skipped" warning | The three `ASC_*` secrets aren't set — §iOS one-time setup. |
| iOS: "No profiles / no signing certificate" in CI | API key role too low (needs **App Manager**+) or bundle ID `com.visara.app` not registered on the developer portal. |
| iOS: upload OK but build missing in TestFlight | Processing takes 10–30 min; also check App Store Connect email for rejection notices (e.g. export compliance). |
| Play: 403 on upload | Service-account permission propagating or revoked — see DEPLOY.md troubleshooting. |
