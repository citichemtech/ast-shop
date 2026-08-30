/**
 * ทางเข้าของระบบ — หน้าเว็บและฟังก์ชันที่หน้าจอเรียก
 *
 * แอปถูกเสิร์ฟจาก Apps Script เอง (HtmlService) ไม่ได้อยู่บน GitHub Pages แล้ว
 * ผลคือ
 *   - ล็อกอินเป็นของ Google ล้วน ๆ ไม่มีรหัสฝังในไฟล์ให้ใครอ่านได้อีก
 *   - หน้าจอกับหลังบ้านอยู่โดเมนเดียวกัน ไม่ต้องยุ่งกับ CORS
 *   - Session.getActiveUser() บอกได้จริงว่าใครกดบันทึก
 */

var ALLOW_DOMAIN = 'chem-inno-tech.com';

/* --------------------------------------------------------------- สิทธิ์เข้าใช้ */

function whoami_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) { email = ''; }
  return String(email).trim().toLowerCase();
}

/** รายชื่อเพิ่มเติมที่อนุญาต เก็บที่ Script Properties คีย์ ALLOW_EMAILS คั่นด้วยจุลภาค */
function allowExtra_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ALLOW_EMAILS') || '';
  return raw.toLowerCase().split(/[\s,;]+/).filter(function (x) { return x.indexOf('@') > 0; });
}

/**
 * ใครเปิดชีทของร้านได้ คนนั้นใช้แอปได้
 *
 * เดิมตรงนี้อ่านรายชื่อผู้แก้ไขจาก Drive มาเทียบ ซึ่งพังเงียบ ๆ กับของจริง:
 * แอป deploy แบบ "ทำงานในชื่อผู้ใช้ที่เข้าถึง" ดังนั้น DriveApp จึงถามในนามพนักงาน
 * ไม่ใช่ในนามเจ้าของ และคนที่เป็นแค่ผู้แก้ไขมักอ่านรายชื่อผู้ร่วมงานไม่ได้
 * ผลคือได้รายชื่อว่าง แล้วปฏิเสธคนที่เจ้าของแชร์ชีทให้เรียบร้อยแล้วจริง ๆ
 *
 * จึงเปลี่ยนมาถามตรง ๆ ว่า "บัญชีนี้เปิดชีทได้ไหม" ให้ Google ตอบเอง ไม่ต้องอ่าน ACL
 * ตรงกับความจริงกว่าเดิมด้วย เพราะสิ่งที่แอปทำได้ก็คือสิ่งที่บัญชีนั้นทำกับชีทได้อยู่แล้ว
 * ส่วนการเขียนยังมี Google กันอีกชั้น คนที่มีสิทธิ์แค่ดูจะบันทึกออเดอร์ไม่ผ่านอยู่ดี
 */
function canOpenSheet_() {
  var cache = CacheService.getUserCache();      // แคชรายคน ไม่ใช่ก้อนเดียวใช้ร่วมกันทั้งระบบ
  if (cache.get('sheetOk') === '1') return true;
  try {
    SpreadsheetApp.openById(SHEET_ID).getName();
  } catch (err) {
    Logger.log('เปิดชีทในนามผู้ใช้ไม่ได้: ' + err.message);
    return false;   // ไม่แคชคำว่า "ไม่ได้" — พอเจ้าของแชร์ชีทให้ ต้องเข้าได้ทันทีไม่ต้องรอ
  }
  cache.put('sheetOk', '1', 300);
  return true;
}

/**
 * ปิดประตูแบบ fail-closed — ถ้าระบบไม่รู้ว่าใครเรียก ให้ปฏิเสธไว้ก่อน
 * ห้ามแก้ให้ผ่านเมื่ออีเมลว่าง เพราะนั่นคือกรณีที่คนนอกเข้ามาพอดี
 *
 * ผ่านได้ 3 ทาง — ทางไหนก็ได้
 *   1. เปิดชีทของร้านได้ (ทางปกติ — เจ้าของแชร์ชีทให้ ก็ใช้ได้เลย)
 *   2. อีเมลลงท้ายด้วยโดเมนบริษัท
 *   3. มีชื่อใน ALLOW_EMAILS ที่ Script Properties
 */
