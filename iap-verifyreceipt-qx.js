/*
 * 内购收据验证解锁 → Quantumult X 重写脚本
 * 对应插件：SatellaJailed / "Fly Crack"（emt.paisseon.satella）的网络层部分
 *
 * 原理：把 App 发往苹果的收据验证请求
 *   POST https://buy.itunes.apple.com/verifyReceipt
 *   POST https://sandbox.itunes.apple.com/verifyReceipt
 * 的响应伪造为"验证通过"（status=0 + 有效收据字段）。
 *
 * ── Quantumult X 配置片段 ─────────────────────────────
 * [rewrite_local]
 * ^https?:\/\/buy\.itunes\.apple\.com\/verifyReceipt url script-response-body https://你的托管地址/iap-verifyreceipt-qx.js
 * ^https?:\/\/sandbox\.itunes\.apple\.com\/verifyReceipt url script-response-body https://你的托管地址/iap-verifyreceipt-qx.js
 *
 * [mitm]
 * hostname = %APPEND% buy.itunes.apple.com, sandbox.itunes.apple.com
 * ────────────────────────────────────────────────────
 * 适用：App 走苹果官方收据验证（/verifyReceipt）时解锁内购。
 * 不适用：App 走自有服务器验证收据、或带额外风控签名的，此脚本无效。
 * 注意：插件里"进程内 StoreKit hook"（价格归零、购买直接成功）是
 *       App 内部逻辑，Qx 无法复刻；本脚本只覆盖网络验证这一层。
 */

const FAKE_PRODUCT_ID = 'com.example.product';
const FAKE_BUNDLE_ID = 'com.example.app';
const FAKE_TX = '1000000000000000';

function pad(n) { return String(n).padStart(2, '0'); }

function buildReceiptFields(productId, bundleId) {
  const now = new Date();
  const ms = now.getTime();
  const pst = new Date(ms - 8 * 3600 * 1000);
  const iso = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const isoPst = pst.toISOString().replace(/\.\d+Z$/, 'Z');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} America/Los_Angeles`;
  const dateStrPst = `${pst.getFullYear()}-${pad(pst.getMonth() + 1)}-${pad(pst.getDate())} ${pad(pst.getHours())}:${pad(pst.getMinutes())}:${pad(pst.getSeconds())} America/Los_Angeles`;

  const item = {
    quantity: '1',
    product_id: productId,
    transaction_id: FAKE_TX,
    original_transaction_id: FAKE_TX,
    purchase_date: dateStr,
    purchase_date_ms: String(ms),
    purchase_date_pst: dateStrPst,
    original_purchase_date: dateStr,
    original_purchase_date_ms: String(ms),
    original_purchase_date_pst: dateStrPst,
    is_trial_period: 'false',
    in_app_ownership_type: 'PURCHASED'
  };

  return {
    receipt: {
      receipt_type: 'Production',
      adam_id: 0,
      app_item_id: 0,
      bundle_id: bundleId,
      application_version: '1',
      download_id: 0,
      request_date: iso,
      request_date_ms: String(ms),
      request_date_pst: isoPst,
      original_purchase_date: dateStr,
      original_purchase_date_ms: String(ms),
      original_purchase_date_pst: dateStrPst,
      in_app: [item]
    },
    latest_receipt_info: [item]
  };
}

function extractProductId(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of Object.keys(obj)) {
    if (key === 'product_id' || key === 'productId' || key === 'productIdentifier') {
      if (typeof obj[key] === 'string' && obj[key]) return obj[key];
    }
    const v = obj[key];
    if (v && typeof v === 'object') {
      const r = extractProductId(v);
      if (r) return r;
    }
  }
  return null;
}

function main() {
  const body = $response.body;
  let obj = null;
  try {
    obj = body && typeof body === 'string' ? JSON.parse(body) : null;
  } catch (e) { obj = null; }

  if (!obj || typeof obj !== 'object') {
    // 非 JSON（错误页等）：整体替换为伪造成功响应
    const fields = buildReceiptFields(FAKE_PRODUCT_ID, FAKE_BUNDLE_ID);
    const full = Object.assign({ status: 0, environment: 'Production' }, fields);
    full.latest_receipt = Buffer.from(JSON.stringify({ receipt: full.receipt })).toString('base64');
    $done({ body: JSON.stringify(full) });
    return;
  }

  if (obj.status === 0) {
    $done({}); // 已成功，透传
    return;
  }

  obj.status = 0;
  obj.environment = 'Production';

  const productId = extractProductId(obj) || FAKE_PRODUCT_ID;
  const bundleId = (obj.receipt && obj.receipt.bundle_id) || FAKE_BUNDLE_ID;
  const fields = buildReceiptFields(productId, bundleId);

  if (!obj.receipt || typeof obj.receipt !== 'object' || !Array.isArray(obj.receipt.in_app) || obj.receipt.in_app.length === 0) {
    obj.receipt = fields.receipt;
  }
  if (!obj.latest_receipt_info || !Array.isArray(obj.latest_receipt_info) || obj.latest_receipt_info.length === 0) {
    obj.latest_receipt_info = fields.latest_receipt_info;
  }
  if (!obj.latest_receipt) {
    obj.latest_receipt = Buffer.from(JSON.stringify({ receipt: obj.receipt })).toString('base64');
  }

  $done({ body: JSON.stringify(obj) });
}

main();
