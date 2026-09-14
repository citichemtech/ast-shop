/**
 * หน้าที่ลูกค้าเปิดได้ — ดูยอด แนบสลิป แจ้งชำระเงิน
 *
 * ======================================================================
 * ไฟล์นี้คือส่วนเดียวของระบบที่คนนอกบริษัทเรียกถึงได้ อ่านให้ครบก่อนแก้
 * ======================================================================
 *
 * ทุกฟังก์ชันในไฟล์นี้ทำงาน "ในนามเจ้าของร้าน" เพราะ deploy ตัวที่ลูกค้าเปิด
 * ต้องตั้งเป็น "ทำงานในชื่อ: ฉัน" (Google บังคับ ถ้าจะให้คนไม่มีบัญชีเข้าได้)
 * แปลว่าโค้ดตรงนี้เขียนชีทได้เต็มมือ ทั้งที่คนเรียกคือคนที่เราไม่รู้ว่าเป็นใคร
 *
 * กฎที่ตามมา
 *   1. ทุกทางเข้าเริ่มด้วยกุญแจ ไม่มีทางเข้าไหนรับ "เลขออเดอร์" ตรง ๆ
 *      เลขออเดอร์เดาได้ AST-26-0007 คือใบถัดจาก AST-26-0006
 *   2. ส่งกลับเฉพาะของที่ลูกค้าต้องเห็นเพื่อจ่ายเงิน — ห้ามใช้ readOrders_
 *      ซึ่งคืนต้นทุนกับกำไรมาด้วย ต่อให้หน้าจอไม่โชว์ ใครกด F12 ก็อ่านได้
 *   3. เขียนได้อย่างเดียวคือ "แนบสลิปของออเดอร์ใบนั้น" ไม่มีการแก้ยอด
 *      ไม่มีการเปลี่ยนสถานะออเดอร์ การรับเงินยังเป็นการตัดสินใจของคน
 */

/* กุญแจ 32 หลักฐานสิบหก = 128 บิต เดาสุ่มไม่ได้ในทางปฏิบัติ
   ใช้ตัวสุ่มของ Java ที่ Apps Script ให้มา ไม่ใช่ Math.random ซึ่งเดาลำดับต่อไปได้ */
function linkNewKey_() {
  return (Utilities.getUuid() + Utilities.getUuid())
    .replace(/-/g, '').slice(0, 32).toLowerCase();
}

/** ปิดลิงก์แล้วหรือยัง — เจ้าของร้านพิมพ์อะไรก็ได้ที่แปลว่าปิด ลงในช่องนั้น */
function linkOff_(v) {
  var s = String(v || '').trim();
  return !!s && /ปิด|off|ยกเลิก|ไม่ใช้/i.test(s);
}

/** หาแถวลิงก์จากเลขออเดอร์ (เอาใบที่ยังไม่ปิด) */
function linkRowByOrder_(orderNo) {
  var no = String(orderNo || '').trim();
  var v = readAll_('link'), IN = SH.link.IN;
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][IN.no - 1] || '').trim() !== no) continue;
    if (linkOff_(v[i][IN.off - 1])) continue;
    return { row: DATA_ROW + i, key: String(v[i][IN.key - 1] || '').trim(), vals: v[i] };
  }
  return null;
}

/**
 * หาแถวลิงก์จากกุญแจ
 *
 * ไม่พบ กับ ถูกปิดไปแล้ว ตอบข้อความคนละแบบโดยตั้งใจ — ลูกค้าที่ได้ลิงก์เก่า
 * ต้องรู้ว่าให้ทักมาขอลิงก์ใหม่ ไม่ใช่คิดว่าเว็บร้านเสีย
 */
