//config/middlewares.js
module.exports = [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https://market-assets.strapi.io', 'https://storage.yandexcloud.net'],
          'media-src': ["'self'", 'data:', 'blob:', 'https://storage.yandexcloud.net'],
        },
      },
    },
  },
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  { name: 'strapi::body', config: { formidable: { maxFileSize: 50 * 1024 * 1024, maxTotalFileSize: 52 * 1024 * 1024 } } },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
