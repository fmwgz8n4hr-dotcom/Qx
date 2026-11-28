/*
 * 飞常准 · 机场进港排队「全天」补全  v9
 * ---------------------------------------------------------------
 * 已破出全站加密：AES-128-ECB，key = ce77c4ff557fb4b1
 * （来自 VZNetworkConfig.cryptKey，CCCrypt options=3）
 *
 * 于是所有接口（含 overviewv6 / screenList / quantizeScreenList）
 * 的响应都能在本地解开，航班数据全部可读。
 *
 * 排队页 inqueuev5 的 3 小时窗口由服务端裁剪，本地改不了；
 * 但把它换成解密后拿到的全天航班即可。
 */

var AES_KEY = 'ce77c4ff557fb4b1';
var CACHE_KEY = 'feeyo_q_cache_v2';
var MAX_PER   = 200000;
var MAX_ITEMS = 12;

/* ---------------- AES-128-ECB ---------------- */

var SBOX = (function (s) {
  var a = [];
  for (var i = 0; i < 256; i++) a.push(parseInt(s.substr(i * 2, 2), 16));
  return a;
})('637c777bf26b6fc53001672bfed7ab76ca82c97dfa5947f0add4a2af9ca472c0' +
   'b7fd9326363ff7cc34a5e5f171d8311504c723c31896059a071280e2eb27b275' +
   '09832c1a1b6e5aa0523bd6b329e32f8453d100ed20fcb15b6acbbe394a4c58cf' +
   'd0efaafb434d338545f9027f503c9fa851a3408f929d38f5bcb6da2110fff3d2' +
   'cd0c13ec5f974417c4a77e3d645d197360814fdc222a908846eeb814de5e0bdb' +
   'e0323a0a4906245cc2d3ac629195e479e7c8376d8dd54ea96c56f4ea657aae08' +
   'ba78252e1ca6b4c6e8dd741f4bbd8b8a703eb5664803f60e613557b986c11d9e' +
   'e1f8981169d98e949b1e87e9ce5528df8ca1890dbfe6426841992d0fb054bb16');

var INV = new Array(256);
(function () { for (var i = 0; i < 256; i++) INV[SBOX[i]] = i; })();
var RCON = [0, 1, 2, 4, 8, 16, 32, 64, 128, 27, 54];

var M9 = new Array(256), M11 = new Array(256), M13 = new Array(256), M14 = new Array(256);
(function () {
  function xt(a) { return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; }
  function gm(a, b) { var p = 0; while (b) { if (b & 1) p ^= a; a = xt(a); b >>= 1; } return p & 0xff; }
  for (var i = 0; i < 256; i++) { M9[i] = gm(i, 9); M11[i] = gm(i, 11); M13[i] = gm(i, 13); M14[i] = gm(i, 14); }
})();

function aesExpand(key) {
  var w = [], i;
  for (i = 0; i < 4; i++) w.push([key[i * 4], key[i * 4 + 1], key[i * 4 + 2], key[i * 4 + 3]]);
  for (i = 4; i < 44; i++) {
    var t = [w[i - 1][0], w[i - 1][1], w[i - 1][2], w[i - 1][3]];
    if (i % 4 === 0) {
      var x = t[0];
      t[0] = SBOX[t[1]] ^ RCON[i >> 2];
      t[1] = SBOX[t[2]];
      t[2] = SBOX[t[3]];
      t[3] = SBOX[x];
    }
    w.push([w[i - 4][0] ^ t[0], w[i - 4][1] ^ t[1], w[i - 4][2] ^ t[2], w[i - 4][3] ^ t[3]]);
  }
  return w;
}

function aesDecBlock(inp, w) {
  var s = new Array(16), r, c, k;
  for (c = 0; c < 4; c++) for (r = 0; r < 4; r++) s[c * 4 + r] = inp[r + 4 * c];

  function ark(rnd) { for (var cc = 0; cc < 4; cc++) for (var rr = 0; rr < 4; rr++) s[cc * 4 + rr] ^= w[rnd * 4 + cc][rr]; }

  ark(10);
  for (var rnd = 9; rnd >= 1; rnd--) {
    for (r = 1; r < 4; r++) {
      var row = [s[0 * 4 + r], s[1 * 4 + r], s[2 * 4 + r], s[3 * 4 + r]];
      for (c = 0; c < 4; c++) s[c * 4 + r] = row[(c - r + 4) % 4];
    }
    for (k = 0; k < 16; k++) s[k] = INV[s[k]];
    ark(rnd);
    for (c = 0; c < 4; c++) {
      var a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
      s[c * 4]     = (M14[a0] ^ M11[a1] ^ M13[a2] ^ M9[a3]) & 0xff;
      s[c * 4 + 1] = (M9[a0]  ^ M14[a1] ^ M11[a2] ^ M13[a3]) & 0xff;
      s[c * 4 + 2] = (M13[a0] ^ M9[a1]  ^ M14[a2] ^ M11[a3]) & 0xff;
      s[c * 4 + 3] = (M11[a0] ^ M13[a1] ^ M9[a2]  ^ M14[a3]) & 0xff;
    }
  }
  for (r = 1; r < 4; r++) {
    var row2 = [s[0 * 4 + r], s[1 * 4 + r], s[2 * 4 + r], s[3 * 4 + r]];
    for (c = 0; c < 4; c++) s[c * 4 + r] = row2[(c - r + 4) % 4];
  }
  for (k = 0; k < 16; k++) s[k] = INV[s[k]];
  ark(0);

  var out = new Array(16);
  for (c = 0; c < 4; c++) for (r = 0; r < 4; r++) out[r + 4 * c] = s[c * 4 + r];
  return out;
}

