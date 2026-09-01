/**
 * โครงชีท — ที่เดียวที่รู้ว่าคอลัมน์ไหนอยู่ตรงไหน
 *
 * กติกาสำคัญที่สุดของไฟล์นี้:
 * ชีทของเจ้าของร้านใส่ "สูตรไว้ล่วงหน้า" ทุกแถวจนถึงแถว 500 (หัวบิล) และ 1200 (รายการ)
 * แถวที่ยังว่างก็มีสูตรอยู่แล้ว มันแค่คืนค่าว่างเพราะยังไม่มีข้อมูลให้คำนวณ
 *
 *   ถ้าสคริปต์เขียนตัวเลขทับช่องสูตร สูตรแถวนั้นจะหายถาวร
 *   ยอดสินค้า ต้นทุน กำไร VAT ของออเดอร์นั้นจะค้างเป็นเลขนิ่ง ไม่อัปเดตอีกเลย
 *
 * ทุกฟังก์ชันในไฟล์นี้จึงเขียนได้เฉพาะคอลัมน์ที่อยู่ใน IN (input) เท่านั้น
 */

/**
 * ไฟล์เดียวที่แอปอ่านและเขียน
 *
 * ในไดรฟ์มีไฟล์ชื่อคล้ายกันหลายอัน และเคยเสียเวลาทั้งวันเพราะเจ้าของร้าน
 * แก้รหัสสินค้า ตั้งยอดเคมี และกรอกที่อยู่ผู้ส่ง ไว้ในไฟล์หนึ่ง
 * แต่แอปผูกอยู่กับอีกไฟล์ ทุกอย่างถูกหมดแต่คนละไฟล์กัน
 *
 * เลิกใช้แล้ว 1s8tS_Fv7YSYPyjzH-rXQdl-5VKBTaV717YYyWUv5k_8 (AST_ระบบออเดอร์และสต๊อก3008)
 * ใช้ตัวนี้แทน — ตัวที่มีรหัสเคมีชุดใหม่ SKU-Chem-0030 ถึง 0047 ยอดยกมา 100 ทุกตัว
 * ล็อตครบ 18 ล็อต และที่อยู่ผู้ส่งกรอกไว้แล้ว
 *
 * หน้าสรุปยอดในแอปโชว์ชื่อไฟล์ที่ผูกอยู่พร้อมลิงก์ กดเช็กได้ทุกเมื่อว่าตรงกับตัวนี้ไหม
 */
var SHEET_ID = '1LwaukCIgiOtKO4qDJZsR4B2twNBo08XXi-oqiDr58h8';

/* ไอคอนของเว็บแอป เสิร์ฟจาก GitHub Pages ของร้านเอง
   Apps Script รับเฉพาะ URL จริง ใส่รูปฝังตรง ๆ ไม่ได้ */
var APP_ICON_URL = 'https://citichemtech.github.io/ast-shop/icon-stock.png';

/** แถวหัวตารางของทุกชีทคือแถว 5 ข้อมูลเริ่มแถว 6 */
var HEAD_ROW = 5;
var DATA_ROW = 6;

/**
 * IN  = คอลัมน์ที่กรอกได้ สคริปต์เขียนได้เฉพาะพวกนี้
 * CALC = คอลัมน์สูตร มีไว้ให้อ่านและกันเผลอเขียน (ห้ามใส่ใน IN เด็ดขาด)
 */
