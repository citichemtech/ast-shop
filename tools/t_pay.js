/*
 * ทดสอบระบบรับเงิน — QR พร้อมเพย์ · เลือกบัญชีตาม VAT · เก็บสลิป
 *
 *   node tools/t_pay.js
 *
 * ข้อที่สำคัญที่สุดของชุดนี้: QR ต้องพาเงินไปเข้าบัญชีที่ถูก
 * ถ้าเลขปลายทางเพี้ยนไปแม้แต่หลักเดียว เงินของลูกค้าจะเข้าบัญชีคนอื่นจริง ๆ
 * และตามคืนแทบไม่ได้ — จึงมีข้อสอบเทียบกับ QR ใบจริงที่ธนาคารออกให้ร้าน
 */
'use strict';
var FS = require('./fakesheet');
var DATA_ROW = FS.DATA_ROW;
var PAY = require('../apps-script/Pay.gs');

var fails = 0;
function eq(label, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label +
    '  ได้ ' + JSON.stringify(got) + (ok ? '' : '  ควรได้ ' + JSON.stringify(want)));
}
function truthy(label, got) {
  if (!got) fails++;
  console.log((got ? '  ok   ' : '  FAIL ') + label + '  ได้ ' + JSON.stringify(got));
}
function throws(label, fn, needle) {
  var msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  var ok = msg !== null && (!needle || msg.indexOf(needle) > -1);
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + '  ' +
    (msg === null ? 'ไม่ได้ error เลย' : 'error: ' + msg.slice(0, 110)));
  return msg;
}

/* ============================================ 1. ข้อความใน QR พร้อมเพย์ */
console.log('\n1. ข้อความใน QR ต้องตรงมาตรฐาน EMVCo');

/* ตอนเขียนตัวนี้ ได้ถอดรหัส QR ใบจริงที่ธนาคารออกให้ร้าน (รูปที่เจ้าของร้านส่งมา
   12 ก.ย. 69) มาเทียบแล้ว ตรงกันทุกตัวอักษร — นั่นคือหลักฐานว่าเราประกอบข้อความ
   ถูกทั้งชุดจริง ไม่ใช่ถูกตามที่เราคิดเอง

   แต่ในไฟล์นี้ล็อกด้วยเลขผู้เสียภาษีของบริษัท ซึ่งพิมพ์อยู่บนใบกำกับภาษีทุกใบอยู่แล้ว
   ไม่ใช่เลขพร้อมเพย์ส่วนตัว — โค้ดชุดนี้เปิดดูได้จากข้างนอก
   โครงสร้างที่สอบเป็นชุดเดียวกัน ต่างกันแค่เลขแท็กปลายทาง (02 แทน 03) */
var REAL = '00020101021129370016A0000006770101110213010555805579053037645802TH6304ACAC';
eq('ข้อความ QR ถาวรประกอบครบทุกช่องตามลำดับ', PAY.ppPayload_('0105558055790', 0), REAL);

console.log('\n   ใส่ยอดแล้วต้องเปลี่ยนเป็น QR ครั้งเดียว และมีช่องจำนวนเงิน');
var dyn = PAY.ppPayload_('0105558055790', 2628);
truthy('แท็บ 01 เปลี่ยนจาก 11 เป็น 12', dyn.indexOf('010212') === 0 + 6);
truthy('มีช่อง 54 ยอดเงินสองตำแหน่ง', dyn.indexOf('54072628.00') > -1);
truthy('ยอดอยู่หลังสกุลเงิน ก่อนรหัสประเทศ',
  dyn.indexOf('5303764') < dyn.indexOf('5407') && dyn.indexOf('5407') < dyn.indexOf('5802TH'));

console.log('\n   ตัวตรวจ CRC ต้องเป็น CCITT-FALSE ไม่ใช่พันธุ์อื่น');
eq('CRC ของสตริงมาตรฐาน "123456789"', PAY.ppCrc16_('123456789'), '29B1');
eq('CRC ท้ายข้อความคำนวณจากทั้งข้อความรวม 6304 ด้วย',
  PAY.ppCrc16_(REAL.slice(0, -4)), REAL.slice(-4));

