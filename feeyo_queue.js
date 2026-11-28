/*
 * 飞常准 · 机场进港排队「全天」补全  v6
 * v3 base64 解码 / v4 b64head 诊断 / v5 配置接口打印 / v6 请求头打印
 */

var CACHE_KEY = 'feeyo_q_cache_v1';
var MAX_PER   = 60000;
var MAX_ITEMS = 12;

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
    if (out.length > 4000000) break;
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
  if (b && b.length > 1) {
    try {
      var t = bytesToUtf8(b);
      return { obj: JSON.parse(t), text: t, via: 'base64' };
    } catch (e) {}
  }
  return null;
}

function b64BytesLen(raw) {
  var b = b64ToBytes(raw);
  return b ? b.length : -1;
}

function loadCache() {
  try { return JSON.parse($prefs.valueForKey(CACHE_KEY) || '{}'); }
  catch (e) { return {}; }
}

function saveCache(c) {
  try {
    var s = JSON.stringify(c);
    if (s.length > 900000) return;
    $prefs.setValueForKey(s, CACHE_KEY);
  } catch (e) {}
}

function urlParam(url, name) {
  var m = url.match(new RegExp('[?&]' + name + '=([^&#]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

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
  if (depth > 9 || node === null || typeof node !== 'object') return;
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
  var bestItems = null, bestFrom = null, bestTs = 0;

  for (var k in cache) {
    if (!Object.prototype.hasOwnProperty.call(cache, k)) continue;
    var e = cache[k];
    if (!e || !e.body || e.kind === 'raw') continue;
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
      bestTs = e.ts || 0;
    }
  }

  if (!bestItems) return null;

  bestItems.sort(function (a, b) {
    var x = a.arrEst === '--:--' ? '99:99' : a.arrEst;
    var y = b.arrEst === '--:--' ? '99:99' : b.arrEst;
    return x < y ? -1 : (x > y ? 1 : 0);
  });

  return { items: bestItems, from: bestFrom, ts: bestTs };
}

(function () {

  var url = ($request && $request.url) ? $request.url : '';
  var body = ($response && typeof $response.body === 'string') ? $response.body : '';

  if (!body) { $done({}); return; }

  var dec = decodeJson(body);

  /* --- A. 排队页：改写 --- */
  if (/\/airport\/(in|out)queuev5/.test(url)) {
    var airport = urlParam(url, 'airport');

    if (!dec) { $done({ body: body }); return; }

    var built = buildFromCache(loadCache(), airport);
    if (!built) {
      console.log('[feeyo_queue v6] no cache for ' + airport + ' -> passthrough');
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

    console.log('[feeyo_queue v6] ' + airport + ' filled ' + built.items.length +
                ' flights from ' + built.from + ' (via ' + dec.via + ')');
    $done({ body: JSON.stringify(obj), headers: $response.headers });
    return;
  }

  /* --- B. 其它接口 --- */
  var qAirport = urlParam(url, 'airport') || urlParam(url, 'airportCode') || urlParam(url, 'apt') || urlParam(url, 'code') || urlParam(url, 'dep') || urlParam(url, 'arr');

  if (!dec) {
    try {
      var hdrs = ($response && $response.headers) || {};
      var hnames = [];
      for (var hn in hdrs) hnames.push(hn);
      var ct = '';
      for (var hi = 0; hi < hnames.length; hi++) {
        if (/content-type/i.test(hnames[hi])) ct = hdrs[hnames[hi]];
      }
      var hex = '';
      var lim = Math.min(64, body.length);
      for (var bi = 0; bi < lim; bi++) {
        var cp = body.charCodeAt(bi) & 0xff;
        hex += (cp < 16 ? '0' : '') + cp.toString(16);
      }
      var dpath = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
      console.log('[diag] ' + dpath + ' ct=' + ct + ' len=' + body.length + ' b64len=' + b64BytesLen(body));
      console.log('[diag] head=' + hex);

      var bts = b64ToBytes(body);
      if (bts && bts.length) {
        var t2 = bytesToUtf8(bts);
        var seenTxt = t2.slice(0, 90).replace(/[^\x20-\x7e]/g, '.');
        console.log('[diag] b64head=' + seenTxt + ' | bytes=' + bts.length);
      }

      if (/config|init|secret|setting|appinfo|startup/i.test(dpath)) {
        var pre = body.slice(0, 1200).replace(/[\r\n\t]+/g, ' ');
        console.log('[cfg] ' + dpath + ' [' + body.length + '] ' + pre);
      }

      // 请求行与请求头：key / iv 若随请求走，一定在这里
      var rh = ($request && $request.headers) || {};
      var rhStr = '';
      for (var rk in rh) {
        if (!Object.prototype.hasOwnProperty.call(rh, rk)) continue;
        rhStr += rk + '=' + String(rh[rk]).slice(0, 80) + ' | ';
      }
      console.log('[req] ' + url.slice(0, 320));
      console.log('[reqh] ' + rhStr.slice(0, 1000));
    } catch (e) {}

    var cc0 = loadCache();
    var rk2 = 'RAW_' + url.split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/[^A-Za-z0-9_]/g, '_');
    cc0[rk2] = { url: url.split('?')[0], airport: qAirport, ts: Date.now(), kind: 'raw', body: body.slice(0, 4000) };
    saveCache(cc0);
    $done({ body: body });
    return;
  }

  var found = [];
  collectFlightArrays(dec.obj, '', 0, found);

  if (found.length) {
    var c = loadCache();
    var key = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/[^A-Za-z0-9_]/g, '_');
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

    c[key] = { url: url.split('?')[0], airport: qAirport, ts: Date.now(), body: text };
    saveCache(c);

    console.log('[feeyo_queue v6] cached ' + key + ' (' + found[0].arr.length + ' flights, via ' + dec.via + ', apt=' + qAirport + ')');
  }

  $done({ body: body });

})();