var SH = {
  cfg: { name: 'ตั้งค่า' },

  prod: {
    name: 'ฐานสินค้า',
    IN: { sku: 2, group: 3, name: 4, perPack: 5, unit: 6, cost: 7, price: 8, opening: 9, reorder: 10 },
    CALC: [1, 11, 12, 13],
    probe: 1
  },

  head: {
    name: 'ออเดอร์_หัวบิล',
    IN: {
      no: 1, date: 2, channel: 3, cust: 4, tel: 5, addr: 6, carrier: 7, track: 8,
      vat: 9, discount: 11, ship: 12, status: 17, staff: 19, note: 20
    },
    CALC: [10, 13, 14, 15, 16, 18, 21],
    // คอลัมน์สูตรที่ใช้วัดว่าสูตรลากมาถึงแถวไหน (J = ยอดสินค้า)
    probe: 10,
    subtotal: 10,  // J = ยอดสินค้า  ใช้ตรวจว่าชีทคำนวณตรงกับที่ตั้งใจ
    net: 14        // N = ยอดชำระสุทธิ
  },

  item: {
    name: 'ออเดอร์_รายการ',
    IN: { no: 2, sku: 4, qty: 7, price: 9 },
    CALC: [1, 3, 5, 6, 8, 10, 11, 12, 13, 14, 15, 16],
    probe: 10,
    refKey: 16,  // P = คีย์อ้างอิง "AST-26-0001|1"
    lineNo: 15,  // O = ลำดับในบิล
    lot: 17      // Q = ล็อตที่ตัด (คอลัมน์ที่ setup() เพิ่มให้ เป็นสูตร)
  },

  stock: { name: 'สต๊อกคงเหลือ', CALC_ALL: true, sku: 2, remain: 9, probe: 1 },

  recv: {
    name: 'รับเข้า',
    IN: { date: 2, doc: 3, type: 4, ref: 5, sku: 6, qty: 8, cost: 9, staff: 11, note: 13 },
    CALC: [1, 7, 10, 12],
    probe: 7
  },

  log: {
    name: 'Log',
    IN: { at: 2, staff: 3, type: 4, sheet: 5, ref: 6, field: 7, before: 8, after: 9, why: 10 },
    CALC: [1],
    probe: 1
  },

  /* ---- สองชีทใหม่ที่ setup() สร้างให้ ---- */

  lot: {
    name: 'ล็อตสินค้า',
    IN: { sku: 2, lotNo: 4, exp: 5, recv: 6, qty: 7, note: 11 },
    CALC: [1, 3, 8, 9, 10, 12, 13],
    probe: 9,
    remain: 9,   // I = คงเหลือในล็อต
    lotKey: 12   // L = คีย์ล็อต "SKU-141|L2601"
  },

  cut: {
    name: 'ตัดล็อต',
    IN: { no: 2, lineNo: 3, sku: 4, lotNo: 5, qty: 6, date: 7 },
    CALC: [1, 8, 9],
    probe: 1
  },

  /**
   * ทะเบียนเอกสารขายที่ออกไปแล้ว 1 ใบ = 1 แถว
   *
   * ของเดิมเจ้าของร้านทำใบละ 1 แท็บในไฟล์ Excel (00227 · 00228 · 00230 ...)
   * ที่ 20 ออเดอร์ต่อวันวิธีนั้นไปต่อไม่ไหว และหาใบเก่าไม่เจอ
   * ชีทนี้ทำให้ค้นได้ ออกซ้ำได้ และบัญชีดึงยอดรวมทั้งเดือนได้ในทีเดียว
   *
   * เก็บยอดไว้เป็นเลขนิ่ง ไม่ใช่สูตรที่ดึงจากออเดอร์ เพราะใบที่ออกไปแล้ว
   * ต้องไม่เปลี่ยนตามการแก้ออเดอร์ทีหลัง ไม่งั้นใบที่ลูกค้าถืออยู่กับในระบบไม่ตรงกัน
   */
  doc: {
    name: 'เอกสาร',
    IN: {
      no: 2, type: 3, date: 4, orderNo: 5, custName: 6, custTaxId: 7, custBranch: 8,
      custAddr: 9, custTel: 10, custEmail: 11, custCode: 12, po: 13, terms: 14,
      base: 15, vat: 16, total: 17, staff: 18, note: 19, voidWhy: 20,
      /* ภาพถ่ายของใบตอนที่ออก เก็บเป็น JSON เพื่อ "พิมพ์ซ้ำ" ให้ได้ใบเดิมเป๊ะ
         ถ้าไปประกอบใหม่จากออเดอร์ตอนพิมพ์ซ้ำ แล้วออเดอร์ถูกแก้ทีหลัง
         ใบที่พิมพ์ซ้ำจะไม่ตรงกับใบที่ลูกค้าถืออยู่ ซึ่งเป็นปัญหาทางภาษี */
      snap: 21
    },
    CALC: [1],
    probe: 1
  },

  /**
   * ค่าที่ใบปะหน้าพัสดุกับข้อความแจ้งลูกค้าต้องใช้ แต่ชีทเดิมไม่มี
   * (ชื่อ-ที่อยู่ผู้ส่ง · ค่าส่ง · ลิงก์ติดตามของแต่ละขนส่ง)
   * แยกเป็นชีทของเราเอง เจ้าของร้านแก้เองได้ ไม่ต้องแก้โค้ด
   */
  app: { name: 'ตั้งค่าแอป' }
};