console.log('\n   อ่านเลขปลายทางได้สามแบบ และห้ามเดาแบบที่อ่านไม่ออก');
eq('มือถือ 10 หลัก', PAY.ppTarget_('094-827-9999'), { tag: '01', val: '0066948279999', kind: 'เบอร์มือถือ' });
eq('มือถือที่พิมพ์มาแบบ 0066 แล้ว', PAY.ppTarget_('0066948279999').val, '0066948279999');
eq('เลขผู้เสียภาษี 13 หลัก', PAY.ppTarget_('0105558055790'), { tag: '02', val: '0105558055790', kind: 'เลขผู้เสียภาษี/บัตรประชาชน' });
eq('e-Wallet 15 หลัก', PAY.ppTarget_('123456789012345').tag, '03');
eq('อ่านไม่ออกคืน null ไม่เดา', PAY.ppTarget_('12345'), null);
eq('ว่างก็คืน null', PAY.ppTarget_(''), null);
throws('เลขที่อ่านไม่ออก ต้องล้มพร้อมบอกว่าต้องกรอกแบบไหน',
  function () { PAY.ppPayload_('12345', 100); }, 'อ่านไม่ออก');

console.log('\n   e-Wallet ที่ศูนย์นำหน้าหาย ต้องกลายเป็นคนละแบบ ไม่ใช่แบบเดิมเงียบ ๆ');
/* 001234567890123 (e-Wallet) กับ 1234567890123 (เลขผู้เสียภาษี) ต่างกันแค่ศูนย์สองตัว
   แต่เป็นบัญชีคนละใบ ระบบต้องไม่กลบความต่างนี้ให้เนียน */
eq('ศูนย์ครบ = e-Wallet', PAY.ppTarget_('001234567890123').tag, '03');
eq('ศูนย์หาย = อ่านเป็นเลขผู้เสียภาษี ไม่ใช่ e-Wallet เดิม', PAY.ppTarget_('1234567890123').tag, '02');
truthy('ข้อความที่ได้จึงต่างกัน',
  PAY.ppPayload_('001234567890123', 100) !== PAY.ppPayload_('1234567890123', 100));

/* ============================================ 2. ตารางจุดของ QR */
console.log('\n2. ตารางจุดของ QR');
var rows = PAY.qrModules_(dyn);
eq('ขนาดเป็นสี่เหลี่ยมจัตุรัส', rows.length, rows[0].length);
eq('ขนาด 41 จุด พอดีกับข้อความยาว ' + dyn.length + ' ตัว', rows.length, 41);
truthy('มีแต่ 0 กับ 1', rows.every(function (r) { return /^[01]+$/.test(r); }));

console.log('\n   ตาสามมุมต้องครบสามมุม ไม่งั้นกล้องหาไม่เจอ');
function finderOk(r0, c0) {
  var want = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
  for (var i = 0; i < 7; i++) if (rows[r0 + i].substr(c0, 7) !== want[i]) return false;
  return true;
}
truthy('มุมบนซ้าย', finderOk(0, 0));
truthy('มุมบนขวา', finderOk(0, rows.length - 7));
truthy('มุมล่างซ้าย', finderOk(rows.length - 7, 0));

console.log('\n   ตารางของ QR ใบจริง ล็อกไว้ทีละจุด');
/* ตารางชุดนี้ผ่านการพิสูจน์สองชั้นตอนเขียน
     1. ตรงกับไลบรารี qrcode ของ Python ทุกจุด ทุกเวอร์ชัน 1-10 ทุกหน้ากาก
     2. วาดเป็นรูปแล้วให้ตัวอ่าน QR อ่านกลับ ได้ข้อความเดิมเป๊ะ
   ล็อกไว้ที่นี่เพื่อให้รู้ทันทีถ้าใครไปแก้ตัวเข้ารหัสแล้วผลลัพธ์เปลี่ยน
   QR ที่เพี้ยนไปหนึ่งจุดอาจยังสแกนติด (มีระบบกันพลาด) แต่เพี้ยนมากกว่านั้นคือเก็บเงินไม่ได้ */