function linkRowByKey_(key) {
  var k = String(key || '').trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(k)) throw new Error('ลิงก์นี้ใช้ไม่ได้ — รบกวนทักร้านขอลิงก์ใหม่นะคะ');
  var v = readAll_('link'), IN = SH.link.IN;
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][IN.key - 1] || '').trim().toLowerCase() !== k) continue;
    if (linkOff_(v[i][IN.off - 1])) {
      throw new Error('ลิงก์นี้ถูกปิดไปแล้ว — รบกวนทักร้านขอลิงก์ใหม่นะคะ');
    }
    return { row: DATA_ROW + i, no: String(v[i][IN.no - 1] || '').trim(), vals: v[i] };
  }
  throw new Error('ลิงก์นี้ใช้ไม่ได้ — รบกวนทักร้านขอลิงก์ใหม่นะคะ');
}

/**
 * ปิดชื่อลูกค้าบางส่วน เหลือสามตัวแรกของแต่ละคำ
 *
 * ลูกค้ารู้ชื่อตัวเองอยู่แล้ว การโชว์เต็มจึงไม่ได้ช่วยอะไรเขาเลย
 * แต่วันที่ลิงก์หลุดไปอยู่ในกลุ่มไลน์ ชื่อเต็มกับที่อยู่คือของที่เอาคืนไม่ได้
 * เท่านี้ก็พอให้เจ้าตัวรู้ว่าใบนี้ของตัวเอง โดยคนอื่นอ่านแล้วไม่ได้อะไรไป
 */
function maskName_(s) {
  return String(s || '').split(/\s+/).map(function (w) {
    if (w.length <= 3) return w;
    return w.slice(0, 3) + new Array(w.length - 2).join('#');
  }).join(' ');
}

/**
 * ข้อมูลออเดอร์เท่าที่ลูกค้าต้องเห็นเพื่อจ่ายเงิน — อ่านจากชีทตรง ๆ
 *
 * ตั้งใจไม่เรียก readOrders_ ทั้งที่โค้ดสั้นกว่า เพราะตัวนั้นคืนต้นทุนและกำไร
 * มาด้วยทุกใบ วันหนึ่งมีคนเพิ่มช่องใหม่เข้าไปในนั้น ช่องนั้นจะไหลออกมาที่นี่เอง
 * โดยไม่มีใครตั้งใจ — รายการข้างล่างนี้จึงเขียนทีละช่อง
 */
function pubRead_(orderNo) {
  var no = String(orderNo || '').trim();
  var hs = sheet_('head'), IN = SH.head.IN;
  var hLast = dataLast_('head');
  var hit = null;
  if (hLast >= DATA_ROW) {
    var wide = Math.min(SH.head.width, hs.getMaxColumns());
    var hv = hs.getRange(DATA_ROW, 1, hLast - DATA_ROW + 1, wide).getValues();
    for (var i = 0; i < hv.length; i++) {
      if (String(hv[i][IN.no - 1] || '').trim() === no) { hit = hv[i]; break; }
    }
  }
  if (!hit) throw new Error('ไม่พบออเดอร์ใบนี้แล้ว — รบกวนทักร้านนะคะ');

  var d = hit[IN.date - 1];
  var ord = {
    no: no,
    date: d instanceof Date ? isoDate_(d) : String(d || ''),
    cust: maskName_(hit[IN.cust - 1]),
    addr: String(hit[IN.addr - 1] || ''),
    carrier: String(hit[IN.carrier - 1] || ''),
    track: String(hit[IN.track - 1] || ''),
    vat: String(hit[IN.vat - 1] || ''),
    discount: Number(hit[IN.discount - 1] || 0),
    ship: Number(hit[IN.ship - 1] || 0),
    status: String(hit[IN.status - 1] || ''),
    subtotal: Number(hit[SH.head.subtotal - 1] || 0),
    vatAmt: Number(hit[SH.head.vatAmt - 1] || 0),
    net: Number(hit[SH.head.net - 1] || 0),
    items: []
  };

  var is = sheet_('item'), iLast = dataLast_('item');
  if (iLast >= DATA_ROW) {
    var iv = is.getRange(DATA_ROW, 1, iLast - DATA_ROW + 1, SH.item.lot).getValues();
    for (var j = 0; j < iv.length; j++) {
      if (String(iv[j][SH.item.IN.no - 1] || '').trim() !== no) continue;
      ord.items.push({
        name: itemName_(iv[j][4], iv[j][SH.item.IN.sku - 1]),
        unit: String(iv[j][5] || ''),
        qty: Number(iv[j][SH.item.IN.qty - 1] || 0),
        price: linePrice_(iv[j][SH.item.IN.price - 1], iv[j][7]),
        total: Number(iv[j][9] || 0)
      });
    }
  }
  return ord;
}

