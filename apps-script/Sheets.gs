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

var SHEET_ID = '1s8tS_Fv7YSYPyjzH-rXQdl-5VKBTaV717YYyWUv5k_8';

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
   * ค่าที่ใบปะหน้าพัสดุกับข้อความแจ้งลูกค้าต้องใช้ แต่ชีทเดิมไม่มี
   * (ชื่อ-ที่อยู่ผู้ส่ง · ค่าส่ง · ลิงก์ติดตามของแต่ละขนส่ง)
   * แยกเป็นชีทของเราเอง เจ้าของร้านแก้เองได้ ไม่ต้องแก้โค้ด
   */
  app: { name: 'ตั้งค่าแอป' }
};

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

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

function appCfg_() {
  var s = ss_().getSheetByName(SH.app.name);
  var out = {
    sender: { name: '', addr: '', tel: '' },
    shipFee: 0, freeOver: 0, codFee: 0, line: '',
    staffList: [], head1: '', head2: '', track: {}
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
