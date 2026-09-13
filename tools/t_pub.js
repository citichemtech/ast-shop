/*
 * ลิงก์ชำระเงินที่ส่งให้ลูกค้า — ด่านเดียวที่กั้นคนนอกคือกุญแจในลิงก์
 *
 *   node tools/t_pub.js
 *
 * ไฟล์นี้สอบสิ่งเดียว: คนที่ถือลิงก์ของออเดอร์ใบหนึ่ง ต้องทำอะไรได้บ้าง
 * และที่สำคัญกว่า — ต้องทำอะไร "ไม่ได้" บ้าง
 *
 * ทุกฟังก์ชันฝั่งลูกค้าทำงานในนามเจ้าของร้าน (Google บังคับ ถ้าจะให้คน
 * ไม่มีบัญชีเปิดได้) จึงเขียนชีทได้เต็มมือ ข้อสอบชุดนี้คือสิ่งเดียวที่ยืนยัน
 * ว่ามันไม่ได้ทำเกินกว่าที่ตั้งใจ
 */
'use strict';
var FS = require('./fakesheet');
var DATA_ROW = FS.DATA_ROW;

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
    (msg === null ? 'ไม่ได้ error เลย' : 'error: ' + msg.slice(0, 90)));
  return msg;
}

var PNG1 = 'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

var FILL = {
  'ธนาคารที่รับเงิน บิลมี VAT': 'ไทยพาณิชย์ (SCB)',
  'ชื่อบัญชี บิลมี VAT': 'บริษัท ทดสอบ จำกัด',
  'เลขบัญชี บิลมี VAT': '431-039435-5',
  'ธนาคารที่รับเงิน บิลไม่มี VAT': 'กรุงศรีอยุธยา',
  'ชื่อบัญชี บิลไม่มี VAT': 'ทดสอบ ทดสอบ',
  'เลขบัญชี บิลไม่มี VAT': '511-1467527',
  'ลิงก์เว็บแอปสำหรับลูกค้า': 'https://script.google.com/macros/s/AKfyTEST/exec'
};

function start(fill) {
  var fx = FS.build();
  var ctx = FS.load(fx, {});
  ctx.setup();
  var app = fx.sheets['ตั้งค่าแอป'];
  var use = fill === undefined ? FILL : fill;
  if (use) {
    for (var r = DATA_ROW; r <= app.getMaxRows(); r++) {
      var k = String(app.cell(r, 1).v || '').trim();
      if (Object.prototype.hasOwnProperty.call(use, k)) app.cell(r, 2).v = use[k];
    }
  }
  function order(o) {
    o = o || {};
    return ctx.createOrder({
      clientKey: 'pub-' + Math.random(),
      date: '2026-09-13', channel: 'เพจ Facebook',
      cust: o.cust || 'ธนธรณ์ พุ่มสาลี',
      tel: '0812345678', addr: '51/45 หมู่บ้านทดสอบ ลาดกระบัง กรุงเทพมหานคร 10520',
      carrier: 'Flash Express', vat: !!o.vat, discount: 0, ship: 50,
      status: o.status || 'รอชำระ',
      items: [{ sku: 'SKU-141', qty: 2, price: 129 }]
    }).no;
  }
  return { fx: fx, ctx: ctx, app: app, order: order };
}

/* ================================================== 1. ออกลิงก์ฝั่งพนักงาน */
console.log('\n1. พนักงานขอลิงก์ของออเดอร์');
var s1 = start();
var no1 = s1.order({ vat: true });
var L1 = s1.ctx.payLink(no1);
truthy('ได้ลิงก์เต็มพร้อมกุญแจ', /^https:\/\/script\.google\.com\/.*\?p=[0-9a-f]{32}$/.test(L1.url));
eq('กุญแจยาว 32 ตัว', L1.key.length, 32);
truthy('กุญแจเป็นเลขฐานสิบหกล้วน', /^[0-9a-f]{32}$/.test(L1.key));
eq('บอกยอดที่ต้องเก็บมาด้วย', L1.net, s1.ctx.payAsk(no1).net);
eq('ยังไม่มีใครเปิด', L1.opened, 0);

