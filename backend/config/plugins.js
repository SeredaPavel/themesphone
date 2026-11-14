// backend/config/plugins.js

module.exports = ({ env }) => ({
  'wallpaper-originals': { enabled: true, resolve: './src/plugins/wallpaper-originals' },
  ...(env('WALLPAPER_STORAGE_DRIVER') === 's3' ? {
    upload: {
      config: (() => {
        const { storageConfig, clientOptions } = require('../src/lib/object-storage');
        const config = storageConfig({
          WALLPAPER_STORAGE_DRIVER: 's3', S3_ENDPOINT: env('S3_ENDPOINT'), S3_REGION: env('S3_REGION'),
          S3_ORIGINALS_BUCKET: env('S3_ORIGINALS_BUCKET'), S3_PREVIEWS_BUCKET: env('S3_PREVIEWS_BUCKET'),
          S3_ACCESS_KEY_ID: env('S3_ACCESS_KEY_ID'), S3_SECRET_ACCESS_KEY: env('S3_SECRET_ACCESS_KEY'),
          S3_SIGNED_URL_TTL: env('S3_SIGNED_URL_TTL'),
        });
        return { provider: 'aws-s3', sizeLimit: 50 * 1024 * 1024,
          providerOptions: { baseUrl: `${config.endpoint}/${config.previewsBucket}`, rootPath: 'previews',
            s3Options: { ...clientOptions(config), params: { Bucket: config.previewsBucket, ACL: 'public-read' } } },
          actionOptions: { upload: { CacheControl: 'public, max-age=31536000, immutable' },
            uploadStream: { CacheControl: 'public, max-age=31536000, immutable' } } };
      })(),
    },
  } : {}),
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
