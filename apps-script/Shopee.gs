/**
 * อ่านไฟล์ออเดอร์ที่ export มาจาก Shopee Seller Centre
 *
 * ทั้งไฟล์นี้ไม่แตะ SpreadsheetApp เลย รับตารางเข้า คืนออเดอร์ออก
 * เพื่อให้ทดสอบด้วย node ได้จริงโดยไม่ต้องยิงขึ้น Google
 * (ดู tools/t_shopee_unit.js)
 *
 * ทำไมต้องอ่านหัวตารางแบบยืดหยุ่น: Shopee เปลี่ยนชื่อคอลัมน์ในไฟล์ export
 * มาแล้วหลายรอบ และไฟล์ภาษาไทยกับภาษาอังกฤษคนละชื่อกันทั้งแผง
 * ถ้าจับตายไว้ที่ชื่อใดชื่อหนึ่ง วันที่ Shopee เปลี่ยนคือวันที่ระบบตัดสต๊อกผิด
 * จึงจับด้วย "คำที่ต้องมี" หลายชุด แล้วเปิดให้คนเลือกคอลัมน์เองได้ที่หน้าจอเสมอ
 */

/**
 * ฟิลด์ที่ระบบใช้ กับคำที่พอเจอในหัวตารางแล้วถือว่าใช่
 *
 * need = ต้องเจอครบทุกคำในชุด (ชุดไหนชุดหนึ่งก็พอ)
 * ใส่ชุดที่เจาะจงกว่าไว้ก่อนเสมอ ไม่งั้น "ราคา" จะไปคว้า "ราคาเดิม" มาแทน "ราคาขาย"
 */
var SHOPEE_COLS = [
  { key: 'sn',     label: 'เลขที่คำสั่งซื้อ',   req: true,
    need: [['หมายเลขคำสั่งซื้อ'], ['เลขที่คำสั่งซื้อ'], ['order', 'id'], ['order', 'sn']] },
  { key: 'status', label: 'สถานะการสั่งซื้อ',  req: true,
    need: [['สถานะการสั่งซื้อ'], ['สถานะคำสั่งซื้อ'], ['order', 'status']] },
  { key: 'date',   label: 'วันที่สั่งซื้อ',      req: false,
    need: [['เวลาการสั่งซื้อ'], ['วันที่ทำการสั่งซื้อ'], ['order', 'creation'], ['order', 'time']] },
  { key: 'code',   label: 'รหัสสินค้า (SKU ฝั่ง Shopee)', req: false,
    need: [['เลขอ้างอิง', 'ตัวเลือก'], ['sku', 'variation'], ['sku', 'reference'], ['เลขอ้างอิง sku'], ['รหัสสินค้า']] },
  { key: 'name',   label: 'ชื่อสินค้า',        req: true,
    need: [['ชื่อสินค้า'], ['product', 'name']] },
  { key: 'variant', label: 'ชื่อตัวเลือกสินค้า', req: false,
    need: [['ชื่อตัวเลือกสินค้า'], ['variation', 'name']] },
  { key: 'qty',    label: 'จำนวน',            req: true,
    need: [['จำนวน'], ['quantity'], ['qty']] },
  { key: 'price',  label: 'ราคาขายต่อชิ้น',    req: false,
    need: [['ราคาขาย'], ['deal', 'price'], ['ราคาต่อหน่วย']] },
  { key: 'amount', label: 'ยอดขายของบรรทัดนี้', req: false,
    need: [['ยอดขายสินค้า'], ['product', 'subtotal'], ['total', 'price']] },
  { key: 'fee',    label: 'ค่าคอมมิชชั่น',     req: false,
    need: [['ค่าคอมมิชชั่น'], ['commission']] },
  { key: 'fee2',   label: 'ค่าบริการ',         req: false,
    need: [['ค่าบริการ'], ['service', 'fee'], ['transaction', 'fee']] },
  { key: 'ship',   label: 'ค่าจัดส่งที่ผู้ซื้อจ่าย', req: false,
    need: [['ค่าจัดส่งที่ผู้ซื้อชำระ'], ['buyer', 'paid', 'shipping']] },
  { key: 'paid',   label: 'ยอดที่ผู้ซื้อชำระ',  req: false,
    need: [['จำนวนเงินทั้งหมด'], ['ยอดรวมสุทธิ'], ['total', 'amount'], ['grand', 'total']] },
  { key: 'buyer',  label: 'ชื่อผู้ซื้อ',        req: false,
    need: [['ชื่อผู้ซื้อ'], ['buyer', 'username']] },
  { key: 'recip',  label: 'ชื่อผู้รับ',         req: false,
    need: [['ชื่อผู้รับ'], ['recipient']] },
  { key: 'tel',    label: 'เบอร์โทร',          req: false,
    need: [['หมายเลขโทรศัพท์'], ['เบอร์โทร'], ['phone']] },
  { key: 'addr',   label: 'ที่อยู่จัดส่ง',       req: false,
    need: [['ที่อยู่ในการจัดส่ง'], ['delivery', 'address'], ['ที่อยู่']] },
  { key: 'carrier', label: 'ขนส่ง',            req: false,
    need: [['ตัวเลือกการจัดส่ง'], ['ช่องทางการจัดส่ง'], ['shipping', 'option']] },
  { key: 'track',  label: 'เลขพัสดุ',          req: false,
    need: [['หมายเลขติดตามพัสดุ'], ['tracking', 'number']] }
];