console.log('\n   กดขอลิงก์ซ้ำ ต้องได้ใบเดิม ไม่ใช่ออกใหม่ทับของที่ส่งไปแล้ว');
var L1b = s1.ctx.payLink(no1);
eq('กุญแจเดิม', L1b.key, L1.key);
function linkRows(fx) {
  var sh = fx.sheets['ลิงก์ชำระเงิน'], n = 0;
  for (var r = DATA_ROW; r <= sh.getMaxRows(); r++) {
    if (String(sh.cell(r, 2).v || '').trim()) n++;
  }
  return n;
}
eq('และมีแถวในทะเบียนแค่แถวเดียว', linkRows(s1.fx), 1);

console.log('\n   ออเดอร์คนละใบต้องคนละกุญแจ');
var no1c = s1.order({ vat: false });
truthy('กุญแจไม่ซ้ำกัน', s1.ctx.payLink(no1c).key !== L1.key);

console.log('\n   ยังไม่ได้กรอกลิงก์เว็บแอปในชีท ต้องบอก ไม่ใช่เดา URL เอง');
var s1d = start({});
var no1d = s1d.order({ vat: true });
var L1d = s1d.ctx.payLink(no1d);
eq('ไม่ส่ง URL ที่เดาเอาเองออกไป', L1d.url, '');
truthy('บอกว่าต้องไปกรอกช่องไหน', L1d.why.indexOf('ลิงก์เว็บแอปสำหรับลูกค้า') > -1);
truthy('แต่ยังออกกุญแจให้ เผื่อกรอกลิงก์ทีหลังแล้วใช้ต่อได้เลย', /^[0-9a-f]{32}$/.test(L1d.key));

/* ================================================== 2. ลูกค้าเปิดลิงก์ */
console.log('\n2. ลูกค้าเปิดลิงก์');
var got1 = s1.ctx.pubOrder(L1.key);
eq('เห็นเลขออเดอร์ของตัวเอง', got1.ord.no, no1);
eq('เห็นยอดที่ต้องโอน', got1.ord.net, L1.net);
eq('เห็นรายการสินค้าครบ', got1.ord.items.length, 1);
eq('บัญชีที่ให้โอนคือฝั่งมี VAT', got1.acct.acct, '431-039435-5');
eq('ใบไม่มี VAT ต้องได้อีกบัญชี', s1.ctx.pubOrder(s1.ctx.payLink(no1c).key).acct.acct, '511-1467527');

console.log('\n   ของที่ห้ามหลุดไปถึงหน้าลูกค้า');
var flat = JSON.stringify(got1);
truthy('ไม่มีต้นทุน', flat.indexOf('"cost"') < 0);
truthy('ไม่มีกำไร', flat.indexOf('"profit"') < 0);
truthy('ไม่มีเบอร์โทรลูกค้า', flat.indexOf('0812345678') < 0);
truthy('ไม่มีลิงก์ไฟล์สลิปในไดรฟ์', flat.indexOf('drive.google.com') < 0);
/* ชื่อเต็มกับที่อยู่คือของที่เอาคืนไม่ได้ ถ้าลิงก์หลุดไปอยู่ในกลุ่มไลน์
   ปิดชื่อไว้บางส่วนก็ยังพอให้เจ้าตัวรู้ว่าใบนี้ของตัวเอง */
truthy('ชื่อลูกค้าถูกปิดบางส่วน', got1.ord.cust.indexOf('#') > -1);
truthy('แต่ยังขึ้นต้นด้วยตัวจริง เจ้าตัวดูออกว่าใบของตัวเอง',
  got1.ord.cust.indexOf('ธนธ') === 0);
truthy('ชื่อเต็มไม่โผล่ที่ไหนเลย', flat.indexOf('ธนธรณ์ พุ่มสาลี') < 0);

console.log('\n   ทะเบียนต้องจดว่าลูกค้าเปิดแล้ว — คำถามแรกเวลาลูกค้าเงียบ');
eq('นับจำนวนครั้งที่เปิด', s1.ctx.payLink(no1).opened, 1);
s1.ctx.pubOrder(L1.key);
eq('เปิดอีกครั้งก็นับเพิ่ม', s1.ctx.payLink(no1).opened, 2);

