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
  var out = t.evaluate()
    .setTitle('AST — คีย์ออเดอร์')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  /* ไอคอนตอนกด "เพิ่มไปยังหน้าจอหลัก" — ถ้าไม่ใส่ Chrome จะขึ้นตัว G สีเทาของ Google
     ใช้ตรา STOCK LIST ไม่ใช่โลโก้ AST เพื่อให้แยกออกจากไอคอนแอปหน้าร้านบนจอเดียวกัน
     ครอบ try ไว้เพราะถ้าลิงก์รูปมีปัญหา ห้ามพาให้ทั้งหน้าเปิดไม่ขึ้น */
  try { out.setFaviconUrl(APP_ICON_URL); } catch (e) { Logger.log('ตั้งไอคอนไม่ได้: ' + e.message); }
  return out;
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
  var ss = ss_();
  return {
    staff: email,
    shop: cfg.shop,
    /* ไฟล์ที่แอปผูกอยู่จริง ๆ — ในไดรฟ์มีไฟล์ชื่อคล้ายกันหลายอัน
       เคยเสียเวลาทั้งคืนเพราะแก้อยู่คนละไฟล์กับที่แอปเขียน
       โชว์ไว้ในแอปให้กดเปิดได้เลย จะได้ไม่ต้องเดากันอีก */
    file: { name: ss.getName(), url: ss.getUrl() },
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
      row: DATA_ROW + i,
      group: String(rows[i][SH.prod.IN.group - 1] || ''),
      name: String(rows[i][SH.prod.IN.name - 1] || ''),
      unit: String(rows[i][SH.prod.IN.unit - 1] || 'ชิ้น'),
      perPack: Number(rows[i][SH.prod.IN.perPack - 1] || 1),
      /* ต้นทุนว่างต้องคงความว่างไว้ ไม่ใช่แปลงเป็นศูนย์
         ว่าง = ยังไม่รู้ต้นทุน · 0 = รู้ว่าไม่มีต้นทุน — คนละความหมาย
         และเป็นตัวที่ใช้ตัดสินว่าของที่พิมพ์ชื่อเองซ้ำ ควรใช้รหัสเดิมหรือรหัสใหม่ */
      cost: (rows[i][SH.prod.IN.cost - 1] === '' ||
             rows[i][SH.prod.IN.cost - 1] === null ||
             rows[i][SH.prod.IN.cost - 1] === undefined)
              ? '' : Number(rows[i][SH.prod.IN.cost - 1] || 0),
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
        /* เบอร์ลูกค้าที่ชีทเก็บเป็นตัวเลข ศูนย์หน้าจะหายไป 0614035852 กลายเป็น 614035852
             แล้วไปพิมพ์บนใบปะหน้าแบบนั้น คนส่งของโทรหาผู้รับไม่ได้ทั้งใบ
             (ของผู้ส่งเติมคืนไว้แล้วตั้งแต่แรก ของผู้รับตกหล่นไป) */
        tel: tel_(hv[i][SH.head.IN.tel - 1]),
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
        name: itemName_(iv[j][4], iv[j][SH.item.IN.sku - 1]),
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

/* วันเวลาแบบไทยสั้น ๆ สำหรับติดท้ายเหตุผลที่ยกเลิก
   ใช้เมธอดของ Date ตรง ๆ ซึ่งใน Apps Script อ่านตามเขตเวลาของสคริปต์อยู่แล้ว */
function stampTime_() {
  var d = new Date();
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
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
    var no = nextDocNo_(prefix, used.nos, 5, cfg.docStart[t.key]);
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
      note: String(p.note || ''),
      snap: docSnap_(d, p, no, t)
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

/**
 * ภาพถ่ายของใบตอนที่ออก — เก็บลงชีทช่องเดียวเป็น JSON
 *
 * มีไว้เพื่อ "พิมพ์ซ้ำ" ให้ได้ใบเดิมทุกตัวอักษร ถ้าไปประกอบใหม่จากออเดอร์
 * ตอนกดพิมพ์ซ้ำ แล้วออเดอร์ถูกแก้ทีหลัง (แก้ราคา เพิ่มของ ลดของ)
 * ใบที่พิมพ์ออกมาจะไม่ตรงกับใบที่ลูกค้าถืออยู่และที่ส่งบัญชีไปแล้ว
 * ใบกำกับภาษีสองใบเลขเดียวกันแต่ยอดคนละอย่าง เป็นปัญหาภาษีของทั้งสองฝ่าย
 *
 * ใบเสนอราคาไม่ได้ผูกกับออเดอร์เลย ถ้าไม่เก็บตรงนี้ก็ประกอบกลับไม่ได้เลยด้วยซ้ำ
 */
function docSnap_(d, p, no, t) {
  var cu = p.cust || {};
  try {
    return JSON.stringify({
      v: 1, no: no, type: t.key, date: String(p.date || ''),
      lines: d.lines, base: d.base, vat: d.vat, vatRate: d.vatRate,
      total: d.total, totalText: d.totalText,
      cust: {
        name: String(cu.name || ''), taxId: String(cu.taxId || ''),
        branch: String(cu.branch || ''), addr: String(cu.addr || ''),
        tel: String(cu.tel || ''), email: String(cu.email || '')
      },
      po: String(p.po || ''), terms: String(p.terms || ''),
      note: String(p.note || ''), validTo: String(p.validTo || ''),
      /* ชื่อที่คนออกใบเลือกให้ขึ้นเข้มบนหัวใบ ต้องเก็บไว้ด้วย
         ไม่งั้นพิมพ์ซ้ำแล้วได้หัวใบคนละแบบกับใบที่ลูกค้าถืออยู่ */
      form: (p.form || []).map(Number).filter(function (n) { return n >= 0 && n <= 3; })
    });
  } catch (e) {
    /* เก็บภาพถ่ายไม่ได้ ไม่ใช่เหตุให้ออกใบไม่สำเร็จ — ใบยังถูกต้องทุกอย่าง
       แค่พิมพ์ซ้ำทีหลังต้องประกอบจากออเดอร์แทน ซึ่งแอปจะเตือนให้เอง */
    Logger.log('เก็บภาพถ่ายใบ ' + no + ' ไม่ได้: ' + e.message);
    return '';
  }
}

/**
 * ใบที่เคยออกให้ออเดอร์นี้ — ไว้ให้หน้าจอโชว์ปุ่มพิมพ์ซ้ำ
 * orderNo ว่าง = เอาใบเสนอราคาล่าสุดมาให้ (ใบเสนอราคาไม่ผูกกับออเดอร์)
 */
function listDocs(orderNo) {
  requireStaff_();
  var want = String(orderNo || '').trim();
  var s = sheet_('doc');
  var last = formulaLimit_('doc');
  if (last < DATA_ROW) return [];
  var n = last - DATA_ROW + 1;
  var C = SH.doc.IN;
  var v = s.getRange(DATA_ROW, C.no, n, C.snap - C.no + 1).getValues();
  var at = function (col) { return col - C.no; };
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var no = String(v[i][0] || '').trim();
    if (!no) continue;
    var ord = String(v[i][at(C.orderNo)] || '').trim();
    if (want) { if (ord !== want) continue; }
    else if (ord) continue;
    out.push({
      no: no, type: String(v[i][at(C.type)] || ''),
      date: isoDate_(v[i][at(C.date)]), orderNo: ord,
      custName: String(v[i][at(C.custName)] || ''),
      total: Number(v[i][at(C.total)] || 0),
      voidWhy: String(v[i][at(C.voidWhy)] || '').trim(),
      hasSnap: !!String(v[i][at(C.snap)] || '').trim()
    });
  }
  /* ใบล่าสุดอยู่บนสุด คนมักพิมพ์ซ้ำใบที่เพิ่งออก */
  out.reverse();
  return want ? out : out.slice(0, 20);
}

/**
 * ยกเลิกเอกสารที่ออกผิด
 *
 * ทำไมไม่ทำเป็น "ปุ่มแก้ไข" ที่เขียนทับใบเดิม: ใบที่ออกไปแล้วลูกค้าถืออยู่ในมือ
 * ถ้าแก้ตัวเลขในระบบเงียบ ๆ ใบที่ลูกค้าถือกับในระบบจะไม่ตรงกัน ซึ่งเป็นปัญหา
 * ตอนสรรพากรตรวจ และเป็นเหตุผลเดียวกับที่ระบบเก็บภาพถ่ายของใบไว้ตอนออก
 *
 * วิธีที่ถูกคือติดป้ายว่ายกเลิกพร้อมเหตุผล แล้วออกใบใหม่แทน
 *   - แถวเดิมยังอยู่ครบ ทั้งเลขที่ ยอด และภาพถ่ายของใบ พิมพ์ออกมาดูย้อนหลังได้
 *   - เลขเดิมไม่ถูกเอากลับมาใช้ซ้ำ (nextDocNo_ ยังนับเลขนั้นอยู่)
 *   - ใบที่ยกเลิกแล้วไม่นับเป็นใบที่ยังใช้อยู่ จึงออกใบใหม่ให้ออเดอร์เดิมได้เลย
 *     ไม่ต้องส่ง allowDup มาอีก
 *
 * ยกเลิกซ้ำใบเดิมไม่ได้ เพราะจะทับเหตุผลเดิมที่บันทึกไว้ครั้งแรกหายไป
 */
function voidDoc(no, why, by) {
  var email = requireStaff_();
  var want = String(no || '').trim();
  if (!want) throw new Error('ไม่ได้บอกว่าจะยกเลิกใบไหน');

  var reason = String(why || '').trim();
  if (reason.length < 5) {
    throw new Error('ต้องบอกเหตุผลที่ยกเลิกอย่างน้อย 5 ตัวอักษร — ' +
      'ช่องนี้คือสิ่งที่บัญชีกับสรรพากรจะอ่านว่าทำไมใบนี้ถึงใช้ไม่ได้');
  }
  reason = reason.slice(0, 200);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    var s = sheet_('doc');
    var last = formulaLimit_('doc');
    var C = SH.doc.IN;
    var n = Math.max(0, last - DATA_ROW + 1);
    var v = n ? s.getRange(DATA_ROW, C.no, n, C.voidWhy - C.no + 1).getValues() : [];
    for (var i = 0; i < v.length; i++) {
      if (String(v[i][0] || '').trim() !== want) continue;

      var had = String(v[i][C.voidWhy - C.no] || '').trim();
      if (had) {
        throw new Error('ใบ ' + want + ' ถูกยกเลิกไปแล้ว (' + had + ') — ' +
          'ออกใบใหม่แทนได้เลย ไม่ต้องยกเลิกซ้ำ');
      }

      var th = String(v[i][C.type - C.no] || '').trim();
      var ord = String(v[i][C.orderNo - C.no] || '').trim();
      var who = String(by || '').trim().slice(0, 40) || email;
      var stamp = reason + ' [ยกเลิกโดย ' + who + ' ' + stampTime_() + ']';

      writeRow_('doc', DATA_ROW + i, { voidWhy: stamp });
      SpreadsheetApp.flush();
      writeLog_(email, 'ยกเลิกเอกสาร', SH.doc.name, want, th, 'ใช้ได้', 'ยกเลิก',
        reason + (ord ? ' (ออเดอร์ ' + ord + ')' : ''));

      return { ok: true, no: want, type: th, orderNo: ord, voidWhy: stamp };
    }
    throw new Error('ไม่พบเอกสารเลขที่ ' + want + ' ในชีท ' + SH.doc.name);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ดึงใบเดิมมาพิมพ์ซ้ำ — ไม่ออกเลขใหม่ ไม่แตะสต๊อก ไม่เขียนอะไรลงชีท
 *
 * คืน exact:true เมื่อใช้ภาพถ่ายที่เก็บไว้ตอนออกใบ ซึ่งได้ใบเดิมเป๊ะ
 * คืน exact:false เมื่อใบนั้นออกก่อนที่ระบบจะเก็บภาพถ่าย ต้องประกอบจากออเดอร์ให้
 * ตอนนั้นถ้ายอดที่ประกอบได้ไม่ตรงกับยอดที่บันทึกไว้ จะบอกมาด้วยว่าต่างกันตรงไหน
 * ห้ามเงียบ เพราะใบที่ยอดไม่ตรงกับที่ส่งลูกค้าไปแล้วคือใบที่ใช้ไม่ได้
 */
function getDoc(no) {
  requireStaff_();
  var want = String(no || '').trim();
  if (!want) throw new Error('ไม่ได้บอกว่าจะพิมพ์ซ้ำใบไหน');
  var s = sheet_('doc');
  var last = formulaLimit_('doc');
  var C = SH.doc.IN;
  var n = Math.max(0, last - DATA_ROW + 1);
  var v = n ? s.getRange(DATA_ROW, C.no, n, C.snap - C.no + 1).getValues() : [];
  var at = function (col) { return col - C.no; };
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0] || '').trim() !== want) continue;

    var th = String(v[i][at(C.type)] || '').trim();
    var key = '';
    for (var k = 0; k < DOC_TYPES.length; k++) if (DOC_TYPES[k].th === th) key = DOC_TYPES[k].key;

    var m = {
      no: want, date: isoDate_(v[i][at(C.date)]), orderNo: String(v[i][at(C.orderNo)] || '').trim(),
      po: String(v[i][at(C.po)] || ''), terms: String(v[i][at(C.terms)] || ''),
      note: String(v[i][at(C.note)] || ''),
      voidWhy: String(v[i][at(C.voidWhy)] || '').trim(),
      cust: {
        name: String(v[i][at(C.custName)] || ''), taxId: String(v[i][at(C.custTaxId)] || ''),
        branch: String(v[i][at(C.custBranch)] || ''), addr: String(v[i][at(C.custAddr)] || ''),
        tel: String(v[i][at(C.custTel)] || ''), email: String(v[i][at(C.custEmail)] || '')
      }
    };
    var saved = { base: Number(v[i][at(C.base)] || 0), vat: Number(v[i][at(C.vat)] || 0),
                  total: Number(v[i][at(C.total)] || 0) };

    var raw = String(v[i][at(C.snap)] || '').trim();
    if (raw) {
      var snap = null;
      try { snap = JSON.parse(raw) } catch (e) { snap = null }
      if (snap && snap.lines) {
        if (snap.validTo) m.validTo = snap.validTo;
        if (snap.form) m.form = snap.form;
        return { ok: true, exact: true, meta: m, saved: saved, doc: {
          type: key || snap.type, lines: snap.lines, base: snap.base, vat: snap.vat,
          vatRate: snap.vatRate, total: snap.total, totalText: snap.totalText
        } };
      }
    }

    /* ใบเก่าที่ยังไม่มีภาพถ่าย — ประกอบจากออเดอร์ให้ แล้วเทียบยอดกับที่บันทึกไว้ */
    if (!m.orderNo) {
      throw new Error('ใบ ' + want + ' ออกก่อนที่ระบบจะเก็บรายการในใบ และไม่ได้ผูกกับออเดอร์ ' +
        'จึงพิมพ์ซ้ำให้ไม่ได้ — ต้องออกใบใหม่');
    }
    var ord = findOrder_(m.orderNo);
    if (!ord) throw new Error('ใบ ' + want + ' อ้างออเดอร์ ' + m.orderNo + ' ซึ่งหาไม่เจอในชีทแล้ว');
    var cfg = appCfg_();
    var d = buildDoc_(key || 'rec', { items: ord.items, ship: ord.ship, discount: ord.discount },
      { vatRate: saved.vat > 0 ? cfgGet_().vatRate : 0, vatMode: cfg.vatMode });
    var same = round2_(d.total) === round2_(saved.total);
    return { ok: true, exact: false, same: same, meta: m, saved: saved, doc: d };
  }
  throw new Error('ไม่พบใบ ' + want + ' ในชีท เอกสาร');
}

