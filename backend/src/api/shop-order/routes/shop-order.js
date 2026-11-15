'use strict';
module.exports = { routes: [
  { method: 'POST', path: '/shop-orders', handler: 'shop-order.create', config: { policies: [] } },
  { method: 'GET', path: '/shop-orders', handler: 'shop-order.list', config: { policies: [] } },
  { method: 'GET', path: '/shop-orders/:id', handler: 'shop-order.findOne', config: { policies: [] } },
  { method: 'POST', path: '/shop-orders/:id/cancel', handler: 'shop-order.cancel', config: { policies: [] } },
  { method: 'POST', path: '/shop-orders/:id/payment', handler: 'shop-order.startPayment', config: { policies: [] } },
  { method: 'GET', path: '/shop-orders/:id/payment', handler: 'shop-order.paymentStatus', config: { policies: [] } },
] };