var GOLDEN = [
  '1111111010110111100110111101001111111',
  '1000001001100010101100001000101000001',
  '1011101000110100111001101010001011101',
  '1011101011001001100010111101001011101',
  '1011101011110110010010111101001011101',
  '1000001010000100010111001000101000001',
  '1111111010101010101010101010101111111',
  '0000000010110010000001010000100000000',
  '1000101110100110100111000010111111001',
  '0011010101001010001100111101010111010',
  '0101111110100011010101110001010110110',
  '1000110010011001111111110000110101110',
  '0000011101001110111001010010101001101',
  '0001010111000101000010111101010110010',
  '0110011100100111110011110011011101110',
  '0101000001001001111001110001100001100',
  '1001111000010110001111001011101001111',
  '1010100000011100100110100101010111010',
  '1110111100110000110011110001110100110',
  '0110100101100000011101111001111101110',
  '1001111101011011111101000010101001101',
  '1110110010011101010010111101010110010',
  '1010001011111111001001010011110001010',
  '1101100001101000100001110010110001110',
  '1011001110001100100110100010101001101',
  '1000100110001000001100000101010110110',
  '0001001101111001010010010001010101110',
  '0000010011100011110001100010100101111',
  '1101111110001100111101000010111111100',
  '0000000011011111000010111001100010010',
  '1111111010100101010011111000101011110',
  '1000001000000001111111010001100011100',
  '1011101011000100001110100010111111101',
  '1011101001111110100100011101001000001',
  '1011101001011010100010010111101001100',
  '1000001001110000010101010000000101110',
  '1111111010111101111101001100011111111'
];
eq('ทุกจุดตรงกับที่พิสูจน์ไว้', PAY.qrModules_(REAL), GOLDEN);

console.log('\n   ข้อความยาวเกินต้องล้ม ไม่ใช่ตัดทิ้งแล้วออก QR ที่โอนผิด');
throws('ยาวเกินเวอร์ชัน 10', function () { PAY.qrModules_(new Array(400).join('A')); }, 'ยาวเกิน');

/* ============================================ 3. เลือกบัญชีตาม VAT */
console.log('\n3. เลือกบัญชีตามว่าใบนั้นมี VAT หรือไม่มี');

function start(fill) {
  var fx = FS.build();
  var ctx = FS.load(fx, {});
  ctx.setup();
  var app = fx.sheets['ตั้งค่าแอป'];
  if (fill) {
    for (var r = DATA_ROW; r <= app.getMaxRows(); r++) {
      var k = String(app.cell(r, 1).v || '').trim();
      if (Object.prototype.hasOwnProperty.call(fill, k)) app.cell(r, 2).v = fill[k];
    }
  }
  function order(o) {
    return ctx.createOrder({
      clientKey: 'pay-' + Math.random(),
      date: '2026-09-12', channel: 'เพจ Facebook', cust: o.cust || 'คุณทดสอบ ชำระเงิน',
      tel: '0812345678', addr: '1/2 ถ.ทดสอบ', carrier: 'Flash Express',
      vat: !!o.vat, discount: 0, ship: 50, status: 'รอชำระ',
      items: [{ sku: 'SKU-141', qty: 2, price: 129 }]
    }).no;
  }
  return { fx: fx, ctx: ctx, app: app, order: order };
}

var FILL = {
  'พร้อมเพย์ บิลมี VAT': '0105558055790',
  'ธนาคารที่รับเงิน บิลไม่มี VAT': 'กรุงศรีอยุธยา',
  'ชื่อบัญชี บิลไม่มี VAT': 'ธนธรณ์ ทดสอบ',
  'เลขบัญชี บิลไม่มี VAT': '511-1467527',
  'พร้อมเพย์ บิลไม่มี VAT': '123456789012345'
};

