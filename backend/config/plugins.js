// backend/config/plugins.js

module.exports = ({ env }) => ({
  documentation: {
    enabled: env.bool('DOCUMENTATION_ENABLED', true),
  },
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET'),
    },
  },
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST'),
        port: env.int('SMTP_PORT'),
        secure: env.bool('SMTP_SECURE'),
        ...(env('SMTP_USER') ? { auth: {
          user: env('SMTP_USER'),
          pass: env('SMTP_PASS'),
        } } : {}),
      },
      settings: {
        defaultFrom: env('SMTP_FROM', 'no-reply@themesphone.ru'),
        defaultReplyTo: env('SMTP_REPLY_TO', env('SMTP_FROM', 'no-reply@themesphone.ru')),
      },
    },
  },
});