/* ------------------------------------------------------------------ ลายเซ็น */

/* ลายเซ็นเก็บเป็นพิกัดเส้นแบบ JSON (รูปทรงอยู่ใน Sign.html) ไม่ใช่รูป
   ราว 1-2 KB ต่อลายเซ็น ช่องในชีทรับได้ 50,000 ตัวอักษร จึงเหลือเฟือ
   แต่ต้องกันไว้อยู่ดี เพราะถ้าเกิน ชีทจะตัดปลายทิ้งเงียบ ๆ แล้วลายเซ็นจะพัง */
var SIGN_MAX = 40000;

/** ตรวจว่าเป็นก้อนลายเซ็นที่ใช้ได้จริง คืนข้อความ JSON ที่พร้อมเขียนลงชีท
    ค่าว่างแปลว่า "ลบลายเซ็นทิ้ง" ซึ่งเป็นคำสั่งที่ถูกต้อง ไม่ใช่ error */
function signClean_(v) {
  if (v === null || v === undefined || v === '') return '';
  var t = (typeof v === 'string') ? v.trim() : JSON.stringify(v);
  if (!t) return '';
  if (t.length > SIGN_MAX) {
    throw new Error('ลายเซ็นยาวเกินไป (' + t.length + ' ตัวอักษร) — ' +
      'ลองเซ็นใหม่แบบไม่ต้องลากเส้นถี่มาก');
  }
  /* รับสองแบบ — เส้นที่เซ็นในแอป กับรูปลายเซ็นที่สแกน/เซ็นมาจากที่อื่น
     รูปรับเฉพาะ data: ของตัวเอง ไม่รับลิงก์จากเน็ต เพราะใบต้องพิมพ์ซ้ำได้เหมือนเดิม
     ทุกวันแม้เน็ตล่มหรือรูปปลายทางถูกลบ */
  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(t)) return t;

  var o;
  try { o = JSON.parse(t); } catch (e) {
    throw new Error('รูปแบบลายเซ็นไม่ถูกต้อง — ต้องเป็นลายเซ็นที่เซ็นในแอป ' +
      'หรือรูปแบบ data:image/png;base64,...');
  }
  if (!o || !o.s || !o.s.length) throw new Error('ลายเซ็นว่างเปล่า — ยังไม่ได้เซ็น');
  return t;
}

