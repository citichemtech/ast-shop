/*
 * หน้าร้านที่ลูกค้าเปิดเอง — ด่านเดียวที่กั้นคนนอกคือ "ไม่มีอีเมล"
 *
 *   node tools/t_shop.js
 *
 * ลิงก์หน้าร้านเป็น deploy ที่รันในนามเจ้าของร้าน ใครเปิดก็ได้ ไม่ต้องล็อกอิน
 * แปลว่าโค้ดทุกบรรทัดในโปรเจกต์รันด้วยสิทธิ์เต็มของเจ้าของ ข้อสอบชุดนี้จึงคุมสองอย่าง
 *
 *   1. ลูกค้าเรียก shopData() ได้ และได้เฉพาะช่องที่ควรเห็น
 *      ห้ามมีต้นทุน กำไร หรือยอดคงเหลือหลุดไปแม้แต่ช่องเดียว
 *   2. ลูกค้าเรียกฟังก์ชันฝั่งพนักงาน "ไม่ได้" สักตัว
 *
 * ข้อ 2 สำคัญกว่าข้อ 1 เพราะถ้าพลาด ลูกค้าคนหนึ่งลบออเดอร์ทั้งชีทได้จากเบราว์เซอร์ตัวเอง
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
    (msg === null ? 'ไม่ได้ error เลย' : 'error: ' + String(msg).slice(0, 80)));
}

/* พนักงานเตรียมชีทให้พร้อมก่อน แล้วค่อยจำลองลูกค้าเปิดลิงก์เดียวกัน */
function shopFixture(mode) {
  var fx = FS.build();
  var staff = FS.load(fx, {});
  staff.setup();
  staff.setupShopColumns();
  /* ค่าเริ่มต้นของระบบคือ "เข้าคิวก่อน" — ข้อสอบชุดที่สอบเส้นทางออเดอร์จริง
     ต้องสลับเป็น "เข้าชีทเลย" ก่อน ไม่งั้นได้เลขคำขอแทนเลขออเดอร์ */
  if (mode === 'direct') {
    var app = fx.sheets['ตั้งค่าแอป'];
    for (var r = DATA_ROW; r <= app.getMaxRows(); r++) {
      if (String(app.cell(r, 1).v || '').trim() === 'ออเดอร์จากเว็บ') {
        app.cell(r, 2).v = 'เข้าชีทเลย';
        break;
      }
    }
  }
  /* ลูกค้า = ไม่มีอีเมล เพราะ deploy ตัวสาธารณะรันในนามเจ้าของ
     Session.getActiveUser() จึงคืนค่าว่างให้คนที่ไม่ได้ล็อกอิน */
  var guest = FS.load(fx, { email: '' });
  return { fx: fx, staff: staff, guest: guest, prod: fx.sheets['ฐานสินค้า'] };
}

/* ============================================ 1. ลูกค้าเปิดหน้าร้านได้ */
console.log('\n1. ลูกค้าที่ไม่ได้ล็อกอิน เปิดหน้าร้านได้');
var s1 = shopFixture();
var d1 = s1.guest.shopData();
truthy('เรียก shopData ได้โดยไม่ต้องล็อกอิน', d1.ok === true);
truthy('ได้รายการสินค้ามาด้วย', d1.items.length > 0);
truthy('ได้ชื่อร้าน', !!d1.shop.name);
truthy('ร้านเปิดรับออเดอร์อยู่', d1.open === true);

/* ============================================ 2. ห้ามมีข้อมูลภายในหลุด */
console.log('\n2. ข้อมูลที่ห้ามหลุดไปถึงลูกค้า');
var raw2 = JSON.stringify(d1);
var it2 = d1.items[0];
eq('ช่องในรายการสินค้ามีเท่าที่ตั้งใจ', Object.keys(it2).sort(),
   ['group', 'img', 'name', 'out', 'perPack', 'price', 'sku', 'unit']);
truthy('ไม่มีคำว่า cost ในคำตอบ', raw2.indexOf('"cost"') < 0);
truthy('ไม่มีคำว่า remain ในคำตอบ', raw2.indexOf('"remain"') < 0);
truthy('ไม่มีเลขแถวของชีทติดไปด้วย', raw2.indexOf('"row"') < 0);
truthy('ไม่มีจุดสั่งซื้อซ้ำติดไปด้วย', raw2.indexOf('"reorder"') < 0);
/* ของหมดต้องเป็นแค่ใช่/ไม่ใช่ ไม่ใช่ตัวเลข ไม่งั้นคู่แข่งนับยอดขายรายเดือนได้ */
truthy('สถานะของหมดเป็น true/false ไม่ใช่จำนวน', typeof it2.out === 'boolean');

