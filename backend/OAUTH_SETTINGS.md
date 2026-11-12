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

Для серверного выхода Telegram через отдельный HTTP(S) CONNECT proxy можно
задать backend-переменную `TELEGRAM_PROXY_URL=http://proxy-host:3128`.
Она применяется только к обмену кода и загрузке JWKS Telegram. Google, Яндекс
и остальные запросы сохраняют прямое соединение; глобальный dispatcher не меняется.
Без переменной сохраняется прежний прямой вход. При отказе заданного proxy
прямого обходного запроса нет. Проверки HTTPS-сертификата и подписи ID-токена
сохраняются; переходы по HTTP redirects запрещены. URL proxy допускает HTTP/HTTPS,
без логина/пароля, пути и query; доступ к этому proxy ограничивается IP сервера.
В production значение хранится только в backend `.env`; существующий `env_file`
Compose передаёт его контейнеру. Frontend, Caddy и публичные порты менять не нужно.

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
   Google и Яндекс передают параметры клиента через client_secret_post;
   Telegram — через client_secret_basic согласно его OIDC-контракту.
4. Callback принимает только code flow, сопоставляет state, cookie и origin,
   однократно расходует запрос. При связывании проверяются тот же пользователь
   и та же сессия, с которой начато подключение.
5. Идентификатор — provider + постоянный sub/id, а не email или username.
   Совпадение почты никогда не объединяет аккаунты автоматически.
6. Новый пользователь сразу получает аккаунт и сессию после проверки сервиса.
   Email и пароль необязательны; выдуманные адреса и скрытые пароли не создаются.
   `confirmed=true` подтверждает вход через сервис; отсутствие email сохраняется
   как null. Поле email заполняется только после отдельной проверки почты.
7. Если email, полученный от провайдера, совпал с существующим аккаунтом,
   пользователь сначала входит привычным способом, затем подключает сервис
   из кабинета. Автоматического объединения нет; прежние аккаунты и заказы сохраняются.
8. Последний способ входа отключить нельзя; изменения сериализуются блокировкой
   строки пользователя. Кабинет показывает «Пароль не задан», названия сервисов
   и «Создать пароль». Для аккаунта без почты можно подтвердить только email
   либо одной ссылкой подтвердить адрес и задать первый пароль.

Письма из кабинета отправляются через существующий POST `/api/account/connections`
и приватный bridge. Пользователь определяется сессией, а не ID из формы.
Введённая почта хранится в закрытом oauth_flow до перехода по одноразовой ссылке;
перед записью адреса повторно проверяются срок, блокировка пользователя и уникальность.
Пароль и email при его создании записываются в одной транзакции. Ссылки действуют
один час; смена пароля отменяет прежние reset-ссылки. Существующая почта берётся
из аккаунта, изменение подтверждённого адреса этим действием не разрешается.
Email-регистрация сохраняет обязательные email, пароль и подтверждение письмом.
Старое незавершённое OAuth-onboarding поддерживается до истечения прежних tickets.

Используются существующие `oauth_flows` и `oauth_identities`; новых таблиц нет.
Email необязателен в модели пользователя, стандартный контроллер email-регистрации
по-прежнему требует его. Callback и ссылки однократны при параллельных запросах;
первый OAuth-вход создаёт одну личность даже при одновременных callbacks.
Добавление почты координируется с email-регистрацией advisory lock на адрес.
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