var s3 = start(FILL);
var noVat3 = s3.order({ vat: true });
var ask3 = s3.ctx.payAsk(noVat3);
eq('ใบมี VAT ใช้บัญชีบริษัท', ask3.acct.bank, 'ไทยพาณิชย์ (SCB)');
eq('เลขบัญชีจัดกลุ่มแบบ SCB 3-6-1', ask3.acct.acct, '431-039435-5');
eq('QR ของใบมี VAT ชี้ไปเลขผู้เสียภาษีบริษัท', ask3.qr.target, '0105558055790');
eq('และล็อกยอดเท่ายอดสุทธิของออเดอร์', ask3.qr.amount, ask3.net);

var plain3 = s3.order({ vat: false });
var ask3b = s3.ctx.payAsk(plain3);
eq('ใบไม่มี VAT ใช้อีกบัญชี', ask3b.acct.bank, 'กรุงศรีอยุธยา');
eq('และ QR ชี้ไปคนละปลายทาง', ask3b.qr.target, '123456789012345');
truthy('ยอดสองใบไม่เท่ากัน เพราะใบหนึ่งบวก VAT', ask3.net !== ask3b.net);

console.log('\n   เลขบัญชีบริษัทอยู่สองที่ ต้องเตือนถ้าเพี้ยนออกจากกัน');
eq('ค่าตั้งต้นตรงกันอยู่แล้ว จึงไม่มีคำเตือน', ask3.acct.drift, '');
var s3e = start({ 'เลขที่บัญชีธนาคาร': 'เลขที่บัญชี 111-222333-4 ธนาคารไทยพาณิชย์' });
var ask3e = s3e.ctx.payAsk(s3e.order({ vat: true }));
truthy('แก้ที่เดียวลืมอีกที่ ต้องฟ้อง', ask3e.acct.drift.indexOf('ไม่ตรงกับ') > -1);
truthy('และบอกว่าต้องไปแก้ช่องไหนบ้าง',
  ask3e.acct.drift.indexOf('เลขที่บัญชีธนาคาร') > -1);
var s3f = start({ 'เลขที่บัญชีธนาคาร': 'เลขที่บัญชี 4310394355 ไทยพาณิชย์' });
eq('เขียนคนละรูปแบบแต่เลขเดียวกัน ต้องไม่ฟ้อง',
   s3f.ctx.payAsk(s3f.order({ vat: true })).acct.drift, '');

console.log('\n   ยังไม่ได้กรอกบัญชี ต้องบอกว่ายังไม่ได้กรอกอะไร ไม่ใช่เงียบ');
var s3c = start(null);
var ask3c = s3c.ctx.payAsk(s3c.order({ vat: false }));
eq('ไม่มี QR', ask3c.qr, null);
eq('บอกครบว่าขาดช่องไหนบ้าง', ask3c.miss,
  ['ธนาคารที่รับเงิน บิลไม่มี VAT', 'ชื่อบัญชี บิลไม่มี VAT', 'เลขบัญชี บิลไม่มี VAT']);
eq('ไม่ยอมสร้างข้อความเรียกเก็บเงินที่ไม่มีเลขบัญชี', ask3c.msg, '');
truthy('และชี้ว่าต้องไปกรอกที่ชีทไหน', ask3c.qrWhy.indexOf('ตั้งค่าแอป') > -1);

console.log('\n   กรอกบัญชีแล้วแต่ยังไม่มีพร้อมเพย์ ต้องยังใช้งานได้ แค่ไม่มี QR');
var s3d = start({ 'ธนาคารที่รับเงิน บิลไม่มี VAT': 'กรุงศรีอยุธยา',
  'ชื่อบัญชี บิลไม่มี VAT': 'ธนธรณ์ ทดสอบ', 'เลขบัญชี บิลไม่มี VAT': '511-1467527' });
var ask3d = s3d.ctx.payAsk(s3d.order({ vat: false }));
eq('ไม่มี QR', ask3d.qr, null);
truthy('แต่ยังมีข้อความให้คัดลอกส่งลูกค้า', ask3d.msg.indexOf('511-1467527') > -1);
truthy('และบอกว่าโอนตามเลขบัญชีได้ตามปกติ', ask3d.qrWhy.indexOf('ตามปกติ') > -1);

