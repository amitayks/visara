# Deploying Visara to Google Play

> **Looking for the release pipeline?** Routine releases to BOTH stores are one
> command — `npm run release <x.y.z>` — see [RELEASING.md](RELEASING.md). This
> document covers the Google Play mechanics that pipeline builds on.

A deterministic, credential-driven flow that **builds the signed release AAB and
uploads it to Google Play** via the **Android Publisher API v3** — no browser
automation / "computer use". It can be run by you from the CLI **or** driven by
Claude / a subagent (see [Run by Claude](#run-by-claude--a-subagent)).

- **Script:** [`scripts/deploy-play.mjs`](scripts/deploy-play.mjs) (Node ≥ 20, uses
  native `fetch` + `google-auth-library`)
- **Package:** `com.visara.app` · **Current version:** `3.0.0` (versionCode `30000`)
- **Play app:** developer `4942243193728464679`, app `4975592433386272475`
  (the API only needs the **package name** + a **service account** with release access)

---

## One-time setup

### 1. Google Play API access + service account

1. Google Play Console → **Setup → API access**.
2. **Link a Google Cloud project** (create one if needed).
3. In that GCP project, enable the **Google Play Android Developer API**
   (APIs & Services → Library → search "Android Publisher").
4. Create a **service account** (GCP → IAM & Admin → Service Accounts →
   Create). No GCP roles are needed. Create a **JSON key** for it and download it.
5. Back in Play Console → **Users & permissions** → **Invite new user**, enter the
   service-account email (`…@…​.iam.gserviceaccount.com`), and grant **app-level**
   permissions: **Release to testing tracks** (add **Release to production** if you
   want to push the `production` track). **Admin is not required.**
6. Save the JSON key somewhere gitignored (the repo already ignores
   `service-account*.json`), e.g. `./service-account.json`.

> Newly granted access can take a few minutes to propagate. A `403` on the first
> run usually just means "wait a bit".

### 2. Upload keystore + Gradle signing props

The release `signingConfig` in `android/app/build.gradle` is gated on four gradle
properties. Put them in **`android/gradle.properties`** (gitignored) or pass them
with `-P` on the gradle command line:

```properties
VISARA_UPLOAD_STORE_FILE=visara-upload.keystore   # path relative to android/app/
VISARA_UPLOAD_STORE_PASSWORD=********
VISARA_UPLOAD_KEY_ALIAS=visara-upload
VISARA_UPLOAD_KEY_PASSWORD=********
```

The `.keystore`/`.jks` files are gitignored — **never commit them.** If Play App
Signing is enabled (recommended), this is your **upload key**; Google re-signs with
the app signing key on their side.

### 3. Gradle wrapper (currently missing from a clean checkout)

`android/gradle/wrapper/*` is **gitignored**, so a fresh clone can't run gradle.
On your existing Android machine it's already present; for a clean checkout / CI,
regenerate it once (needs a system Gradle **or** any Gradle install):

```bash
cd android && gradle wrapper --gradle-version 8.10.2   # match your RN 0.81 gradle
```

Then use a JDK compatible with that Gradle (17 or 21 — **not** 26). Consider
committing the wrapper for reproducibility.

### 4. Node

Node **≥ 20** (for native `fetch` + `process.loadEnvFile`). This repo uses Node 24.

### 5. Configure `.env`

```bash
cp .env.example .env      # then edit .env
```

Set `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` to your key path (or inline JSON). The
`VISARA_UPLOAD_*` values in `.env` are **documentation only** — Gradle reads them
from `android/gradle.properties`, not `.env`.

---

## Run (deterministic)

Always **dry-run first** — it authenticates, checks Play API access, and prints the
plan **without** creating/committing anything:

```bash
node scripts/deploy-play.mjs --dry-run
```

Then:

| Goal | Command |
|------|---------|
| Build the AAB **and** upload to `internal` (completed) | `npm run deploy:play:build` |
| Upload the **freshest existing** AAB to `internal` | `npm run deploy:play` |
| Push to **production** as a **draft** (review in console) | `npm run deploy:play:production` |
| Staged rollout to production (10%) | `node scripts/deploy-play.mjs --track production --status inProgress --rollout 0.1` |
| Upload a specific AAB | `node scripts/deploy-play.mjs --aab path/to/app.aab` |

**Useful flags** (env vars in parentheses; flags win):
`--track internal\|alpha\|beta\|production` (`PLAY_TRACK`) ·
`--status completed\|draft\|inProgress\|halted` (`PLAY_STATUS`) ·
`--rollout 0.1` (`PLAY_ROLLOUT`, required for `inProgress`) ·
`--build` (build the AAB first) · `--aab <path>` (else auto-detects the newest
`android/app/build/outputs/bundle/release/*.aab`) ·
`--notes <file>` (defaults to `release-notes/<version>.md`) ·
`--service-account <path>` (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`) ·
`--package com.visara.app` (`PLAY_PACKAGE`) · `--dry-run`.

The script: authenticates → **creates an edit** → **uploads the bundle** →
**assigns it to the track** with the release notes (and `userFraction` for staged
rollout) → **commits** → **verifies** the versionCode landed on the track. On any
error it **deletes the edit** to avoid orphaned drafts, and prints the Play API
error body.

---

## Run by Claude / a subagent

Give the agent this ordered flow (it's adaptive — it can self-heal the common
failures):

1. **Confirm the version** — read `versionCode`/`versionName` from
   `android/app/build.gradle`. If this versionCode was already uploaded, run
   `npm run bump <x.y.z>` first (Play rejects duplicate versionCodes).
2. **Dry-run** `node scripts/deploy-play.mjs --dry-run` and read the plan +
   confirm auth/permission are OK. Fix any prerequisite the output names.
3. **Build + upload**: `npm run deploy:play:build` (or `npm run deploy:play` if an
   AAB already exists) for the intended `--track`/`--status`.
4. **Parse the result** — the script exits non-zero with a categorized message on
   failure (see exit codes below). Map the message to the fix in
   [Troubleshooting](#troubleshooting) and retry.
5. **Verify** — the script's `verifyLanded` read-back confirms the versionCode is on
   the track; report the track, versionCode, and status back to the user.
6. **Never** log or echo secrets, and **don't** commit `.env`, keys, or keystores.

Exit codes: `1` usage/validation · `2` build or API failure · `3` permission/auth.

---

## Troubleshooting

| Symptom | Cause → Fix |
|---------|-------------|
| `APK/AAB versionCode NNNN has already been used` | You already uploaded this versionCode. `npm run bump <x.y.z>` (bumps versionCode), rebuild, re-run. |
| `403` / "permission denied" / "does not have permission" | Service account not granted **Release** on this app, or access still propagating. Re-check Play Console → Users & permissions; wait a few minutes. |
| `404` / "package not found" | Wrong `--package`, or the SA is linked to a different Play account. Must be `com.visara.app` and the SA's console. |
| "Edit … conflict" / "another edit is in progress" | A stale edit exists (e.g. someone editing in the console). Close it, or wait; the script always deletes its own edit on failure. |
| "No AAB found" | Build didn't run or output is elsewhere. Use `--build`, or pass `--aab <path>`. |
| Gradle build hangs / "gradle-wrapper.jar not found" | Missing wrapper (see setup §3) or an incompatible JDK (use 17/21, not 26). |
| Auth "hangs" | You didn't set `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — the script errors fast when it's unset; make sure it points at a real key file. |

---

## How it works (Android Publisher API v3)

```
POST   /edits                          → open an edit  ({ id })
POST   /upload/.../edits/{id}/bundles?uploadType=media   → upload the .aab ({ versionCode })
PUT    /edits/{id}/tracks/{track}      → assign versionCode + release notes (+ userFraction)
POST   /edits/{id}:commit              → publish
GET    /edits/{id}/tracks/{track}      → (verify) confirm the versionCode landed
```

Auth is a service-account JWT exchanged for an OAuth token with scope
`https://www.googleapis.com/auth/androidpublisher`. Every request has a timeout, so
the script can't hang on the network.
