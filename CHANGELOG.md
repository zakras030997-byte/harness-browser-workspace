# 0.4.0 · Shared DevTools browser core

- Default extension-free Google Chrome with a client window, chat-owned tabs and a shared verified public-read catalog. OpenCode adapter included as source, never registered by the Harness installer.
- SSO redirects keep ownership; stale URLs yield a structured result; exact-owner closing is independent of page URL. Tab failures and unknown console outcomes remain isolated.
- Role/exact-name form targeting, legacy selector compatibility and distinct missing/ambiguous/invalid-selector errors.
- Public read learning, verified replacement without duplicates, bounded SQLite memory and retention.
- One-time macOS Automation setup for blank tabs in the exact agent window; website actions remain DevTools. Universal local helper source and binary included.
- Existing Computer Use fixes retained. Installer uses official bundled Node; no extension/Chromium setup, app/signature/updater patch or OpenCode configuration changes. Busy shared-runtime upgrades refuse instead of stopping clients.
- Legacy extension recipes and browser mini-cards are not migrated/enabled by default. Private API learning remains unsupported in the new core.

# 0.3.1 · Computer Use target validation

- Explicit snapshot tokens in action_elements; stale/unknown tokens and text input to noneditable elements are refused before dispatch.
- computer_state rejects supplied state/image arguments; callers must read the real window.
- Real signed-Harness capture, text, button, readback, live-card and release checks; focus validation is recorded in VALIDATION.md.
- Same plugin/profile upgrade, official signature and updater preserved.

#0.3.0 · Harness Use

- Official signed Harness0.2.2-rc.3 plugin installation/upgrade; no app clone, app.asar patch or updater/signature modification. Legacy native Electron sidebar overlay removed.
- Chrome-owned background windows, learned public read contracts, private YouTube account-menu learning/replay and common read router.
- Page-scoped verified route refresh/deduplication, bounded site retention and memory status.
- Browser JavaScript console/session metadata and explicit same-origin reads. Cookies are not exported into route memory.
- Computer Use moved to a package-owned direct/embedded helper with lazy startup and EOF cleanup. No standalone app or permission bypass.
- Public extension identity preserved; mismatched native host name corrected. Profile update supports same-destination upgrades and explicit legacy migration.

# Изменения

## 0.2.1

Исправлен крестик миниатюр: локальное скрытие больше не зависит от доступности источника. Добавлены ограничение ожидания, честное уведомление о неподтверждённом закрытии и отмена запросов при выгрузке UI. Соседние страницы стопки сохраняются. Для Mac закрывается просмотр, не приложение.

## 0.2.0

Убрана зависимость загрузки чата от браузерного MCP; браузер запускается только по явному запросу.

Единая установка трёх браузерных режимов и карточек. Добавлены native Browser инструменты, встроенный оконный runtime без отдельного CuaDriver.app, привязка окна к чату, фоновые действия и live preview. Установщик проверяет точную сборку Harness, создаёт отдельный carrier и сохраняет профиль.

Оконный режим экспериментальный: подтверждённые проверки и ограничения — в VALIDATION.md.