/**
 * เก็บลายเซ็นฝั่งร้านไว้ใช้กับทุกใบ — เซ็นครั้งเดียวพอ
 *   which  'cashier' = ผู้รับเงิน/พนักงานขาย · 'auth' = ผู้มีอำนาจลงนาม
 *   sig    ก้อนลายเซ็น หรือค่าว่างเพื่อลบทิ้ง
 *
 * เขียนลงชีท ตั้งค่าแอป ช่องเดียวกับที่ appCfg_ อ่าน จึงไม่มีที่เก็บสองแห่ง
 */
function saveSignature(which, sig) {
  var email = requireStaff_();
  var KEY = {
    cashier: 'ลายเซ็นผู้รับเงิน/พนักงานขาย',
    auth: 'ลายเซ็นผู้มีอำนาจลงนาม'
  };
  var key = KEY[String(which || '')];
  if (!key) throw new Error('ไม่รู้ว่าจะเก็บลายเซ็นของใคร');

  var json = signClean_(sig);
  var s = ss_().getSheetByName(SH.app.name);
  if (!s) throw new Error('ยังไม่มีชีท ' + SH.app.name + ' — สั่ง setup ก่อนหนึ่งครั้ง');

  var n = Math.max(1, s.getLastRow() - DATA_ROW + 1);
  var v = s.getRange(DATA_ROW, 1, n, 1).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0] || '').trim() !== key) continue;
    var cell = s.getRange(DATA_ROW + i, 2);
    cell.setNumberFormat('@');       /* ต้องตั้งก่อนเขียน ไม่งั้นชีทเดาชนิดเอง */
    cell.setValue(json);
    writeLog_(email, 'ลายเซ็น', SH.app.name, key, '', json ? 'ลบ/ของเดิม' : 'มีลายเซ็น',
      json ? 'เซ็นใหม่' : 'ลบทิ้ง', 'ตั้งค่าลายเซ็นจากแอป');
    return { ok: true, which: which, has: !!json };
  }
  throw new Error('ไม่พบแถว "' + key + '" ในชีท ' + SH.app.name +
    ' — สั่ง setup อีกครั้งเพื่อเติมแถวนี้ให้');
}

