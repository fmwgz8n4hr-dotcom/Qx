// 飞常准 会员字段改写（递归版）
// 配合 feeyo.plugin 使用
// 设计原则：
//   1) 任何响应先尝试 JSON.parse，不是 JSON 就原样放行，不破坏非接口响应
//   2) 递归遍历，会员字段藏在多深都能改到
//   3) 只改叶子值，不整个覆盖对象，避免 app 解析崩
//   4) 每次命中都会打印到 QX 日志，等于顺便把接口清单打出来

let body = $response.body;
const url = ($request && $request.url) ? $request.url : "?";

if (typeof body !== "string" || body.length === 0) {
  $done({});
} else {
  const changed = [];

  // 布尔/数字型会员标志
  const FLAG = /^(is_?vip|is_?pro|is_?member|is_?proplus|is_?pro_?plus|vip_?flag|member_?flag|isvipuser)$/i;
  // 等级/类型
  const LEVEL = /^(member_?level|vip_?level|vip_?type|member_?type|pro_?level|proplus_?level|vip_?grade)$/i;
  // 状态
  const STATUS = /^(vip_?status|pro_?status|proplus_?status|pro_?plus_?status|member_?status|status)$/i;
  // 到期时间
  const EXPIRE = /^((vip|member|pro|proplus|pro_?plus).*(expire|end|deadline).*(time|date)?|(expire|end).*(time|date))$/i;
  // 承载会员信息的对象
  const OBJ = /^(pro_?plus|vip_?info|member_?info|vipinfo|memberinfo|vip|member)$/i;

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
        if (typeof v === "string") { node[k] = "1"; changed.push(k); continue; }
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
    // 有些接口把 JSON 当字符串再包一层
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
    console.log("[vz_vip] " + url + " -> " + changed.join(","));
  }
  $done({ body: out });
}