/**
 * เปิดชีทที่แอปผูกอยู่
 *
 * ถ้าเปิดไม่ได้ Google โยนคำว่า "You do not have permission to access the requested
 * document." ออกมาดื้อ ๆ ซึ่งไม่ได้บอกเลยว่าไฟล์ไหน และต้องแชร์ให้ใคร
 * คนอ่านจึงเดาไม่ออกว่าต้องทำอะไรต่อ — เปลี่ยนเป็นบอกให้ครบว่า
 * บัญชีไหนกำลังเปิด ไฟล์ไหน และต้องทำอะไรถึงจะผ่าน
 */
function ss_() {
  try {
    return SpreadsheetApp.openById(SHEET_ID);
  } catch (e) {
    var who = '';
    try { who = Session.getEffectiveUser().getEmail() || ''; } catch (e2) { who = ''; }
    throw new Error(
      'เปิดชีทไม่ได้ด้วยบัญชี ' + (who || '(ไม่ทราบบัญชี)') + '\n\n' +
      'ไฟล์ที่แอปผูกอยู่: https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit\n\n' +
      'วิธีแก้: เปิดไฟล์นั้น กดปุ่ม แชร์ ใส่อีเมล ' + (who || 'บัญชีที่รันสคริปต์') +
      ' แล้วเลือกสิทธิ์ "ผู้แก้ไข" กดส่ง จากนั้นลองใหม่\n' +
      '(ถ้าเพิ่งเปลี่ยนไฟล์ ไฟล์ใหม่มักยังไม่ได้แชร์ให้บัญชีนี้ ต่างจากไฟล์เดิม)\n\n' +
      'ข้อความจาก Google: ' + e.message);
  }
}

/**
 * บอกว่าใครกำลังรันสคริปต์ และเปิดชีทที่ผูกไว้ได้ไหม
 *
 * กด เรียกใช้ ได้เลยโดยไม่ต้องส่งค่าอะไร และไม่แตะข้อมูลในชีทแม้แต่ช่องเดียว
 * มีไว้ตอบคำถามเดียวคือ "ต้องเอาไฟล์ไปแชร์ให้อีเมลไหน"
 */
