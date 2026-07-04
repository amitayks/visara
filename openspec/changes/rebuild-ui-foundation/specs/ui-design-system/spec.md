## ADDED Requirements

### Requirement: Design tokens are the single source of truth for styling

The design system SHALL define one token set covering color, spacing, radii, typography, and motion, and all rebuilt UI styling SHALL derive from it:

- **Color**: semantic tokens (background/surface tiers, text tiers, accent, borders, status/feedback, overlay/scrim, navigation) each defined with a light value and a dark value; the dark palette is the reference design (dark-first) and both palettes SHALL be equally complete.
- **Spacing**: a scale whose named steps include 2, 12, and 20 — the values the old 8px-base scale lacked, forcing call-site arithmetic (`sm+xs`, `xs/2`, `lg−xs`) — either as explicit added steps or by adopting a 4px base.
- **Radii**: named steps including a pill/full radius.
- **Typography**: named font sizes, weights, and line heights, with line height resolved by the Text primitive rather than computed at call sites.
- **Motion**: named spring configurations and duration/easing values; animation code SHALL reference motion tokens instead of component-local constants.

UI code SHALL NOT hardcode color literals or off-scale spacing/font values. Surfaces that previously bypassed the theme (edge-swipe feedback overlay, thumbnail loading scrim, off-token 16px input text) SHALL render from tokens and read correctly in both themes.

#### Scenario: Spacing needs no call-site arithmetic

- **WHEN** rebuilt screens lay out gaps of 2, 12, or 20 points
- **THEN** each value resolves from a named spacing token with no arithmetic on scale values at the call site

#### Scenario: Previously hardcoded surfaces are theme-correct

- **WHEN** the edge-swipe feedback overlay and the thumbnail loading scrim render under the light theme and under the dark theme
- **THEN** their colors resolve from semantic tokens and are visually correct in both themes, with no fixed rgba literal that is wrong in one theme

#### Scenario: Motion uses named configs

- **WHEN** a primitive or surface animates (press feedback, progress fill, morph choreography, sheet springs)
- **THEN** its spring/duration parameters come from the motion tokens

### Requirement: Theme switching restyles without re-rendering media content

