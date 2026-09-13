/*
 * 番茄全系通用 (KAlert 5.0.2) → Quantumult X 重写脚本
 * 由越狱插件 KAlert.dylib (com.kalert.tweak) 逆向转换而来，JSON 改写逻辑与原插件一致。
 *
 * 原插件注入的 App（全系覆盖）：
 *   com.dragon.read      番茄小说
 *   com.xs.fm            番茄畅听
 *   com.dragon.read.fm   番茄畅听(旧)
 *   com.phoenix.video    番茄视频/番茄畅看
 *   com.kylin.readnew    番茄免费小说
 *
 * 功能（响应体 JSON 字段改写）：
 *   1) 会员字段 false/0 → true
 *   2) 广告开关字段 false → true（ad_free / free_ad）
 *   3) 会员过期时间 expire_time → 4102444800（约 2100-01-01）
 */

const RESPONSE_BODY_PATCHES = [
  // —— 会员状态字段：false/0 → true ——
  [/("is_vip"\s*:\s*)false/g, '$1true'],
  [/("isVip"\s*:\s*)false/g, '$1true'],
  [/("isVIP"\s*:\s*)false/g, '$1true'],
  [/("is_vip"\s*:\s*)0/g, '$1true'],
  [/("isVip"\s*:\s*)0/g, '$1true'],
  [/("is_unionVip"\s*:\s*)false/g, '$1true'],
  [/("is_ad_vip"\s*:\s*)false/g, '$1true'],
  [/("isPublishSubVip"\s*:\s*)false/g, '$1true'],
  [/("isShortStroySubVip"\s*:\s*)false/g, '$1true'],
  [/("isAdFreeSubVip"\s*:\s*)false/g, '$1true'],
  [/("hasAnySubVip"\s*:\s*)false/g, '$1true'],
  [/("ownFreePubVipCard"\s*:\s*)false/g, '$1true'],
  // —— 广告开关字段：false → true ——
  [/("ad_free"\s*:\s*)false/g, '$1true'],
  [/("free_ad"\s*:\s*)false/g, '$1true'],
  // —— 会员过期时间：任意数字 → 4102444800 ——
  [/("expire_time"\s*:\s*)\d+/g, '$14102444800'],
];

function main() {
  const body = $response.body;
  if (!body || typeof body !== 'string') {
    $done({}); // 保持原响应不变
    return;
  }

  let patched = body;
  for (let i = 0; i < RESPONSE_BODY_PATCHES.length; i++) {
    const patch = RESPONSE_BODY_PATCHES[i];
    patched = patched.replace(patch[0], patch[1]);
  }

  if (patched !== body) {
    $done({ body: patched });
  } else {
    $done({});
  }
}

main();