/* ============================================ 4. ข้อความเรียกเก็บเงิน */
console.log('\n4. ข้อความที่พนักงานคัดลอกไปวางในแชท');
truthy('ใบมี VAT บอกยอดเป็นตัวเลขจริง', ask3.msg.indexOf('฿') > -1);
truthy('ใบมี VAT บอกว่าออกใบกำกับภาษีได้', ask3.msg.indexOf('ออกใบกำกับภาษีได้') > -1);
truthy('ใบมี VAT ขอชื่อ-ที่อยู่สำหรับออกใบกำกับภาษี', ask3.msg.indexOf('ชื่อ-ที่อยู่') > -1);
truthy('ใบไม่มี VAT บอกชัดว่าไม่มีใบกำกับภาษี', ask3b.msg.indexOf('ไม่มีใบกำกับภาษี') > -1);
truthy('ใบไม่มี VAT ไม่ไปสัญญาว่าออกใบกำกับภาษีได้', ask3b.msg.indexOf('ออกใบกำกับภาษีได้') < 0);
truthy('ทั้งสองแบบขอสลิปกลับมา', ask3.msg.indexOf('สลิป') > -1 && ask3b.msg.indexOf('สลิป') > -1);
truthy('มีเลขออเดอร์กำกับ กันวางผิดแชท', ask3.msg.indexOf(noVat3) > -1);

/* ============================================ 5. แนบสลิป */
console.log('\n5. แนบสลิป');
var PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
var s5 = start(FILL);
var no5 = s5.order({ vat: true });
var net5 = s5.ctx.payAsk(no5).net;
var add5 = s5.ctx.addSlip(no5, { data: PNG1, paidAt: '2026-09-12', amount: net5, bank: 'SCB' });
eq('บอกว่าแนบสำเร็จ', add5.ok, true);
eq('ยอดตรงจึงไม่มีคำเตือน', add5.warn, '');
eq('มีสลิปหนึ่งใบผูกกับออเดอร์', add5.slips.length, 1);
eq('สถานะตั้งต้นคือรอตรวจสอบ', add5.slips[0].status, 'รอตรวจสอบ');
truthy('ชื่อไฟล์มีเลขออเดอร์อยู่ด้วย', add5.fileName.indexOf(no5) > -1);
truthy('เก็บลิงก์ไฟล์ไว้ ไม่ได้เก็บตัวรูปลงชีท', add5.fileUrl.indexOf('drive.google.com') === 8);

var slipSheet = s5.fx.sheets['หลักฐานการชำระเงิน'];
eq('ชีทเก็บเลขออเดอร์', slipSheet.cell(DATA_ROW, 2).v, no5);
eq('ชีทไม่ได้เก็บ base64 ของรูป', String(slipSheet.cell(DATA_ROW, 8).v).indexOf('base64'), -1);
eq('ช่องลำดับเป็นสูตร ไม่ได้ถูกเขียนทับ',
  String(slipSheet.cell(DATA_ROW, 1).f || '').indexOf('COUNTA') > -1, true);

console.log('\n   ยอดในสลิปไม่ตรงยอดออเดอร์ ต้องเตือน แต่ไม่ปฏิเสธไฟล์');
var add5b = s5.ctx.addSlip(no5, { data: PNG1, paidAt: '2026-09-12', amount: 100, bank: 'SCB' });
eq('ยังรับไฟล์', add5b.ok, true);
truthy('แต่บอกว่ายอดไม่ตรงและต่างเท่าไร', add5b.warn.indexOf('ไม่เท่ายอดออเดอร์') > -1);
eq('ออเดอร์เดียวมีได้หลายสลิป', add5b.slips.length, 2);

