/**
 * เอกสารขาย — ใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จรับเงิน-ใบกำกับภาษี / ใบรับเงินมัดจำ
 *
 * ไฟล์นี้เก็บ "ตรรกะล้วน" ที่ไม่แตะ SpreadsheetApp เลย เพื่อให้ทดสอบด้วย node ได้
 * ส่วนที่อ่าน/เขียนชีทอยู่ใน Api.gs
 *
 * อ้างอิงจากใบจริงที่ร้านใช้อยู่ (ONIV26-00230):
 *   มูลค่าสินค้า Total   139.25
 *   ภาษีมูลค่าเพิ่ม 7%     9.75
 *   รวมทั้งสิ้น          149.00      ← ราคาขายหน้าร้านคือ 149 บาท "รวม VAT แล้ว"
 * แปลว่าร้านตั้งราคาแบบรวมภาษี แล้วถอดภาษีออกตอนออกเอกสาร ไม่ใช่บวกเพิ่มจากราคาป้าย
 */

/* ------------------------------------------------------------ ชนิดเอกสาร */

/**
 * สี่ชนิดที่ร้านใช้ — เรียงตามลำดับการทำงานจริง เสนอราคา → แจ้งหนี้ → รับเงิน
 *
 * quote:true คือใบที่ออก "ก่อน" มีออเดอร์ จึงไม่ผูกเลขออเดอร์และไม่ตัดสต๊อก
 * vat:true   คือใบที่ต้องแสดงการแยกภาษีมูลค่าเพิ่มบนหน้าเอกสาร
 */
var DOC_TYPES = [
  { key: 'quote', code: 'QO', th: 'ใบเสนอราคา',                en: 'QUOTATION',  quote: true,  vat: true },
  { key: 'inv',   code: 'IV', th: 'ใบแจ้งหนี้',                  en: 'INVOICE',    quote: false, vat: true },
  { key: 'rec',   code: 'RE', th: 'ใบเสร็จรับเงิน / ใบกำกับภาษี', en: 'RECEIPT / TAX INVOICE', quote: false, vat: true },
  { key: 'dep',   code: 'DR', th: 'ใบรับเงินมัดจำ',              en: 'DEPOSIT RECEIPT', quote: false, vat: true }
];

function docType_(key) {
  for (var i = 0; i < DOC_TYPES.length; i++) {
    if (DOC_TYPES[i].key === key) return DOC_TYPES[i];
  }
  return null;
}

/* ------------------------------------------------- จำนวนเงินเป็นตัวหนังสือ */

var BT_DIG = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
var BT_POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/**
 * จำนวนเต็มเป็นตัวหนังสือไทย ตามหลักที่ราชบัณฑิตฯ ใช้
 *   หลักหน่วยของกลุ่มที่ยาวเกินหนึ่งหลัก เลข 1 อ่านว่า "เอ็ด"  (11 → สิบเอ็ด)
 *   หลักสิบ เลข 1 ไม่ออกเสียง                                (10 → สิบ ไม่ใช่ หนึ่งสิบ)
 *   หลักสิบ เลข 2 อ่านว่า "ยี่"                                (20 → ยี่สิบ)
 *   เกินหกหลักตัดเป็นกลุ่มล้าน แล้ววนซ้ำ
 */
