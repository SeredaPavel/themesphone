'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { FILE, WALLPAPER, metadata } = require('./wallpaper-files');
const ORDER = 'api::shop-order.shop-order';
const USER = 'plugin::users-permissions.user';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DOCUMENT = /^[a-z0-9]{24}$/;
const MAX_ITEMS = 30;
class OrderError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const hash = value => createHash('sha256').update(value).digest('hex');
function inputOrder(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['items', 'checkoutKey'].includes(key)) ||
      typeof input.checkoutKey !== 'string' || !UUID.test(input.checkoutKey) || !Array.isArray(input.items) || !input.items.length || input.items.length > MAX_ITEMS ||
      input.items.some(id => typeof id !== 'string' || !DOCUMENT.test(id)) || new Set(input.items).size !== input.items.length) throw new OrderError('invalid_order');
  const items = [...input.items].sort();
  return { items, checkoutKey: input.checkoutKey, requestHash: hash(JSON.stringify(items)) };
}
function priceKopecks(value) {
  // Strapi's current price field is an integer number of rubles, not a float.
  const rubles = String(value);
  if (!/^[1-9]\d{0,6}$/.test(rubles) || BigInt(rubles) > 1000000n) throw new OrderError('invalid_price', 409);
  return Number(BigInt(rubles) * 100n);
}
function publicOrder(row, now = Date.now()) {
  return {
    id: row.reference, currency: row.currency, totalKopecks: Number(row.totalKopecks),
    state: row.state === 'awaiting_payment' && new Date(row.expiresAt).getTime() <= now ? 'expired' : row.state,
    createdAt: row.createdAt, expiresAt: row.expiresAt,
    items: row.items.map(item => ({ documentId: item.documentId, title: item.title, unitKopecks: item.unitKopecks, quantity: 1 })),
  };
}
async function withOwner(strapi, userId, work) {
  if (!Number.isInteger(userId) || userId <= 0) throw new OrderError('login_required', 401);
  return strapi.db.transaction(async ({ trx }) => {
    // Same user lock as OAuth merge: an order cannot appear on an archived account.
    await trx(strapi.db.metadata.get(USER).tableName).where('id', userId).forUpdate().first();
    const user = await strapi.db.query(USER).findOne({ where: { id: userId }, populate: ['role'] });
    if (!user || user.confirmed !== true || user.blocked || user.mergedIntoUserId || user.role?.type !== 'authenticated') throw new OrderError('login_required', 401);
    return work(user,trx);
  });
}
function createOrders(strapi) {
  const query = () => strapi.db.query(ORDER);
  return {
    async create(userId, raw) {
      if (process.env.ORDERS_ENABLED !== 'true') throw new OrderError('orders_unavailable', 503);
      const input = inputOrder(raw);
      return withOwner(strapi, userId, async () => {
        const checkoutKey = hash(userId + ':' + input.checkoutKey);
        const existing = await query().findOne({ where: { checkoutKey, owner: { id: userId } } });
        if (existing) {
          if (existing.requestHash !== input.requestHash) throw new OrderError('checkout_conflict', 409);
          return publicOrder(existing);
        }
        if (await query().count({ where: { owner: { id: userId }, state: 'awaiting_payment', expiresAt: { $gt: new Date() } } }) >= 20) throw new OrderError('too_many_orders', 429);
        const products = await strapi.documents(WALLPAPER).findMany({
          status: 'published', filters: { documentId: { $in: input.items } }, fields: ['documentId', 'title', 'price', 'isFree'], limit: MAX_ITEMS,
        });
        const files = await strapi.db.query(FILE).findMany({ where: { wallpaperDocumentId: { $in: input.items }, ready: true } });
        const items = input.items.map(id => {
          const product = products.find(row => row.documentId === id);
          const original = files.find(file => file.wallpaperDocumentId === id);
          if (!product || product.isFree !== false || !metadata(original) || typeof product.title !== 'string' || !product.title.trim()) throw new OrderError('product_unavailable', 409);
          return { documentId: id, title: product.title.slice(0, 300), unitKopecks: priceKopecks(product.price), quantity: 1, originalFileId: original.documentId };
        });
        const totalKopecks = items.reduce((sum, item) => sum + item.unitKopecks, 0);
        if (!Number.isSafeInteger(totalKopecks) || totalKopecks > 1000000000) throw new OrderError('invalid_price', 409);
        const row = await query().create({ data: {
          reference: randomUUID(), checkoutKey, requestHash: input.requestHash, owner: userId,
          items, totalKopecks: String(totalKopecks), currency: 'RUB', state: 'awaiting_payment',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        } });
        return publicOrder(row);
      });
    },
    async findOne(userId, id) {
      if (typeof id !== 'string' || !UUID.test(id)) throw new OrderError('order_not_found', 404);
      return withOwner(strapi, userId, async () => {
        const row = await query().findOne({ where: { reference: id, owner: { id: userId } } });
        if (!row) throw new OrderError('order_not_found', 404);
        return publicOrder(row);
      });
    },
    async list(userId, page = '1') {
      if (typeof page !== 'string' || !/^[1-9]\d{0,3}$/.test(page)) throw new OrderError('invalid_page');
      return withOwner(strapi, userId, async () => {
        const rows = await query().findMany({ where: { owner: { id: userId } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], offset: (Number(page) - 1) * 20, limit: 21 });
        return { orders: rows.slice(0, 20).map(row => publicOrder(row)), hasMore: rows.length > 20 };
      });
    },
    async cancel(userId, id) {
      if (typeof id !== 'string' || !UUID.test(id)) throw new OrderError('order_not_found', 404);
      return withOwner(strapi, userId, async (_user,trx) => {
        const meta=strapi.db.metadata.get(ORDER);
        await trx(meta.tableName).where(meta.attributes.reference.columnName,id).forUpdate().first();
        const row = await query().findOne({ where: { reference: id, owner: { id: userId } } });
        if (!row) throw new OrderError('order_not_found', 404);
        if(await strapi.db.query('api::shop-payment.shop-payment').findOne({where:{orderReference:id}}))throw new OrderError('payment_in_progress',409);
        if (row.state !== 'awaiting_payment' && row.state !== 'cancelled') throw new OrderError('order_not_cancellable', 409);
        const result = row.state === 'cancelled' ? row : await query().update({ where: { id: row.id }, data: { state: 'cancelled' } });
        return publicOrder(result);
      });
    },
  };
}

async function configureOrderPermissions(strapi) {
  const permission = strapi.db.query('plugin::users-permissions.permission');
  for (const role of await strapi.db.query('plugin::users-permissions.role').findMany({ where: { type: { $in: ['public', 'authenticated'] } } })) {
    await permission.deleteMany({ where: { role: role.id, action: { $startsWith: 'api::order.' } } });
    if (role.type === 'public') await permission.deleteMany({ where: { role: role.id, action: { $startsWith: 'api::shop-order.' } } });
    if (role.type === 'authenticated') for (const method of ['create', 'findOne', 'list', 'cancel','startPayment','paymentStatus']) {
      const action = 'api::shop-order.shop-order.' + method;
      if (!await permission.findOne({ where: { action, role: role.id } })) await permission.create({ data: { action, role: role.id } });
    }
  }
}
module.exports = { ORDER, OrderError, inputOrder, priceKopecks, publicOrder, withOwner, createOrders, configureOrderPermissions };