/** สลิปของใบนี้ เท่าที่ลูกค้าควรเห็น — วันเวลาที่ส่งกับสถานะ ไม่มีลิงก์ไฟล์ */
function pubSlips_(orderNo) {
  var sh = sheetIfAny_('slip');
  if (!sh) return [];
  var no = String(orderNo || '').trim();
  var v = readAll_('slip'), IN = SH.slip.IN, out = [];
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][IN.no - 1] || '').trim() !== no) continue;
    out.push({
      at: v[i][IN.at - 1] instanceof Date ? ymd_(v[i][IN.at - 1], true) : '',
      amount: Number(v[i][IN.amount - 1] || 0),
      status: String(v[i][IN.status - 1] || '')
    });
  }
  return out;
}

/* ------------------------------------------------------- ฝั่งลูกค้า (ไม่มีด่าน) */

/**
 * เปิดลิงก์ — คืนยอด รายการสินค้า และบัญชีที่ต้องโอนเข้า
 *
 * นับจำนวนครั้งที่เปิดไว้ในชีทด้วย เพราะเวลาลูกค้าเงียบไป คำถามแรกของร้านคือ
 * "เขาเห็นลิงก์หรือยัง" — ยังไม่เปิด กับ เปิดแล้วแต่ยังไม่โอน ตามงานคนละแบบ
 */
function pubOrder(key) {
  var hit = linkRowByKey_(key);
  var ord = pubRead_(hit.no);

  /* ใบที่ยกเลิกไปแล้วต้องไม่มีหน้าให้จ่ายเงิน เงินที่โอนเข้ามาหลังจากนั้น
     คือเงินที่ร้านต้องตามคืน ซึ่งแพงกว่าการที่ลูกค้าเห็นว่าใบถูกยกเลิก */
  var dead = isDeadStatus_(ord.status);
  /* ใบปลายทางต้องไม่โชว์เลขบัญชีและต้องไม่มีช่องแนบสลิป ลูกค้าที่โอนตามลิงก์
     แล้วยังจ่ายพนักงานส่งของอีกรอบ คือเงินที่ร้านต้องตามคืน */
  var cod = isCodStatus_(ord.status);

  var wantVat = String(ord.vat || '').indexOf('ไม่') < 0 &&
    String(ord.vat || '').indexOf('รับ') > -1;
  var acct = payAcct_(wantVat);

  var IN = SH.link.IN;
  try {
    var s = sheet_('link');
    s.getRange(hit.row, IN.opened).setValue(Number(hit.vals[IN.opened - 1] || 0) + 1);
    s.getRange(hit.row, IN.lastOpen).setValue(new Date());
  } catch (e) {
    /* จดสถิติไม่ได้ ไม่ใช่เหตุให้ลูกค้าจ่ายเงินไม่ได้ */
    Logger.log('บันทึกจำนวนครั้งที่เปิดลิงก์ไม่สำเร็จ: ' + e.message);
  }

  return jsonSafe_({
    ok: true, dead: dead, cod: cod, ord: ord,
    /* ยังไม่ได้กรอกเลขบัญชีในชีท = ห้ามเดา ห้ามโชว์บัญชีอีกฝั่งแทน
       ลูกค้าเห็นคำว่า "ทักร้าน" ดีกว่าโอนเข้าบัญชีที่ไม่ใช่ของใบนี้ */
    acct: (cod || acct.miss.length) ? null : {
      bank: acct.bank, name: acct.name, acct: acct.acct, link: acct.link
    },
    told: hit.vals[IN.told - 1] instanceof Date ? ymd_(hit.vals[IN.told - 1], true) : '',
    slips: pubSlips_(hit.no)
  });
}