function shopeeNorm_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[\s *_.:()\[\]-]+/g, '');
}

/**
 * จับคอลัมน์จากแถวหัวตาราง คืน { key: ดัชนีคอลัมน์ } (เจอที่ไหนก่อนใช้ที่นั่น)
 * คอลัมน์ที่จับไม่ได้จะไม่มีคีย์อยู่ในผลลัพธ์เลย ไม่ใช่ -1 — คนเรียกจะได้ไม่เผลอใช้
 */
function shopeeMatchCols(headers) {
  var h = (headers || []).map(shopeeNorm_);
  var out = {};
  for (var i = 0; i < SHOPEE_COLS.length; i++) {
    var spec = SHOPEE_COLS[i];
    for (var s = 0; s < spec.need.length && out[spec.key] === undefined; s++) {
      var words = spec.need[s].map(shopeeNorm_);
      for (var c = 0; c < h.length; c++) {
        if (!h[c]) continue;
        var all = true;
        for (var w = 0; w < words.length; w++) if (h[c].indexOf(words[w]) < 0) { all = false; break; }
        if (all) { out[spec.key] = c; break; }
      }
    }
  }
  return out;
}

/** หาแถวหัวตาราง — ไฟล์ Shopee บางรุ่นมีบรรทัดคำอธิบายอยู่เหนือหัวตาราง */
function shopeeHeaderRow(table) {
  var best = -1, bestScore = 0;
  for (var r = 0; r < Math.min(12, (table || []).length); r++) {
    var got = shopeeMatchCols(table[r]);
    var score = 0;
    for (var k in got) score++;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore >= 3 ? best : -1;
}

/** ตัวเลขจากชีทที่อาจมาเป็น "1,234.50" หรือ "฿1,234" หรือว่าง */
function shopeeNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var t = String(v == null ? '' : v).replace(/[^\d.\-]/g, '');
  var n = Number(t);
  return isFinite(n) ? n : 0;
}

/**
 * วันที่จาก Shopee — เจอมาแล้วทั้ง Date จริง, "2026-08-29 14:03", "29/08/2026 14:03"
 * คืน 'YYYY-MM-DD' หรือ '' ถ้าอ่านไม่ออก (ไม่เดาเป็นวันนี้ เพราะจะทำให้ยอดไปลงผิดวัน)
 */
function shopeeDate_(v) {
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
  }
  var t = String(v == null ? '' : v).trim();
  var m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(t);
  if (m) return m[1] + '-' + p(+m[2]) + '-' + p(+m[3]);
  m = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/.exec(t);
  if (m) {
    var y = +m[3];
    if (y > 2400) y -= 543;              // ไฟล์ที่ผ่านมือ Excel ไทยมาแล้วเป็น พ.ศ.
    return y + '-' + p(+m[2]) + '-' + p(+m[1]);
  }
  return '';
}

/**
 * สถานะ Shopee → กลุ่มที่ระบบเข้าใจ
 *
 * แยกกลุ่มไว้เพราะ "ตัดสต๊อกตอนไหน" เป็นเรื่องเป็นตายของยอดคงเหลือ
 * ตัดตั้งแต่ลูกค้ากดสั่ง (ยังไม่จ่าย) แล้วเจอยกเลิกเยอะ สต๊อกจะขาดทั้งที่ของยังอยู่
 */
function shopeeStatusKind(status) {
  var t = String(status == null ? '' : status).toLowerCase();
  if (/ยกเลิก|cancel/.test(t)) return 'cancelled';
  if (/คืน|refund|return/.test(t)) return 'returned';
  if (/สำเร็จ|complete/.test(t)) return 'done';
  if (/จัดส่งแล้ว|กำลังจัดส่ง|ship(?!ping fee)|delivered/.test(t)) return 'shipped';
  if (/ที่ต้องจัดส่ง|รอจัดส่ง|พร้อมจัดส่ง|เตรียมจัดส่ง|to ?ship|ready|process/.test(t)) return 'toship';
  if (/ยังไม่ได้ชำระ|ยังไม่ชำระ|รอชำระ|unpaid|pending/.test(t)) return 'unpaid';
  return 'other';
}

/** กลุ่มสถานะที่ระบบยอมตัดสต๊อกให้ตามค่าตั้งต้น — ตัดเมื่อของออกจากร้านแล้วเท่านั้น */
var SHOPEE_CUT_KINDS = ['toship', 'shipped', 'done'];