/* ============================================ 3. ซ่อนสินค้าที่ไม่อยากขายหน้าเว็บ */
console.log('\n3. ช่อง "ขายหน้าเว็บ" — เว้นว่างคือขาย พิมพ์ "ไม่" คือซ่อน');
var s3 = shopFixture();
var before3 = s3.guest.shopData().items.length;
var sku3 = s3.guest.shopData().items[0].sku;
/* หาแถวของสินค้าตัวแรกแล้วปิดขายหน้าเว็บ */
var prodSheet = s3.prod, row3 = 0;
for (var r = DATA_ROW; r <= prodSheet.getMaxRows(); r++) {
  if (String(prodSheet.cell(r, 2).v || '').trim() === sku3) { row3 = r; break; }
}
truthy('หาแถวของสินค้าเจอ', row3 > 0);
prodSheet.cell(row3, 14).v = 'ไม่';
var after3 = s3.guest.shopData().items;
eq('สินค้าหายไปหนึ่งตัว', after3.length, before3 - 1);
truthy('และตัวที่ปิดไม่โผล่แล้ว', after3.every(function (x) { return x.sku !== sku3 }));
prodSheet.cell(row3, 14).v = '';
eq('ลบคำว่า "ไม่" ออก แล้วกลับมาขายเหมือนเดิม', s3.guest.shopData().items.length, before3);

/* ============================================ 4. สวิตช์ปิดร้าน */
console.log('\n4. สวิตช์ปิดรับออเดอร์หน้าเว็บ');
var s4 = shopFixture();
var app4 = s4.fx.sheets['ตั้งค่าแอป'];
var row4 = 0;
for (var r4 = DATA_ROW; r4 <= app4.getMaxRows(); r4++) {
  if (String(app4.cell(r4, 1).v || '').trim() === 'เปิดรับออเดอร์หน้าเว็บ') { row4 = r4; break; }
}
truthy('setupShopColumns เพิ่มสวิตช์ให้แล้ว', row4 > 0);
app4.cell(row4, 2).v = 'ปิด';
eq('พิมพ์ "ปิด" แล้วหน้าร้านรู้ว่าปิด', s4.guest.shopData().open, false);
/* ปิดร้านแล้วยังดูสินค้าได้ ห้ามซ่อนของหาย ลูกค้าจะได้รู้ว่าร้านมีอะไรบ้าง */
truthy('แต่ยังดูสินค้าได้อยู่', s4.guest.shopData().items.length > 0);

/* ============================================ 5. ด่านพนักงาน */
console.log('\n5. ลูกค้าเรียกของฝั่งพนักงานไม่ได้สักตัว');
var s5 = shopFixture();
var g5 = s5.guest;
var GATED = ['getOrders', 'createOrder', 'setTracking', 'issueDoc', 'previewDoc', 'getDoc',
  'emailDoc', 'checkProductLinks', 'fixProductLinks', 'growProducts', 'setupShopColumns'];
GATED.forEach(function (fn) {
  if (typeof g5[fn] !== 'function') { fails++; console.log('  FAIL ไม่เจอฟังก์ชัน ' + fn); return; }
  throws('ลูกค้าเรียก ' + fn + ' ไม่ได้', function () { g5[fn]({}); }, 'ระบบไม่ทราบว่าคุณเป็นใคร');
});

/* ============================================ 6. พนักงานยังทำงานได้ตามเดิม */
console.log('\n6. ของเดิมฝั่งพนักงานต้องไม่พังเพราะคอลัมน์ใหม่');
var s6 = shopFixture();
var prods6 = s6.staff.getProducts ? s6.staff.getProducts() : null;
truthy('พนักงานยังอ่านสินค้าได้', !prods6 || prods6.length > 0);
var made6 = s6.staff.createOrder({
  clientKey: 'shop-t6', date: '2026-09-19', channel: 'เพจ Facebook',
  cust: 'ลูกค้าทดสอบ', tel: '0812345678', addr: 'ที่อยู่ทดสอบ 1',
  carrier: 'Flash Express', vat: false, discount: 0, ship: 50, status: 'รอชำระ',
  items: [{ sku: 'SKU-141', qty: 1, price: 129 }]
});
truthy('พนักงานยังคีย์ออเดอร์ได้', !!made6.no);
eq('ไม่มีช่องสูตรถูกเขียนทับ', made6.overwrittenFormulas || [], []);

