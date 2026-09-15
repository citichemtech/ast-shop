/**
 * เอกสารขาย — ใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จรับเงิน-ใบกำกับภาษี / ใบรับเงินมัดจำ
 *
 * ไฟล์นี้เก็บ "ตรรกะล้วน" ที่ไม่แตะ SpreadsheetApp เลย เพื่อให้ทดสอบด้วย node ได้
 * ส่วนที่อ่าน/เขียนชีทอยู่ใน Api.gs
 *
 * อ้างอิงจากใบจริงที่ร้านใช้อยู่ (ONIV26-00212):
 *   5 x 129.00 + 1 x 239.00 + 1 x 239.00  =  1,123.00   มูลค่าสินค้า Total
 *   1,123.00 x 7%                         =     78.61   ภาษีมูลค่าเพิ่ม Vat 7%
 *                                            1,201.61   รวมจำนวนเงินทั้งสิ้น
 *
 * แปลว่าราคาต่อหน่วยบนใบเป็นราคา "ก่อน" ภาษี แล้วบวกภาษีเพิ่มท้ายใบ
 * ไม่ใช่ถอดภาษีออกจากราคาป้าย — ค่าตั้งต้นจึงเป็น excl
 *
 * แต่ขายปลีกหน้าเพจตั้งราคาแบบรวมภาษีไว้แล้ว (149 บาทรวม VAT) ใบ ONIV26-00230
 * จึงคีย์ราคาก่อนภาษี 139.25 เข้าไปเอง ระบบเลยเปิดให้สลับโหมดได้รายใบ
 */

/* ------------------------------------------------------------ ชนิดเอกสาร */

/**
 * สี่ชนิดที่ร้านใช้ — เรียงตามลำดับการทำงานจริง เสนอราคา → แจ้งหนี้ → รับเงิน
 *
 * quote:true คือใบที่ออก "ก่อน" มีออเดอร์ จึงไม่ผูกเลขออเดอร์และไม่ตัดสต๊อก
 * vat:true   คือใบที่ต้องแสดงการแยกภาษีมูลค่าเพิ่มบนหน้าเอกสาร
 */
/**
 * ฟอร์มกระดาษของร้านพิมพ์สี่ชื่อไว้ในใบเดียว แล้วขีดเน้นชื่อที่ใช้จริงของใบนั้น
 * form คือดัชนีของชื่อที่ต้องขีดเน้น — ใบเสร็จรับเงินคือใบกำกับภาษีในตัว จึงเน้นสองชื่อ
 * ใบเสนอราคากับใบรับเงินมัดจำไม่ได้อยู่ในสี่ชื่อนี้ (form ว่าง) จึงพิมพ์ชื่อตัวเองแทน
 */
var DOC_FORM_TH = ['ใบเสร็จรับเงิน', 'ใบกำกับภาษี', 'ใบส่งของ', 'ใบแจ้งหนี้'];
var DOC_FORM_EN = ['RECEIPT', 'TAX INVOICE', 'DELIVERY ORDER', 'DEBIT NOTE'];

