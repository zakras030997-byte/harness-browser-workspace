# Validation ·0.3.1 ·15 November2026

## Confirmed locally

- Eight browser suites: chat ownership, personal-tab denial, explicit reveal, native framing/broker identity, per-page preview, independent close, headless form, real extension in temporary test Chromium, multi-card UI/drag/focus/dispose and unavailable-source close behavior.
- Learning suites: inferred public path/query, private observed account-menu recipe, no persisted credentials/responses, Chrome account/fresh read checks, cross-chat denial, bounded capture/audit, timeout/no automatic retry, no late save after close, CDP object-key order independence.
- Retention tests use controlled clocks:7day incidental,3distinct days promotion,180day familiar, important YouTube no expiry, byte/count caps preserving existing files, stale cache pruning, no per-chat copy for shared replay.
- Route refresh tests: validated v2 replaces v1 for same source page/fields, field-order deduplication, page scope and unsupported/ambiguous fallback.
- Installer/profile: same package upgrade without duplicate rows; unknown registrations/links denied; unrelated model/mail/drive/project configuration retained; legacy native registration disabled only with explicit migration. Signed official application inspected in dry-run without profile writes.
- New direct Computer Use helper: real initialize→check_permissions(prompt:false)→stdin EOF, plus argument/lifecycle/UNKNOWN tests. No standalone CuaDriver.app, no app patch, no permission grants or GUI actions in this helper test. Permission booleans reflect the actual host responsibility chain; do not treat Node test grants as proof of Harness grants.
- Global tool definitions accepted by official Harness SDK. Distribution allowlist excludes private pairing/config/cookies/chat histories/recipes and test bootstraps.

## Existing working-client E2E before portable packaging

The same existing Harness chat on Luna Off performed YouTube account menu observe→discover→save→close→fresh replay, then repeated training and selected the saved private recipe through the common router. Account display fields matched, no page/cache for replay, one recipe before/after. This validates the workflow in the working development installation, not a clean installation on another Mac.

## Not claimed

- No physical second Mac or full Intel installation acceptance.
- Focus-independent background input is confirmed only for the controlled AppKit form below. Other applications and TCC environments can differ.
- No native Electron sidebar control in0.3.0. Legacy carrier overlay and ad-hoc signing are removed.
- No arbitrary authenticated site compiler, arbitrary read-only POST inference, login/CSRF chain recovery or writes learned automatically.
- No universal performance or token-cost benchmark. Previous GitHub comparison used a fixed public API and sequential warm-context runs; private YouTube transport timing is not full model-turn latency.

The signed upstream helper checksum/provenance and installer hashes are included with release assets. The official Harness app is not redistributed. Test JSON/screenshots are local evidence and are excluded from the package.


## Local Computer Use follow-up, 2026-11-15

On official Harness 0.2.2-rc.3, in the existing tester chat on Luna Off, actual Accessibility and Screen Recording grants were confirmed. Window capture, text insertion through a fresh AX token, Apply, post-action state readback and the live Mac-window card passed against the disposable Harness CU Check AppKit fixture. Fixture output was `Готово: Harness Computer Use OK`. A second single click and release passed. No new Harness profile or client was created; app.asar and app-update.yml hashes were unchanged and deep strict codesign verification passed.

The first live attempt exposed model confusion between invented element indexes and actual markdown indexes. The local follow-up now returns explicit action_elements tokens, rejects stale/unknown tokens and text input to noneditable roles, and refuses arguments to computer_state. Ten automated checks passed; one optional helper test was skipped.

The first follow-up did not establish focus independence. A subsequent monitored run on Luna Off used the same existing client/chat and a fresh controlled AppKit form. The agent captured the window, inserted text, read it back, pressed Apply once, checked the output and released the lease. NSWorkspace reported the same Chrome process frontmost at both text-change and button callbacks; NSRunningApplication.current.isActive was false for the target at both callbacks. Activation notifications and 100 ms polling never observed the target frontmost. The expected output and exactly one click were confirmed independently. No automation actions switched apps during the run; the owner submitted the test prompt and switched to Chrome.

The fixture's local NSApp.isActive flag became true on the button callback while both system-level focus signals remained unchanged. We therefore do not use that local AppKit flag or the helper's background label alone as evidence of global focus. This result is scoped to this form, not every application. The fixes and this validation are included in 0.3.1; original 0.3.0 assets remain unchanged.
