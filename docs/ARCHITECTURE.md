# Архитектура0.3.0

Official signed Harness → profile bundle → scoped tools. App bundle/updater не меняются.

- Изолированный Chromium: публичный Playwright MCP, отдельный live-session context, loopback capability preview.
- Внешний Chrome: nativeMessaging→private Unix broker→extension; actual chat identity фиксируется handshake и не подменяется params. Собственные окна/группы и привязка tabId к чату. Host name com.anodhas.browser_workspace.
- Public learner: observed JSON GET, две пробы, одна переменная, echo/schema validation, credential-free replay before publish. Shared metadata only; source page/fields задают ключ обновления маршрута.
- Private YouTube: narrowly allowlisted observed account_menu READ, Chrome-local cookies/fresh auth, account fingerprint, per-chat recipe, no response cache. Нет универсального private POST compiler.
- Site memory: stable stateDir, byte/count caps, tiers/expiry on use, no background timer, existing task chat history outside scope.
- Computer: package-owned signed cua-driver direct/embedded, standard policy, no run-script/unrestricted/standalone app, lazy spawn and stdin EOF; core window leases and read-only preview.

Native Electron sidebar overlay прежнего0.2.x исключён из установки и exports. Git history/tag прежней версии сохраняют исходник. All page/console/connector contents remain untrusted data. Approval pipeline and task authorization remain in effect.
