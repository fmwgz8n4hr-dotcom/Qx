var AES_KEY    = 'ce77c4ff557fb4b1';
var CACHE_KEY  = 'feeyo_q_cache_v3';
var DUMP_KEY   = 'feeyo_q_dump_v2';
var MAX_PER    = 400000;
var MAX_ITEMS  = 14;

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
var M2 = new Array(256), M3 = new Array(256);
(function () {
  function xt(a) { return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; }
  function gm(a, b) { var p = 0; while (b) { if (b & 1) p ^= a; a = xt(a); b >>= 1; } return p & 0xff; }
  for (var i = 0; i < 256; i++) {
    M9[i] = gm(i, 9); M11[i] = gm(i, 11); M13[i] = gm(i, 13); M14[i] = gm(i, 14);
    M2[i] = gm(i, 2); M3[i] = gm(i, 3);
  }
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

function aesKeyBytes(keyStr) {
  var key = [];
  for (var i = 0; i < 16; i++) key.push(keyStr.charCodeAt(i) & 0xff);
  return key;
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

function aesEncBlock(inp, w) {
  var s = new Array(16), r, c, k;
  for (c = 0; c < 4; c++) for (r = 0; r < 4; r++) s[c * 4 + r] = inp[r + 4 * c];

  function ark(rnd) { for (var cc = 0; cc < 4; cc++) for (var rr = 0; rr < 4; rr++) s[cc * 4 + rr] ^= w[rnd * 4 + cc][rr]; }

  ark(0);
  for (var rnd = 1; rnd <= 9; rnd++) {
    for (k = 0; k < 16; k++) s[k] = SBOX[s[k]];
    for (r = 1; r < 4; r++) {
      var row = [s[0 * 4 + r], s[1 * 4 + r], s[2 * 4 + r], s[3 * 4 + r]];
      for (c = 0; c < 4; c++) s[c * 4 + r] = row[(c + r) % 4];
    }
    for (c = 0; c < 4; c++) {
      var a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
      s[c * 4]     = (M2[a0] ^ M3[a1] ^ a2      ^ a3)      & 0xff;
      s[c * 4 + 1] = (a0      ^ M2[a1] ^ M3[a2] ^ a3)      & 0xff;
      s[c * 4 + 2] = (a0      ^ a1      ^ M2[a2] ^ M3[a3]) & 0xff;
      s[c * 4 + 3] = (M3[a0]  ^ a1      ^ a2      ^ M2[a3]) & 0xff;
    }
    ark(rnd);
  }
  for (k = 0; k < 16; k++) s[k] = SBOX[s[k]];
  for (r = 1; r < 4; r++) {
    var row3 = [s[0 * 4 + r], s[1 * 4 + r], s[2 * 4 + r], s[3 * 4 + r]];
    for (c = 0; c < 4; c++) s[c * 4 + r] = row3[(c + r) % 4];
  }
  ark(10);

  var out = new Array(16);
  for (c = 0; c < 4; c++) for (r = 0; r < 4; r++) out[r + 4 * c] = s[c * 4 + r];
  return out;
}

function aesDecryptECB(data, keyStr) {
  var w = aesExpand(aesKeyBytes(keyStr));
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

function aesEncryptECB(data, keyStr) {
  var w = aesExpand(aesKeyBytes(keyStr));
  var pad = 16 - (data.length % 16);
  var buf = data.slice(0);
  for (var i = 0; i < pad; i++) buf.push(pad);
  var out = [];
  for (var off = 0; off < buf.length; off += 16) {
    var ct = aesEncBlock(buf.slice(off, off + 16), w);
    for (var j = 0; j < 16; j++) out.push(ct[j]);
  }
  return out;
}

var B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64ToBytes(s) {
  var map = {};
  for (var i = 0; i < B64C.length; i++) map[B64C.charAt(i)] = i;
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
    if (out.length > 8000000) break;
  }
  return out;
}

function bytesToB64(b) {
  var out = '', i;
  for (i = 0; i + 2 < b.length; i += 3) {
    var n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    out += B64C.charAt((n >> 18) & 63) + B64C.charAt((n >> 12) & 63) +
           B64C.charAt((n >> 6) & 63) + B64C.charAt(n & 63);
  }
  var rem = b.length - i;
  if (rem === 1) {
    var n1 = b[i] << 16;
    out += B64C.charAt((n1 >> 18) & 63) + B64C.charAt((n1 >> 12) & 63) + '==';
  } else if (rem === 2) {
    var n2 = (b[i] << 16) | (b[i + 1] << 8);
    out += B64C.charAt((n2 >> 18) & 63) + B64C.charAt((n2 >> 12) & 63) +
           B64C.charAt((n2 >> 6) & 63) + '=';
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

function utf8ToBytes(s) {
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    else if (c >= 0xD800 && c <= 0xDBFF) {
      var c2 = s.charCodeAt(++i);
      var cp = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF);
      out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
    } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
  }
  return out;
}

function decodeJson(raw) {
  if (!raw) return null;
  var s = String(raw).replace(/^\s+|\s+$/g, '');
  var obj0 = null;
  try { obj0 = JSON.parse(s); } catch (e) {}
  if (obj0) return { obj: obj0, text: s, via: 'plain' };

  var b = b64ToBytes(s);
  if (!b || !b.length) return null;

  if (b.length % 16 === 0) {
    try {
      var pt = aesDecryptECB(b, AES_KEY);
      var t2 = bytesToUtf8(pt);
      return { obj: JSON.parse(t2), text: t2, via: 'aes' };
    } catch (e) {}
  }
  try {
    var t = bytesToUtf8(b);
    return { obj: JSON.parse(t), text: t, via: 'base64' };
  } catch (e) {}
  return null;
}

function encodeAs(obj, via) {
  var s = JSON.stringify(obj);
  if (via === 'plain') return s;
  var bytes = utf8ToBytes(s);
  if (via === 'aes') return bytesToB64(aesEncryptECB(bytes, AES_KEY));
  return bytesToB64(bytes);
}

function loadCache() {
  try { return JSON.parse($prefs.valueForKey(CACHE_KEY) || '{}'); }
  catch (e) { return {}; }
}

function saveCache(c) {
  try {
    var s = JSON.stringify(c);
    if (s.length > 1600000) return;
    $prefs.setValueForKey(s, CACHE_KEY);
  } catch (e) {}
}

function dumpOnce(tag) {
  try {
    var d = JSON.parse($prefs.valueForKey(DUMP_KEY) || '{}');
    if (d[tag]) return false;
    d[tag] = 1;
    $prefs.setValueForKey(JSON.stringify(d), DUMP_KEY);
    return true;
  } catch (e) { return true; }
}

function urlParam(url, name) {
  var m = url.match(new RegExp('[?&]' + name + '=([^&#]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

var APT_STOP = { CNX: 0, ALL: 0, ANY: 0, UTC: 0, GMT: 0, CNY: 0, RMB: 0, VIP: 0, PRO: 0, IOS: 0, AND: 0, IDN: 0 };

function aptFromText(s) {
  if (!s) return '';
  var m = s.match(/(?:airport|airportCode|airportcode|apt|threeCode|threecode|iata|arrAirport|depAirport)["']?\s*[=:]\s*["']?([A-Za-z]{3})\b/);
  if (m) return m[1].toUpperCase();
  return '';
}

function aptFromObj(node, depth) {
  if (!node || typeof node !== 'object' || depth > 7) return '';
  if (Array.isArray(node)) {
    for (var i = 0; i < Math.min(node.length, 2); i++) {
      var r0 = aptFromObj(node[i], depth + 1);
      if (r0) return r0;
    }
    return '';
  }
  for (var k in node) {
    if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
    var lk = k.toLowerCase();
    if (/^(airport|airportcode|airportnamecode|apt|threecode|iata|iatacode|arr3code|dep3code)$/.test(lk)) {
      var v = node[k];
      if (typeof v === 'string' && /^[A-Za-z]{3}$/.test(v) && !APT_STOP[v.toUpperCase()]) return v.toUpperCase();
    }
  }
  for (var k2 in node) {
    if (!Object.prototype.hasOwnProperty.call(node, k2)) continue;
    var r = aptFromObj(node[k2], depth + 1);
    if (r) return r;
  }
  return '';
}

function aptFromRequest() {
  try {
    if (typeof $request === 'undefined' || !$request) return '';
    var u = $request.url || '';
    var a = urlParam(u, 'airport') || urlParam(u, 'airportCode') || urlParam(u, 'apt') || urlParam(u, 'code') || urlParam(u, 'arrAirport');
    if (a && /^[A-Za-z]{3}$/.test(a)) return a.toUpperCase();

    var rb = (typeof $request.body === 'string') ? $request.body : '';
    if (!rb) return '';
    var d = decodeJson(rb);
    if (d) {
      var t = aptFromText(d.text) || aptFromText(JSON.stringify(d.obj)) || aptFromObj(d.obj, 0);
      if (t) return t;
    }
    return aptFromText(rb);
  } catch (e) { return ''; }
}

function lowerKeys(o) {
  var out = {};
  for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k.toLowerCase()] = k;
  return out;
}

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

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function tsToHM(v) {
  var n = Number(v);
  if (!isFinite(n) || n <= 0) return '';
  if (n > 1e12) n = Math.floor(n / 1000);
  var d = new Date(n * 1000);
  if (isNaN(d.getTime())) return '';
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function tsToDate(v) {
  var n = Number(v);
  if (!isFinite(n) || n <= 0) return '';
  if (n > 1e12) n = Math.floor(n / 1000);
  var d = new Date(n * 1000);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function normTime(v) {
  if (v === undefined || v === null || v === '') return '';
  var s = String(v).replace(/^\s+|\s+$/g, '');
  if (!s || s === '--:--') return '';
  var m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return pad2(parseInt(m[1], 10)) + ':' + m[2];
  if (/^\d{3,4}$/.test(s)) {
    var p = s.length === 3 ? '0' + s : s;
    return p.slice(0, 2) + ':' + p.slice(2);
  }
  if (/^\d{9,13}$/.test(s)) return tsToHM(s);
  return '';
}

function normDate(v) {
  if (v === undefined || v === null) return '';
  var s = String(v);
  var m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10));
  return '';
}

function normStatus(v) {
  if (v === undefined || v === null || v === '') return '预计';
  var s = String(v);
  if (/取消|cancel/i.test(s)) return '取消';
  if (/到达|抵达|落地|已落|arriv|landed/i.test(s)) return '到达';
  if (/起飞|离港|depart/i.test(s)) return '起飞';
  if (/延误|delay/i.test(s)) return '延误';
  if (/备降|divert/i.test(s)) return '备降';
  if (/返航|return/i.test(s)) return '返航';
  if (/计划|预计|sched|ontime|on time/i.test(s)) return '预计';
  if (/^[0-9]+$/.test(s)) {
    if (s === '0' || s === '1') return '预计';
    if (s === '2') return '起飞';
    if (s === '3') return '到达';
    if (s === '4') return '延误';
    if (s === '5') return '取消';
  }
  return s.length <= 6 ? s : '预计';
}

function normPax(v) {
  if (v === undefined || v === null || v === '') return '';
  var s = String(v).replace(/^\s+|\s+$/g, '');
  if (!s || s === '0' || s === '--' || s === '-') return '';
  if (!/^\d+(\.\d+)?$/.test(s)) return '';
  return s;
}

function up(v) {
  if (v === undefined || v === null) return '';
  return String(v).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

function pickTS(o, names) {
  var lk = lowerKeys(o);
  for (var i = 0; i < names.length; i++) {
    var real = lk[names[i]];
    if (real === undefined) continue;
    var t = tsToHM(o[real]);
    if (t) return t;
  }
  return '';
}

function toQueueItem(f) {
  if (!f || typeof f !== 'object') return null;

  var fnum = pick(f, ['flightnum', 'fnum', 'flightno', 'flight_no', 'fcflightno', 'flightnumber', 'flightcode']);
  if (!fnum) return null;
  fnum = String(fnum).replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{2,3}\d{2,4}[A-Z]?$/.test(fnum)) return null;

  var dep = up(pick(f, ['depcode', 'departurecode', 'depairport', 'depapt', 'dep', 'depthreecode', 'origincode', 'origin']));
  var arr = up(pick(f, ['arrcode', 'arrivalcode', 'arrairport', 'arrapt', 'arr', 'arrthreecode', 'destinationcode', 'destination']));

  var arrT = normTime(pick(f, ['arrest', 'arrivalestimatetime', 'arrivalplantime', 'arrtime', 'arrplantime']))
          || pickTS(f, ['arrivalestimatetimestamp', 'arrivalplantimestamp', 'arrestimatetimestamp', 'arrplantimestamp', 'estarrtimestamp'])
          || normTime(pick(f, ['estarrtime', 'eta', 'arrhm']));

  var depT = normTime(pick(f, ['deptime', 'depplantime', 'departureplantime', 'departureestimatetime']))
          || pickTS(f, ['departureestimatetimestamp', 'departureplantimestamp', 'depestimatetimestamp', 'depplantimestamp']);

  var dt = normDate(pick(f, ['date', 'arrplandate', 'depdate', 'depplandate']))
        || tsToDate(pick(f, ['arrivalplantimestamp', 'departureplantimestamp', 'arrivalestimatetimestamp']));

  var item = {
    isCare: false,
    flightNum: fnum,
    depcode: dep,
    arrcode: arr,
    date: dt,
    depTime: depT,
    arrTime: arrT,
    status: normStatus(pick(f, ['flightstatus', 'status', 'flightstate', 'state', 'statusname'])),
    arrCityName: String(pick(f, ['arrcityname', 'arrciytname', 'arrcity', 'arrival']) || ''),
    depCityName: String(pick(f, ['depcityname', 'depcity', 'departure']) || ''),
    passager: normPax(pick(f, ['passager', 'passengernum', 'passagercount', 'planpassenger', 'pcount', 'num'])),
    yw: String(pick(f, ['yw', 'delay', 'delaytime']) || ''),
    terminal: String(pick(f, ['arrterminal', 'terminal', 'depterminal']) || ''),
    showRowNumber: 0
  };

  if (!item.arrTime && !item.depTime) return null;
  return item;
}

function rewriteLike(tpl, src) {
  var o = {};
  for (var k in tpl) {
    if (!Object.prototype.hasOwnProperty.call(tpl, k)) continue;
    var lk = k.toLowerCase(), v;
    if (/^(fnum|flightnum|flightnumber|flightno|fcflightno|flightcode)$/.test(lk)) v = src.flightNum;
    else if (/^(dep|depcode|departurecode|depairport|depapt)$/.test(lk)) v = src.depcode;
    else if (/^(arr|arrcode|arrivalcode|arrairport|arrapt)$/.test(lk)) v = src.arrcode;
    else if (/^(departure|depcityname|depcity)$/.test(lk)) v = src.depCityName;
    else if (/^(arrival|arrcityname|arrciytname|arrcity)$/.test(lk)) v = src.arrCityName;
    else if (/^(arrest|arrtime|arrplantime|arrhm)$/.test(lk)) v = src.arrTime;
    else if (/^(deptime|depplantime|dephm)$/.test(lk)) v = src.depTime;
    else if (/^(flightstatus|status|flightstate)$/.test(lk)) v = src.status;
    else if (/^(passager|passagernum|passengernum|pcount)$/.test(lk)) v = src.passager;
    else if (/^(yw|delay|delaytime)$/.test(lk)) v = src.yw;
    else if (/^terminal$/.test(lk)) v = src.terminal;
    else if (/^date$/.test(lk)) v = src.date;
    else if (/timestamp$/.test(lk)) v = 0;
    else if (typeof tpl[k] === 'number') v = 0;
    else if (typeof tpl[k] === 'boolean') v = false;
    else v = '';
    o[k] = v;
  }
  return o;
}

function aptOfArray(arr) {
  if (!arr || !arr.length) return '';
  var n = Math.min(arr.length, 40), aC = {}, dC = {}, i;
  for (i = 0; i < n; i++) {
    var a = up(pick(arr[i], ['arrcode', 'arrivalcode', 'arrairport', 'arr']));
    var d = up(pick(arr[i], ['depcode', 'departurecode', 'depairport', 'dep']));
    if (a) aC[a] = (aC[a] || 0) + 1;
    if (d) dC[d] = (dC[d] || 0) + 1;
  }
  var best = '', bestN = 0, k;
  for (k in aC) if (aC[k] > bestN) { bestN = aC[k]; best = k; }
  for (k in dC) if (dC[k] > bestN) { bestN = dC[k]; best = k; }
  if (!best) return '';
  return bestN >= Math.ceil(n * 0.8) ? best : '';
}

function isFlightObj(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  var lk = Object.keys(lowerKeys(o));
  var hasNum = false, hasTime = false;
  for (var i = 0; i < lk.length; i++) {
    if (/^(flightnum|fnum|flightno|flight_no|fcflightno|flightnumber|flightcode)$/.test(lk[i])) hasNum = true;
    if (/(time|timestamp|est|arrest)$/.test(lk[i])) hasTime = true;
  }
  return hasNum && hasTime;
}

function collectFlightArrays(node, path, depth, out) {
  if (depth > 9 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    if (node.length && isFlightObj(node[0])) out.push({ path: path, arr: node });
    var lim = Math.min(node.length, 2);
    for (var i = 0; i < lim; i++) {
      if (isFlightObj(node[i])) continue;
      collectFlightArrays(node[i], path + '[' + i + ']', depth + 1, out);
    }
    return;
  }
  for (var k in node) {
    if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
    collectFlightArrays(node[k], path ? path + '.' + k : k, depth + 1, out);
  }
}

function buildFromCache(cache, airportCode, isInQueue) {
  var bag = [], seen = {}, from = [];

  function feed(list, tag) {
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || !it.flightNum) continue;
      if (airportCode) {
        if (isInQueue) { if (it.arrcode && it.arrcode !== airportCode) continue; }
        else { if (it.depcode && it.depcode !== airportCode) continue; }
      }
      var dk = it.flightNum + '|' + it.arrTime + '|' + it.depTime;
      if (seen[dk]) continue;
      seen[dk] = 1;
      bag.push(it);
      n++;
    }
    if (n) from.push(tag + ':' + n);
  }

  var pool = cache.__pool || {};
  if (airportCode && Array.isArray(pool[airportCode])) feed(pool[airportCode], 'pool');

  var keys = [];
  for (var k0 in cache) {
    if (!Object.prototype.hasOwnProperty.call(cache, k0)) continue;
    if (k0 === '__pool') continue;
    keys.push(k0);
  }
  keys.sort(function (a, b) {
    var pa = /screenList/.test(a) ? 0 : (/overviewv6/.test(a) ? 1 : (/queuev5/.test(a) ? 3 : 2));
    var pb = /screenList/.test(b) ? 0 : (/overviewv6/.test(b) ? 1 : (/queuev5/.test(b) ? 3 : 2));
    return pa - pb;
  });

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var e = cache[k];
    if (!e || !e.body) continue;
    if (airportCode && e.airport && e.airport !== airportCode) continue;

    var j;
    try { j = JSON.parse(e.body); } catch (err) { continue; }
    var arrs = [];
    collectFlightArrays(j, '', 0, arrs);
    var got = [];
    for (var ai = 0; ai < arrs.length; ai++) {
      for (var q = 0; q < arrs[ai].arr.length; q++) {
        var it2 = toQueueItem(arrs[ai].arr[q]);
        if (it2) got.push(it2);
      }
    }
    if (got.length) feed(got, e.url || k);
  }

  if (!bag.length) return null;
  bag.sort(function (a, b) {
    var x = a.arrTime || '99:99', y = b.arrTime || '99:99';
    if (x !== y) return x < y ? -1 : 1;
    return a.flightNum < b.flightNum ? -1 : (a.flightNum > b.flightNum ? 1 : 0);
  });
  return { items: bag, from: from.join(',') };
}

function poolAdd(cache, apt, items) {
  if (!apt || !items || !items.length) return 0;
  var pool = cache.__pool || {};
  var arr = Array.isArray(pool[apt]) ? pool[apt] : [];
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].flightNum) seen[arr[i].flightNum + '|' + arr[i].arrTime + '|' + arr[i].depTime] = 1;
  }
  var added = 0;
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    if (!it || !it.flightNum) continue;
    var dk = it.flightNum + '|' + it.arrTime + '|' + it.depTime;
    if (seen[dk]) continue;
    seen[dk] = 1;
    arr.push(it);
    added++;
  }
  pool[apt] = arr;
  cache.__pool = pool;
  return added;
}

