/*
 * 飞常准 · 机场进港排队「全天」补全
 * ---------------------------------------------------------------
 * 原理：
 *   排队页 /airport/inqueuev5 的 list / prolist 由服务端按账号裁成 3 小时窗口，
 *   本地改不了。但 App 里「机场 → 航班动态 / 大屏」那些接口是免费的、
 *   返回的是全天进出港航班，而且它就在同一台手机上被真实请求过。
 *
 *   所以这个脚本做两件事：
 *     1) 被动缓存：App 请求任何 airport / flight 接口，把响应存进 QX 本地
 *     2) 排队页改写：把缓存里的当天航班重排成排队页要的结构，填回 list / prolist
 *
 *   数据全部来自 App 自身已获授权的接口，不伪造、不外连。
 * ---------------------------------------------------------------
 * 兼容：Quantumult X 1.x
 */

var CACHE_KEY = 'feeyo_q_cache_v1';
var MAX_PER   = 45000;   // 单个接口缓存上限（字节）
var MAX_ITEMS = 10;      // 最多缓存几个接口

/* ---------------- 缓存 ---------------- */

function loadCache() {
  try { return JSON.parse($prefs.valueForKey(CACHE_KEY) || '{}'); }
  catch (e) { return {}; }
}

function saveCache(c) {
  try {
    var s = JSON.stringify(c);
    if (s.length > 900000) return;   // 保险丝，别撑爆持久化
    $prefs.setValueForKey(s, CACHE_KEY);
  } catch (e) {}
}

