## ADDED Requirements

### Requirement: Toolchain follows RN 0.86 template pins, not latest

The dev toolchain SHALL align to the RN 0.86 template: TypeScript stays 5.9.3 (TS 6.0 rejected), Babel stays on 7.x bumped to ^7.29 (Babel 8 rejected), jest moves to template ^29.6.3 with `@react-native/jest-preset@0.86.0`, `@testing-library/react-native` moves to ^14.0.1 with its required `test-renderer` peer. The stale `@types/react-native@0.72.8` and `metro-react-native-babel-preset` devDependencies SHALL be removed (they conflict with RN-bundled types/preset).

#### Scenario: Type and test toolchain is coherent

- **WHEN** `npm run typecheck` and `npm test` run after the upgrade
- **THEN** both exit 0 (typecheck clean; jest resolves the @react-native/jest-preset and passes with no tests via passWithNoTests)

#### Scenario: Stale packages gone

- **WHEN** `package.json` is inspected
- **THEN** `@types/react-native` and `metro-react-native-babel-preset` are absent

### Requirement: Lint scans only source, not native build artifacts

Biome configuration SHALL exclude generated native build output (at minimum `android/**/.cxx/**`, `android/**/build/**`, `ios/Pods/**`, `ios/build/**`) so `npm run lint` reports only real source diagnostics and exits 0 on the upgraded tree.

#### Scenario: Lint is green and honest

- **WHEN** `npx biome check .` runs
- **THEN** it exits 0 with no diagnostics sourced from `.cxx`, `android/**/build`, or Pods paths

### Requirement: npm scripts run on macOS

The `package.json` scripts SHALL work on macOS/zsh: the Windows-only `.\gradlew.bat` invocations (`apk`, `ca`) are replaced with POSIX `./gradlew` forms, and the typo script `cr\`` is removed. Existing script names in active use (`android`, `ios`, `start`, `typecheck`, `test`, `lint`, `deploy:play*`, `bump`) SHALL keep their names and semantics.

#### Scenario: Gradle scripts work from macOS

- **WHEN** `npm run apk` or `npm run ca` executes on the Mac
- **THEN** the underlying `./gradlew` command runs (no `.bat` resolution error)