/** ลูกค้าแนบสลิปแล้วกดแจ้งชำระเงิน */
function pubSlip(key, p) {
  var hit = linkRowByKey_(key);
  p = p || {};
  var ord = pubRead_(hit.no);
  if (isDeadStatus_(ord.status)) {
    throw new Error('ออเดอร์ใบนี้ถูกยกเลิกแล้ว รบกวนทักร้านก่อนโอนนะคะ');
  }
  if (isCodStatus_(ord.status)) {
    throw new Error('ออเดอร์ใบนี้เป็นแบบเก็บเงินปลายทาง ' +
      'ชำระกับพนักงานส่งของตอนรับพัสดุได้เลย ไม่ต้องโอนนะคะ');
  }

  /* ลิงก์ที่หลุดออกไปต้องทำอะไรได้จำกัด — 5 ใบพอสำหรับคนที่โอนหลายรอบ
     หรือถ่ายใหม่เพราะรูปแรกเบลอ แต่ไม่พอให้ใครใช้เป็นที่ฝากไฟล์ */
  var already = pubSlips_(hit.no).length;
  if (already >= 5) {
    throw new Error('ใบนี้ส่งสลิปมาครบ 5 ใบแล้ว รบกวนทักร้านโดยตรงนะคะ');
  }

  var m = /^data:([^;]+);base64,(.*)$/.exec(String(p.data || ''));
  if (!m) throw new Error('ยังไม่ได้เลือกไฟล์สลิป หรือไฟล์อ่านไม่ออก');
  var mime = String(m[1]).toLowerCase();
  var ext = SLIP_MIME[mime];
  if (!ext) throw new Error('ไฟล์ชนิดนี้แนบไม่ได้ — ส่งเป็นรูป (JPG · PNG) หรือ PDF นะคะ');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > SLIP_MAX_BYTES) {
    throw new Error('ไฟล์ใหญ่เกิน 10 MB รบกวนถ่ายใหม่หรือย่อรูปก่อนนะคะ');
  }

  var paidRaw = String(p.paidAt || '').trim();
  var paidAt = paidRaw ? parseDate_(paidRaw) : '';
  var amount = Number(p.amount || 0);
  var stamp = Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss');
  var fname = 'สลิป ' + hit.no + ' ' + stamp + ' (ลูกค้าส่งเอง).' + ext;

  var file = driveDo_('เก็บไฟล์สลิป', function () {
    return slipMonthFolder_(paidAt || new Date())
      .createFile(Utilities.newBlob(bytes, mime, fname));
  });

  var row = nextRow_('slip', SH.slip.IN.no);
  if (!row) {
    try { file.setTrashed(true); } catch (e) { Logger.log('ทิ้งไฟล์ไม่สำเร็จ: ' + e.message); }
    throw new Error('ระบบร้านเต็มชั่วคราว รบกวนทักร้านโดยตรงนะคะ');
  }
  try {
    writeRow_('slip', row, {
      no: hit.no, at: new Date(), paidAt: paidAt,
      amount: amount > 0 ? amount : '', bank: String(p.bank || ''),
      fileName: fname, fileUrl: file.getUrl(),
      /* ผู้แนบต้องบอกได้ว่ามาจากทางไหน คนตรวจจะได้รู้ว่าไม่มีพนักงานคนไหน
         เห็นตัวสลิปตอนแนบ ต่างจากใบที่พนักงานแนบเองซึ่งดูมาแล้วชั้นหนึ่ง */
      by: 'ลูกค้าส่งผ่านลิงก์',
      status: SLIP_WAIT, note: String(p.note || '')
    });
  } catch (err) {
    try { file.setTrashed(true); } catch (e2) { Logger.log('ทิ้งไฟล์ไม่สำเร็จ: ' + e2.message); }
    throw err;
  }

  try {
    sheet_('link').getRange(hit.row, SH.link.IN.told).setValue(new Date());
  } catch (e3) {
    Logger.log('บันทึกเวลาแจ้งชำระไม่สำเร็จ: ' + e3.message);
  }
  writeLog_('ลูกค้าส่งผ่านลิงก์', 'แจ้งชำระเงิน', SH.slip.name, hit.no, 'สลิป', '', fname, '');

  return jsonSafe_({ ok: true, slips: pubSlips_(hit.no) });
}