/* ============================================ 7. สั่งซ้ำได้ไม่พัง */
console.log('\n7. สั่ง setupShopColumns ซ้ำ');
var s7 = shopFixture();
var again7 = s7.staff.setupShopColumns();
truthy('สั่งซ้ำแล้วบอกว่ามีอยู่แล้ว', again7.indexOf('อยู่แล้ว') > -1);
eq('จำนวนสินค้าไม่เปลี่ยน', s7.guest.shopData().items.length, s1.guest.shopData().items.length);

/* ============================================ 8. ลูกค้าสั่งซื้อเอง */
console.log('\n8. ลูกค้ากดสั่งซื้อจากหน้าร้าน');
var s8 = shopFixture('direct');
var shelf8 = s8.guest.shopData().items;
var buy = function (o) {
  o = o || {};
  return s8.guest.shopOrder({
    clientKey: o.key || ('web-' + Math.random()),
    cust: o.cust === undefined ? 'มานี ใจดี' : o.cust,
    tel: o.tel === undefined ? '0812345678' : o.tel,
    addr: o.addr === undefined ? '99/9 ถ.ตัวอย่าง ต.เนินพระ อ.เมือง จ.ระยอง 21000' : o.addr,
    note: o.note || '',
    items: o.items || [{ sku: shelf8[0].sku, qty: 2 }]
  });
};
var r8 = buy();
truthy('สั่งได้ ได้เลขออเดอร์กลับมา', /^AST-/.test(r8.no));
truthy('ได้ยอดสุทธิกลับมา', r8.net > 0);

/* ยอดต้องเท่ากับ ราคาในชีท x จำนวน + ค่าส่ง */
var want8 = shelf8[0].price * 2 + 50;
eq('ยอดตรงกับราคาในชีทบวกค่าส่ง', r8.net, want8);

/* ============================================ 9. โกงราคาไม่ได้ */
console.log('\n9. ส่งราคาปลอมมาจากเบราว์เซอร์');
var s9 = shopFixture('direct');
var shelf9 = s9.guest.shopData().items;
var r9 = s9.guest.shopOrder({
  clientKey: 'web-cheat', cust: 'คนโกง ราคา', tel: '0812345678',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
  /* แนบราคา 1 บาทมาด้วย ระบบต้องไม่สนใจ */
  items: [{ sku: shelf9[0].sku, qty: 1, price: 1, free: 1, name: 'ของปลอม', cost: 0 }]
});
eq('ระบบใช้ราคาจากชีท ไม่ใช่ราคาที่ส่งมา', r9.net, shelf9[0].price + 50);
eq('ไม่มีสินค้าปลอมโผล่ในฐานสินค้า', s9.guest.shopData().items.length, shelf9.length);

/* ============================================ 10. ด่านตรวจข้อมูลลูกค้า */
console.log('\n10. กรอกไม่ครบต้องไม่ผ่าน');
throws('ไม่ใส่ชื่อ', function () { buy({ cust: '' }) }, 'ชื่อผู้รับ');
throws('เบอร์ผิด', function () { buy({ tel: '123' }) }, 'เบอร์โทร');
throws('ที่อยู่สั้นเกิน', function () { buy({ addr: 'บ้าน' }) }, 'ที่อยู่');
throws('ไม่เลือกสินค้า', function () { buy({ items: [] }) }, 'ยังไม่ได้เลือกสินค้า');
throws('รหัสสินค้าที่ไม่มีขาย', function () { buy({ items: [{ sku: 'SKU-ไม่มีจริง', qty: 1 }] }) },
  'ไม่มีขายแล้ว');
throws('จำนวนติดลบ', function () { buy({ items: [{ sku: shelf8[0].sku, qty: -3 }] }) }, 'จำนวน');
throws('จำนวนเป็นเศษ', function () { buy({ items: [{ sku: shelf8[0].sku, qty: 1.5 }] }) }, 'จำนวน');
throws('สั่งทีเดียวเป็นพันชิ้น', function () { buy({ items: [{ sku: shelf8[0].sku, qty: 5000 }] }) },
  'จำนวน');