function arrKey(item) {
  if (!item) return 9999;
  var t = String(pick(item, ['arrest', 'arrtime', 'arrplantime']) || '');
  var now = new Date();
  var cur = now.getHours() * 60 + now.getMinutes();
  var m = t.match(/(\d{1,2}):(\d{2})/);
  if (m && !/分钟/.test(t)) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  var r1 = t.match(/(\d+)\s*分钟后/);
  if (r1) return cur + parseInt(r1[1], 10);
  var r2 = t.match(/(\d+)\s*分钟前/);
  if (r2) return cur - parseInt(r2[1], 10);
  var r3 = t.match(/(\d+)\s*小时后/);
  if (r3) return cur + parseInt(r3[1], 10) * 60;
  var ts = pick(item, ['arrivalplantimestamp', 'arrivalestimatetimestamp', 'arrivalactualtimestamp']);
  var n = Number(ts);
  if (isFinite(n) && n > 0) {
    if (n > 1e12) n = Math.floor(n / 1000);
    var d = new Date(n * 1000);
    if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  }
  return 9999;
}

function trimToRestOfDay(items, dateStr) {
  var out = [], now = new Date();
  var hm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (dateStr && it.date && it.date !== dateStr) continue;
    if (it.arrTime && it.arrTime < hm) {
      var a = it.arrTime.split(':'), b = hm.split(':');
      var mins = (parseInt(b[0], 10) * 60 + parseInt(b[1], 10)) - (parseInt(a[0], 10) * 60 + parseInt(a[1], 10));
      if (mins > 40) continue;
    }
    out.push(it);
  }
  return out.length ? out : items;
}