/**
 * ลูกค้าเซ็นรับของบนใบที่ออกไปแล้ว
 *
 * เขียนลงคอลัมน์ของตัวเอง **ไม่แตะ snap** เพราะ snap คือภาพถ่ายของใบตอนที่ออก
 * ซึ่งต้องพิมพ์ซ้ำได้เหมือนเดิมทุกตัวอักษร ส่วนลายเซ็นเป็นสิ่งที่เกิดทีหลังตอนของถึงมือ
 *
 * ใบที่ยกเลิกไปแล้วเซ็นไม่ได้ — เซ็นรับของบนใบที่ใช้ไม่ได้คือหลักฐานที่ขัดกันเอง
 */
function signDoc(no, sig, by) {
  var email = requireStaff_();
  var want = String(no || '').trim();
  if (!want) throw new Error('ไม่ได้บอกว่าจะเซ็นใบไหน');
  var json = signClean_(sig);
  if (!json) throw new Error('ยังไม่ได้เซ็น');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    var s = sheet_('doc');
    var last = formulaLimit_('doc');
    var C = SH.doc.IN;
    var n = Math.max(0, last - DATA_ROW + 1);
    var v = n ? s.getRange(DATA_ROW, C.no, n, C.voidWhy - C.no + 1).getValues() : [];
    for (var i = 0; i < v.length; i++) {
      if (String(v[i][0] || '').trim() !== want) continue;

      var voided = String(v[i][C.voidWhy - C.no] || '').trim();
      if (voided) {
        throw new Error('ใบ ' + want + ' ถูกยกเลิกไปแล้ว (' + voided + ') — ' +
          'ออกใบใหม่ก่อน แล้วให้ลูกค้าเซ็นบนใบใหม่');
      }

      var who = String(by || '').trim().slice(0, 40) || email;
      writeRow_('doc', DATA_ROW + i, { sign: json });
      SpreadsheetApp.flush();
      writeLog_(email, 'ลายเซ็น', SH.doc.name, want,
        String(v[i][C.type - C.no] || '').trim(), '', 'ลูกค้าเซ็นรับของ',
        'รับส่งโดย ' + who + ' ' + stampTime_());

      return { ok: true, no: want, at: stampTime_() };
    }
    throw new Error('ไม่พบเอกสารเลขที่ ' + want + ' ในชีท ' + SH.doc.name);
  } finally {
    lock.releaseLock();
  }
}