var many = [];
for (var m = 0; m < 31; m++) many.push({ sku: shelf8[0].sku, qty: 1 });
throws('บรรทัดเกินเพดาน', function () { buy({ items: many }) }, 'ไม่เกิน');

/* ============================================ 11. สินค้าที่ปิดขาย สั่งไม่ได้ */
console.log('\n11. ของที่ซ่อนจากหน้าร้าน ต้องสั่งไม่ได้');
var s11 = shopFixture();
var shelf11 = s11.guest.shopData().items;
var hide = shelf11[0].sku, prod11 = s11.fx.sheets['ฐานสินค้า'], row11 = 0;
for (var r11 = DATA_ROW; r11 <= prod11.getMaxRows(); r11++) {
  if (String(prod11.cell(r11, 2).v || '').trim() === hide) { row11 = r11; break; }
}
prod11.cell(row11, 14).v = 'ไม่';
throws('ปิดขายแล้วสั่งไม่ได้', function () {
  s11.guest.shopOrder({
    clientKey: 'web-hidden', cust: 'มานี ใจดี', tel: '0812345678',
    addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
    items: [{ sku: hide, qty: 1 }]
  });
}, 'ไม่มีขายแล้ว');

/* ============================================ 12. ร้านปิด สั่งไม่ได้ */
console.log('\n12. ปิดรับออเดอร์แล้วสั่งไม่ได้');
var s12 = shopFixture();
var app12 = s12.fx.sheets['ตั้งค่าแอป'], row12 = 0;
for (var r12 = DATA_ROW; r12 <= app12.getMaxRows(); r12++) {
  if (String(app12.cell(r12, 1).v || '').trim() === 'เปิดรับออเดอร์หน้าเว็บ') { row12 = r12; break; }
}
app12.cell(row12, 2).v = 'ปิด';
throws('ร้านปิดแล้วสั่งไม่ได้', function () {
  s12.guest.shopOrder({
    clientKey: 'web-closed', cust: 'มานี ใจดี', tel: '0812345678',
    addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
    items: [{ sku: s12.guest.shopData().items[0].sku, qty: 1 }]
  });
}, 'ปิดรับออเดอร์');

/* ============================================ 13. กดซ้ำไม่ได้สองใบ */
console.log('\n13. ลูกค้ากดสั่งซ้ำตอนเน็ตช้า');
var s13 = shopFixture('direct');
var sku13 = s13.guest.shopData().items[0].sku;
var pay13 = {
  clientKey: 'web-same-key', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
  items: [{ sku: sku13, qty: 1 }]
};
var a13 = s13.guest.shopOrder(pay13);
var b13 = s13.guest.shopOrder(pay13);
eq('กดสองครั้งได้เลขเดิม', b13.no, a13.no);
truthy('และบอกว่าเป็นใบซ้ำ', b13.duplicate === true);

/* ============================================ 14. ออเดอร์เข้าชีทจริง */
console.log('\n14. ออเดอร์ที่ลูกค้าสั่ง ต้องเข้าชีทเหมือนพนักงานคีย์');
var s14 = shopFixture('direct');
var sku14 = s14.guest.shopData().items[0].sku;
var r14 = s14.guest.shopOrder({
  clientKey: 'web-sheet', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
  note: 'ฝากส่งเร็วหน่อย', items: [{ sku: sku14, qty: 3 }]
});
var head14 = s14.fx.sheets['ออเดอร์_หัวบิล'];
eq('เลขออเดอร์อยู่ในหัวบิล', String(head14.cell(DATA_ROW, 1).v), r14.no);
eq('ชื่อลูกค้าเข้าชีท', String(head14.cell(DATA_ROW, 4).v), 'มานี ใจดี');
eq('เบอร์เก็บครบ ศูนย์หน้าไม่หาย', String(head14.cell(DATA_ROW, 5).v), '0812345678');
truthy('หมายเหตุบอกว่ามาจากหน้าเว็บ',
  String(head14.cell(DATA_ROW, 20).v).indexOf('สั่งจากหน้าเว็บ') > -1);