console.log('\n   ไฟล์ที่ไม่ใช่สลิป ต้องไม่รับ');
throws('ไฟล์ Word', function () {
  s5.ctx.addSlip(no5, { data: 'data:application/msword;base64,QUJD' });
}, 'แนบไม่ได้');
throws('ไม่ได้เลือกไฟล์เลย', function () { s5.ctx.addSlip(no5, {}); }, 'ยังไม่ได้เลือกไฟล์');
throws('ออเดอร์ที่ไม่มีจริง', function () {
  s5.ctx.addSlip('AST-26-9999', { data: PNG1 });
}, 'ไม่พบออเดอร์');

console.log('\n   เขียนแถวในชีทไม่สำเร็จ ต้องไม่ทิ้งไฟล์ลอยไว้ในไดรฟ์');
/* ไฟล์ที่ไม่มีแถวอ้างถึง คือสลิปที่ไม่มีใครรู้ว่าเป็นของออเดอร์ไหนตลอดกาล */
var s5c = start(FILL);
var no5c = s5c.order({ vat: true });
var slip5c = s5c.fx.sheets['หลักฐานการชำระเงิน'];
for (var rr = DATA_ROW; rr <= slip5c.getMaxRows(); rr++) slip5c.cell(rr, 2).v = 'กันแถวว่าง';
var before5c = s5c.ctx.__drive.live().length;
throws('บอกว่าชีทเต็ม', function () { s5c.ctx.addSlip(no5c, { data: PNG1 }); }, 'เต็ม');
eq('ไม่เหลือไฟล์ลอยในไดรฟ์', s5c.ctx.__drive.live().length, before5c);
eq('ไฟล์ที่เพิ่งสร้างถูกทิ้งลงถังขยะแล้ว',
   s5c.ctx.__drive.files.filter(function (f) { return f._trashed; }).length, 1);

/* ============================================ 6. ตรวจสลิป */
console.log('\n6. ตรวจสลิปแล้วทำเครื่องหมายว่าชำระแล้ว');
var s6 = start(FILL);
var no6 = s6.order({ vat: true });
var fid6 = s6.ctx.addSlip(no6, { data: PNG1, amount: 1000 }).fileId;
var head6 = s6.fx.sheets['ออเดอร์_หัวบิล'];
eq('ก่อนตรวจ ออเดอร์ยังไม่ชำระ', head6.cell(DATA_ROW, 17).v, 'รอชำระ');

var v6 = s6.ctx.setSlipStatus(fid6, 'ยืนยันแล้ว', 'เช็คยอดในแอปธนาคารแล้ว', true);
eq('สลิปเปลี่ยนเป็นยืนยันแล้ว', v6.status, 'ยืนยันแล้ว');
eq('และออเดอร์กลายเป็นชำระแล้วในคราวเดียว', head6.cell(DATA_ROW, 17).v, 'ชำระแล้ว');
truthy('จดชื่อคนตรวจไว้', v6.slips[0].checkBy.indexOf('@') > 0);

console.log('\n   ยืนยันโดยไม่สั่งให้เปลี่ยนสถานะออเดอร์ ต้องไม่ไปแตะออเดอร์');
var s6b = start(FILL);
var no6b = s6b.order({ vat: true });
var fid6b = s6b.ctx.addSlip(no6b, { data: PNG1 }).fileId;
s6b.ctx.setSlipStatus(fid6b, 'ยืนยันแล้ว', '', false);
eq('ออเดอร์ยังเป็นรอชำระ', s6b.fx.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, 17).v, 'รอชำระ');

console.log('\n   สลิปที่แนบผิดใบ ให้เปลี่ยนสถานะ ไม่ใช่ลบแถว');
var s6c = start(FILL);
var no6c = s6c.order({ vat: true });
var fid6c = s6c.ctx.addSlip(no6c, { data: PNG1 }).fileId;
var bad6c = s6c.ctx.setSlipStatus(fid6c, 'ไม่ใช่ของใบนี้', 'ลูกค้าส่งสลิปของอีกร้าน', false);
eq('สถานะเปลี่ยน', bad6c.status, 'ไม่ใช่ของใบนี้');
eq('แถวยังอยู่ในชีท', s6c.fx.sheets['หลักฐานการชำระเงิน'].cell(DATA_ROW, 2).v, no6c);
throws('สถานะที่ไม่มีในรายการ ต้องไม่ยอมรับ',
  function () { s6c.ctx.setSlipStatus(fid6c, 'จ่ายแล้วมั้ง', '', false); }, 'มีให้เลือกแค่');