/** ลายเซ็นผู้รับของของใบหนึ่ง — ใช้ตอนพิมพ์ซ้ำ จะได้ได้ใบที่มีลายเซ็นเหมือนตอนส่งมอบ */
function readDocSign_(no) {
  var want = String(no || '').trim();
  if (!want) return '';
  var s = sheetIfAny_('doc');
  if (!s) return '';
  var last = formulaLimit_('doc');
  var n = Math.max(0, last - DATA_ROW + 1);
  if (!n) return '';
  var C = SH.doc.IN;
  var v = s.getRange(DATA_ROW, C.no, n, 1).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0] || '').trim() === want) {
      return String(s.getRange(DATA_ROW + i, C.sign).getValue() || '');
    }
  }
  return '';
}

/** เลขเอกสารถัดไปของแต่ละชนิด — ให้หน้าจอโชว์ก่อนกดออกจริง */
function peekDocNos() {
  requireStaff_();
  var cfg = appCfg_();
  var used = readDocNos_();
  var out = {};
  for (var i = 0; i < DOC_TYPES.length; i++) {
    var t = DOC_TYPES[i];
    out[t.key] = nextDocNo_(cfg.docPrefix[t.key] || (t.code + '26-'), used.nos, 5, cfg.docStart[t.key]);
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

/** เลขถัดไปแบบดูเฉย ๆ — ยังไม่จอง ต้องเรียกใต้ lock อีกทีตอนบันทึกจริง
 *
 *  ดูจากสองที่ ไม่ใช่ที่เดียว
 *    ชีทออเดอร์  = ใบที่ยังอยู่ในระบบ
 *    ชีทเอกสาร   = ใบที่ออกให้ลูกค้าไปแล้ว ซึ่งอยู่ต่อแม้ออเดอร์จะถูกล้าง
 *
 *  ถ้าดูแต่ชีทออเดอร์ พอล้างออเดอร์ทดลองทีเลขจะวนกลับไปที่ 0001
 *  แล้วชนกับใบเสร็จที่ลูกค้าถืออยู่ — ค้นเลขเดียวเจอลูกค้าสองราย
 *  และระบบจะไม่ยอมออกใบชนิดเดิมซ้ำ โดยชี้ไปที่ใบของอีกคน */
function peekNextOrderNo_() {
  var cfg = cfgGet_();
  var max = 0;

  var s = sheet_('head');
  var last = formulaLimit_('head');
  if (last >= DATA_ROW) {
    var v = s.getRange(DATA_ROW, SH.head.IN.no, last - DATA_ROW + 1, 1).getValues();
    for (var i = 0; i < v.length; i++) max = maxOrderNo_(max, v[i][0], cfg.prefix);
  }

  var ds = sheetIfAny_('doc');
  if (ds) {
    var dlast = formulaLimit_('doc');
    if (dlast >= DATA_ROW) {
      var dv = ds.getRange(DATA_ROW, SH.doc.IN.orderNo, dlast - DATA_ROW + 1, 1).getValues();
      for (var j = 0; j < dv.length; j++) max = maxOrderNo_(max, dv[j][0], cfg.prefix);
    }
  }

  return cfg.prefix + pad4_(max + 1);
}

/** เลขที่มากกว่าระหว่างค่าเดิมกับเลขออเดอร์ในช่องนั้น — ช่องที่ไม่ใช่เลขออเดอร์ข้ามไป */
function maxOrderNo_(max, cell, prefix) {
  var no = String(cell || '').trim();
  if (no.indexOf(prefix) !== 0) return max;
  var n = parseInt(no.substring(prefix.length), 10);
  return (!isNaN(n) && n > max) ? n : max;
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

  var written = { head: 0, item: [], cut: [], prod: [], recv: [] };
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

    /* สินค้าที่แอปเพิ่มเข้าฐานสินค้าเอง ต้องมีร่องรอยว่ามาจากไหน
       ไม่งั้นเปิดชีทมาเจอรหัสแปลกหน้าโผล่มาเฉย ๆ แล้วไม่มีใครกล้าลบ */
    for (var np = 0; np < plan.newProds.length; np++) {
      writeLog_(email, 'เพิ่มสินค้า', SH.prod.name, plan.newProds[np].sku,
        'ซื้อมาขายไป', '', plan.newProds[np].name,
        'พิมพ์ชื่อสินค้าเองตอนคีย์ออเดอร์ ' + no + ' ทุน ' + plan.newProds[np].cost +
        ' ขาย ' + plan.newProds[np].price + ' (ลงรับเข้าเท่าที่ขายแล้ว สต๊อกจึงเป็นศูนย์)');
    }

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

  /* สินค้าซื้อมาขายไปที่พิมพ์ชื่อเอง — เตรียมเลขรหัสไว้ก่อน แต่ยังไม่เขียนลงชีท
     เพราะขั้นวางแผนต้องไม่แตะชีทเลย ถ้าล้มกลางทางจะได้ไม่มีอะไรค้าง */
  var newProds = [], recvRows = [], freeSeq = nextFreeSeq_(plist);

  for (var k = 0; k < rawItems.length; k++) {
    var it = rawItems[k];
    var free = !!it.free;
    var sku, prod;

    var qty = Number(it.qty);
    if (!(qty > 0) || qty !== Math.floor(qty)) {
      throw new Error('บรรทัดที่ ' + (k + 1) + ': จำนวนต้องเป็นจำนวนเต็มมากกว่า 0');
    }

    var price = (it.price === '' || it.price === null || it.price === undefined)
      ? null : Number(it.price);
    if (price !== null && !(price >= 0)) {
      throw new Error('บรรทัดที่ ' + (k + 1) + ': ราคาขายจริงไม่ถูกต้อง');
    }

    if (free) {
      var nm = String(it.name || '').trim();
      if (!nm) throw new Error('บรรทัดที่ ' + (k + 1) + ': พิมพ์ชื่อสินค้าเองแล้ว แต่ยังไม่ได้ใส่ชื่อ');
      if (price === null) {
        throw new Error('บรรทัดที่ ' + (k + 1) + ' (' + nm + '): สินค้าที่พิมพ์ชื่อเอง ' +
          'ต้องใส่ราคาขายด้วย เพราะไม่มีราคามาตรฐานในฐานสินค้าให้ดึง');
      }
      var cost = (it.cost === '' || it.cost === null || it.cost === undefined)
        ? null : Number(it.cost);
      if (cost !== null && !(cost >= 0)) {
        throw new Error('บรรทัดที่ ' + (k + 1) + ' (' + nm + '): ต้นทุนไม่ถูกต้อง');
      }

      /* ลงฐานสินค้าให้เสมอ ไม่ว่าจะกรอกต้นทุนหรือไม่
         พร้อมลงรับเข้าเท่าจำนวนที่ขาย สต๊อกจึงสุทธิเป็นศูนย์ ไม่ติดลบ

         ของเดิม: ไม่กรอกต้นทุน = ไม่ลงฐานสินค้า แล้วเขียนชื่อลงช่องรหัสแทน
         ยอดเงินถูกก็จริง แต่ช่องชื่อสินค้าในชีทเป็นสูตร VLOOKUP หารหัสในฐานสินค้า
         หาไม่เจอจึงขึ้นว่า "ไม่พบ SKU" แล้วคำนั้นไปพิมพ์บนใบกำกับภาษีที่ส่งลูกค้า
         (เกิดขึ้นจริงกับใบ ONIV26-00245) ชื่อสินค้าบนใบภาษีผิดคือใบใช้ไม่ได้ทั้งใบ

         ไม่กรอกต้นทุนก็ยังลงได้ แค่เว้นช่องต้นทุนไว้ ชีทมีช่องเตือน
         "ยังไม่มีต้นทุน" ให้อยู่แล้ว ซึ่งบอกเรื่องนี้ได้ตรงกว่าและไม่ทำใบเสีย

         ชื่อซ้ำกับที่เคยขายไปแล้วให้ใช้รหัสเดิม ไม่สร้างรหัสใหม่ทุกครั้ง
         (ต้นทุนต่างกันถือเป็นคนละตัว เพราะช่องต้นทุนในฐานสินค้าคือตัวที่สูตร
          ดึงไปคิดกำไรของทุกใบที่ใช้รหัสนั้น ทับแล้วกำไรใบเก่าเปลี่ยนตามเงียบ ๆ) */
      var hit = findFreeProduct_(plist, nm, cost);
      if (hit) {
        sku = hit.sku;
      } else {
        sku = 'SKU-X' + pad3_(freeSeq++);
        newProds.push({ sku: sku, name: nm, cost: cost, price: price });
        plist.push({ sku: sku, name: nm, price: price, cost: cost, row: 0 });
      }
      prod = { sku: sku, name: nm, price: price };
      recvRows.push({ sku: sku, name: nm, qty: qty, cost: cost });
    } else {
      sku = String(it.sku || '').trim();
      prod = prods[sku];
      if (!prod) throw new Error('บรรทัดที่ ' + (k + 1) + ': ไม่พบ SKU "' + sku + '" ในฐานสินค้า');
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
    newProds: newProds, recvRows: recvRows,
    recvType: recvRows.length ? pickRecvType_(lists.recvType) : '',
    subtotal: round2_(subtotal),
    lotNote: lotNote
  };
}

/* ---------------------------------------------- สินค้าซื้อมาขายไปที่พิมพ์ชื่อเอง */

var FREE_GROUP = 'ซื้อมาขายไป';

function pad3_(n) { return ('00' + n).slice(-3); }

/**
 * ประเภทของแถว รับเข้า สำหรับของซื้อมาขายไป
 *
 * ช่องนี้มี data validation ผูกกับรายการในชีท ตั้งค่า ถ้าเขียนคำที่ไม่อยู่ในรายการ
 * ชีทจะขึ้นสามเหลี่ยมเตือนทุกแถว จึงเลือกจากรายการจริงเสมอ ไม่ฮาร์ดโค้ด
 */
function pickRecvType_(list) {
  list = list || [];
  for (var i = 0; i < list.length; i++) if (list[i].indexOf('ซื้อ') > -1) return list[i];
  return list.length ? list[0] : 'ซื้อเข้า';
}

/**
 * ชื่อสินค้าที่จะพิมพ์ลงบนใบ
 *
 * ช่องชื่อสินค้าในชีทเป็นสูตร VLOOKUP หารหัสในฐานสินค้า หาไม่เจอจะได้คำว่า
 * "ไม่พบ SKU" กลับมา — และคำนั้นเคยไปพิมพ์บนใบกำกับภาษีที่ส่งลูกค้าจริง
 * (ONIV26-00245) ชื่อสินค้าบนใบภาษีผิด = ใบใช้ไม่ได้ทั้งใบ
 *
 * ออเดอร์ที่คีย์หลังจากนี้ไม่เกิดอีกแล้ว เพราะของที่พิมพ์ชื่อเองถูกลงฐานสินค้าให้เสมอ
 * แต่แถวที่คีย์ไปแล้วยังอยู่ในชีท และต้องพิมพ์ซ้ำได้ถูกต้อง — แถวพวกนั้นเก็บชื่อจริง
 * ไว้ในช่องรหัสสินค้า จึงหยิบจากตรงนั้นมาแทน ดีกว่าพิมพ์คำว่า "ไม่พบ SKU" ออกไป
 */
function itemName_(nameCell, skuCell) {
  var nm = String(nameCell == null ? '' : nameCell).trim();
  if (nm && nm.indexOf('ไม่พบ') !== 0 && nm.charAt(0) !== '#') return nm;
  var sku = String(skuCell == null ? '' : skuCell).trim();
  return sku || nm;
}

/** เลขรหัสถัดไปของชุด SKU-X — ดูจากที่มีอยู่จริง ไม่ใช่นับจำนวนแถว */
function nextFreeSeq_(plist) {
  var max = 0;
  for (var i = 0; i < plist.length; i++) {
    var m = /^SKU-X(\d+)$/.exec(String(plist[i].sku || ''));
    if (m) { var n = Number(m[1]); if (n > max) max = n; }
  }
  return max + 1;
}

/**
 * เคยขายของชื่อนี้ที่ต้นทุนเท่านี้ไปแล้วหรือยัง
 *
 * ต้องตรงทั้งชื่อและต้นทุน ไม่ใช่ชื่ออย่างเดียว เพราะช่องต้นทุนใน ฐานสินค้า
 * เป็นตัวที่สูตรของ ออเดอร์_รายการ ดึงไปคิดกำไรของ "ทุกใบ" ที่ใช้รหัสนั้น
 * ถ้าของชื่อเดิมรอบนี้ซื้อมาแพงขึ้นแล้วไปทับต้นทุนของแถวเดิม
 * กำไรของออเดอร์เก่าที่ปิดไปแล้วจะเปลี่ยนตามไปด้วยโดยไม่มีใครรู้
 * ต้นทุนคนละราคาจึงแยกเป็นคนละรหัส แล้วไม่ต้องแก้แถวเดิมเลยสักครั้ง
 */
function findFreeProduct_(plist, name, cost) {
  var key = String(name).trim().toLowerCase();
  for (var i = 0; i < plist.length; i++) {
    if (!/^SKU-X\d+$/.test(String(plist[i].sku || ''))) continue;
    if (String(plist[i].name || '').trim().toLowerCase() !== key) continue;
    /* ต้นทุนว่างกับต้นทุน 0 ไม่ใช่เรื่องเดียวกัน
       ว่าง = ยังไม่รู้ต้นทุน · 0 = รู้ว่าไม่มีต้นทุน (ของแถม ของตัวอย่าง)
       ถ้าตีรวมกัน ของที่ยังไม่รู้ต้นทุนจะไปเกาะรหัสของที่ต้นทุนศูนย์
       แล้วกำไรของใบเก่าจะเปลี่ยนตามโดยไม่มีใครรู้ */
    var have = plist[i].cost;
    var blankHave = (have === '' || have === null || have === undefined);
    var blankWant = (cost === null);
    if (blankHave !== blankWant) continue;
    if (!blankWant && Math.abs(Number(have) - Number(cost)) > 0.005) continue;
    return plist[i];
  }
  return null;
}

/** เขียนจริง — เรียกได้เฉพาะตอนถือ lock อยู่ */
function commitOrder_(plan) {
  var written = { head: 0, item: [], cut: [], prod: [], recv: [] };

  /* สินค้าซื้อมาขายไปที่พิมพ์ชื่อเอง — ลงฐานสินค้าก่อน แล้วลงรับเข้าเท่าที่ขาย
     สต๊อกจึงสุทธิเป็นศูนย์แทนที่จะติดลบ และต้นทุนกำไรของใบนี้คำนวณได้จริง */
  if (plan.newProds.length) {
    var stockLimit = formulaLimit_('stock');
    var pRows = nextRows_('prod', SH.prod.IN.sku, plan.newProds.length);
    if (!pRows.length) throw new Error('ชีท ' + SH.prod.name + ' เหลือที่ว่างไม่พอ ' +
      plan.newProds.length + ' รายการ (สูตรมีถึงแถว ' + formulaLimit_('prod') + ') — ต้องลากสูตรลงเพิ่มก่อน');
    for (var a = 0; a < pRows.length; a++) {
      /* สต๊อกคงเหลือ ผูกกับ ฐานสินค้า แบบแถวต่อแถว ถ้าเลยแถวสุดท้ายที่มีสูตร
         สินค้าตัวใหม่จะไม่มียอดคงเหลือ และไม่มีอะไรฟ้อง — กันไว้ตรงนี้ */
      if (pRows[a] > stockLimit) {
        throw new Error('ชีท ' + SH.stock.name + ' มีสูตรถึงแถว ' + stockLimit +
          ' แต่สินค้าใหม่จะลงแถว ' + pRows[a] + ' — ต้องลากสูตรของ ' + SH.stock.name +
          ' ลงให้ถึงแถวเดียวกันก่อน ไม่งั้นสินค้าตัวใหม่จะไม่มียอดคงเหลือ');
      }
      var np = plan.newProds[a];
      writeRow_('prod', pRows[a], {
        sku: np.sku, group: FREE_GROUP, name: np.name, perPack: 1, unit: 'ชิ้น',
        cost: np.cost, price: np.price, opening: 0, reorder: 0
      });
      written.prod.push(pRows[a]);
    }
  }

  if (plan.recvRows.length) {
    var rRows = nextRows_('recv', SH.recv.IN.sku, plan.recvRows.length);
    if (!rRows.length) throw new Error('ชีท ' + SH.recv.name + ' เหลือที่ว่างไม่พอ ' +
      plan.recvRows.length + ' บรรทัด (สูตรมีถึงแถว ' + formulaLimit_('recv') + ') — ต้องลากสูตรลงเพิ่มก่อน');
    for (var b = 0; b < rRows.length; b++) {
      var rv = plan.recvRows[b];
      writeRow_('recv', rRows[b], {
        date: plan.date, doc: plan.no, type: plan.recvType, ref: FREE_GROUP,
        sku: rv.sku, qty: rv.qty, cost: rv.cost, staff: plan.staff,
        note: 'ซื้อมาขายไปตามออเดอร์ ' + plan.no
      });
      written.recv.push(rRows[b]);
    }
  }

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
      ') — ระบบยกเลิกการบันทึกใบนี้แล้ว' + whyTotalOff_());
  }
  plan.net = Number(s.getRange(row, SH.head.net).getValue() || 0);
  plan.row = row;
}

/**
 * ยอดไม่ตรงเพราะอะไร และต้องกดอะไรต่อ
 *
 * ข้อความเดิมบอกแค่ "สูตรในชีทอาจถูกแก้" ซึ่งพอเจอจริงแล้วไปต่อไม่ถูก
 * ต้องไล่หากันเป็นชั่วโมงกว่าจะรู้ว่าสูตรของ ออเดอร์_รายการ หายไป 333 ช่อง
 * ครั้งนี้จึงนับให้เลยตอนนั้น แล้วบอกชื่อฟังก์ชันที่ต้องกดไปด้วย
 *
 * ห้ามพังทับ error ตัวจริง ถ้านับไม่ได้ก็คืนข้อความกลาง ๆ ไป
 */
function whyTotalOff_() {
  try {
    var hurt = [];
    ['item', 'head', 'prod'].forEach(function (k) {
      var r = scanCalc_(k);
      if (r.flat) hurt.push(SH[k].name + ' ' + r.flat + ' ช่อง');
    });
    if (hurt.length) {
      return '\n\nสาเหตุ: สูตรในชีทถูกพิมพ์ทับจนหายไป — ' + hurt.join(', ') +
        '\nวิธีแก้: เปิด Apps Script เลือกฟังก์ชัน repairOrderSheets กด เรียกใช้ ' +
        'แล้วกลับมากดบันทึกออเดอร์ใหม่ (ข้อมูลในฟอร์มยังอยู่ครบ)';
    }
    return '\n\nสูตรของชีทยังครบดี ยอดที่ไม่ตรงจึงอาจมาจากสูตรถูกแก้เนื้อใน ' +
      'ให้เปิด Apps Script สั่ง checkFormulas ดูสูตรจริงของแถวต้นแบบก่อน';
  } catch (e) {
    return '\n\nสูตรในชีทอาจถูกแก้ ให้เปิด Apps Script สั่ง checkFormulas ดูก่อน';
  }
}

/** ล้างเฉพาะแถวที่เพิ่งเขียน และล้างเฉพาะช่องกรอก สูตรของแถวนั้นยังอยู่ครบ */
function rollback_(written) {
  try {
    for (var i = written.cut.length - 1; i >= 0; i--) clearRow_('cut', written.cut[i]);
    for (var j = written.item.length - 1; j >= 0; j--) clearRow_('item', written.item[j]);
    if (written.head) clearRow_('head', written.head);
    var rv = written.recv || [], pd = written.prod || [];
    for (var m = rv.length - 1; m >= 0; m--) clearRow_('recv', rv[m]);
    for (var n = pd.length - 1; n >= 0; n--) clearRow_('prod', pd[n]);
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

/**
 * แปลง 2026-09-01 เป็นวันที่ของชีท
 *
 * new Date(ปี, เดือน, วัน) สร้างเที่ยงคืนตาม "เขตเวลาของสคริปต์"
 * แต่ชีทแสดงผลตาม "เขตเวลาของสเปรดชีต" ถ้าสองอันตั้งไว้ไม่ตรงกัน
 * วันที่จะเลื่อนไปหนึ่งวันทันที — ของจริงเจอมาแล้ว คีย์วันที่ 1 ก.ย. แต่ชีทลง 31 ส.ค. 10:00
 * จึงสร้างเป็นเที่ยงวันตามเขตเวลาของสเปรดชีตแทน ห่างจากเส้นวันทั้งสองฝั่ง 12 ชั่วโมง
 * ต่อให้เขตเวลาเพี้ยนไปบ้างก็ยังตกอยู่ในวันเดิม
 */
function parseDate_(s) {
  if (s instanceof Date) return s;
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  try {
    return Utilities.parseDate(m[1] + '-' + m[2] + '-' + m[3] + ' 12:00:00',
      ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  } catch (e) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  }
}

/** ค่าที่ส่งมาต้องเป็นหนึ่งในตัวเลือกของชีท ตั้งค่า ไม่งั้น dropdown กับสูตรจะเพี้ยน */
function pickFrom_(v, list, label) {
  var x = String(v || '').trim();
  if (!x) return list[0] || '';
  for (var i = 0; i < list.length; i++) if (list[i] === x) return x;
  throw new Error(label + ' "' + x + '" ไม่มีในตัวเลือกของชีท ตั้งค่า — ' +
    'ที่มีคือ ' + list.join(' / '));
}