/**
 * แปลงตารางทั้งแผ่นเป็นออเดอร์
 *
 * table = array 2 มิติ (รวมแถวหัว) · cols = ผลจาก shopeeMatchCols หรือที่คนเลือกเองมา
 * headerRow = ดัชนีแถวหัว
 *
 * ไฟล์ Shopee 1 ออเดอร์กินหลายแถว (แถวละสินค้า) ค่าระดับใบ เช่น ชื่อผู้รับ ที่อยู่
 * ค่าธรรมเนียม มักใส่มาเฉพาะแถวแรกของใบ แถวถัด ๆ ไปปล่อยว่าง จึงต้องเก็บแบบ
 * "ค่าแรกที่ไม่ว่าง" ไม่ใช่ทับด้วยค่าว่างของแถวหลัง
 */
function shopeeParse(table, cols, headerRow) {
  table = table || [];
  cols = cols || {};
  var start = (headerRow === undefined || headerRow === null ? shopeeHeaderRow(table) : headerRow) + 1;
  var byNo = {};
  var order = [];
  var skipped = 0;

  function get(row, key) {
    var c = cols[key];
    return (c === undefined || c === null || c < 0) ? '' : row[c];
  }

  for (var r = start; r < table.length; r++) {
    var row = table[r] || [];
    var sn = String(get(row, 'sn') || '').trim();
    if (!sn) { skipped++; continue; }

    var o = byNo[sn];
    if (!o) {
      o = byNo[sn] = {
        sn: sn, date: '', status: '', kind: 'other',
        buyer: '', recip: '', tel: '', addr: '', carrier: '', track: '',
        fee: 0, ship: 0, paid: 0, items: [], rows: 0
      };
      order.push(o);
    }
    o.rows++;

    /* ค่าระดับใบ — เอาค่าแรกที่ไม่ว่าง */
    function keep(field, key, conv) {
      if (o[field]) return;
      var v = get(row, key);
      var t = conv ? conv(v) : String(v == null ? '' : v).trim();
      if (t) o[field] = t;
    }
    keep('date', 'date', shopeeDate_);
    keep('status', 'status');
    keep('buyer', 'buyer');
    keep('recip', 'recip');
    keep('tel', 'tel');
    keep('addr', 'addr');
    keep('carrier', 'carrier');
    keep('track', 'track');

    /* ค่าธรรมเนียมกับยอดชำระ Shopee ใส่มาเฉพาะแถวแรกของใบ บวกซ้ำทุกแถวจะได้เลขเกินจริง */
    if (o.fee === 0)  o.fee  = shopeeNum_(get(row, 'fee')) + shopeeNum_(get(row, 'fee2'));
    if (o.ship === 0) o.ship = shopeeNum_(get(row, 'ship'));
    if (o.paid === 0) o.paid = shopeeNum_(get(row, 'paid'));

    var qty = shopeeNum_(get(row, 'qty'));
    var name = String(get(row, 'name') || '').trim();
    var variant = String(get(row, 'variant') || '').trim();
    var code = String(get(row, 'code') || '').trim();
    if (!qty && !name && !code) continue;      // แถวสรุปท้ายไฟล์ ไม่ใช่สินค้า

    var amount = shopeeNum_(get(row, 'amount'));
    var price = shopeeNum_(get(row, 'price'));
    if (!price && qty > 0 && amount) price = Math.round((amount / qty) * 100) / 100;
    if (!amount) amount = Math.round(price * qty * 100) / 100;

    o.items.push({
      code: code, name: name, variant: variant,
      qty: qty, price: price, amount: amount
    });
  }

  for (var i = 0; i < order.length; i++) order[i].kind = shopeeStatusKind(order[i].status);
  return { orders: order, skipped: skipped };
}

/**
 * คีย์ที่ใช้จับคู่กับตาราง จับคู่SKU
 * ใช้รหัสก่อนเสมอ เพราะร้านตั้งรหัสเองได้ ส่วนชื่อสินค้าบน Shopee เปลี่ยนบ่อยมาก
 */
function shopeeKeys(item) {
  var out = [];
  if (item.code) out.push(shopeeNorm_(item.code));
  if (item.name && item.variant) out.push(shopeeNorm_(item.name + '|' + item.variant));
  if (item.name) out.push(shopeeNorm_(item.name));
  return out;
}

/* ให้ node ดึงไปทดสอบได้ ตอนรันบน Apps Script บรรทัดนี้ไม่ทำงาน */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SHOPEE_COLS: SHOPEE_COLS, SHOPEE_CUT_KINDS: SHOPEE_CUT_KINDS,
    shopeeMatchCols: shopeeMatchCols, shopeeHeaderRow: shopeeHeaderRow,
    shopeeParse: shopeeParse, shopeeStatusKind: shopeeStatusKind,
    shopeeKeys: shopeeKeys, shopeeDate_: shopeeDate_, shopeeNum_: shopeeNum_
  };
}