console.log('\n   ไม่ได้กรอกวันโอน ต้องเว้นว่าง ไม่ใช่เติมวันนี้ให้เงียบ ๆ');
var s6d = start(FILL);
var no6d = s6d.order({ vat: true });
s6d.ctx.addSlip(no6d, { data: PNG1 });
eq('ช่องวันที่โอนในชีทยังว่าง',
   s6d.fx.sheets['หลักฐานการชำระเงิน'].cell(DATA_ROW, 4).v, '');
s6d.ctx.addSlip(no6d, { data: PNG1, paidAt: '2026-09-10' });
truthy('กรอกมาก็เก็บตามที่กรอก',
   String(s6d.fx.sheets['หลักฐานการชำระเงิน'].cell(DATA_ROW + 1, 4).v).indexOf('2026') > -1);
throws('สลิปที่ไม่มีจริง', function () {
  s6c.ctx.setSlipStatus('file-ไม่มีจริง', 'ยืนยันแล้ว', '', false);
}, 'ไม่พบสลิป');

console.log('\n   ใบที่ยกเลิกไปแล้ว ห้ามเรียกเก็บเงินและห้ามแนบสลิป');
/* ของคืนสต๊อกไปแล้ว ยอดในใบไม่ใช่หนี้อีกต่อไป — ส่ง QR ไปคือไปเก็บเงินค่าของที่ลูกค้าไม่ได้รับ */
var s6e = start(FILL);
var no6e = s6e.order({ vat: true });
s6e.ctx.cancelOrder(no6e, 'ลูกค้าเปลี่ยนใจก่อนแพ็ค', 'แอดมิน', 'cx-' + Math.random());
throws('ขอ QR ไม่ได้', function () { s6e.ctx.payAsk(no6e); }, 'เรียกเก็บเงินไม่ได้');
throws('แนบสลิปไม่ได้', function () { s6e.ctx.addSlip(no6e, { data: PNG1 }); }, 'แนบสลิปเข้าใบนี้ไม่ได้');

/* ============================================ 7. ป้ายเตือนสลิปที่ยังไม่ตรวจ */
console.log('\n7. สลิปที่ยังไม่มีใครตรวจ');
var s7 = start(FILL);
var a7 = s7.order({ vat: true }), b7 = s7.order({ vat: false });
s7.ctx.addSlip(a7, { data: PNG1 });
s7.ctx.addSlip(a7, { data: PNG1 });
var fidB7 = s7.ctx.addSlip(b7, { data: PNG1 }).fileId;
var w7 = s7.ctx.slipsWaiting();
eq('นับรวมได้สามใบ', w7.total, 3);
eq('แยกตามออเดอร์ถูก', [w7.byOrder[a7], w7.byOrder[b7]], [2, 1]);
s7.ctx.setSlipStatus(fidB7, 'ยืนยันแล้ว', '', false);
var w7b = s7.ctx.slipsWaiting();
eq('ตรวจไปแล้วต้องหลุดออกจากรายการรอ', w7b.total, 2);
eq('และออเดอร์ที่ไม่เหลือใบรอ ต้องไม่มีป้าย', w7b.byOrder[b7], undefined);

/* ============================================ 8. ไม่แตะช่องสูตร */
console.log('\n8. ไม่มีช่องสูตรถูกเขียนทับแม้แต่ช่องเดียว');
function hurt(fx) {
  var out = [];
  for (var n in fx.sheets) out = out.concat(fx.sheets[n].overwrittenFormulas);
  return out;
}
eq('ทั้งชุดที่ผ่านมา', hurt(s7.fx), []);
eq('รวมชุดที่แนบสลิปหลายใบด้วย', hurt(s5.fx), []);
eq('และชุดที่ตรวจสลิปแล้วเปลี่ยนสถานะออเดอร์', hurt(s6.fx), []);

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
