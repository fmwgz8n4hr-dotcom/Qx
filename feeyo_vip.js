// 飞常准 会员字段改写（递归版 v2）
// v2 增补：svip / isSuperVIP / superMember / cardLevel / cardType / rights
// 配合 feeyo.plugin 使用

let body = $response.body;
const url = ($request && $request.url) ? $request.url : "?";

if (typeof body !== "string" || body.length === 0) {
  $done({});
} else {
  const changed = [];

  // 会员 / 超级会员 布尔标志
  const FLAG = /^(is_?vip|is_?pro|is_?member|is_?pro_?plus|is_?super_?vip|is_?svip|is_?super|svip|super_?vip|super_?member|vip_?flag|member_?flag|show_?vip|show_?pro_?plus|sale_?vip|b_?show_?vip_?cell|isvipuser)$/i;
  // 等级 / 卡种
  const LEVEL = /^(member_?level|vip_?level|vip_?type|member_?type|pro_?level|proplus_?level|vip_?grade|grade)$/i;
  // 状态
  const STATUS = /^(vip_?status|pro_?status|proplus_?status|pro_?plus_?status|member_?status|super_?vip_?status|svip_?status|status)$/i;
  // 到期时间
  const EXPIRE = /^((vip|member|pro|proplus|pro_?plus|svip|super).*(expire|end|deadline).*(time|date)?|(expire|end).*(time|date))$/i;
  // 承载会员信息的对象
  const OBJ = /^(pro_?plus|vip_?info|member_?info|vipinfo|memberinfo|svip|super_?vip|super_?vip_?model|super_?member|vip|member)$/i;

  const FAR_FUTURE = "2099-12-31 23:59:59";

  function setLeaf(holder, key, val) {
    if (typeof val === "boolean") { holder[key] = true; changed.push(key); return true; }
    if (typeof val === "string") { holder[key] = "1"; changed.push(key); return true; }
    if (typeof val === "number") { holder[key] = 1; changed.push(key); return true; }
    return false;
  }

  function walk(node, depth, inVip) {
    if (depth > 14 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const it of node) walk(it, depth + 1, inVip); return; }

    for (const k of Object.keys(node)) {
      const v = node[k];

      if (FLAG.test(k)) {
        if (setLeaf(node, k, v)) continue;
      }
      if (LEVEL.test(k)) {
        if (typeof v === "number") { node[k] = 1; changed.push(k); continue; }
        if (typeof v === "string" && /^\d+$/.test(v)) { node[k] = "1"; changed.push(k); continue; }
      }
      if (inVip && STATUS.test(k)) {
        if (typeof v === "number") { node[k] = 1; changed.push(k); continue; }
        if (typeof v === "string" && /^\d+$/.test(v)) { node[k] = "1"; changed.push(k); continue; }
        if (typeof v === "boolean") { node[k] = true; changed.push(k); continue; }
      }
      if (inVip && EXPIRE.test(k)) {
        if (typeof v === "string") { node[k] = FAR_FUTURE; changed.push(k); continue; }
        if (typeof v === "number") { node[k] = 4102444799; changed.push(k); continue; }
      }
      if (v !== null && typeof v === "object") {
        walk(v, depth + 1, inVip || OBJ.test(k));
      }
    }
  }

  let out = body;
  try {
    let o = JSON.parse(body);
    if (typeof o === "string") {
      const inner = JSON.parse(o);
      walk(inner, 0, false);
      o = JSON.stringify(inner);
    } else {
      walk(o, 0, false);
    }
    out = typeof o === "string" ? o : JSON.stringify(o);
  } catch (e) {
    out = body; // 非 JSON：原样放行
  }

  if (changed.length > 0) {
    console.log("[feeyo] " + url + " => " + changed.join(","));
  }
  $done({ body: out });
}
