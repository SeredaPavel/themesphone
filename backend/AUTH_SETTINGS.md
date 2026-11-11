# Настройки авторизации и профиля

Код проверен на локальном Strapi 5.14.0 и отдельной PostgreSQL из
`../docker/AUTH_LOCAL.md`. Production включается отдельным развёртыванием.

## Что хранится в коде

- Штатный вход Strapi сохранён: подтверждение email, проверка пароля и блокировки.
- Обёртка `src/extensions/users-permissions/strapi-server.js` добавляет срок
  восстановления 1 час и блокировку строки на время сброса/смены пароля.
  Успешный сброс очищает токен, успешная смена из кабинета отменяет старые ссылки.
- Новые поля User: `firstname` (80), `lastname` (80), `phone` (32),
  `billingAddress` (300), приватный `resetPasswordExpiresAt`.
- `PUT /api/account/profile` обновляет исключительно четыре личных поля
  текущего `ctx.state.user`. ID, role, email, blocked и password не принимаются.
- Список пользователей и универсальный `PUT /users/:id` интерфейсу не требуются.

## Что хранится в БД Strapi и не переносится одним push

В Users & Permissions → Advanced settings:

- Enable email confirmation: включено.
- Unique email: включено; Default role: Authenticated.
- Reset password page: `https://<домен-сайта>/auth/reset-password`.
- Confirmation redirection: `https://<домен-сайта>/confirmation/submit`.

Шаблон восстановления должен содержать ссылку
`<%= URL %>?code=<%= TOKEN %>`. Шаблон подтверждения для frontend-страницы:
`https://<домен-сайта>/auth/confirm-email?confirmation=<%= CODE %>`.
Адрес и имя отправителя согласуются с настоящим SMTP-сервисом. В локальной БД
эти значения задаёт `scripts/local-auth.cjs`, письма перехватывает Mailpit.

Права Authenticated: собственный `user.me`, `auth.changePassword`,
`account.updateProfile`. Не включать Public или Authenticated доступ к
`user.find`, `user.findOne`, `user.update`, `user.create`, `user.destroy`
ради работы профиля. Публичные auth-маршруты Strapi используют штатные ограничения
частоты запросов; браузер использует только Next.js BFF, CMS auth через Caddy закрыт.

## Настройка при запуске production

`AUTH_CONFIGURE_EMAIL=true` включает контролируемую настройку через
`src/lib/auth-mail.js`. Требуются `AUTH_FRONTEND_URL` (явный HTTPS origin),
`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`. Compose использует `https://themesphone.ru`.
Bootstrap сохраняет остальные advanced settings, включает подтверждение,
устанавливает URL и шаблоны подтверждения/восстановления, отключает незавершённые
OAuth-провайдеры и убирает общий доступ Public/Authenticated к пользователям.
Authenticated получает `user.me`, `auth.changePassword`, `account.updateProfile`.
Письма содержат HTML и отдельную текстовую часть; SMTP-пароль остаётся в серверной
`.env`, не в Git. Перед включением сохраняются БД и конфигурация.

Frontend принимает Origin из `FRONTEND_URL`/`AUTH_ALLOWED_ORIGINS` и хранит JWT
только в HttpOnly Secure cookie. Повторное подтверждение не раскрывает наличие
учётки; ошибка отправки после создания пользователя объясняется в форме.

## Перед публикацией

Сохранить резервную копию production-БД перед добавлением полей схемы.
Проверить роли, SMTP, шаблоны и URL именно в production Strapi. Новые формы
не требуют снятия общего запрета API: согласовать только необходимые маршруты
и методы в обоих пространствах API по `../deploy/PUBLIC.md`.
Проверить лимиты запросов за frontend/proxy и сценарии восстановления на HTTPS.

Остаются отдельными задачами OAuth со state/проверкой callback, отзыв JWT-сессий
на других устройствах, реальная рассылка и оплата. Смена email требует повторного
подтверждения нового адреса и в текущем профиле намеренно не реализована.