/* ------------------------------------------------------------ ฝั่งพนักงาน */

/**
 * ลิงก์ที่มีอยู่แล้วของออเดอร์ใบนี้ — ดูอย่างเดียว ไม่สร้างใหม่
 *
 * แยกจาก payLink เพราะหน้าเก็บเงินเปิดขึ้นมาทุกครั้งที่กดดูออเดอร์
 * ถ้าใช้ตัวสร้าง ทุกครั้งที่เปิดดูจะได้ลิงก์ใหม่ทั้งที่ยังไม่ได้ตั้งใจจะส่งให้ใคร
 */
function linkInfo_(orderNo) {
  if (!sheetIfAny_('link')) return null;
  var hit = linkRowByOrder_(orderNo);
  if (!hit || !hit.key) return null;
  var IN = SH.link.IN, base = appCfg_().payLink;
  return {
    key: hit.key,
    url: base ? base + (base.indexOf('?') > -1 ? '&' : '?') + 'p=' + hit.key : '',
    why: base ? '' : 'ยังไม่ได้กรอก "ลิงก์เว็บแอปสำหรับลูกค้า" ในชีท ' + SH.app.name,
    opened: Number(hit.vals[IN.opened - 1] || 0),
    told: hit.vals[IN.told - 1] instanceof Date ? ymd_(hit.vals[IN.told - 1], true) : ''
  };
}

/**
 * ขอลิงก์ของออเดอร์ใบหนึ่ง — มีอยู่แล้วใช้ใบเดิม ไม่ออกใหม่ทุกครั้งที่กด
 *
 * ออกใหม่ทุกครั้งคือลิงก์ที่ส่งไปเมื่อวานตายเงียบ ๆ ลูกค้ากดแล้วเจอ
 * "ลิงก์นี้ใช้ไม่ได้" ทั้งที่ไม่มีใครทำอะไรผิด
 */
function payLink(orderNo) {
  var email = requireStaff_();
  var ord = payOrder_(orderNo);
  if (isDeadStatus_(ord.status)) {
    throw new Error('ออเดอร์ ' + ord.no + ' สถานะ "' + ord.status + '" แล้ว ' +
      'ไม่ควรส่งลิงก์ให้ลูกค้าจ่ายเงิน');
  }
  /* ปลายทางแล้วยังส่งลิงก์โอนไปอีก = ลูกค้าจ่ายสองรอบ แล้วร้านต้องตามคืนเงิน
     ปฏิเสธไปตรง ๆ พร้อมบอกทางออก ถ้าลูกค้าเปลี่ยนใจขอโอนแทนจริง ๆ
     ก็แก้สถานะใบให้ตรงกับความจริงก่อน แล้วค่อยกดใหม่ */
  if (isCodStatus_(ord.status)) {
    throw new Error('ออเดอร์ ' + ord.no + ' เป็นใบเก็บเงินปลายทาง ' +
      'ลูกค้าจ่ายกับพนักงานส่งของอยู่แล้ว ส่งลิงก์โอนไปด้วยจะกลายเป็นจ่ายสองรอบ — ' +
      'ถ้าลูกค้าขอโอนแทน ให้แก้สถานะออเดอร์เป็น “รอชำระ” ก่อน แล้วกดสร้างลิงก์ใหม่');
  }

  var base = appCfg_().payLink;
  var hit = linkRowByOrder_(ord.no);
  if (!hit) {
    var row = nextRow_('link', SH.link.IN.no);
    if (!row) throw new Error('ชีท ' + SH.link.name + ' เต็มแล้ว — สั่ง setup อีกครั้งเพื่อขยายแถว');
    var key = linkNewKey_();
    writeRow_('link', row, { no: ord.no, key: key, at: new Date(), by: email, opened: 0 });
    writeLog_(email, 'สร้างลิงก์ชำระเงิน', SH.link.name, ord.no, 'ลิงก์', '', key.slice(0, 8) + '…', '');
    hit = { row: row, key: key, vals: [] };
  }

  var IN = SH.link.IN;
  return jsonSafe_({
    ok: true, no: ord.no, net: Number(ord.net), key: hit.key,
    /* ยังไม่ได้กรอกลิงก์เว็บแอปในชีท = ยังส่งให้ลูกค้าไม่ได้ ต้องบอกตรง ๆ
       ห้ามประกอบ URL เองจาก ScriptApp.getService().getUrl() เพราะนั่นคือลิงก์
       ของ deploy ที่พนักงานใช้อยู่ ลูกค้าเปิดแล้วเจอหน้าให้ล็อกอินของ Google */
    url: base ? base + (base.indexOf('?') > -1 ? '&' : '?') + 'p=' + hit.key : '',
    why: base ? '' : 'ยังไม่ได้กรอก "ลิงก์เว็บแอปสำหรับลูกค้า" ในชีท ' + SH.app.name,
    opened: Number((hit.vals || [])[IN.opened - 1] || 0),
    told: (hit.vals || [])[IN.told - 1] instanceof Date
      ? ymd_((hit.vals || [])[IN.told - 1], true) : ''
  });
}