/* ================================================== 3. กุญแจผิด */
console.log('\n3. กุญแจผิดต้องไม่ผ่าน');
throws('กุญแจมั่ว', function () { s1.ctx.pubOrder('a'.repeat(32)); }, 'ใช้ไม่ได้');
throws('กุญแจว่าง', function () { s1.ctx.pubOrder(''); }, 'ใช้ไม่ได้');
throws('ส่งเลขออเดอร์มาแทนกุญแจ', function () { s1.ctx.pubOrder(no1); }, 'ใช้ไม่ได้');
/* เลขออเดอร์เดาได้ ใบถัดไปคือใบถัดไป ถ้าเดาแล้วเปิดได้ก็ไล่ดูได้ทั้งร้าน */
throws('กุญแจของใบอื่นต้องไม่เปิดใบนี้ได้', function () {
  var other = s1.ctx.pubOrder(s1.ctx.payLink(no1c).key);
  if (other.ord.no === no1) throw new Error('ok-cross');
  throw new Error('เปิดได้แต่เป็นคนละใบ (ถูกต้อง)');
}, 'คนละใบ');
throws('กุญแจสั้นกว่าที่ควร', function () { s1.ctx.pubOrder('abc'); }, 'ใช้ไม่ได้');

console.log('\n   ปิดลิงก์จากในชีทได้ทันที และต้องบอกลูกค้าคนละแบบกับกุญแจมั่ว');
var link = s1.fx.sheets['ลิงก์ชำระเงิน'];
var offRow = 0;
for (var r = DATA_ROW; r <= link.getMaxRows(); r++) {
  if (String(link.cell(r, 3).v || '') === L1.key) { offRow = r; break; }
}
truthy('หาแถวของกุญแจในชีทเจอ', offRow > 0);
link.cell(offRow, 9).v = 'ปิด';
throws('ลิงก์ที่ปิดแล้วเปิดไม่ได้', function () { s1.ctx.pubOrder(L1.key); }, 'ถูกปิดไปแล้ว');
console.log('\n   ปิดแล้วขอใหม่ ต้องได้กุญแจใหม่ ไม่ใช่ปลุกใบเก่ากลับมา');
var L1e = s1.ctx.payLink(no1);
truthy('กุญแจใหม่ไม่ใช่ตัวเดิม', L1e.key !== L1.key);
throws('และตัวเก่ายังปิดอยู่', function () { s1.ctx.pubOrder(L1.key); }, 'ถูกปิด');
eq('ของใหม่เปิดได้', s1.ctx.pubOrder(L1e.key).ord.no, no1);

/* ================================================== 4. ลูกค้าแนบสลิป */
console.log('\n4. ลูกค้าแนบสลิปแล้วกดแจ้งชำระเงิน');
var s4 = start();
var no4 = s4.order({ vat: true });
var K4 = s4.ctx.payLink(no4).key;
var up4 = s4.ctx.pubSlip(K4, { data: PNG1, paidAt: '2026-09-13', amount: 1795 });
eq('แนบสำเร็จ', up4.ok, true);
eq('สลิปขึ้นในทะเบียนของออเดอร์ใบนั้น', s4.ctx.listSlips(no4).length, 1);
eq('สถานะเป็นรอตรวจสอบ ไม่ใช่ปิดยอดให้เอง', s4.ctx.listSlips(no4)[0].status, 'รอตรวจสอบ');
truthy('บอกว่ามาจากลูกค้าเอง ไม่ใช่พนักงานแนบ',
  s4.ctx.listSlips(no4)[0].by.indexOf('ลูกค้า') > -1);
/* พนักงานเห็นสลิปตอนแนบเอง ใบที่ลูกค้าส่งมาไม่มีใครดูมาก่อน คนตรวจต้องรู้ */
eq('สถานะออเดอร์ยังไม่เปลี่ยน การรับเงินยังเป็นการตัดสินใจของคน',
  s4.ctx.getOrders(0).filter(function (o) { return o.no === no4 })[0].status, 'รอชำระ');
eq('เข้าคิวรอพนักงานยืนยัน', s4.ctx.slipsWaiting().byOrder[no4], 1);
truthy('ทะเบียนลิงก์จดเวลาที่ลูกค้าแจ้ง', !!s4.ctx.payLink(no4).told);

