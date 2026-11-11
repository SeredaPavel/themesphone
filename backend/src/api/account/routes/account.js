'use strict';
module.exports = { routes:[{
  method:'PUT', path:'/account/profile', handler:'account.updateProfile',
  config:{ policies:[] },
}] };
