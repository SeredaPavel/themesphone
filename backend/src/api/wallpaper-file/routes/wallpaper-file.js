'use strict';
module.exports = { routes: [{
  method: 'GET', path: '/wallpaper-files/:fileId/download', handler: 'wallpaper-file.download',
  config: { auth: false, policies: [] },
}] };
