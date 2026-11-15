'use strict';

// Read-only connection check. Never creates a payment or prints credentials.
const fs = require('node:fs');
const path = require('node:path');
const { Agent, fetch } = require('undici');

async function main() {
  const filename = path.resolve(__dirname, '../../.local/payments/backend.env');
  const env = require('dotenv').parse(fs.readFileSync(filename));
  if (env.YOOKASSA_MODE !== 'test' || env.PAYMENTS_ENABLED !== 'false') throw Error('Use the disabled test configuration');
  if (!/^\d{1,20}$/.test(env.YOOKASSA_SHOP_ID || '') || !env.YOOKASSA_SECRET_KEY || /\s/.test(env.YOOKASSA_SECRET_KEY)) throw Error('Fill in the test shop ID and secret key locally');
  const agent = new Agent({ connect: { family: 4, timeout: 10000 } });
  try {
    const response = await fetch('https://api.yookassa.ru/v3/me', {
      headers: { Authorization: 'Basic ' + Buffer.from(env.YOOKASSA_SHOP_ID + ':' + env.YOOKASSA_SECRET_KEY).toString('base64') },
      dispatcher: agent, signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) throw Error('YooKassa returned HTTP ' + response.status);
    const data = await response.json();
    if (data.test !== true || String(data.account_id) !== env.YOOKASSA_SHOP_ID) throw Error('The API did not confirm the expected test shop');
    console.log('SUCCESS: YooKassa authenticated; test shop confirmed; no payments created.');
    console.log('Payment acceptance:', data.status === 'enabled' ? 'enabled for testing' : 'not enabled');
  } finally { await agent.close(); }
}

main().catch(error => {
  const safe = /^(Use the disabled|Fill in|YooKassa returned HTTP|The API did not confirm)/.test(error.message);
  console.error('FAILED:', safe ? error.message : 'Connection check failed; credentials were not printed.');
  process.exitCode = 1;
});