function requireStaff_() {
  var email = whoami_();
  if (!email) {
    throw new Error('ระบบไม่ทราบว่าคุณเป็นใคร — ตอน deploy ให้เลือก "ทำงานในชื่อ: ' +
      'ผู้ใช้ที่เข้าถึงเว็บแอป" แล้วเปิดลิงก์ใหม่อีกครั้ง');
  }
  if (canOpenSheet_()) return email;

  var suffix = '@' + ALLOW_DOMAIN;
  var inDomain = ALLOW_DOMAIN && email.length > suffix.length &&
    email.substring(email.length - suffix.length) === suffix;
  if (inDomain || allowExtra_().indexOf(email) > -1) return email;

  throw new Error('บัญชี ' + email + ' ยังไม่มีสิทธิ์ใช้ระบบนี้ — ' +
    'ให้เจ้าของร้านแชร์ชีทให้บัญชีนี้แบบ "ผู้แก้ไข" แล้วลองใหม่');
}

/* ------------------------------------------------------------------ หน้าเว็บ */

function doGet() {
  var email;
  try {
    email = requireStaff_();
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<div style="font:16px/1.7 system-ui;padding:32px;max-width:520px;margin:auto">' +
      '<h2 style="margin:0 0 12px">เข้าใช้ระบบไม่ได้</h2>' +
      '<p>' + escapeHtml_(err.message) + '</p></div>'
    ).setTitle('AST — เข้าใช้ระบบไม่ได้');
  }
  var t = HtmlService.createTemplateFromFile('Index');
  t.staffEmail = email;
  return t.evaluate()
    .setTitle('AST — คีย์ออเดอร์')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------------------------- ข้อมูลตั้งต้นสำหรับหน้าจอ */

/** สินค้าทั้งหมด + ยอดคงเหลือ + ตัวเลือก dropdown + ล็อตที่ยังมีของ */
function getBootstrap() {
  var email = requireStaff_();
  var cfg = cfgGet_();
  return {
    staff: email,
    shop: cfg.shop,
    vatRate: cfg.vatRate,
    lists: cfgLists_(),
    app: appCfg_(),
    products: readProducts_(),
    lots: readLotSummary_(),
    nextNo: peekNextOrderNo_()
  };
}

function readProducts_() {
  var rows = readAll_('prod');
  var stock = readStock_();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var sku = String(rows[i][SH.prod.IN.sku - 1] || '').trim();
    if (!sku) continue;
    out.push({
      sku: sku,
      group: String(rows[i][SH.prod.IN.group - 1] || ''),
      name: String(rows[i][SH.prod.IN.name - 1] || ''),
      unit: String(rows[i][SH.prod.IN.unit - 1] || 'ชิ้น'),
      perPack: Number(rows[i][SH.prod.IN.perPack - 1] || 1),
      price: Number(rows[i][SH.prod.IN.price - 1] || 0),
      remain: stock[sku] === undefined ? null : stock[sku]
    });
  }
  return out;
}

function readStock_() {
  var s = sheet_('stock');
  var last = s.getLastRow();
  var map = {};
  if (last < DATA_ROW) return map;
  var v = s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, SH.stock.remain).getValues();
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][SH.stock.sku - 1] || '').trim();
    if (sku) map[sku] = Number(v[i][SH.stock.remain - 1] || 0);
  }
  return map;
}

/** ล็อตที่ยังมีของ จัดกลุ่มตาม SKU พร้อมข้อมูลที่ FEFO ต้องใช้ */
function readLots_() {
  var s = sheet_('lot');
  var last = formulaLimit_('lot');
  var by = {};
  if (last < DATA_ROW) return by;
  var v = s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, SH.lot.remain).getValues();
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][SH.lot.IN.sku - 1] || '').trim();
    var lotNo = String(v[i][SH.lot.IN.lotNo - 1] || '').trim();
    if (!sku || !lotNo) continue;
    var exp = v[i][SH.lot.IN.exp - 1];
    var recv = v[i][SH.lot.IN.recv - 1];
    (by[sku] = by[sku] || []).push({
      row: DATA_ROW + i,
      lotNo: lotNo,
      exp: exp instanceof Date ? exp.getTime() : null,
      recv: recv instanceof Date ? recv.getTime() : null,
      remain: Number(v[i][SH.lot.remain - 1] || 0)
    });
  }
  return by;
}

/** รูปย่อของล็อตสำหรับหน้าจอ — บอกว่า SKU ไหนคุมล็อต เหลือเท่าไร ใกล้หมดอายุอันไหน */
function readLotSummary_() {
  var by = readLots_();
  var out = {};
  for (var sku in by) {
    var lots = fefoSort(by[sku]).filter(function (l) { return l.remain > 0; });
    var total = 0;
    for (var i = 0; i < lots.length; i++) total += lots[i].remain;
    out[sku] = {
      total: total,
      next: lots.length ? { lotNo: lots[0].lotNo, exp: lots[0].exp, remain: lots[0].remain } : null,
      count: lots.length
    };
  }
  return out;
}

/* ------------------------------------------------------- อ่านออเดอร์ที่บันทึกไว้ */

