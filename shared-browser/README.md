# Shared browser core · 0.4.0

Shared local SQLite catalogue and one demand-started Node owner of an agent Google Chrome. No browser extension, public debugging port or personal Chrome attachment. Harness has 11 work tools and one explicit setup tool; the optional native OpenCode adapter has 11 work tools and independent native permissions.

## Lifecycle and isolation

Each authenticated client has its own normal Chrome window; every tab belongs to a client and an actual host chat, never a model-supplied identity. One private Unix socket fixes the client identity, scopes chat IDs and enforces message bounds/cancellation. Disconnecting one client leaves the other running; after both disconnect, owned resources close normally. No global kill, profile copying or arbitrary debugging-port probing.

An exclusive owner lease and Chrome profile lock fail closed. Existing profileDirectory must be explicitly registered in an owner-only profile-registry.json mapping opencode to the exact profile path. This is an existing dedicated AGENT profile, never the personal Chrome profile. With no configured existing profile, the runtime lazily creates its own agent profile under its state directory.

Separate windows use native/chrome-tab only for another EMPTY tab in the exact verified Chrome PID/parent/profile/window. All website navigation and actions remain DevTools. Native source and universal macOS binary are included. The one-time Harness setup tool may request Automation only after the owner's setup request; ordinary operations never prompt automatically or activate Chrome. windowMode=shared uses one agent window through CDP alone. Headless checks do not prove desktop focus; the documented visible-window tests are separate.

## Host adapters

Harness installs through the package shared-provider export; settings default to the official bundled Node and persistent DSH_HOME state. The installer provides explicit runtime settings in the existing profile, without altering the application or OpenCode.

OpenCode 2.3 users can manually register the exported opencode-plugin package. The Harness installer NEVER does this. Options:

```json
{
  "stateDirectory": "/absolute/private/common-state",
  "nodeExecutable": "/absolute/node-24.9-or-newer",
  "sharedRuntime": true,
  "windowMode": "separate"
}
```

Use the SAME explicit stateDirectory, windowMode and optional registered profileDirectory in both clients. OpenCode permissions are anodhas_browser and independent anodhas_browser_script; ask/allow/deny are set by the owner, never granted by setup. Do not use its reserved built-in browser permission or remove that browser's attachment gate. Versioned adapters must be upgraded while the shared runtime is idle. The Harness installer refuses a busy or unresolved shared socket and does not stop other clients.

## Supported learning

Credential-free same-origin HTTPS GET JSON, two distinct observed inputs, one varying path/query, 1–8 small primitive fields and an echo field. Replays are fresh, semantically checked and do not open a page. Schema change requires browser validation; unknown/auth/temporary failures do not trigger blind retries. Confirmed replacements use revision CAS and do not duplicate a route per chat.

Public recipes share one catalog. Private references are client/chat/account-scoped placeholders; a generic private request learner/provider is NOT supplied. Legacy YouTube extension recipes are not migrated. Cookies stay in the agent Chrome; login/logout affects both windows. Console can change a site and must stay within the owner's task. Page/console text is untrusted.

## UI and SSO

SSO/login navigation has a separate policy from public-recipe validation. Ownership stays on chat/tabId, current URLs omit sensitive query/fragment metadata, stale URLs yield TAB_NAVIGATED before action. Closing is independent of the old URL or renderer state. Console timeouts quarantine subsequent actions in that tab; independent closing and sibling tabs remain available.

Prefer interact(role, exact name) from a fresh snapshot. Unique CSS, role selectors and snapshot shorthand are also accepted. Missing, ambiguous and invalid selectors have distinct errors. Never pick the first match or repeat an unknown action. Always verify UI postconditions; success dispatch alone is not proof.

## Storage and verification

20 MiB routes, 936 public operations and 256 KiB/64 private-reference reserve; audit 10 MiB/7 days. Incidental sites expire after 7 inactive days, familiar sites after 180; YouTube is pinned by age, not by validity. Cleanup happens on use, not a watcher. Full storage refuses new entries and preserves existing useful routes. No complete response/credential/page persistence. PNG capture separately caps 5 MiB/file, 10 MiB total, one day on capture use. Profile caches/chat history/RAM are outside these budgets.

npm run test:shared checks actual Chrome learning, controlled cross-origin HTTPS redirects, UI targeting, sibling recovery, cross-process writes, private scope, authorization, cancellation, two transports and normal disposal. Existing Harness Luna Off and OpenCode chat checks are described in VALIDATION.md; another physical Mac/complete Intel acceptance remains unverified.