(function () {

  var url = '';
  try { url = ($request && $request.url) ? $request.url : ''; } catch (e) {}

  if (typeof $response === 'undefined' || !$response) { $done({}); return; }
  var body = (typeof $response.body === 'string') ? $response.body : '';
  if (!body) { $done({}); return; }

  var dpath = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
  var dec = decodeJson(body);

  var apt = aptFromRequest();
  if (!apt && dec) apt = aptFromObj(dec.obj, 0);
  if (!apt) apt = up(urlParam(url, 'airport') || urlParam(url, 'code'));

  var isQueue = /\/airport\/(in|out)queuev5/i.test(url);
  var isIn = /inqueuev5/i.test(url);

  if (!apt && dec) {
    var aq = [];
    collectFlightArrays(dec.obj, '', 0, aq);
    for (var ax = 0; ax < aq.length && !apt; ax++) apt = aptOfArray(aq[ax].arr);
  }

  if (isQueue) {
    if (!dec) {
      if (dumpOnce('qnodec')) console.log('[feeyo v16] queue undecodable len=' + body.length);
      $done({ body: body });
      return;
    }

    if (dumpOnce('qreq_' + (isIn ? 'in' : 'out'))) {
      try {
        console.log('[feeyo u1] FULLURL ' + url);
        var mth = '?', hc = 0;
        try { mth = ($request && $request.method) ? $request.method : '?'; } catch (e) {}
        try { hc = ($request && $request.headers) ? Object.keys($request.headers).length : 0; } catch (e) {}
        console.log('[feeyo u1] MODE ' + mth + ' HDRN=' + hc);
      } catch (e) {}
    }

    if (dumpOnce('probe_' + (isIn ? 'in' : 'out'))) {
      try {
        var pu = url.replace('/airport/inqueuev5', '/v4/airport/getQueueList').replace('/airport/outqueuev5', '/v4/airport/getQueueList');
        if (pu !== url) {
          console.log('[feeyo u2] PROBEURL ' + pu.slice(0, 260));
          $task.fetch({ url: pu, method: 'GET', headers: ($request && $request.headers) || {} }).then(function (r) {
            var b = (r && r.body) ? String(r.body) : '';
            console.log('[feeyo u2] PROBE status=' + (r && r.statusCode) + ' len=' + b.length);
            var pd = decodeJson(b);
            console.log('[feeyo u2] PROBEDEC ' + (pd ? pd.text.slice(0, 600) : (b ? 'RAW:' + b.slice(0, 300) : '(empty)')));
          }).catch(function (e) {
            console.log('[feeyo u2] PROBEERR ' + e);
          });
        }
      } catch (e) { console.log('[feeyo u2] PROBETHROW ' + e); }
    }

    var built = buildFromCache(loadCache(), apt, isIn);
    if (!built) {
      if (dumpOnce('qnocache')) console.log('[feeyo v16] no cache for ' + (apt || '??'));
      $done({ body: body });
      return;
    }

    var obj = dec.obj;
    if (!obj || typeof obj !== 'object') { $done({ body: body }); return; }

    var holders = [];
    function pushHolder(h) { if (h && typeof h === 'object' && holders.indexOf(h) < 0) holders.push(h); }
    pushHolder(obj);
    pushHolder(obj.data);
    if (obj.data && obj.data.queueData) pushHolder(obj.data.queueData);
    if (obj.queueData) pushHolder(obj.queueData);

    var items = trimToRestOfDay(built.items, '');

    var qArrs = [];
    collectFlightArrays(obj, '', 0, qArrs);

    var tplAny = null;
    for (var ta = 0; ta < qArrs.length && !tplAny; ta++) {
      if (qArrs[ta].arr.length && qArrs[ta].arr[0] && typeof qArrs[ta].arr[0] === 'object') tplAny = qArrs[ta].arr[0];
    }

    var replaced = 0, mainExtras = null, mainTpl = null;
    for (var qa = 0; qa < qArrs.length; qa++) {
      var qpath = qArrs[qa].path || '';
      if (/preflight|prefly/i.test(qpath)) continue;
      var qarr = qArrs[qa].arr;
      var tpl = qarr.length ? qarr[0] : tplAny;
      if (!tpl || typeof tpl !== 'object') continue;

      var have = {};
      for (var hx = 0; hx < qarr.length; hx++) {
        var hn = String(pick(qarr[hx], ['fnum', 'flightnum', 'flightnumber', 'flightno', 'fcflightno']) || '').toUpperCase();
        if (hn) have[hn] = 1;
      }

      var extras = [];
      for (var qx = 0; qx < items.length; qx++) {
        if (have[items[qx].flightNum]) continue;
        have[items[qx].flightNum] = 1;
        extras.push(items[qx]);
      }
      if (!extras.length) continue;

      extras.sort(function (a, b) {
        var x = a.arrTime || '99:99', y = b.arrTime || '99:99';
        return x < y ? -1 : (x > y ? 1 : 0);
      });

      for (var xe = 0; xe < extras.length; xe++) qarr.push(rewriteLike(tpl, extras[xe]));
      if (!mainExtras) { mainExtras = extras; mainTpl = tpl; }
      replaced += extras.length;

      qarr.sort(function (a, b) {
        var ka = arrKey(a), kb = arrKey(b);
        if (ka === kb) return 0;
        return ka < kb ? -1 : 1;
      });
    }

    var tg0 = (obj.data && typeof obj.data === 'object') ? obj.data : obj;
    if (Array.isArray(tg0.queueList) && !tg0.queueList.length && tplAny && items.length) {
      for (var qf = 0; qf < items.length; qf++) tg0.queueList.push(rewriteLike(tplAny, items[qf]));
      replaced += tg0.queueList.length;
    }

    if (!replaced) {
      var itemsQ = [];
      for (var iq = 0; iq < items.length; iq++) {
        itemsQ.push({
          fnum: items[iq].flightNum, dep: items[iq].depcode, arr: items[iq].arrcode,
          date: items[iq].date, flightStatus: items[iq].status,
          arrEst: items[iq].arrTime, departure: items[iq].depCityName,
          yw: items[iq].yw, terminal: items[iq].terminal,
          arrivalActualTimestamp: 0, passager: items[iq].passager
        });
      }
      var tgt = (obj.data && typeof obj.data === 'object') ? obj.data : obj;
      if (Array.isArray(tgt.queueList) && itemsQ.length > tgt.queueList.length) { tgt.queueList = itemsQ; replaced++; }
      else if (Array.isArray(tgt.prolist) && itemsQ.length > tgt.prolist.length) { tgt.prolist = itemsQ; replaced++; }
      else if (!tgt.queueList) { tgt.queueList = itemsQ; replaced++; }
    }

    if (!replaced) {
      console.log('[feeyo v16] keep original (built ' + items.length + ') apt=' + apt + ' src=' + built.from);
      $done({ body: body });
      return;
    }

    for (var hk = 0; hk < holders.length; hk++) {
      var hh = holders[hk];
      if ('tip' in hh) hh.tip = '';
      if ('showPassager' in hh) hh.showPassager = true;
      if ('showTerminal' in hh) hh.showTerminal = true;
      if ('notifyState' in hh) hh.notifyState = false;
      if ('firstCareRow' in hh) hh.firstCareRow = 0;
      if (hh.proplus && typeof hh.proplus === 'object') {
        hh.proplus.status = 1;
        hh.proplus.explain = '';
      }
      if (hh.proPlus && typeof hh.proPlus === 'object') {
        hh.proPlus.status = 1;
        hh.proPlus.explain = '';
      }
    }
    var tgt2 = (obj.data && typeof obj.data === 'object') ? obj.data : obj;
    if (tgt2.proplus && typeof tgt2.proplus === 'object') { tgt2.proplus.status = 1; tgt2.proplus.explain = ''; }
    if (tgt2.tip !== undefined) tgt2.tip = '';
    if (obj.isVip !== undefined) obj.isVip = 1;
    if (tgt2.isVip !== undefined) tgt2.isVip = 1;

    var outBody = encodeAs(obj, dec.via);

    console.log('[feeyo v16] ' + (apt || '??') + ' filled ' + items.length +
                ' flights (+' + replaced + ' new) via=' + dec.via +
                ' src=' + built.from + ' out=' + outBody.length);

    $done({ body: outBody, headers: $response.headers });
    return;
  }

  if (!dec) {
    if (dumpOnce('undec_' + dpath.replace(/[^A-Za-z0-9_]/g, '_')))
      console.log('[feeyo v16] undecoded ' + dpath + ' len=' + body.length);
    $done({ body: body });
    return;
  }

  var found = [];
  collectFlightArrays(dec.obj, '', 0, found);

  if (!apt && found.length) {
    for (var af = 0; af < found.length && !apt; af++) apt = aptOfArray(found[af].arr);
  }

  if (found.length) {
    var c = loadCache();
    var key = dpath.replace(/[^A-Za-z0-9_]/g, '_');
    var total = 0;
    for (var kk2 in c) {
      if (!Object.prototype.hasOwnProperty.call(c, kk2)) continue;
      if (kk2 === '__pool') continue;
      total++;
    }
    if (total >= MAX_ITEMS) {
      var oldestKey = null, oldestTs = Infinity;
      for (var kk3 in c) {
        if (!Object.prototype.hasOwnProperty.call(c, kk3)) continue;
        if (kk3 === '__pool') continue;
        if (c[kk3].ts < oldestTs) { oldestTs = c[kk3].ts; oldestKey = kk3; }
      }
      if (oldestKey) delete c[oldestKey];
    }

    var text = dec.text;
    if (text.length > MAX_PER) text = text.slice(0, MAX_PER);

    var count = 0, norm = [];
    for (var fi = 0; fi < found.length; fi++) {
      count += found[fi].arr.length;
      for (var fj = 0; fj < found[fi].arr.length; fj++) {
        var nit = toQueueItem(found[fi].arr[fj]);
        if (nit) norm.push(nit);
      }
    }

    c[key] = { url: dpath, airport: apt, ts: Date.now(), body: text };
    var pooled = apt ? poolAdd(c, apt, norm) : 0;
    saveCache(c);

    console.log('[feeyo v16] cached ' + key + ' (' + count + ' flights, via ' + dec.via + ', apt=' + apt + ', pool+' + pooled + ')');
  }

  $done({ body: body });

})();