/**
 * ออเดอร์ล่าสุด พร้อมรายการสินค้าของแต่ละใบ
 * ใช้ทำใบปะหน้าพัสดุ · ข้อความแจ้งเลขพัสดุ · หน้ารายการออเดอร์
 */
function getOrders(limit) {
  requireStaff_();
  limit = Number(limit) || 40;

  var hs = sheet_('head');
  var hLast = formulaLimit_('head');
  var heads = [];
  if (hLast >= DATA_ROW) {
    var hv = hs.getRange(DATA_ROW, 1, hLast - DATA_ROW + 1, 21).getValues();
    for (var i = 0; i < hv.length; i++) {
      var no = String(hv[i][SH.head.IN.no - 1] || '').trim();
      if (!no) continue;
      var d = hv[i][SH.head.IN.date - 1];
      heads.push({
        no: no,
        date: d instanceof Date ? isoDate_(d) : String(d || ''),
        channel: String(hv[i][SH.head.IN.channel - 1] || ''),
        cust: String(hv[i][SH.head.IN.cust - 1] || ''),
        tel: String(hv[i][SH.head.IN.tel - 1] || ''),
        addr: String(hv[i][SH.head.IN.addr - 1] || ''),
        carrier: String(hv[i][SH.head.IN.carrier - 1] || ''),
        track: String(hv[i][SH.head.IN.track - 1] || ''),
        vat: String(hv[i][SH.head.IN.vat - 1] || ''),
        discount: Number(hv[i][SH.head.IN.discount - 1] || 0),
        ship: Number(hv[i][SH.head.IN.ship - 1] || 0),
        status: String(hv[i][SH.head.IN.status - 1] || ''),
        staff: String(hv[i][SH.head.IN.staff - 1] || ''),
        note: String(hv[i][SH.head.IN.note - 1] || ''),
        subtotal: Number(hv[i][SH.head.subtotal - 1] || 0),
        net: Number(hv[i][SH.head.net - 1] || 0),
        /* ต้นทุนกับกำไรเอาที่ชีทคำนวณมาเลย (O, P) ไม่คิดเองซ้ำในแอป
           ตัวเลขบนหน้าสรุปจะได้ตรงกับชีทเสมอ ไม่มีทางเถียงกันเอง */
        cost: Number(hv[i][14] || 0),
        profit: Number(hv[i][15] || 0),
        check: String(hv[i][17] || ''),
        items: []
      });
    }
  }

  heads.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.no < b.no ? 1 : -1;
  });
  heads = heads.slice(0, limit);

  var want = {};
  for (var h = 0; h < heads.length; h++) want[heads[h].no] = heads[h];

  var is = sheet_('item');
  var iLast = formulaLimit_('item');
  if (iLast >= DATA_ROW) {
    var iv = is.getRange(DATA_ROW, 1, iLast - DATA_ROW + 1, SH.item.lot).getValues();
    for (var j = 0; j < iv.length; j++) {
      var ono = String(iv[j][SH.item.IN.no - 1] || '').trim();
      var owner = want[ono];
      if (!owner) continue;
      owner.items.push({
        sku: String(iv[j][SH.item.IN.sku - 1] || ''),
        name: String(iv[j][4] || ''),
        unit: String(iv[j][5] || ''),
        qty: Number(iv[j][SH.item.IN.qty - 1] || 0),
        price: Number(iv[j][SH.item.IN.price - 1] || iv[j][7] || 0),
        total: Number(iv[j][9] || 0),
        profit: Number(iv[j][11] || 0),
        lot: String(iv[j][SH.item.lot - 1] || '')
      });
    }
  }
  return heads;
}