/* --------------------------------------------------------------- หน้าเว็บ */

/**
 * หน้าที่ลูกค้าเห็น — เสิร์ฟจาก doGet เมื่อมีกุญแจติดมาในลิงก์
 *
 * ส่งข้อมูลของออเดอร์ฝังไปกับหน้าเลย ไม่ให้หน้าจอยิงมาถามอีกรอบ
 * ลูกค้าเปิดจากมือถือกลางทาง เน็ตช้าหนึ่งรอบก็คือหน้าขาวหนึ่งครั้ง
 *
 * กุญแจผิดหรือลิงก์ถูกปิด ต้องได้หน้าตาเดียวกับหน้าปกติ (หัวร้าน ข้อความไทย)
 * ไม่ใช่หน้า error ของ Google ที่ลูกค้าอ่านแล้วนึกว่าโดนหลอก
 */
function pubPage_(key) {
  var boot = { key: String(key || ''), shop: pubShop_(), data: null, err: '' };
  try {
    boot.data = pubOrder(key);
  } catch (e) {
    /* กุญแจผิด ลิงก์ถูกปิด ออเดอร์ถูกลบ — ทั้งหมดต้องได้หน้าเดียวกับหน้าปกติ
       ที่มีหัวร้านและข้อความไทย ไม่ใช่หน้า error ของ Google ที่ลูกค้าอ่านแล้ว
       นึกว่าโดนหลอกให้กดลิงก์ปลอม */
    boot.err = String((e && e.message) || e);
  }
  var t = HtmlService.createTemplateFromFile('Pub');
  /* ฝังเป็น JSON ก้อนเดียว ไม่ใช่ตัวแปรทีละตัวใน scriptlet
     หน้าจอจึงวาดด้วย JS ล้วน ซึ่งเอาไปสอบในเบราว์เซอร์จริงได้ */
  t.boot = JSON.stringify(boot);
  var shop = boot.shop;
  var out = t.evaluate()
    .setTitle('ชำระเงิน — ' + (shop.name || 'AST'))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  try { out.setFaviconUrl(APP_ICON_URL); } catch (e2) { Logger.log('ไอคอน: ' + e2.message); }
  return out;
}

/** ข้อมูลร้านเท่าที่ลูกค้าควรเห็นบนหัวหน้า — ไม่ใช่ appCfg_ ทั้งก้อน */
function pubShop_() {
  var c = appCfg_();
  return {
    name: c.co.name || c.sender.name || '',
    tel: c.co.tel || c.sender.tel || '',
    line: c.line || ''
  };
}