function whoAmI() {
  var act = '', eff = '';
  try { act = Session.getActiveUser().getEmail() || ''; } catch (e) { act = ''; }
  try { eff = Session.getEffectiveUser().getEmail() || ''; } catch (e) { eff = ''; }

  var out = [];
  out.push('บัญชีที่รันสคริปต์นี้: ' + (eff || '(อ่านไม่ออก)'));
  if (act && act !== eff) out.push('บัญชีที่กำลังเปิดหน้าจอ: ' + act);
  out.push('ไฟล์ที่แอปผูกอยู่: https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit');
  out.push('');
  try {
    var name = SpreadsheetApp.openById(SHEET_ID).getName();
    out.push('เปิดไฟล์ได้ปกติ ชื่อไฟล์: ' + name);
    out.push('ไม่ต้องแชร์อะไรเพิ่ม ใช้งานได้เลย');
  } catch (e) {
    out.push('เปิดไฟล์นี้ไม่ได้');
    out.push('ให้เปิดลิงก์ข้างบน กดปุ่ม แชร์ ใส่อีเมล ' + (eff || 'บัญชีที่รันสคริปต์') +
      ' เลือกสิทธิ์ "ผู้แก้ไข" กดส่ง แล้วกลับมา Run ที่ whoAmI อีกครั้ง');
    out.push('ข้อความจาก Google: ' + e.message);
  }
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

function sheet_(key) {
  var name = SH[key].name;
  var s = ss_().getSheetByName(name);
  if (!s) throw new Error('ไม่พบชีท "' + name + '" — ยังไม่ได้สั่ง setup() หรือมีคนเปลี่ยนชื่อชีท');
  return s;
}

/**
 * แถวสุดท้ายที่ยัง "มีสูตรรออยู่"
 *
 * เขียนเกินแถวนี้ไปแล้วออเดอร์จะไม่มียอดรวม ไม่มีต้นทุน ไม่มีกำไร — และไม่มีอะไรฟ้อง
 * จึงต้องรู้ขอบเขตไว้ก่อนเสมอ แล้วปฏิเสธตรง ๆ ตอนชีทเต็ม ดีกว่าปล่อยให้ข้อมูลเงียบ ๆ ผิด
 */
function formulaLimit_(key) {
  var cfg = SH[key];
  var s = sheet_(key);
  var col = cfg.probe;
  var n = s.getMaxRows() - DATA_ROW + 1;
  if (n <= 0) return DATA_ROW - 1;
  var f = s.getRange(DATA_ROW, col, n, 1).getFormulas();
  var last = DATA_ROW - 1;
  for (var i = 0; i < f.length; i++) if (f[i][0]) last = DATA_ROW + i;
  return last;
}

/**
 * หาแถวว่าง count แถวแรกที่ยังมีสูตรรออยู่
 *
 * อ่านคอลัมน์เดียวรอบเดียวแล้วเลือกทีละแถว — ไม่ใช่ "หาแถวแรกแล้วบวกหนึ่งไปเรื่อย ๆ"
 * เพราะถ้ามีคนลบข้อมูลกลางตารางไว้ ช่องว่างจะอยู่กลาง ๆ การบวกหนึ่งจะไปทับแถวที่ยังมีของ
 *
 * คืน [] ถ้าที่ว่างไม่พอ
 */
function nextRows_(key, keyCol, count) {
  var s = sheet_(key);
  var limit = formulaLimit_(key);
  if (limit < DATA_ROW) return [];
  var n = limit - DATA_ROW + 1;
  var v = s.getRange(DATA_ROW, keyCol, n, 1).getValues();
  var out = [];
  for (var i = 0; i < n && out.length < count; i++) {
    if (v[i][0] === '' || v[i][0] === null) out.push(DATA_ROW + i);
  }
  return out.length === count ? out : [];
}

function nextRow_(key, keyCol) {
  var r = nextRows_(key, keyCol, 1);
  return r.length ? r[0] : 0;
}

/**
 * เขียนค่าลงแถวเดียว เฉพาะคอลัมน์ที่อยู่ใน IN
 * ส่ง obj เป็น { ชื่อฟิลด์ตาม IN : ค่า } ฟิลด์ไหนไม่ส่งมาก็ไม่แตะ
 *
 * คอลัมน์ที่ติดกันเขียนรวดเดียว ลดจำนวนรอบคุยกับ Google ต่อ 1 ออเดอร์
 */
function writeRow_(key, row, obj) {
  var cfg = SH[key];
  var s = sheet_(key);
  var cells = {};
  for (var f in obj) {
    if (!Object.prototype.hasOwnProperty.call(cfg.IN, f)) {
      throw new Error('เขียนช่อง "' + f + '" ของชีท ' + cfg.name + ' ไม่ได้ — ไม่ใช่ช่องกรอก');
    }
    var col = cfg.IN[f];
    if (cfg.CALC && cfg.CALC.indexOf(col) > -1) {
      throw new Error('คอลัมน์ ' + col + ' ของชีท ' + cfg.name + ' เป็นสูตร ห้ามเขียนทับ');
    }
    var v = obj[f];
    if (v === undefined || v === null) continue;
    cells[col] = v;
  }

  var cols = Object.keys(cells).map(Number).sort(function (a, b) { return a - b; });
  var i = 0;
  while (i < cols.length) {
    var j = i;
    while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++;
    var run = [];
    for (var k = i; k <= j; k++) run.push(cells[cols[k]]);
    s.getRange(row, cols[i], 1, run.length).setValues([run]);
    i = j + 1;
  }
}

/**
 * ล้างแถวที่เพิ่งเขียน — ใช้ตอนถอยกลับเมื่อบันทึกล้มกลางทาง
 * ล้างเฉพาะช่องกรอก ห้ามใช้ clearContent ทั้งแถว ไม่งั้นสูตรหายไปด้วย
 */
function clearRow_(key, row) {
  var cfg = SH[key];
  var s = sheet_(key);
  for (var f in cfg.IN) {
    s.getRange(row, cfg.IN[f]).clearContent();
  }
}

/** อ่านทั้งช่วงข้อมูลของชีทเป็น array 2 มิติ (แถว 6 ถึงแถวสุดท้ายที่มีสูตร) */
function readAll_(key) {
  var s = sheet_(key);
  var limit = formulaLimit_(key);
  if (limit < DATA_ROW) return [];
  return s.getRange(DATA_ROW, 1, limit - DATA_ROW + 1, s.getLastColumn()).getValues();
}

/** ค่าตั้งต้นจากชีท ตั้งค่า */
function cfgGet_() {
  var s = sheet_('cfg');
  var v = s.getRange('B6:B9').getValues();
  return {
    shop: String(v[0][0] || ''),
    prefix: String(v[1][0] || 'AST-26-'),
    vatRate: Number(v[2][0] || 0),
    reorder: Number(v[3][0] || 0)
  };
}

/**
 * ค่าจากชีท ตั้งค่าแอป — คู่ ชื่อ/ค่า ที่ B6 ลงไป และตารางลิงก์ติดตามที่ D6 ลงไป
 * ชีทนี้เป็นของแอป ไม่ใช่ 1 ใน 9 ชีทเดิม แก้ได้อิสระ
 */
/**
 * เบอร์โทรที่ชีทเก็บเป็น "ตัวเลข" จะทำศูนย์นำหน้าหาย — 0961929993 กลายเป็น 961929993
 * แล้วไปโผล่บนใบปะหน้าพัสดุแบบนั้น ลูกค้าโทรกลับไม่ได้
 * เบอร์ไทยที่เหลือ 9 หลักคือกรณีนี้เสมอ เติมศูนย์คืนให้
 */
function tel_(v) {
  var t = String(v == null ? '' : v).trim();
  return /^\d{9}$/.test(t) ? '0' + t : t;
}

/**
 * เลขประจำตัวผู้เสียภาษี 13 หลักที่ขึ้นต้นด้วยศูนย์ — ชีทที่เก็บเป็นตัวเลขจะกินศูนย์หน้าไป
 * 0575500000000 กลายเป็น 575500000000 แล้วไปพิมพ์บนใบกำกับภาษีแบบนั้น ใบใช้ไม่ได้
 */
function taxId_(v) {
  var t = String(v == null ? '' : v).trim().replace(/[^\d]/g, '');
  while (t && t.length < 13) t = '0' + t;
  return t;
}

function appCfg_() {
  var s = ss_().getSheetByName(SH.app.name);
  var out = {
    sender: { name: '', addr: '', tel: '' },
    shipFee: 0, freeOver: 0, codFee: 0, line: '',
    staffList: [], head1: '', head2: '', track: {},
    /* ข้อมูลผู้ขายบนใบกำกับภาษี — กฎหมายบังคับว่าต้องมีชื่อ ที่อยู่ และเลขผู้เสียภาษี
       เก็บในชีทไม่ใช่ในโค้ด เจ้าของร้านจะได้แก้เองโดยไม่ต้องรอคนแก้โปรแกรม */
    co: { name: '', nameEn: '', shortName: '', addr: '', taxId: '', branch: '', tel: '', email: '' },
    bank: '', thanks: '', docTerms: '', website: '', docSeller: '', docSellerEmail: '', vatMode: 'excl',
    docPrefix: { rec: 'ONIV26-', inv: 'IV26-', quote: 'QO26-', dep: 'DR26-' },
    /* เลขที่ยกยอดมาจากระบบเดิม ระบบจะออกเลขถัดจากตัวนี้เสมอ แม้ชีทยังว่าง */
    docStart: { rec: 0, inv: 0, quote: 0, dep: 0 },
    quoteDays: 7
  };
  if (!s) return out;
  var v = s.getRange(DATA_ROW, 1, Math.max(1, s.getLastRow() - DATA_ROW + 1), 5).getValues();
  for (var i = 0; i < v.length; i++) {
    var k = String(v[i][0] || '').trim();
    var val = v[i][1];
    if (k === 'ชื่อผู้ส่ง') out.sender.name = String(val || '');
    else if (k === 'หัวใบปะหน้า บรรทัด 1') out.head1 = String(val || '');
    else if (k === 'หัวใบปะหน้า บรรทัด 2') out.head2 = String(val || '');
    else if (k === 'ที่อยู่ผู้ส่ง') out.sender.addr = String(val || '');
    else if (k === 'เบอร์โทรผู้ส่ง') out.sender.tel = tel_(val);
    else if (k === 'ค่าจัดส่งเริ่มต้น') out.shipFee = Number(val || 0);
    else if (k === 'ส่งฟรีเมื่อยอดถึง') out.freeOver = Number(val || 0);
    else if (k === 'ค่าธรรมเนียมเก็บปลายทาง') out.codFee = Number(val || 0);
    else if (k === 'ลิงก์ LINE ของร้าน') out.line = String(val || '');
    /* ใช้บัญชี Google เดียวกันทุกเครื่อง จึงแยกไม่ออกว่าใครเป็นคนคีย์
       รายชื่อนี้ทำให้เลือกชื่อตัวเองได้ตอนคีย์ แล้วชื่อจะไปอยู่ในช่องพนักงานของออเดอร์ */
    else if (k === 'ชื่อบริษัท (ใบกำกับภาษี)') out.co.name = String(val || '');
    else if (k === 'ชื่อบริษัท ภาษาอังกฤษ') out.co.nameEn = String(val || '');
    else if (k === 'ชื่อบริษัท แบบสั้น (ช่องเซ็น)') out.co.shortName = String(val || '');
    else if (k === 'ที่อยู่บริษัท (ใบกำกับภาษี)') out.co.addr = String(val || '');
    /* เลขผู้เสียภาษีขึ้นต้นด้วยศูนย์ ถ้าชีทเก็บเป็นตัวเลขศูนย์หน้าจะหาย
       เหมือนที่เคยเกิดกับเบอร์โทรบนใบปะหน้า จึงเติมคืนให้ */
    else if (k === 'เลขประจำตัวผู้เสียภาษีบริษัท') out.co.taxId = taxId_(val);
    else if (k === 'สำนักงานใหญ่ / สาขา') out.co.branch = String(val || '');
    else if (k === 'เบอร์โทรบริษัท') out.co.tel = tel_(val);
    else if (k === 'อีเมลบริษัท') out.co.email = String(val || '');
    else if (k === 'เว็บไซต์บริษัท') out.website = String(val || '');
    else if (k === 'ชื่อผู้เสนอ/พนักงานขาย บนเอกสาร') out.docSeller = String(val || '');
    else if (k === 'อีเมลผู้เสนอ บนเอกสาร') out.docSellerEmail = String(val || '');
    else if (k === 'เลขที่บัญชีธนาคาร') out.bank = String(val || '');
    else if (k === 'ข้อความขอบคุณท้ายหัวเอกสาร') out.thanks = String(val || '');
    else if (k === 'ข้อความในช่องหมายเหตุ') out.docTerms = String(val || '');
    else if (k === 'ราคาสินค้ารวม VAT แล้วหรือยัง') out.vatMode = /ไม่|ยัง/.test(String(val || '')) ? 'excl' : 'incl';
    else if (k === 'คำนำหน้าเลขใบเสร็จ/ใบกำกับภาษี') out.docPrefix.rec = String(val || out.docPrefix.rec);
    else if (k === 'คำนำหน้าเลขใบแจ้งหนี้') out.docPrefix.inv = String(val || out.docPrefix.inv);
    else if (k === 'คำนำหน้าเลขใบเสนอราคา') out.docPrefix.quote = String(val || out.docPrefix.quote);
    else if (k === 'คำนำหน้าเลขใบรับเงินมัดจำ') out.docPrefix.dep = String(val || out.docPrefix.dep);
    else if (k === 'ยกยอดเลขใบเสร็จ/ใบกำกับภาษีมาจาก') out.docStart.rec = Number(val || 0) || 0;
    else if (k === 'ยกยอดเลขใบแจ้งหนี้มาจาก') out.docStart.inv = Number(val || 0) || 0;
    else if (k === 'ยกยอดเลขใบเสนอราคามาจาก') out.docStart.quote = Number(val || 0) || 0;
    else if (k === 'ยกยอดเลขใบรับเงินมัดจำมาจาก') out.docStart.dep = Number(val || 0) || 0;
    else if (k === 'ใบเสนอราคายืนราคากี่วัน') out.quoteDays = Number(val || 7) || 7;
    else if (k === 'รายชื่อพนักงาน') out.staffList = String(val || '')
      .split(/[,\n]+/).map(function (x) { return x.trim() }).filter(function (x) { return x });

    var car = String(v[i][3] || '').trim();
    if (car) out.track[car] = String(v[i][4] || '').trim();
  }
  return out;
}

/** ตัวเลือก dropdown จากชีท ตั้งค่า (D7:D  ช่องทางขาย, E ขนส่ง, F VAT, G สถานะ) */
function cfgLists_() {
  var s = sheet_('cfg');
  var v = s.getRange('D7:H11').getValues();
  function col(i) {
    var out = [];
    for (var r = 0; r < v.length; r++) {
      var x = String(v[r][i] || '').trim();
      if (x) out.push(x);
    }
    return out;
  }
  return { channel: col(0), carrier: col(1), vat: col(2), status: col(3), recvType: col(4) };
}