console.log('\n   ของที่ลิงก์ต้องทำไม่ได้');
throws('ไฟล์ชนิดที่ไม่ใช่รูปหรือ PDF', function () {
  s4.ctx.pubSlip(K4, { data: 'data:application/zip;base64,UEsDBA==' });
}, 'แนบไม่ได้');
throws('ไม่ได้แนบไฟล์มาเลย', function () { s4.ctx.pubSlip(K4, { amount: 100 }); }, 'ยังไม่ได้เลือกไฟล์');
throws('กุญแจผิดแนบไม่ได้', function () {
  s4.ctx.pubSlip('b'.repeat(32), { data: PNG1 });
}, 'ใช้ไม่ได้');

console.log('\n   ลิงก์ที่หลุดออกไปต้องทำอะไรได้จำกัด');
for (var k = 0; k < 4; k++) s4.ctx.pubSlip(K4, { data: PNG1 });
eq('ครบห้าใบแล้ว', s4.ctx.listSlips(no4).length, 5);
throws('ใบที่หกไม่ให้ส่ง', function () { s4.ctx.pubSlip(K4, { data: PNG1 }); }, 'ครบ 5 ใบ');

/* ================================================== 5. ใบที่ยกเลิกแล้ว */
console.log('\n5. ออเดอร์ที่ยกเลิกแล้ว ต้องไม่มีหน้าให้จ่ายเงิน');
var s5 = start();
var no5 = s5.order({ vat: true });
var K5 = s5.ctx.payLink(no5).key;
s5.ctx.cancelOrder(no5, 'ลูกค้าเปลี่ยนใจ', 'somchai@chem-inno-tech.com');
eq('เปิดลิงก์ได้ แต่บอกว่าใบถูกยกเลิก', s5.ctx.pubOrder(K5).dead, true);
throws('และแนบสลิปไม่ได้', function () { s5.ctx.pubSlip(K5, { data: PNG1 }); }, 'ยกเลิก');
/* เงินที่โอนเข้ามาหลังใบถูกยกเลิก คือเงินที่ร้านต้องตามคืน
   ซึ่งแพงกว่าการที่ลูกค้าเห็นว่าใบถูกยกเลิกไปแล้ว */
throws('และขอลิงก์ใหม่ให้ใบที่ตายแล้วไม่ได้',
  function () { s5.ctx.payLink(no5); }, 'ไม่ควรส่งลิงก์');

/* ================================================== 6. ยังไม่ได้กรอกบัญชี */
console.log('\n6. ยังไม่ได้กรอกเลขบัญชีในชีท ห้ามเดา ห้ามโชว์บัญชีอีกฝั่งแทน');
/* ฝั่งไม่มี VAT คือฝั่งที่ setup ไม่ได้เติมค่าตั้งต้นให้ (บัญชีส่วนตัวของเจ้าของร้าน
   ระบบไม่มีทางรู้) จึงเป็นฝั่งที่เกิดเรื่องนี้จริงในวันแรกที่เปิดใช้ */
var s6 = start({ 'ลิงก์เว็บแอปสำหรับลูกค้า': 'https://script.google.com/macros/s/AKfyTEST/exec',
  'ธนาคารที่รับเงิน บิลไม่มี VAT': '', 'ชื่อบัญชี บิลไม่มี VAT': '',
  'เลขบัญชี บิลไม่มี VAT': '' });
var no6 = s6.order({ vat: false });
var G6 = s6.ctx.pubOrder(s6.ctx.payLink(no6).key);
eq('ไม่มีบัญชีให้โอน ดีกว่าโอนผิดบัญชี', G6.acct, null);
eq('แต่ยังเห็นยอดกับรายการของตัวเอง', G6.ord.items.length, 1);

/* ================================================== 7. ไม่แตะช่องสูตร */
console.log('\n7. ไม่มีช่องสูตรถูกเขียนทับแม้แต่ช่องเดียว');
function hurt(fx) {
  var out = [];
  for (var n in fx.sheets) out = out.concat(fx.sheets[n].overwrittenFormulas);
  return out;
}
eq('ชุดที่ออกลิงก์และเปิดลิงก์', hurt(s1.fx), []);
eq('ชุดที่ลูกค้าแนบสลิปห้าใบ', hurt(s4.fx), []);
eq('ชุดที่ยกเลิกออเดอร์', hurt(s5.fx), []);

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
