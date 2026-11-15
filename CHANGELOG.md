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