The theming engine SHALL be react-native-unistyles 3 consumed exclusively through owned wrapper APIs (the design system's theme hook and style-creation helpers), so that the typed-StyleSheet fallback engine (design decision D1) can replace Unistyles behind the identical wrapper API and token shape without changing call sites. Switching the app theme SHALL NOT re-render mounted media list content: gallery and album list cells restyle without their React components re-rendering.

#### Scenario: Theme flip leaves grid cells un-re-rendered

- **WHEN** the gallery grid is mounted with photos and the user switches the theme
- **THEN** all visible surfaces adopt the new theme's colors
- **AND** React profiling shows zero grid-cell re-renders attributable to the theme change

#### Scenario: Engine swaps behind the wrapper

- **WHEN** the fallback typed-StyleSheet engine replaces Unistyles (design D1 spike gate)
- **THEN** primitives and feature screens compile and behave unchanged, because they consume only the owned wrapper API and token shape

### Requirement: One theme-mode type with immediate apply and a resolved-theme status bar

The theming system SHALL support exactly three modes — `light`, `dark`, and `system` — declared as one shared TypeScript type that the settings store, the appearance UI, and the theme engine all import; duplicate local declarations of the mode type MUST NOT exist. Selecting a mode SHALL apply the resolved theme to all mounted UI immediately, without restart. `system` SHALL resolve from the current OS color scheme, re-resolve when the OS scheme changes while the app runs, and be the default when no persisted selection exists. The status bar style SHALL follow the RESOLVED app theme at all times — an in-app mode that overrides the OS scheme drives the status bar too. Persistence of the selected mode is owned by `settingsStore` (see `ui-state-management`); the appearance selection UI is owned by `settings-experience`.

#### Scenario: Forced dark under a light OS

- **WHEN** the OS reports a light color scheme and the user selects the Dark mode in-app
- **THEN** all mounted screens render the dark theme immediately
- **AND** the status bar switches to the style matching the dark app theme, not the OS scheme

#### Scenario: System mode tracks OS scheme changes

- **WHEN** the mode is `system` and the OS color scheme changes while the app is running
- **THEN** the app theme and the status bar re-resolve to the new scheme without restart

#### Scenario: Single shared mode type

- **WHEN** the codebase is typechecked
- **THEN** exactly one declaration of the theme-mode type exists and the settings store, appearance UI, and theme engine all import it

### Requirement: Owned primitive set, token-themed and accessible

The design system SHALL provide the owned primitive set — Text, Button, IconButton, Icon, Sheet, Dialog, Menu, Chip, SegmentedControl, SwitchRow, ListItem/Section, Toast, Skeleton, EmptyState, ProgressBar, and SelectionBar — and the set SHALL remain capped near this size (~15); feature screens SHALL compose these primitives rather than restyling raw React Native primitives ad hoc. Every primitive SHALL be themed exclusively via design tokens and render correctly in both themes. Every interactive primitive SHALL expose accessibility role, label, and state (selected/checked/disabled as applicable) to assistive technology. ProgressBar SHALL accept its progress as a Reanimated SharedValue so high-frequency pipeline progress animates with zero React re-renders (progress source per `ui-state-management`).

#### Scenario: Primitives render from tokens in both themes

- **WHEN** each primitive renders under the light theme and under the dark theme
- **THEN** every color, spacing, radius, and type value resolves from tokens with the correct per-theme value

#### Scenario: Screen reader announces role, label, and state

- **WHEN** a screen reader focuses interactive primitives
- **THEN** each announces a correct role and label
- **AND** stateful primitives announce their state — a SwitchRow announces on/off, a selected Chip or SegmentedControl segment announces selected, a disabled Button announces disabled

#### Scenario: Progress animates without React re-renders

- **WHEN** pipeline progress updates at high frequency during a processing drain
- **THEN** the ProgressBar fill animates from its SharedValue input with zero React re-renders of the bar or its parents

### Requirement: Icons render directly from the Material Design Icons package

The Icon primitive SHALL render glyphs directly from `@react-native-vector-icons/material-design-icons`, defaulting its color from the text color token and exposing named token sizes. `react-native-paper` SHALL NOT remain in the dependency tree.

#### Scenario: Paper removed, every glyph still renders

- **WHEN** dependencies install and icon-bearing screens render
- **THEN** `react-native-paper` is absent from the dependency tree
- **AND** every Material Design Icons glyph name the app references displays correctly, with no missing-glyph placeholders

### Requirement: Bottom sheets present natively via TrueSheet

All bottom-sheet surfaces SHALL present through the design system Sheet primitive wrapping TrueSheet native presentation; hand-rolled translateY/snap-point sheet implementations MUST NOT be rebuilt. A presented Sheet SHALL provide: a dimming backdrop that dismisses on tap; nested scrolling in which scrollable sheet content scrolls freely within the sheet and drag-to-dismiss engages only from the grabber or when the content is at its top; and dismissal resolved through presentation-lifecycle callbacks with no timer-based close races. Which surfaces present as sheets is owned by the feature capabilities (e.g. the photo info sheet in `gallery-experience`).

#### Scenario: Nested scroll does not fight dismissal

- **WHEN** a sheet contains content taller than its detent (e.g. photo info labels plus OCR text) and the user scrolls the content
- **THEN** the content scrolls within the sheet without dismissing it
- **AND** dragging down from the grabber, or from content already scrolled to its top, dismisses the sheet

#### Scenario: Backdrop dims and dismisses

- **WHEN** a sheet is presented
- **THEN** the UI behind it is dimmed by a backdrop
- **AND** tapping the backdrop dismisses the sheet

#### Scenario: Dismissal is race-free

- **WHEN** a sheet is dismissed by gesture or programmatically and immediately re-presented
- **THEN** open/close callbacks fire from the native presentation lifecycle, with no fixed-delay timers, and the visible state never desyncs from the controlling state

### Requirement: User-facing action errors surface as toasts

The design system SHALL provide toasts via sonner-native: one app-level Toaster host and an imperative toast API available to all features. A failed user-initiated action (e.g. share/copy/delete, album operations, settings data actions) SHALL surface a toast with a human-readable message; user-facing action errors MUST NOT be reported only to the console. Which actions report which errors is owned by the feature capabilities.

#### Scenario: Failed action produces a visible toast

- **WHEN** a user-initiated action fails (e.g. photo deletion throws)
- **THEN** a toast appears with a human-readable error message
- **AND** the failure is not swallowed as a console-only log

### Requirement: Unistyles and Reanimated styles remain separate style entries

Wherever a component combines token-derived (Unistyles) styles with Reanimated animated styles, the two SHALL be passed as separate entries in the style array and MUST NOT be merged or spread into a single style object (the documented Unistyles–Reanimated interop constraint). Theme updates SHALL keep restyling the token-derived entry and Reanimated SHALL keep driving the animated entry, with neither overwriting the other.

#### Scenario: Animated primitive survives a theme flip

- **WHEN** an animated, themed component (e.g. Button press-scale or the morphing bottom bar) has run or is running its animation and the theme is switched
- **THEN** its token-derived colors update to the new theme
- **AND** its animated transform/opacity values remain driven by Reanimated, with neither style source clobbering the other
