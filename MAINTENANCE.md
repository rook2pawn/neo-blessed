# Maintenance Notes

This file tracks technical debt, modernization priorities, and test coverage guidance for `neo-blessed`.

## Snapshot (2026-03-06)

- Runtime baseline: core module load and non-interactive widget smoke checks pass.
- Lint baseline: `eslint lib` passes.
- Known runtime concern: terminal-heavy tests can hit OOM in constrained Windows/sandbox environments.
- Known environment caveat: PTY spawn may fail in restricted environments (`ConPTY` pipe permission errors).

## Old-File Sweep

Method: per-file last-touch date from `git log -1 --format=%ad --date=short`.

Notable legacy files (still old and likely stable data/fixtures):

- `usr/xterm.termcap` (2013-03-04)
- `usr/xterm.terminfo` (2013-03-04)
- `usr/xterm` (2013-03-05)
- `usr/xterm-256color` (2013-03-06)
- `usr/windows-ansi` (2013-08-02)
- `usr/linux` (2015-03-28)
- `example/ansi-viewer/*` (2015 range)
- many `test/widget-*.js` files (mostly 2015 range)

Interpretation:

- `usr/*` terminfo/termcap files are historical compatibility artifacts; do not refactor casually.
- `test/*` and `example/*` include very old demos and interactive scripts; treat as smoke/regression harnesses, not modern unit tests.

## Highest-Risk Legacy Areas

These files currently rely on scoped ESLint overrides due to deeply legacy control-flow/parser patterns:

- `lib/program.js`
- `lib/tput.js`
- `lib/keys.js`
- `lib/unicode.js`
- `lib/widgets/element.js`
- `lib/widgets/screen.js`
- `lib/colors.js`
- `lib/widgets/form.js`
- `lib/widgets/list.js`
- `lib/widgets/message.js`
- `lib/widgets/scrollablebox.js`

## Priority Roadmap

1. Terminal memory-growth investigation
2. Parser-core hardening (`program/tput/keys/unicode`)
3. Widget-core decomposition (`element/screen/list/scrollablebox`)
4. Override burn-down in `.eslintrc.json`

### 1) Terminal Memory-Growth Investigation

Targets:

- `test/widget-terminal.js`
- `test/widget-term-blessed.js`
- `lib/widgets/terminal.js`

Actions:

- Add opt-in memory telemetry (`process.memoryUsage`) around render/event loops.
- Confirm if growth is unbounded in normal local shells (non-sandbox).
- Add lifecycle guards for listeners/timers to verify teardown is complete.

Exit criteria:

- 5-10 minute terminal smoke run with stable memory trend (no linear growth).

### 2) Parser-Core Hardening

Targets:

- `lib/program.js`, `lib/tput.js`, `lib/keys.js`, `lib/unicode.js`

Actions:

- Break large functions into smaller pure helpers.
- Replace assignment-in-condition and comma-expression control flow.
- Add focused tests for CSI/OSC parsing edge cases.

Exit criteria:

- Remove most parser-specific ESLint overrides.

### 3) Widget-Core Decomposition

Targets:

- `lib/widgets/element.js`, `lib/widgets/screen.js`, `lib/widgets/list.js`, `lib/widgets/scrollablebox.js`

Actions:

- Split rendering, layout, and state mutation logic into separate helpers/modules.
- Add deterministic tests for render buffer transformations where possible.

Exit criteria:

- Complexity and depth overrides no longer needed for these files.

## Recommended Test Matrix

Run in CI/non-interactive:

- `node -e "require('./'); console.log('ok')"`
- `node test/tput.js`
- `node test/helpers.js`
- `node test/tail.js`
- `node test/widget-exit.js`
- `node test/widget-noalt.js`
- `node test/widget-termswitch.js`
- `npm run lint`

Run locally (interactive):

- `node test/widget-terminal.js`
- `node test/widget-term-blessed.js`
- `node test/widget-video.js`

Platform matrix:

- Windows (ConPTY path)
- Linux (PTY + terminfo path)
- macOS (PTY + terminal escape behavior)

## Lockfile Policy

Use one lockfile strategy only.

- If using `pnpm`, keep `pnpm-lock.yaml` and avoid committing `package-lock.json`.
- If switching to `npm`, commit `package-lock.json` and remove `pnpm-lock.yaml`.