var DOC_TYPES = [
  { key: 'quote', code: 'QO', th: 'ใบเสนอราคา',   en: 'QUOTATION',      quote: true,  vat: true, form: [] },
  { key: 'inv',   code: 'IV', th: 'ใบแจ้งหนี้',     en: 'DEBIT NOTE',     quote: false, vat: true, form: [3] },
  { key: 'rec',   code: 'RE', th: 'ใบเสร็จรับเงิน', en: 'RECEIPT',        quote: false, vat: true, form: [0, 1] },
  { key: 'dep',   code: 'DR', th: 'ใบรับเงินมัดจำ', en: 'DEPOSIT RECEIPT', quote: false, vat: true, form: [] },
  /* บิลเงินสด — ขายที่ไม่ออกใบกำกับภาษี
     ของเดิมทำด้วยการออก "ใบเสร็จรับเงิน" แล้วเลือก "ไม่คิด VAT" ซึ่งผิดสองชั้น
       หนึ่ง  กระดาษยังพิมพ์คำว่า ใบกำกับภาษี อยู่บนหัวใบ ทั้งที่ไม่ใช่ใบกำกับภาษี
       สอง   กินเลขจากชุด ONIV ซึ่งเป็นชุดเลขใบกำกับภาษีที่ต้องเรียงต่อกันไม่ขาด
              และเป็นชุดที่สรรพากรตรวจ
     จึงต้องเป็นเอกสารคนละชนิด คนละชุดเลข และ vat:false ถาวร ไม่ใช่ติ๊กเอาตอนออกใบ */
  { key: 'cash',  code: 'CS', th: 'บิลเงินสด',     en: 'CASH BILL',      quote: false, vat: false, form: [] },
  /* ใบวางบิล — ใบเดียวรวมหลายบิลของลูกค้ารายเดียว ไม่ใช่ 1 ใบ = 1 ออเดอร์เหมือนใบอื่น
     เนื้อในใบเป็น "รายการเอกสาร" (เลขที่ใบ · วันที่ · PO · วันครบกำหนด · ยอด)
     ไม่ใช่รายการสินค้า จึงมีตัวประกอบใบของตัวเองคือ buildBill_ ไม่ได้ใช้ buildDoc_
     และเลขใบเป็นคนละรูปแบบ BL260822-001 (วันที่ + ลำดับในวันนั้น) ตามใบจริงของร้าน */
  { key: 'bill',  code: 'BL', th: 'ใบวางบิล',      en: 'BILLING NOTE',   quote: false, vat: true,  form: [], many: true }
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
 *   excl (ค่าตั้งต้น) — ยอดที่ส่งมายังไม่รวมภาษี บวกเพิ่มให้  1,123.00 → 1,123.00 + 78.61
 *   incl             — ยอดที่ส่งมารวมภาษีแล้ว ถอดออกมาแสดง      149.00 →   139.25 +  9.75
 *
 * ปัดฐานภาษีเป็นทศนิยมสองตำแหน่ง แล้วให้ภาษีเป็นเศษที่เหลือ
 * เพื่อให้ ฐาน + ภาษี = ยอดรวม เป๊ะเสมอ ไม่มีบาทหายไปจากการปัดคนละที
 */
function vatSplit_(amount, rate, mode) {
  var a = Number(amount) || 0;
  var r = Number(rate) || 0;
  if (r > 1) r = r / 100;           // รับได้ทั้ง 0.07 และ 7
  if (r <= 0) return { base: round2_(a), vat: 0, gross: round2_(a), rate: 0 };
  if (mode !== 'incl') {
    var base = round2_(a);
    var gross = round2_(base * (1 + r));
    return { base: base, vat: round2_(gross - base), gross: gross, rate: r };
  }
  var g = round2_(a);
  var b = round2_(g / (1 + r));
  return { base: b, vat: round2_(g - b), gross: g, rate: r };
}

/* --------------------------------------------- เลขประจำตัวผู้เสียภาษี */

/**
 * ตรวจเลขประจำตัวผู้เสียภาษี 13 หลักด้วยหลักตรวจสอบ (mod 11) ตัวเดียวกับเลขบัตรประชาชน
 *
 * ทำไมต้องตรวจ: ถ้าเลขผู้เสียภาษีของลูกค้าผิดแม้แต่หลักเดียว ใบกำกับภาษีใบนั้น
 * ลูกค้าเอาไปใช้เครดิตภาษีซื้อไม่ได้ ต้องออกใบใหม่และยกเลิกใบเก่า เสียเวลาทั้งสองฝ่าย
 * พิมพ์ผิดหนึ่งหลักคนอ่านจับไม่ได้ แต่หลักตรวจสอบจับได้ทันที
 *
 * คืน true/false เท่านั้น ไม่โยน error — ฝั่งหน้าจอเอาไปขึ้นเตือนแบบไม่บล็อก
 * เพราะลูกค้าบุคคลธรรมดาบางรายไม่มีเลขนี้ และงานต้องเดินต่อได้
 */
function taxIdValid_(v) {
  var t = String(v == null ? '' : v).replace(/[^\d]/g, '');
  if (t.length !== 13) return false;
  var sum = 0;
  for (var i = 0; i < 12; i++) sum += Number(t.charAt(i)) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(t.charAt(12));
}

/* ------------------------------------------------------------ เลขเอกสาร */

/**
 * เลขถัดไปของชุดหนึ่ง — ต่อจากเลขสูงสุดที่เคยออก ไม่ใช่นับจำนวนแถว
 * (นับแถวจะชนกันทันทีที่มีการลบแถวหรือเริ่มชุดกลางคัน)
 *
 * floor คือเลขที่ยกยอดมาจากระบบเดิม — ชุด ONIV26 เดินมาถึง 00230 แล้วในไฟล์ Excel เก่า
 * แต่ชีท เอกสาร ยังว่าง ถ้าไม่มีพื้น ระบบจะเริ่มนับ 00001 ใหม่แล้วออกเลขซ้ำกับใบที่
 * ส่งลูกค้าไปแล้ว 230 ใบ — เลขใบกำกับภาษีซ้ำเป็นปัญหาทางบัญชีที่แก้ทีหลังยากมาก
 *
 * prefix  เช่น "ONIV26-"   used  เลขที่เคยออกไปแล้วทั้งชุด   floor  เลขที่ยกยอดมา
 */
/**
 * เลขใบวางบิล — BL + ปีเดือนวัน + ลำดับในวันนั้น  เช่น BL260822-001
 *
 * คนละรูปแบบกับชุด ONIV ที่เดินเลขต่อกันทั้งปีโดยตั้งใจ ใบวางบิลไม่ใช่เอกสารภาษี
 * ไม่ต้องเรียงไม่ขาด และร้านใช้รูปแบบนี้อยู่แล้ว (ใบจริง BL260822-001 · 22/08/2026)
 */
/**
 * เป็นวันที่ที่ใช้ได้ไหม — ดูที่ "ทำอะไรได้" ไม่ใช่ instanceof
 *
 * instanceof Date เป็นเท็จทันทีถ้า Date ตัวนั้นมาจากคนละขอบเขต (เช่นข้ามจากไลบรารี
 * หรือข้ามจาก vm ตอนรันข้อสอบ) แล้วโค้ดจะถอยไปใช้ "วันนี้" แทนวันที่จริงแบบเงียบ ๆ
 * ซึ่งบนใบวางบิลแปลว่าวันครบกำหนดผิดไปทั้งใบโดยไม่มีอะไรฟ้อง
 */
function isDate_(v) {
  return !!v && typeof v.getTime === 'function' && !isNaN(v.getTime());
}

function billNo_(prefix, when, used) {
  var d = isDate_(when) ? when : new Date();
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  var stem = String(prefix || 'BL') +
    String(d.getFullYear()).slice(-2) + p2(d.getMonth() + 1) + p2(d.getDate()) + '-';
  var max = 0;
  for (var i = 0; i < (used || []).length; i++) {
    var t = String(used[i] || '');
    if (t.indexOf(stem) !== 0) continue;
    var n = parseInt(t.substring(stem.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  var seq = String(max + 1);
  while (seq.length < 3) seq = '0' + seq;
  return stem + seq;
}

/**
 * เครดิตกี่วัน อ่านจากข้อความเงื่อนไขชำระเงินที่คนพิมพ์เอง
 * "เครดิต 30 วัน" -> 30 · "เงินสด" -> 0 · อ่านไม่ออก -> ค่าตั้งต้น
 *
 * อ่านไม่ออกแล้วเดาเป็น 30 ทุกกรณีไม่ได้ เพราะวันครบกำหนดบนใบวางบิล
 * คือวันที่ลูกค้าใช้ตั้งรอบจ่ายจริง ผิดไปสามสิบวันคือเงินเข้าช้าไปหนึ่งเดือน
 */
function creditDays_(terms, fallback) {
  var t = String(terms == null ? '' : terms);
  var m = /(\d{1,3})\s*วัน/.exec(t);
  if (m) return Number(m[1]);
  if (/เงินสด|ทันที|cash/i.test(t)) return 0;
  return fallback === undefined ? 30 : Number(fallback) || 0;
}

function addDays_(d, n) {
  var out = new Date(d.getTime());
  out.setDate(out.getDate() + Number(n || 0));
  return out;
}

/**
 * ประกอบใบวางบิลจากรายการเอกสารที่เลือกมา
 *
 * ยอดทุกช่องมาจาก "ยอดที่บันทึกไว้ตอนออกใบนั้น ๆ" ไม่ได้คิดใหม่จากสินค้า
 * ใบที่ลูกค้าถืออยู่เขียนยอดเท่าไร ใบวางบิลต้องเขียนเท่านั้น ห้ามต่างกันแม้แต่สตางค์เดียว
 * ถ้าคิดใหม่แล้วอัตราภาษีหรือวิธีปัดเศษเปลี่ยนไปตอนไหน ยอดสองใบจะไม่ตรงกันเงียบ ๆ
 */
/* ใบวางบิลพิมพ์ได้กี่บรรทัดในหนึ่งแผ่น — ตัวเลขนี้ต้องตรงกับที่ Doc.html วาดจริง
   เกินกว่านี้ระบบไม่ยอมออกใบ ไม่ใช่พิมพ์แค่ที่พอแล้วเงียบ
   ใบวางบิลที่โชว์ 14 บรรทัดแต่ยอดรวมเป็นของ 20 ใบ คือใบที่ลูกค้าตรวจไม่ได้
   และเป็นข้อโต้แย้งที่ร้านอธิบายไม่ได้ตอนทวงเงิน */
var BILL_MAX_LINES = 14;

function buildBill_(docs, opts) {
  var o = opts || {};
  var days = creditDays_(o.terms, o.creditDays);
  var base = 0, vat = 0, total = 0;
  var lines = (docs || []).map(function (d, i) {
    var b = round2_(Number(d.base) || 0);
    var v = round2_(Number(d.vat) || 0);
    var g = round2_(Number(d.total) || 0);
    base = round2_(base + b); vat = round2_(vat + v); total = round2_(total + g);
    var dt = isDate_(d.date) ? d.date : parseYmd_(d.date);
    return {
      i: i + 1, no: String(d.no || ''), date: dt, po: String(d.po || ''),
      due: dt ? addDays_(dt, days) : null,
      base: b, vat: v, total: g
    };
  });
  return {
    type: 'bill', typeTh: 'ใบวางบิล', typeEn: 'BILLING NOTE',
    lines: lines, count: lines.length, creditDays: days,
    base: base, vat: vat, total: total, totalText: bahtText_(total)
  };
}

/** "2026-08-22" หรือ "22/08/2026" -> Date · อ่านไม่ออกคืน null ไม่เดาเป็นวันนี้ */
function parseYmd_(v) {
  var t = String(v == null ? '' : v).trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var d = new Date(t);
  return isDate_(d) ? d : null;
}

function nextDocNo_(prefix, used, width, floor) {
  var w = width || 5;
  var max = Number(floor) || 0;
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
  var mode = (cfg && cfg.vatMode) || 'excl';
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
