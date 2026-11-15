'use strict';
const { createOrders, OrderError } = require('../../../lib/shop-orders');
const {createPayments}=require('../../../lib/shop-payments');
const {PaymentError}=require('../../../lib/yookassa');
module.exports = ({ strapi }) => {
  const orders = createOrders(strapi);
  const payments=createPayments(strapi);
  const handle = work => async ctx => {
    ctx.set('Cache-Control', 'no-store');
    try {
      if (!ctx.state.user) throw new OrderError('login_required', 401);
      ctx.body = await work(ctx, ctx.state.user.id);
    } catch (error) {
      ctx.status = error instanceof OrderError || error instanceof PaymentError ? error.status : 503;
      ctx.body = { error: error instanceof OrderError || error instanceof PaymentError ? error.code : 'orders_unavailable' };
    }
  };
  return {
    create: handle((ctx, id) => orders.create(id, ctx.request.body)),
    findOne: handle((ctx, id) => {
      if (Object.keys(ctx.query).length) throw new OrderError('invalid_order');
      return orders.findOne(id, ctx.params.id);
    }),
    list: handle((ctx, id) => {
      if (Object.keys(ctx.query).some(key => key !== 'page')) throw new OrderError('invalid_page');
      return orders.list(id, ctx.query.page);
    }),
    cancel: handle((ctx, id) => {
      if (Object.keys(ctx.query).length || (ctx.request.body && Object.keys(ctx.request.body).length)) throw new OrderError('invalid_order');
      return orders.cancel(id, ctx.params.id);
    }),
    startPayment:handle((ctx,id)=>{
      if(Object.keys(ctx.query).length||!ctx.request.body||Object.keys(ctx.request.body).length)throw new OrderError('invalid_order');
      return payments.start(id,ctx.params.id,ctx.get('x-storefront-origin')||undefined);
    }),
    paymentStatus:handle((ctx,id)=>{
      if(Object.keys(ctx.query).length)throw new OrderError('invalid_order');
      return payments.refresh(id,ctx.params.id);
    }),
  };
};