truthy('และเก็บข้อความที่ลูกค้าฝากไว้ด้วย',
  String(head14.cell(DATA_ROW, 20).v).indexOf('ฝากส่งเร็วหน่อย') > -1);
/* พนักงานต้องเห็นออเดอร์นี้ในระบบเหมือนใบที่ตัวเองคีย์ */
var seen14 = s14.staff.getOrders(20).filter(function (o) { return o.no === r14.no });
eq('พนักงานเห็นออเดอร์ใบนี้', seen14.length, 1);

/* ============================================ 15. โหมดเข้าคิวก่อน */
console.log('\n15. โหมด "เข้าคิวก่อน" — ค่าเริ่มต้นของระบบ');
function queueFixture() {
  var f = shopFixture();
  /* ค่าเริ่มต้นคือเข้าคิวอยู่แล้ว ไม่ต้องตั้งอะไร */
  return f;
}
var s15 = queueFixture();
var sku15 = s15.guest.shopData().items[0].sku;
var q15 = s15.guest.shopOrder({
  clientKey: 'q-1', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '99/9 ถ.ตัวอย่าง ต.เนินพระ อ.เมือง จ.ระยอง 21000',
  note: 'ขอใบกำกับภาษี', items: [{ sku: sku15, qty: 2 }]
});
truthy('ได้เลขคำขอ ไม่ใช่เลขออเดอร์', /^REQ-/.test(q15.no));
truthy('บอกว่าเข้าคิวแล้ว', q15.queued === true);
eq('บอกยอดประเมินให้ลูกค้า', q15.net, s15.guest.shopData().items[0].price * 2 + 50);
eq('ยังไม่มีลิงก์จ่ายเงิน เพราะยอดยังไม่นิ่ง', q15.payUrl, '');

/* ยังไม่ใช่ออเดอร์ — หัวบิลต้องยังว่าง สต๊อกต้องยังไม่ถูกตัด */
var head15 = s15.fx.sheets['ออเดอร์_หัวบิล'];
eq('ยังไม่มีออเดอร์ในชีทหัวบิล', String(head15.cell(DATA_ROW, 1).v || ''), '');
eq('พนักงานยังไม่เห็นเป็นออเดอร์', s15.staff.getOrders(20).length, 0);

/* แต่ต้องอยู่ในคิวให้พนักงานเห็น */
var reqs15 = s15.staff.getRequests(20);
eq('พนักงานเห็นคำขอหนึ่งใบ', reqs15.length, 1);
eq('เลขคำขอตรงกัน', reqs15[0].no, q15.no);
eq('ชื่อลูกค้าครบ', reqs15[0].cust, 'มานี ใจดี');
eq('เบอร์ครบ ศูนย์หน้าไม่หาย', reqs15[0].tel, '0812345678');
eq('สถานะเริ่มต้นคือใหม่', reqs15[0].status, 'ใหม่');
eq('แกะรายการสินค้ากลับมาได้', reqs15[0].items, [{ sku: sku15, qty: 2 }]);
truthy('มีชื่อสินค้าให้อ่านด้วย', reqs15[0].names.indexOf('x2') > -1);

/* ============================================ 16. พนักงานกดรับเป็นออเดอร์ */
console.log('\n16. พนักงานกดรับคำขอเป็นออเดอร์');
var got16 = s15.staff.acceptRequest({ no: q15.no, carrier: 'Flash Express' });
truthy('ได้เลขออเดอร์จริง', /^AST-/.test(got16.no));
eq('ยอดเท่ากับที่ประเมินไว้', got16.net, q15.net);
eq('ตอนนี้พนักงานเห็นเป็นออเดอร์แล้ว', s15.staff.getOrders(20).length, 1);
var after16 = s15.staff.getRequests(20)[0];
eq('คำขอเปลี่ยนสถานะเป็นรับแล้ว', after16.status, 'รับแล้ว');
eq('และผูกกับเลขออเดอร์ไว้', after16.orderNo, got16.no);
truthy('หมายเหตุออเดอร์อ้างเลขคำขอ',
  String(s15.fx.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, 20).v).indexOf(q15.no) > -1);
throws('กดรับซ้ำไม่ได้', function () { s15.staff.acceptRequest({ no: q15.no }) }, 'ไปแล้ว');