function isoDate_(d) {
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/**
 * ใส่เลขพัสดุและสถานะย้อนหลัง — งานที่เกิดหลังบันทึกออเดอร์เสมอ
 * แก้เฉพาะสองช่องนี้ ช่องอื่นของออเดอร์ไม่ถูกแตะ และลง Log ไว้ว่าใครแก้
 */
function setTracking(no, track, status) {
  var email = requireStaff_();
  no = String(no || '').trim();
  if (!no) throw new Error('ไม่ได้บอกว่าจะแก้ออเดอร์ไหน');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    var s = sheet_('head');
    var last = formulaLimit_('head');
    var v = s.getRange(DATA_ROW, SH.head.IN.no, last - DATA_ROW + 1, 1).getValues();
    var row = 0;
    for (var i = 0; i < v.length; i++) if (String(v[i][0]) === no) { row = DATA_ROW + i; break; }
    if (!row) throw new Error('ไม่พบออเดอร์ ' + no + ' ในชีท');

    var before = String(s.getRange(row, SH.head.IN.track).getValue() || '');
    var beforeStatus = String(s.getRange(row, SH.head.IN.status).getValue() || '');
    var patch = {};
    if (track !== undefined && track !== null) patch.track = String(track).trim();
    if (status) patch.status = pickFrom_(status, cfgLists_().status, 'สถานะออเดอร์');
    if (!Object.keys(patch).length) return { ok: true, no: no, changed: false };

    writeRow_('head', row, patch);
    SpreadsheetApp.flush();

    if (patch.track !== undefined && patch.track !== before) {
      writeLog_(email, 'ใส่เลขพัสดุ', SH.head.name, no, 'เลขพัสดุ', before, patch.track,
        'ใส่จากแอปโดย ' + email);
    }
    if (patch.status && patch.status !== beforeStatus) {
      writeLog_(email, 'เปลี่ยนสถานะ', SH.head.name, no, 'สถานะ', beforeStatus, patch.status,
        'เปลี่ยนจากแอปโดย ' + email);
    }
    return { ok: true, no: no, changed: true };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------ เอกสารขาย */

/**
 * ออกเอกสารขายหนึ่งใบ แล้วลงทะเบียนไว้ในชีท เอกสาร
 *
 * ใบเสนอราคาออกได้โดยไม่ต้องมีออเดอร์ (ยังไม่รู้ว่าลูกค้าจะซื้อไหม)
 * อีกสามชนิดต้องอ้างออเดอร์ที่มีจริง เพราะเป็นเอกสารของการขายที่เกิดขึ้นแล้ว
 *
 * ออกใบกำกับภาษีซ้ำใบที่สองให้ออเดอร์เดียวกันไม่ได้ ถ้าไม่ยืนยันมาว่าตั้งใจ —
 * ใบกำกับภาษีสองใบสำหรับการขายครั้งเดียวเป็นปัญหาทางบัญชีของทั้งร้านและลูกค้า
 * ถ้าจะออกใหม่จริง ๆ ต้องยกเลิกใบเก่าก่อน (กรอกเหตุผลในชีท) แล้วส่ง allowDup มา
 */
function issueDoc(payload) {
  var email = requireStaff_();
  var p = payload || {};
  var t = docType_(String(p.type || ''));
  if (!t) throw new Error('ไม่รู้จักชนิดเอกสาร');

  var clientKey = String(p.clientKey || '').trim();
  if (!clientKey) throw new Error('คำขอไม่มี clientKey — ระบบกันออกใบซ้ำไม่ได้ ไม่ออกให้');
  var props = PropertiesService.getScriptProperties();
  var done = props.getProperty('dk_' + clientKey);
  if (done) return { ok: true, no: done, repeat: true };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    done = props.getProperty('dk_' + clientKey);
    if (done) return { ok: true, no: done, repeat: true };

    var cfg = appCfg_();
    var orderNo = String(p.orderNo || '').trim();
    var src;
    if (t.quote) {
      src = { items: p.items || [], ship: p.ship, discount: p.discount };
      orderNo = '';
    } else {
      if (!orderNo) throw new Error('เอกสารชนิดนี้ต้องอ้างออเดอร์ ยังไม่ได้บอกว่าออเดอร์ไหน');
      var ord = findOrder_(orderNo);
      if (!ord) throw new Error('ไม่พบออเดอร์ ' + orderNo + ' ในชีท');
      src = { items: ord.items, ship: ord.ship, discount: ord.discount };
    }

    var used = readDocNos_();
    if (orderNo && !p.allowDup) {
      var dup = used.byOrder[orderNo + '|' + t.key];
      if (dup) {
        throw new Error('ออเดอร์ ' + orderNo + ' ออก' + t.th + 'ไปแล้วเป็นใบ ' + dup +
          ' — ถ้าจะออกใหม่ ต้องยกเลิกใบเดิมในชีท เอกสาร ก่อน');
      }
    }

    var prefix = cfg.docPrefix[t.key] || (t.code + '26-');
    var no = nextDocNo_(prefix, used.nos);
    var d = buildDoc_(t.key, src, {
      vatRate: p.novat ? 0 : cfgGet_().vatRate,
      vatMode: p.vatMode || cfg.vatMode
    });

    var row = nextRow_('doc', SH.doc.IN.no);
    if (!row) throw new Error('ชีท เอกสาร เต็มแล้ว — สั่ง setup() อีกครั้งเพื่อขยายแถว');
    var cu = p.cust || {};
    writeRow_('doc', row, {
      no: no, type: t.th, date: parseDate_(p.date) || new Date(), orderNo: orderNo,
      custName: String(cu.name || ''), custTaxId: String(cu.taxId || ''),
      custBranch: String(cu.branch || ''), custAddr: String(cu.addr || ''),
      custTel: String(cu.tel || ''), custEmail: String(cu.email || ''),
      custCode: String(cu.code || ''), po: String(p.po || ''), terms: String(p.terms || ''),
      base: d.base, vat: d.vat, total: d.total,
      staff: String(p.by || '').trim().slice(0, 40) || email,
      note: String(p.note || '')
    });
    SpreadsheetApp.flush();
    props.setProperty('dk_' + clientKey, no);
    writeLog_(email, 'ออกเอกสาร', SH.doc.name, no, t.th, '', d.total,
      orderNo ? 'จากออเดอร์ ' + orderNo : 'ออกเดี่ยว');

    return { ok: true, no: no, doc: d, row: row };
  } finally {
    lock.releaseLock();
  }
}

/** เลขเอกสารที่เคยออกไปแล้วทั้งหมด + ดัชนีว่าออเดอร์ไหนออกใบชนิดไหนไปแล้ว */
function readDocNos_() {
  var out = { nos: [], byOrder: {} };
  var s = sheet_('doc');
  var last = formulaLimit_('doc');
  if (last < DATA_ROW) return out;
  var n = last - DATA_ROW + 1;
  var v = s.getRange(DATA_ROW, SH.doc.IN.no, n, SH.doc.IN.voidWhy - SH.doc.IN.no + 1).getValues();
  var iType = SH.doc.IN.type - SH.doc.IN.no;
  var iOrd = SH.doc.IN.orderNo - SH.doc.IN.no;
  var iVoid = SH.doc.IN.voidWhy - SH.doc.IN.no;
  for (var i = 0; i < v.length; i++) {
    var no = String(v[i][0] || '').trim();
    if (!no) continue;
    out.nos.push(no);
    /* ใบที่ยกเลิกไปแล้วไม่นับเป็นใบที่ยังใช้อยู่ จึงออกใบใหม่แทนได้
       แต่เลขของมันยังอยู่ในชุด ไม่เอาเลขเดิมมาใช้ซ้ำ */
    if (String(v[i][iVoid] || '').trim()) continue;
    var ord = String(v[i][iOrd] || '').trim();
    if (!ord) continue;
    var th = String(v[i][iType] || '').trim();
    for (var k = 0; k < DOC_TYPES.length; k++) {
      if (DOC_TYPES[k].th === th) out.byOrder[ord + '|' + DOC_TYPES[k].key] = no;
    }
  }
  return out;
}

/** เลขเอกสารถัดไปของแต่ละชนิด — ให้หน้าจอโชว์ก่อนกดออกจริง */
function peekDocNos() {
  requireStaff_();
  var cfg = appCfg_();
  var used = readDocNos_();
  var out = {};
  for (var i = 0; i < DOC_TYPES.length; i++) {
    var t = DOC_TYPES[i];
    out[t.key] = nextDocNo_(cfg.docPrefix[t.key] || (t.code + '26-'), used.nos);
  }
  return out;
}

/** หาออเดอร์หนึ่งใบพร้อมรายการ — ใช้ตัวอ่านเดียวกับหน้ารายการออเดอร์ */
function findOrder_(no) {
  var list = getOrders(0);
  for (var i = 0; i < list.length; i++) if (String(list[i].no) === String(no)) return list[i];
  return null;
}

/* -------------------------------------------------------------- เลขที่ออเดอร์ */

/** เลขถัดไปแบบดูเฉย ๆ — ยังไม่จอง ต้องเรียกใต้ lock อีกทีตอนบันทึกจริง */
function peekNextOrderNo_() {
  var cfg = cfgGet_();
  var s = sheet_('head');
  var last = formulaLimit_('head');
  var max = 0;
  if (last >= DATA_ROW) {
    var v = s.getRange(DATA_ROW, SH.head.IN.no, last - DATA_ROW + 1, 1).getValues();
    for (var i = 0; i < v.length; i++) {
      var no = String(v[i][0] || '');
      if (no.indexOf(cfg.prefix) !== 0) continue;
      var n = parseInt(no.substring(cfg.prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return cfg.prefix + pad4_(max + 1);
}

function pad4_(n) {
  var s = String(n);
  while (s.length < 4) s = '0' + s;
  return s;
}

/* ------------------------------------------------------------- บันทึกออเดอร์ */

/**
 * บันทึก 1 ออเดอร์ลงชีท
 *
 * ทุกอย่างอยู่ใต้ LockService — คนสองคนกดพร้อมกันจะไม่ได้เลขออเดอร์ซ้ำกัน
 * ถ้าล้มกลางทาง แถวที่เพิ่งเขียนจะถูกล้างทิ้งทั้งหมด ไม่ทิ้งออเดอร์ครึ่งใบไว้ในชีท
 *
 * payload.clientKey ทำให้กดซ้ำหรือเน็ตหลุดแล้วยิงใหม่ ไม่เกิดออเดอร์ซ้ำ
 */
function createOrder(payload) {
  var email = requireStaff_();
  var p = payload || {};

  var clientKey = String(p.clientKey || '').trim();
  if (!clientKey) throw new Error('คำขอไม่มี clientKey — ระบบกันบันทึกซ้ำไม่ได้ ไม่บันทึกให้');

  var props = PropertiesService.getScriptProperties();
  var done = props.getProperty('ck_' + clientKey);
  if (done) return { ok: true, no: done, duplicate: true };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('มีคนกำลังบันทึกออเดอร์อยู่ ลองกดใหม่อีกครั้งใน 2-3 วินาที');
  }

  var written = { head: 0, item: [], cut: [] };
  try {
    done = props.getProperty('ck_' + clientKey);
    if (done) return { ok: true, no: done, duplicate: true };

    var plan = planOrder_(p, email);
    var no = reserveOrderNo_();
    plan.no = no;

    written = commitOrder_(plan);
    SpreadsheetApp.flush();
    verifyOrder_(plan);

    props.setProperty('ck_' + clientKey, no);
    writeLog_(email, 'บันทึกออเดอร์', SH.head.name, no,
      'สร้างออเดอร์ใหม่', '', String(plan.items.length) + ' รายการ',
      'คีย์ออเดอร์จากแอป โดย ' + plan.staff + ' (บัญชี ' + email + ')');

    return { ok: true, no: no, subtotal: plan.subtotal, net: plan.net, lots: plan.lotNote };
  } catch (err) {
    rollback_(written);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** ตรวจและเตรียมทุกอย่างให้ครบก่อน แล้วค่อยเริ่มเขียน — กันล้มกลางทางตั้งแต่ต้นทาง */
function planOrder_(p, email) {
  var cfg = cfgGet_();
  var lists = cfgLists_();

  var cust = String(p.cust || '').trim();
  if (!cust) throw new Error('ยังไม่ได้ใส่ชื่อลูกค้า');

  var rawItems = p.items || [];
  if (!rawItems.length) throw new Error('ออเดอร์นี้ยังไม่มีรายการสินค้า');

  var prods = {};
  var plist = readProducts_();
  for (var i = 0; i < plist.length; i++) prods[plist[i].sku] = plist[i];

  var lotsBySku = readLots_();
  var used = {};   // ตัดไปแล้วเท่าไรในออเดอร์นี้ กันสินค้าตัวเดียวกันหลายบรรทัดแย่งล็อตเดียวกัน
  var items = [];
  var cuts = [];
  var subtotal = 0;
  var lotNote = [];

  for (var k = 0; k < rawItems.length; k++) {
    var it = rawItems[k];
    var sku = String(it.sku || '').trim();
    var prod = prods[sku];
    if (!prod) throw new Error('บรรทัดที่ ' + (k + 1) + ': ไม่พบ SKU "' + sku + '" ในฐานสินค้า');

    var qty = Number(it.qty);
    if (!(qty > 0) || qty !== Math.floor(qty)) {
      throw new Error('บรรทัดที่ ' + (k + 1) + ' (' + sku + '): จำนวนต้องเป็นจำนวนเต็มมากกว่า 0');
    }

    var price = (it.price === '' || it.price === null || it.price === undefined)
      ? null : Number(it.price);
    if (price !== null && !(price >= 0)) {
      throw new Error('บรรทัดที่ ' + (k + 1) + ' (' + sku + '): ราคาขายจริงไม่ถูกต้อง');
    }
    subtotal += round2_(qty * (price === null ? prod.price : price));

    var lineNo = k + 1;
    var pool = (lotsBySku[sku] || []).map(function (l) {
      return { row: l.row, lotNo: l.lotNo, exp: l.exp, recv: l.recv, remain: l.remain - (used[l.row] || 0) };
    });
    var pick = fefoPick(pool, qty);
    if (!pick.ok) {
      if (pick.reason === 'short') {
        throw new Error('บรรทัดที่ ' + lineNo + ' (' + sku + ' — ' + prod.name + '): ' +
          'ล็อตมีของไม่พอ สั่ง ' + qty + ' แต่ในล็อตเหลือรวม ' + pick.have + ' ชิ้น ' +
          '— ให้บันทึกล็อตที่รับเข้ามาใหม่ก่อน หรือแก้จำนวนในออเดอร์');
      }
      throw new Error('บรรทัดที่ ' + lineNo + ' (' + sku + '): จำนวนไม่ถูกต้อง');
    }

    var expired = fefoExpired(pick.picks, pool);
    if (expired.length) {
      var names = expired.map(function (e) { return e.lotNo; }).join(', ');
      throw new Error('บรรทัดที่ ' + lineNo + ' (' + sku + '): ล็อต ' + names +
        ' หมดอายุแล้ว ระบบไม่ตัดขายให้ — ให้ปรับลดล็อตนั้นออกที่ชีท ' + SH.recv.name + ' ก่อน');
    }

    for (var q = 0; q < pick.picks.length; q++) {
      var pk = pick.picks[q];
      used[pk.row] = (used[pk.row] || 0) + pk.take;
      cuts.push({ lineNo: lineNo, sku: sku, lotNo: pk.lotNo, qty: pk.take });
    }
    if (pick.tracked) {
      lotNote.push(sku + ': ' + pick.picks.map(function (x) { return x.lotNo + ' x' + x.take; }).join(', '));
    }

    items.push({ lineNo: lineNo, sku: sku, qty: qty, price: price, std: prod.price });
  }

  var date = parseDate_(p.date);
  var channel = pickFrom_(p.channel, lists.channel, 'ช่องทางขาย');
  var carrier = pickFrom_(p.carrier, lists.carrier, 'ช่องทางจัดส่ง');
  var status = pickFrom_(p.status || lists.status[0], lists.status, 'สถานะออเดอร์');
  var vat = p.vat ? 'รับ VAT' : 'ไม่รับ VAT';

  return {
    date: date, channel: channel, cust: cust,
    tel: String(p.tel || '').trim(),
    addr: String(p.addr || '').trim(),
    carrier: carrier, track: String(p.track || '').trim(),
    vat: vat,
    discount: numOr0_(p.discount), ship: numOr0_(p.ship),
    /* ช่องพนักงานเก็บ "ชื่อคนคีย์" ที่เลือกจากหน้าจอ เพราะทั้งร้านใช้บัญชี Google เดียวกัน
       ถ้าไม่ได้เลือกก็ใช้อีเมลไปก่อน และไม่ว่าทางไหน Log ยังบันทึกอีเมลจริงไว้เสมอ */
    status: status, staff: String(p.by || '').trim().slice(0, 40) || email,
    note: String(p.note || '').trim(),
    items: items, cuts: cuts,
    subtotal: round2_(subtotal),
    lotNote: lotNote
  };
}

/** เขียนจริง — เรียกได้เฉพาะตอนถือ lock อยู่ */
function commitOrder_(plan) {
  var written = { head: 0, item: [], cut: [] };

  var hRow = nextRow_('head', SH.head.IN.no);
  if (!hRow) throw new Error('ชีท ' + SH.head.name + ' เต็มแล้ว (สูตรมีถึงแถว ' +
    formulaLimit_('head') + ') — ต้องลากสูตรลงเพิ่มก่อนจึงบันทึกออเดอร์ใหม่ได้');

  writeRow_('head', hRow, {
    no: plan.no, date: plan.date, channel: plan.channel, cust: plan.cust,
    tel: plan.tel, addr: plan.addr, carrier: plan.carrier, track: plan.track,
    vat: plan.vat, discount: plan.discount, ship: plan.ship,
    status: plan.status, staff: plan.staff, note: plan.note
  });
  written.head = hRow;

  var iRows = nextRows_('item', SH.item.IN.no, plan.items.length);
  if (!iRows.length) throw new Error('ชีท ' + SH.item.name + ' เหลือที่ว่างไม่พอ ' +
    plan.items.length + ' บรรทัด (สูตรมีถึงแถว ' + formulaLimit_('item') + ') — ต้องลากสูตรลงเพิ่มก่อน');
  for (var i = 0; i < plan.items.length; i++) {
    var it = plan.items[i];
    writeRow_('item', iRows[i], {
      no: plan.no, sku: it.sku, qty: it.qty,
      price: it.price === null ? undefined : it.price
    });
    written.item.push(iRows[i]);
  }

  if (plan.cuts.length) {
    var cRows = nextRows_('cut', SH.cut.IN.no, plan.cuts.length);
    if (!cRows.length) throw new Error('ชีท ' + SH.cut.name + ' เหลือที่ว่างไม่พอ ' +
      plan.cuts.length + ' บรรทัด — ต้องลากสูตรลงเพิ่มก่อน');
    for (var j = 0; j < plan.cuts.length; j++) {
      var ct = plan.cuts[j];
      writeRow_('cut', cRows[j], {
        no: plan.no, lineNo: ct.lineNo, sku: ct.sku, lotNo: ct.lotNo,
        qty: ct.qty, date: plan.date
      });
      written.cut.push(cRows[j]);
    }
  }

  return written;
}

/**
 * อ่านกลับมาดูว่าชีทคำนวณได้ตรงกับที่ตั้งใจไหม
 * จับกรณีที่สูตรในชีทถูกลบหรือถูกเขียนทับไปแล้ว — ถ้าไม่ตรงให้ถอยทั้งใบ ดีกว่าปล่อยยอดผิดค้างไว้
 */
function verifyOrder_(plan) {
  var s = sheet_('head');
  var row = 0;
  var last = formulaLimit_('head');
  var v = s.getRange(DATA_ROW, SH.head.IN.no, last - DATA_ROW + 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === plan.no) { row = DATA_ROW + i; break; }
  if (!row) throw new Error('บันทึกแล้วแต่หาแถวออเดอร์ ' + plan.no + ' ไม่เจอ — ยกเลิกการบันทึก');

  var got = Number(s.getRange(row, SH.head.subtotal).getValue() || 0);
  if (Math.abs(got - plan.subtotal) > 0.05) {
    throw new Error('ยอดสินค้าที่ชีทคำนวณได้ (' + got + ') ไม่ตรงกับที่ควรเป็น (' + plan.subtotal +
      ') — สูตรในชีทอาจถูกแก้ ระบบยกเลิกการบันทึกใบนี้แล้ว');
  }
  plan.net = Number(s.getRange(row, SH.head.net).getValue() || 0);
  plan.row = row;
}

/** ล้างเฉพาะแถวที่เพิ่งเขียน และล้างเฉพาะช่องกรอก สูตรของแถวนั้นยังอยู่ครบ */
function rollback_(written) {
  try {
    for (var i = written.cut.length - 1; i >= 0; i--) clearRow_('cut', written.cut[i]);
    for (var j = written.item.length - 1; j >= 0; j--) clearRow_('item', written.item[j]);
    if (written.head) clearRow_('head', written.head);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log('ถอยกลับไม่สำเร็จ: ' + e.message + ' ' + JSON.stringify(written));
  }
}

/** จองเลขออเดอร์ — เรียกได้เฉพาะตอนถือ lock อยู่ */
function reserveOrderNo_() {
  return peekNextOrderNo_();
}

function writeLog_(staff, type, sheetName, ref, field, before, after, why) {
  var row = nextRow_('log', SH.log.IN.at);
  if (!row) return;
  writeRow_('log', row, {
    at: new Date(), staff: staff, type: type, sheet: sheetName, ref: ref,
    field: field, before: before, after: after, why: why
  });
}

/* ------------------------------------------------------------------- helpers */

/**
 * ปัดเป็นทศนิยมสองตำแหน่งแบบเงิน
 *
 * Math.round(n * 100) / 100 ตรง ๆ ใช้กับเงินไม่ได้ เพราะเลขทศนิยมฐานสองเก็บ 9.995
 * ไว้ต่ำกว่าความจริงนิดหนึ่ง 9.995 * 100 จึงได้ 999.4999... แล้วปัดลงเป็น 9.99
 * บนใบกำกับภาษีคือสตางค์หายไปหนึ่งสตางค์ และทำให้ ฐานภาษี + ภาษี ไม่เท่ายอดรวม
 * แปลงผ่านสัญกรณ์ยกกำลังก่อน 9.995 จึงกลายเป็น 999.5 เป๊ะ แล้วค่อยปัด
 */
function round2_(n) {
  var v = Number(n);
  if (!isFinite(v)) return 0;
  var sign = v < 0 ? -1 : 1, a = Math.abs(v), s = String(a);
  if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) return sign * (Math.round(a * 100) / 100);
  var r = String(Math.round(Number(s + 'e2')));
  if (r.indexOf('e') >= 0 || r.indexOf('E') >= 0) return sign * a;
  return sign * Number(r + 'e-2');
}

function numOr0_(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

function parseDate_(s) {
  if (s instanceof Date) return s;
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** ค่าที่ส่งมาต้องเป็นหนึ่งในตัวเลือกของชีท ตั้งค่า ไม่งั้น dropdown กับสูตรจะเพี้ยน */
function pickFrom_(v, list, label) {
  var x = String(v || '').trim();
  if (!x) return list[0] || '';
  for (var i = 0; i < list.length; i++) if (list[i] === x) return x;
  throw new Error(label + ' "' + x + '" ไม่มีในตัวเลือกของชีท ตั้งค่า — ' +
    'ที่มีคือ ' + list.join(' / '));
}
