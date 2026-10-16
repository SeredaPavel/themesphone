// backend/config/plugins.js

module.exports = ({ env }) => ({
  documentation: {
    enabled: true,
  },
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET'),
      providers: {
        yandex: {
          uid: env('YANDEX_CLIENT_ID'),
          secret: env('YANDEX_CLIENT_SECRET'),
          callback: `${env('STRAPI_ADMIN_BACKEND_URL')}/api/connect/yandex/callback`,
          scope: ['login:email'],
        },
      },
    },
  },
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST'),
        port: env.int('SMTP_PORT'),
        secure: env.bool('SMTP_SECURE'),
        auth: {
          user: env('SMTP_USER'),
          pass: env('SMTP_PASS'),
        },
      },
      'users-permissions': {
    config: {
      email: {
        confirmation: {
          redirectUrl: 'http://localhost:3000/confirmation/submit',
          },
         },
       },
     },
    },
  },
});
