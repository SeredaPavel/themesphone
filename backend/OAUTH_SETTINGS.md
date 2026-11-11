# Вход Google, Яндекс и Telegram

Новый вход использует отдельные серверные обработчики и библиотеку openid-client
6.8.9. Штатные внешние Strapi Grant providers остаются отключены. Email-вход,
подтверждение и восстановление пароля сохраняются.

## Серверные настройки

В backend `.env`: `OAUTH_ENABLED=true`, `OAUTH_BRIDGE_SECRET` (64 hex-символа),
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `YANDEX_CLIENT_ID`,
`YANDEX_CLIENT_SECRET`, `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET`.
`OAUTH_ALLOWED_ORIGINS` — явный список HTTPS origins; production Compose
перечисляет .ru/.com с www и без него. Без флага функциональность отключена.

В frontend.env: `OAUTH_ENABLED=true` и тот же `OAUTH_BRIDGE_SECRET`.
Provider secrets во frontend не передаются. Значения никогда не получают
префикс NEXT_PUBLIC. Локальные секреты хранятся в игнорируемых
`.local/oauth/backend.env` и `.local/oauth/frontend.env`.

`POST /api/oauth/bridge` Strapi принимает только серверный ключ. В публичном
Caddy CMS этот путь остаётся закрыт; публичные CRUD-маршруты для OAuth-таблиц
не создаются. Не включать соответствующие разрешения Public/Authenticated.

## Поток и правила аккаунтов

1. Кнопка отправляет POST в Next.js `/api/connect/{provider}` с проверкой Origin.
2. Backend сохраняет короткоживущий запрос в PostgreSQL. Браузер получает
   отдельную HttpOnly SameSite=Lax cookie для провайдера. На HTTPS — Secure.
3. Google/Telegram используют code + PKCE S256 + state + nonce. ID-токены
   проверяются по JWKS: подпись RS256, issuer, audience, nonce и срок действия.
   Яндекс использует code + PKCE S256 + state, серверный `/info` и проверку client_id.
4. Callback принимает только code flow, сопоставляет state, cookie и origin,
   однократно расходует запрос. При связывании проверяются тот же пользователь
   и та же сессия, с которой начато подключение.
5. Идентификатор — provider + постоянный sub/id, а не email или username.
   Совпадение почты никогда не объединяет аккаунты автоматически.
6. Новый пользователь указывает email (для Google/Яндекса он может быть
   предварительно заполнен). Создаётся local user без скрытого пароля,
   отправляется наше письмо подтверждения. До подтверждения OAuth-вход запрещён.
   После подтверждения пользователь повторяет вход через сервис.
7. Для существующего email пользователь сначала входит привычным способом,
   затем подключает сервис из кабинета. Email-аккаунт и его заказы сохраняются.
8. Последний способ входа отключить нельзя; изменения сериализуются блокировкой
   строки пользователя. Пароль можно задать через существующее восстановление.

В БД добавляются `oauth_flows` и `oauth_identities`. Callback и onboarding
однократны также при параллельных запросах. Начало и завершение регистрации
координируются с email-регистрацией advisory lock на нормализованный email.
Токены провайдеров не сохраняются в БД, localStorage или URL сайта; JWT Strapi
передаётся только Next.js для установки существующей HttpOnly cookie.
Старые `/api/set-token`, Apple callback и клиентский `/auth/callback` отключены.

## Redirect URI

Для каждого provider (`google`, `yandex`, `telegram`) указываются:

```text
https://themesphone.ru/api/auth/{provider}/callback
https://www.themesphone.ru/api/auth/{provider}/callback
https://themesphone.com/api/auth/{provider}/callback
https://www.themesphone.com/api/auth/{provider}/callback
```

Google пока в Testing с добавленным тестовым пользователем. До общего запуска
нужно завершить Branding, реальные страницы privacy/terms и публикацию приложения.
Локальные адреса не добавляются в production OAuth-клиент; для реального входа
локально нужен отдельный тестовый клиент провайдера.

## Локальная проверка

Windows PowerShell из корня проекта, Node.js 22:

```powershell
node scripts/local-oauth.cjs setup
node scripts/local-auth.cjs start --oauth
# После сборки frontend, в отдельном терминале:
node scripts/local-oauth.cjs frontend
# В отдельном терминале; только Mailpit и themesphone_auth_dev:
node scripts/check-local-oauth.cjs
```

`backend/tests/oauth-providers.test.cjs` проверяет реальные подписи тестовых
ID-токенов через openid-client с подставным HTTPS transport; реальных аккаунтов
и писем не использует. Backend Docker build запускает эти тесты до сборки.
Frontend tests проверяют Origin/cookies/bridge/legacy callbacks.
Интеграционный скрипт проверяет настоящую PostgreSQL и реальные письма в Mailpit,
с подставной личностью провайдера; production SMTP и БД запрещены защитами.

## Публикация

Перед сменой схемы сохранить проверенный дамп production-БД и конфигурацию.
Установить backend/frontend настройки и production Compose. Сначала развернуть
проверенные образы, затем установить только точные разрешения методов/путей из
`deploy/themesphone-public.caddy`, сохранив общий запрет API и соседние сайты.
Проверить validate/reload, оба соседних сайта, сохранённые ограничения оплаты,
скачивания и CMS bridge. Не запускать старый publish-public.sh повторно.

После развёртывания нужен настоящий интерактивный вход во все три сервиса,
подключение к существующей учётке, повторный вход и отмена. Локальные подставные
ответы не доказывают работоспособность настроек внешних приложений.