function intText_(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'ศูนย์';
  if (n > 999999) {
    var rest = n % 1000000;
    return intText_(Math.floor(n / 1000000)) + 'ล้าน' + (rest ? intText_(rest) : '');
  }
  var s = String(n), out = '';
  for (var i = 0; i < s.length; i++) {
    var d = Number(s.charAt(i)), p = s.length - i - 1;
    if (d === 0) continue;
    if (p === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
    else if (p === 1 && d === 1) out += '';
    else if (p === 1 && d === 2) out += 'ยี่';
    else out += BT_DIG[d];
    out += BT_POS[p];
  }
  return out;
}

/**
 * เงินบาทเป็นตัวหนังสือ — ช่องในวงเล็บกลางใบกำกับภาษี
 * 149 → "หนึ่งร้อยสี่สิบเก้าบาทถ้วน"  (ตรงกับใบจริง ONIV26-00230)
 */
function bahtText_(amount) {
  var v = Number(amount);
  if (!isFinite(v)) v = 0;
  var neg = v < 0;
  v = round2_(Math.abs(v));          // ใช้ตัวปัดเงินตัวเดียวกับที่ใช้คิดยอด จะได้ไม่เพี้ยนคนละทาง
  var baht = Math.floor(v);
  var satang = Math.round(round2_(v - baht) * 100);
  // ปัดเศษแล้วสตางค์อาจเต็มร้อย ต้องทดขึ้นบาท ไม่งั้นได้ "ร้อยสตางค์"
  if (satang === 100) { baht += 1; satang = 0; }
  var t;
  if (baht === 0 && satang === 0) t = 'ศูนย์บาทถ้วน';
  else if (satang === 0) t = intText_(baht) + 'บาทถ้วน';
  else if (baht === 0) t = intText_(satang) + 'สตางค์';
  else t = intText_(baht) + 'บาท' + intText_(satang) + 'สตางค์';
  return (neg ? 'ลบ' : '') + t;
}

/* ----------------------------------------------------- ภาษีมูลค่าเพิ่ม */

/**
 * แยกภาษีออกจากยอด
 *   incl (ค่าตั้งต้น) — ยอดที่ส่งมารวมภาษีแล้ว ถอดออกมาแสดง  149 → 139.25 + 9.75
 *   excl             — ยอดที่ส่งมายังไม่รวม บวกเพิ่มให้       139.25 → 139.25 + 9.75
 *
 * ปัดฐานภาษีเป็นทศนิยมสองตำแหน่ง แล้วให้ภาษีเป็นเศษที่เหลือ
 * เพื่อให้ ฐาน + ภาษี = ยอดรวม เป๊ะเสมอ ไม่มีบาทหายไปจากการปัดคนละที
 */
function vatSplit_(amount, rate, mode) {
  var a = Number(amount) || 0;
  var r = Number(rate) || 0;
  if (r > 1) r = r / 100;           // รับได้ทั้ง 0.07 และ 7
  if (r <= 0) return { base: round2_(a), vat: 0, gross: round2_(a), rate: 0 };
  if (mode === 'excl') {
    var base = round2_(a);
    var gross = round2_(base * (1 + r));
    return { base: base, vat: round2_(gross - base), gross: gross, rate: r };
  }
  var g = round2_(a);
  var b = round2_(g / (1 + r));
  return { base: b, vat: round2_(g - b), gross: g, rate: r };
}

/* ------------------------------------------------------------ เลขเอกสาร */

/**
 * เลขถัดไปของชุดหนึ่ง — ต่อจากเลขสูงสุดที่เคยออก ไม่ใช่นับจำนวนแถว
 * (นับแถวจะชนกันทันทีที่มีการลบแถวหรือเริ่มชุดกลางคัน อย่างชุด ONIV26 ที่เริ่มที่ 230)
 *
 * prefix  เช่น "ONIV26-"   used  เลขที่เคยออกไปแล้วทั้งชุด
 */
function nextDocNo_(prefix, used, width) {
  var w = width || 5;
  var max = 0;
  for (var i = 0; i < (used || []).length; i++) {
    var s = String(used[i] || '');
    if (s.indexOf(prefix) !== 0) continue;
    var n = parseInt(s.substring(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  var t = String(max + 1);
  while (t.length < w) t = '0' + t;
  return prefix + t;
}

/* --------------------------------------------------------- ประกอบตัวเอกสาร */

/**
 * แปลงออเดอร์ (หรือร่างใบเสนอราคา) เป็นก้อนข้อมูลที่หน้าจอเอาไปวาดกระดาษได้เลย
 * ไม่แตะชีท ไม่แตะ DOM — ทดสอบได้ตรง ๆ
 *
 * src.items[]  {name, qty, unit, price}   price = ราคาต่อหน่วยที่ลูกค้าจ่าย (รวม VAT ถ้าโหมด incl)
 * src.ship     ค่าจัดส่ง ลงเป็นบรรทัดหนึ่งในตาราง เพราะเป็นเงินที่เรียกเก็บและต้องเสียภาษีด้วย
 * src.discount ส่วนลด ลงเป็นบรรทัดติดลบ
 */
function buildDoc_(type, src, cfg) {
  var t = docType_(type);
  if (!t) throw new Error('ไม่รู้จักชนิดเอกสาร: ' + type);
  var mode = (cfg && cfg.vatMode) || 'incl';
  var rate = t.vat ? (cfg && cfg.vatRate) || 0 : 0;

  var lines = [], gross = 0;
  (src.items || []).forEach(function (it) {
    var qty = Number(it.qty) || 0;
    var price = Number(it.price) || 0;
    var amt = round2_(qty * price);
    gross += amt;
    lines.push({
      name: String(it.name || ''), po: String(it.po || ''),
      qty: qty, unit: String(it.unit || 'ชิ้น'), price: price, amount: amt
    });
  });
  var ship = Number(src.ship) || 0;
  if (ship > 0) {
    gross += ship;
    lines.push({ name: 'ค่าจัดส่ง', po: '', qty: 1, unit: 'ครั้ง', price: ship, amount: ship });
  }
  var discount = Number(src.discount) || 0;
  if (discount > 0) {
    gross -= discount;
    lines.push({ name: 'ส่วนลด', po: '', qty: 1, unit: '-', price: -discount, amount: -discount });
  }

  var v = vatSplit_(gross, rate, mode);
  return {
    type: t.key, typeTh: t.th, typeEn: t.en,
    lines: lines,
    base: v.base, vat: v.vat, total: v.gross, vatRate: v.rate,
    totalText: bahtText_(v.gross)
  };
}