function aesDecryptECB(data, keyStr) {
  var key = [];
  for (var i = 0; i < 16; i++) key.push(keyStr.charCodeAt(i) & 0xff);
  var w = aesExpand(key);
  var out = [];
  for (var off = 0; off + 16 <= data.length; off += 16) {
    var pt = aesDecBlock(data.slice(off, off + 16), w);
    for (var j = 0; j < 16; j++) out.push(pt[j]);
  }
  if (out.length) {
    var p = out[out.length - 1];
    if (p >= 1 && p <= 16 && out.length >= p) {
      var ok = true;
      for (var q = out.length - p; q < out.length; q++) if (out[q] !== p) { ok = false; break; }
      if (ok) out = out.slice(0, out.length - p);
    }
  }
  return out;
}

/* ---------------- 编解码 ---------------- */

function b64ToBytes(s) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var map = {};
  for (var i = 0; i < chars.length; i++) map[chars.charAt(i)] = i;
  var t = String(s).replace(/[\s\r\n]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  var out = [], buf = 0, bits = 0;
  for (var j = 0; j < t.length; j++) {
    var c = t.charAt(j);
    if (c === '=') break;
    var v = map[c];
    if (v === undefined) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
    if (out.length > 6000000) break;
  }
  return out;
}

function bytesToUtf8(b) {
  var out = '', i = 0;
  while (i < b.length) {
    var c = b[i++];
    if (c < 0x80) { out += String.fromCharCode(c); }
    else if (c < 0xE0) { out += String.fromCharCode(((c & 0x1F) << 6) | (b[i++] & 0x3F)); }
    else if (c < 0xF0) {
      var c2 = b[i++], c3 = b[i++];
      out += String.fromCharCode(((c & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F));
    } else {
      var d2 = b[i++], d3 = b[i++], d4 = b[i++];
      var cp = (((c & 0x07) << 18) | ((d2 & 0x3F) << 12) | ((d3 & 0x3F) << 6) | (d4 & 0x3F)) - 0x10000;
      out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
    }
  }
  return out;
}

function decodeJson(raw) {
  if (!raw) return null;
  try { return { obj: JSON.parse(raw), text: raw, via: 'plain' }; } catch (e) {}

  var b = b64ToBytes(raw);
  if (!b || !b.length) return null;

  try {
    var t = bytesToUtf8(b);
    return { obj: JSON.parse(t), text: t, via: 'base64' };
  } catch (e) {}

  if (b.length % 16 === 0) {
    try {
      var pt = aesDecryptECB(b, AES_KEY);
      var t2 = bytesToUtf8(pt);
      return { obj: JSON.parse(t2), text: t2, via: 'aes' };
    } catch (e) {}
  }
  return null;
}

/* ---------------- 缓存 ---------------- */

function loadCache() {
  try { return JSON.parse($prefs.valueForKey(CACHE_KEY) || '{}'); }
  catch (e) { return {}; }
}

function saveCache(c) {
  try {
    var s = JSON.stringify(c);
    if (s.length > 1500000) return;
    $prefs.setValueForKey(s, CACHE_KEY);
  } catch (e) {}
}

function urlParam(url, name) {
  var m = url.match(new RegExp('[?&]' + name + '=([^&#]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/* ---------------- 航班识别 ---------------- */

function lowerKeys(o) {
  var out = {};
  for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k.toLowerCase()] = k;
  return out;
}

function isFlightObj(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  var lk = Object.keys(lowerKeys(o));
  var hasNum = false;
  for (var i = 0; i < lk.length; i++) {
    if (/^(fnum|flightno|flight_no|flightnum|fno|flightnumber|fcflightno|flightcode)$/.test(lk[i])) { hasNum = true; break; }
  }
  if (!hasNum) return false;
  for (var j = 0; j < lk.length; j++) {
    if (/(time|date|hm|hour|status|state|airport|port|code|num)$/.test(lk[j])) return true;
  }
  return false;
}

function collectFlightArrays(node, path, depth, out) {
  if (depth > 10 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    if (node.length && isFlightObj(node[0])) out.push({ path: path, arr: node });
    var lim = Math.min(node.length, 3);
    for (var i = 0; i < lim; i++) collectFlightArrays(node[i], path + '[' + i + ']', depth + 1, out);
    return;
  }
  for (var k in node) {
    if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
    collectFlightArrays(node[k], path ? path + '.' + k : k, depth + 1, out);
  }
}

/* ---------------- 字段映射 ---------------- */

function pick(o, names) {
  var lk = lowerKeys(o);
  for (var i = 0; i < names.length; i++) {
    var real = lk[names[i]];
    if (real === undefined) continue;
    var v = o[real];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function normTime(v) {
  if (v === undefined || v === null || v === '') return '--:--';
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) {
    var n = Number(v);
    if (String(v).length === 10) n = n * 1000;
    var d = new Date(n);
    if (!isNaN(d.getTime())) {
      var hh = d.getHours(), mm = d.getMinutes();
      return (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
    }
  }
  var s = String(v).trim();
  var m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return (m[1].length === 1 ? '0' + m[1] : m[1]) + ':' + m[2];
  if (/^\d{6}$/.test(s)) return s.slice(0, 2) + ':' + s.slice(2, 4);
  if (/^\d{3,4}$/.test(s)) {
    var p = s.length === 3 ? '0' + s : s;
    return p.slice(0, 2) + ':' + p.slice(2);
  }
  return '--:--';
}

function normStatus(v) {
  if (v === undefined || v === null || v === '') return '预计';
  var s = String(v);
  if (/取消|cancel/i.test(s)) return '取消';
  if (/到达|抵达|落地|已落|arriv|landed/i.test(s)) return '到达';
  if (/起飞|离港|depart/i.test(s)) return '起飞';
  if (/延误|delayed?/i.test(s)) return '延误';
  if (/备降|divert/i.test(s)) return '备降';
  if (/返航|return/i.test(s)) return '返航';
  if (/计划|预计|sched|ontime|on time/i.test(s)) return '预计';
  if (/^[0-9]+$/.test(s)) {
    if (s === '1') return '预计';
    if (s === '2') return '起飞';
    if (s === '3') return '到达';
    if (s === '4') return '延误';
    if (s === '5') return '取消';
  }
  return s.length <= 6 ? s : '预计';
}

function normPassenger(v) {
  if (v === undefined || v === null || v === '') return '--';
  if (typeof v === 'number') return v > 0 ? String(v) : '--';
  var s = String(v).trim();
  if (!s || s === '0' || s === '--' || s === '-') return '--';
  return s;
}

function normCode(v) {
  if (v === undefined || v === null) return '';
  return String(v).toUpperCase().trim();
}

function toQueueItem(f, airportCode) {
  var fnum = pick(f, ['fnum', 'flightno', 'flight_no', 'flightnum', 'fno', 'flightnumber', 'fcflightno', 'flightcode']);
  if (!fnum) return null;

  if (airportCode) {
    var apt = normCode(airportCode);
    var dep = normCode(pick(f, ['depairport', 'depairportcode', 'depapt', 'departureairport', 'origincode', 'origin', 'depcode', 'dep', 'depthreecode', 'deptthreecode']));
    var arr = normCode(pick(f, ['arrairport', 'arrairportcode', 'arrapt', 'arrivalairport', 'destinationcode', 'destination', 'arrcode', 'arr', 'arrthreecode']));
    if (dep && dep === apt) return null;
    if (arr && arr !== apt) return null;
  }

  var t = pick(f, [
    'arrest', 'arresttime', 'estarrtime', 'arrtime', 'arrplantime', 'planarrtime',
    'plannedarrival', 'schedarrtime', 'scheduledarrival', 'arr_time', 'arrhm',
    'esttime', 'plantime', 'arrivaltime', 'eta', 'arrplantimes'
  ]);

  var st = pick(f, ['flightstatus', 'status', 'state', 'flightstate', 'statusname', 'flightstatusname', 'flightstatusdesc']);
  var pg = pick(f, ['passager', 'passenger', 'passengernum', 'passengercount', 'planpassenger', 'passager_num', 'pcount', 'passengernumber']);

  return {
    fnum: String(fnum),
    arrEst: normTime(t),
    flightStatus: normStatus(st),
    passager: normPassenger(pg)
  };
}

function buildFromCache(cache, airportCode) {
  var bestItems = null, bestFrom = null;

  for (var k in cache) {
    if (!Object.prototype.hasOwnProperty.call(cache, k)) continue;
    var e = cache[k];
    if (!e || !e.body) continue;
    if (airportCode && e.airport && e.airport.toUpperCase() !== airportCode.toUpperCase()) continue;

    var j;
    try { j = JSON.parse(e.body); } catch (err) { continue; }

    var arrs = [];
    collectFlightArrays(j, '', 0, arrs);
    if (!arrs.length) continue;

    var items = [], seen = {};
    for (var ai = 0; ai < arrs.length; ai++) {
      var src = arrs[ai].arr;
      for (var i = 0; i < src.length; i++) {
        var it = toQueueItem(src[i], airportCode);
        if (!it) continue;
        var dk = it.fnum + '|' + it.arrEst;
        if (seen[dk]) continue;
        seen[dk] = 1;
        items.push(it);
      }
    }

    if (items.length && (!bestItems || items.length > bestItems.length)) {
      bestItems = items;
      bestFrom = e.url || k;
    }
  }

  if (!bestItems) return null;

  bestItems.sort(function (a, b) {
    var x = a.arrEst === '--:--' ? '99:99' : a.arrEst;
    var y = b.arrEst === '--:--' ? '99:99' : b.arrEst;
    return x < y ? -1 : (x > y ? 1 : 0);
  });

  return { items: bestItems, from: bestFrom };
}

/* ---------------- 主逻辑 ---------------- */

(function () {

  var url = ($request && $request.url) ? $request.url : '';

  if (!$response) { $done({}); return; }

  var body = ($response && typeof $response.body === 'string') ? $response.body : '';
  if (!body) { $done({}); return; }

  var dec = decodeJson(body);
  var dpath = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
  var qAirport = urlParam(url, 'airport') || urlParam(url, 'airportCode') || urlParam(url, 'apt') || urlParam(url, 'code') || urlParam(url, 'arr');

  /* --- A. 排队页：改写 --- */
  if (/\/airport\/(in|out)queuev5/.test(url)) {

    if (!dec) {
      console.log('[feeyo v9] queue not decodable');
      $done({ body: body });
      return;
    }

    var built = buildFromCache(loadCache(), qAirport);
    if (!built) {
      console.log('[feeyo v9] no cache for ' + qAirport + ' -> passthrough');
      $done({ body: body });
      return;
    }

    var obj = dec.obj;
    if (!obj || typeof obj !== 'object') { $done({ body: body }); return; }

    var holder = obj;
    if (obj.data && typeof obj.data === 'object' &&
        (obj.data.list !== undefined || obj.data.prolist !== undefined ||
         obj.data.proplus !== undefined || obj.data.tip !== undefined)) {
      holder = obj.data;
    }

    holder.list = built.items;
    holder.prolist = built.items;
    holder.tip = '';
    if (holder.proplus && typeof holder.proplus === 'object') {
      holder.proplus.status = 1;
      holder.proplus.explain = '';
    } else {
      holder.proplus = { status: 1 };
    }

    console.log('[feeyo v9] ' + qAirport + ' filled ' + built.items.length + ' flights from ' + built.from);
    $done({ body: JSON.stringify(obj), headers: $response.headers });
    return;
  }

  /* --- B. 其它接口：解密后缓存 --- */
  if (!dec) {
    console.log('[feeyo v9] undecoded ' + dpath + ' len=' + body.length);
    $done({ body: body });
    return;
  }

  var found = [];
  collectFlightArrays(dec.obj, '', 0, found);

  if (found.length) {
    var c = loadCache();
    var key = dpath.replace(/[^A-Za-z0-9_]/g, '_');
    var total = 0;
    for (var kk in c) if (Object.prototype.hasOwnProperty.call(c, kk)) total++;

    if (total >= MAX_ITEMS) {
      var oldestKey = null, oldestTs = Infinity;
      for (var kk2 in c) {
        if (!Object.prototype.hasOwnProperty.call(c, kk2)) continue;
        if (c[kk2].ts < oldestTs) { oldestTs = c[kk2].ts; oldestKey = kk2; }
      }
      if (oldestKey) delete c[oldestKey];
    }

    var text = dec.text;
    if (text.length > MAX_PER) text = text.slice(0, MAX_PER);

    c[key] = { url: dpath, airport: qAirport, ts: Date.now(), body: text };
    saveCache(c);

    console.log('[feeyo v9] cached ' + key + ' (' + found[0].arr.length + ' flights, via ' + dec.via + ', apt=' + qAirport + ')');
  }

  $done({ body: body });

})();