/* ============================================ 17. ไม่รับคำขอ */
console.log('\n17. พนักงานไม่รับคำขอ');
var s17 = queueFixture();
var sku17 = s17.guest.shopData().items[0].sku;
var q17 = s17.guest.shopOrder({
  clientKey: 'q-2', cust: 'มานะ ใจกล้า', tel: '0899999999',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000', items: [{ sku: sku17, qty: 1 }]
});
throws('ไม่ใส่เหตุผลไม่ได้', function () { s17.staff.rejectRequest(q17.no, '') }, 'เหตุผล');
s17.staff.rejectRequest(q17.no, 'ลูกค้าแจ้งยกเลิกทางไลน์');
eq('สถานะเป็นไม่รับ', s17.staff.getRequests(20)[0].status, 'ไม่รับ');
eq('และไม่กลายเป็นออเดอร์', s17.staff.getOrders(20).length, 0);

/* ============================================ 18. สลับเป็นเข้าชีทเลย */
console.log('\n18. สลับโหมดเป็น "เข้าชีทเลย"');
var s18 = shopFixture();
var app18 = s18.fx.sheets['ตั้งค่าแอป'], row18 = 0;
for (var r18 = DATA_ROW; r18 <= app18.getMaxRows(); r18++) {
  if (String(app18.cell(r18, 1).v || '').trim() === 'ออเดอร์จากเว็บ') { row18 = r18; break; }
}
truthy('setupShopColumns เพิ่มสวิตช์เลือกโหมดให้แล้ว', row18 > 0);
app18.cell(row18, 2).v = 'เข้าชีทเลย';
var sku18 = s18.guest.shopData().items[0].sku;
var r18 = s18.guest.shopOrder({
  clientKey: 'q-3', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000', items: [{ sku: sku18, qty: 1 }]
});
truthy('ได้เลขออเดอร์เลย ไม่ผ่านคิว', /^AST-/.test(r18.no));
truthy('ไม่ได้บอกว่าเข้าคิว', !r18.queued);
eq('เข้าชีทหัวบิลทันที', s18.staff.getOrders(20).length, 1);
eq('และไม่มีอะไรค้างในคิว', s18.staff.getRequests(20).length, 0);
/* สลับกลับ */
app18.cell(row18, 2).v = 'เข้าคิวก่อน';
var r18b = s18.guest.shopOrder({
  clientKey: 'q-4', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000', items: [{ sku: sku18, qty: 1 }]
});
truthy('สลับกลับแล้วเข้าคิวเหมือนเดิม', /^REQ-/.test(r18b.no));

/* ============================================ 19. ลูกค้าแตะคิวไม่ได้ */
console.log('\n19. ลูกค้าเรียกของฝั่งคิวไม่ได้');
var g19 = shopFixture().guest;
['getRequests', 'acceptRequest', 'rejectRequest'].forEach(function (fn) {
  throws('ลูกค้าเรียก ' + fn + ' ไม่ได้', function () { g19[fn]({}) }, 'ระบบไม่ทราบว่าคุณเป็นใคร');
});

/* ============================================ 20. ลิงก์หน้าร้านต้องไม่จู้จี้ */
console.log('\n20. ?shop=1 ต้องรับได้ทุกแบบที่คนพิมพ์จริง');
var g20 = shopFixture().guest;
[['shop', '1'], ['Shop', '1'], ['SHOP', '1'], ['shop', 'true'], ['shop', 'yes'], ['ShOp', '']]
  .forEach(function (pair) {
    var e = { parameter: {} };
    e.parameter[pair[0]] = pair[1];
    truthy('?' + pair[0] + '=' + pair[1] + ' ได้หน้าร้าน', g20.wantShop_(e) === true);
  });
[['shop', '0'], ['shop', 'false'], ['shop', 'no']].forEach(function (pair) {
  var e = { parameter: {} };
  e.parameter[pair[0]] = pair[1];
  truthy('?' + pair[0] + '=' + pair[1] + ' ไม่เอาหน้าร้าน', g20.wantShop_(e) === false);
});
truthy('ไม่มีพารามิเตอร์เลย = ไม่ใช่หน้าร้าน', g20.wantShop_({ parameter: {} }) === false);
truthy('พารามิเตอร์อื่นไม่หลอกให้เปิดหน้าร้าน',
  g20.wantShop_({ parameter: { p: 'abc', workshop: '1' } }) === false);

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