function urlParam(url, name) {
  var m = url.match(new RegExp('[?&]' + name + '=([^&#]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/* ---------------- 识别航班数组 ---------------- */

function lowerKeys(o) {
  var out = {};
  for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k.toLowerCase()] = k;
  return out;
}

function isFlightObj(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  var lk = Object.keys(lowerKeys(o));
  var numKey = null;
  for (var i = 0; i < lk.length; i++) {
    if (/^(fnum|flightno|flight_no|flightnum|fno|flightnumber|fcflightno|flightcode)$/.test(lk[i])) { numKey = lk[i]; break; }
  }
  if (!numKey) return false;
  var timeHit = false;
  for (var j = 0; j < lk.length; j++) {
    if (/(arr|est|plan|sched|time)/.test(lk[j]) && /(time|date|hm|hour|ts)$/.test(lk[j])) { timeHit = true; break; }
  }
  return timeHit;
}

function collectFlightArrays(node, path, depth, out) {
  if (depth > 8 || node === null || typeof node !== 'object') return;
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

// 任意时间表示 → "HH:mm"
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
  if (/^\d{6}$/.test(s)) return s.slice(0, 2) + ':' + s.slice(2, 4);   // HHMMSS
  if (/^\d{3,4}$/.test(s)) {                                            // HMM / HHMM
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

  // 若有方向字段，只要进港；起飞地在本地机场的直接排除
  if (airportCode) {
    var apt = normCode(airportCode);
    var dep = normCode(pick(f, ['depairport', 'depairportcode', 'depapt', 'origincode', 'origin', 'depcode', 'dep']));
    var arr = normCode(pick(f, ['arrairport', 'arrairportcode', 'arrapt', 'destinationcode', 'destination', 'arrcode', 'arr']));
    if (dep && dep === apt) return null;
    if (arr && arr !== apt) return null;
  }

  var t = pick(f, [
    'arrest', 'arresttime', 'estarrtime', 'arrtime', 'arrplantime', 'planarrtime',
    'plannedarrival', 'schedarrtime', 'scheduledarrival', 'arr_time', 'arrhm',
    'esttime', 'plantime', 'arrivaltime', 'eta'
  ]);

  var st = pick(f, ['flightstatus', 'status', 'state', 'flightstate', 'statusname', 'flightstatusname']);
  var pg = pick(f, ['passager', 'passenger', 'passengernum', 'passengercount', 'planpassenger', 'passager_num', 'pcount']);

  return {
    fnum: String(fnum),
    arrEst: normTime(t),
    flightStatus: normStatus(st),
    passager: normPassenger(pg)
  };
}

function buildFromCache(cache, airportCode) {
  var best = null;
  for (var k in cache) {
    if (!Object.prototype.hasOwnProperty.call(cache, k)) continue;
    var e = cache[k];
    if (!e || !e.body) continue;
    if (e.kind === 'raw') continue;
    // 机场要匹配；缓存里没记机场的就当通配
    if (airportCode && e.airport && e.airport.toUpperCase() !== airportCode.toUpperCase()) continue;
    if (!best || e.ts > best.ts) best = e;
  }
  if (!best) return null;

  var j;
  try { j = JSON.parse(best.body); } catch (e) { return null; }

  var arrs = [];
  collectFlightArrays(j, '', 0, arrs);
  if (!arrs.length) return null;

  // 合并所有航班数组（进出港可能分在不同字段里）
  var items = [];
  var seen = {};
  for (var ai = 0; ai < arrs.length; ai++) {
    var src = arrs[ai].arr;
    for (var i = 0; i < src.length; i++) {
      var it = toQueueItem(src[i], airportCode);
      if (!it) continue;
      var key = it.fnum + '|' + it.arrEst;
      if (seen[key]) continue;
      seen[key] = 1;
      items.push(it);
    }
  }
  if (!items.length) return null;

  // 按到达时间排序
  items.sort(function (a, b) {
    var x = a.arrEst === '--:--' ? '99:99' : a.arrEst;
    var y = b.arrEst === '--:--' ? '99:99' : b.arrEst;
    return x < y ? -1 : (x > y ? 1 : 0);
  });

  return { items: items, from: best.url || k, ts: best.ts };
}

/* ---------------- 主逻辑 ---------------- */

(function () {

  var url = ($request && $request.url) ? $request.url : '';
  var body = ($response && typeof $response.body === 'string') ? $response.body : '';

  if (!body) { $done({}); return; }

  /* --- A. 排队页：改写 --- */
  if (/\/airport\/(in|out)queuev5/.test(url)) {
    var airport = urlParam(url, 'airport');
    var built = buildFromCache(loadCache(), airport);

    if (!built) {
      console.log('[feeyo_queue] no cache for ' + airport + ' -> passthrough');
      $done({ body: body });
      return;
    }

    var obj = null;
    try { obj = JSON.parse(body); } catch (e) { obj = null; }

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

    console.log('[feeyo_queue] ' + airport + ' filled ' + built.items.length + ' flights from ' + built.from);
    $done({ body: JSON.stringify(obj), headers: $response.headers });
    return;
  }

  /* --- B. 其它接口：采集 --- */
  var qAirport = urlParam(url, 'airport') || urlParam(url, 'airportCode') || urlParam(url, 'apt') || urlParam(url, 'code');
  var probe = null;
  var parsed = false;

  try { probe = JSON.parse(body); parsed = true; } catch (e) { parsed = false; }

  if (!parsed) {
    // 密文接口：留一份样本，便于确认加密格式
    var raw = body.trim();
    var looksEnc = /^[A-Za-z0-9+/=\s]{64,}$/.test(raw) || /^[0-9a-fA-F]{64,}$/.test(raw);
    if (looksEnc) {
      var cc = loadCache();
      var rk = 'RAW_' + url.split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/[^A-Za-z0-9_]/g, '_');
      cc[rk] = { url: url.split('?')[0], airport: qAirport, ts: Date.now(), kind: 'raw', body: raw.slice(0, 4000) };
      saveCache(cc);
      console.log('[feeyo_queue] raw sample kept: ' + rk + ' len=' + raw.length);
    }
    $done({ body: body });
    return;
  }

  var found = [];
  collectFlightArrays(probe, '', 0, found);

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

    c[key] = {
      url: url.split('?')[0],
      airport: qAirport,
      ts: Date.now(),
      body: body.length > MAX_PER ? body.slice(0, MAX_PER) : body
    };
    saveCache(c);
    console.log('[feeyo_queue] cached ' + key + ' (' + found[0].arr.length + ' flights, apt=' + qAirport + ')');
  }

  $done({ body: body });

})();
