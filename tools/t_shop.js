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

/* ข้อสอบชุด 21–23 แก้ค่าในชีทตรง ๆ แล้วอ่านหน้าร้านซ้ำทันที
   ของจริงหน้าร้านมีแคช 5 นาที คนที่ไปพิมพ์ในชีทเองจึงต้องรอถึงจะเห็นผล
   (แก้ผ่านโหมดแก้ไขในแอปล้างแคชให้เอง ไม่ต้องรอ)
   ข้อสอบพวกนี้สนใจว่าอ่านค่าถูกไหม ไม่ได้สนใจเรื่องแคช จึงล้างก่อนอ่านทุกครั้ง */
function shopSeeOn(ctx) {
  ctx.shopSee = function () { ctx.shopCacheBust_(); return ctx.shopData() };
  return ctx;
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
  var guest = shopSeeOn(FS.load(fx, { email: '' }));
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
   ['group', 'img', 'imgs', 'name', 'out', 'perPack', 'price', 'sku', 'tags', 'unit']);
truthy('ไม่มีคำว่า cost ในคำตอบ', raw2.indexOf('"cost"') < 0);
truthy('ไม่มีคำว่า remain ในคำตอบ', raw2.indexOf('"remain"') < 0);
truthy('ไม่มีเลขแถวของชีทติดไปด้วย', raw2.indexOf('"row"') < 0);
truthy('ไม่มีจุดสั่งซื้อซ้ำติดไปด้วย', raw2.indexOf('"reorder"') < 0);
/* ของหมดต้องเป็นแค่ใช่/ไม่ใช่ ไม่ใช่ตัวเลข ไม่งั้นคู่แข่งนับยอดขายรายเดือนได้ */
truthy('สถานะของหมดเป็น true/false ไม่ใช่จำนวน', typeof it2.out === 'boolean');

/* ============================================ 3. ซ่อนสินค้าที่ไม่อยากขายหน้าเว็บ */
console.log('\n3. ช่อง "ขายหน้าเว็บ" — เว้นว่างคือขาย พิมพ์ "ไม่" คือซ่อน');
var s3 = shopFixture();
var before3 = s3.guest.shopSee().items.length;
var sku3 = s3.guest.shopSee().items[0].sku;
/* หาแถวของสินค้าตัวแรกแล้วปิดขายหน้าเว็บ */
var prodSheet = s3.prod, row3 = 0;
for (var r = DATA_ROW; r <= prodSheet.getMaxRows(); r++) {
  if (String(prodSheet.cell(r, 2).v || '').trim() === sku3) { row3 = r; break; }
}
truthy('หาแถวของสินค้าเจอ', row3 > 0);
prodSheet.cell(row3, 14).v = 'ไม่';
var after3 = s3.guest.shopSee().items;
eq('สินค้าหายไปหนึ่งตัว', after3.length, before3 - 1);
truthy('และตัวที่ปิดไม่โผล่แล้ว', after3.every(function (x) { return x.sku !== sku3 }));
prodSheet.cell(row3, 14).v = '';
eq('ลบคำว่า "ไม่" ออก แล้วกลับมาขายเหมือนเดิม', s3.guest.shopSee().items.length, before3);

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

/* ============================================ 21. ลิงก์รูปสินค้า */
console.log('\n21. ลิงก์รูป — ต้องรับลิงก์แชร์ไดรฟ์ที่เจ้าของร้านก๊อปมาวางจริง');
var g21 = shopFixture().guest;
var THUMB = 'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUv&sz=w1000';
[
  ['https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing', THUMB],
  ['https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view', THUMB],
  ['https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUv', THUMB],
  ['https://drive.google.com/uc?export=view&id=1AbCdEfGhIjKlMnOpQrStUv', THUMB],
  ['  https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view  ', THUMB]
].forEach(function (pair) {
  eq('แปลง ' + pair[0].trim().slice(0, 46) + '…', g21.shopImg_(pair[0]), pair[1]);
});
eq('ลิงก์รูปธรรมดาปล่อยผ่าน',
   g21.shopImg_('https://example.com/a.jpg'), 'https://example.com/a.jpg');
eq('ลิงก์ googleusercontent ปล่อยผ่าน',
   g21.shopImg_('https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUv'),
   'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUv');
eq('รูปฝังมาแบบ data: ปล่อยผ่าน',
   g21.shopImg_('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
eq('ช่องว่างได้ค่าว่าง', g21.shopImg_(''), '');
eq('ข้อความมั่วได้ค่าว่าง ไม่ปล่อยให้รูปแตก', g21.shopImg_('รูปอยู่ในเครื่อง'), '');
eq('ลิงก์ http ธรรมดา (ไม่ใช่ https) ไม่รับ', g21.shopImg_('http://example.com/a.jpg'), '');

/* ต้องต่อถึงหน้าร้านจริง ไม่ใช่แค่ฟังก์ชันลอย ๆ */
var s21 = shopFixture();
var prod21 = s21.fx.sheets['ฐานสินค้า'];
var sku21 = s21.guest.shopSee().items[0].sku, row21 = 0;
for (var r21 = DATA_ROW; r21 <= prod21.getMaxRows(); r21++) {
  if (String(prod21.cell(r21, 2).v || '').trim() === sku21) { row21 = r21; break; }
}
prod21.cell(row21, 15).v = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing';
var got21 = s21.guest.shopSee().items.filter(function (x) { return x.sku === sku21 })[0];
eq('วางลิงก์ไดรฟ์ในชีทแล้วหน้าร้านได้ที่อยู่รูปจริง', got21.img, THUMB);
eq('รูปเดียวได้ชุดรูปยาวหนึ่ง', got21.imgs, [THUMB]);

/* ============================================ 22. รูปที่สอง (คอลัมน์ P) */
console.log('\n22. รูปสองรูปต่อสินค้า — ลูกค้ากดดูแล้วเลื่อนได้');
var THUMB2 = 'https://drive.google.com/thumbnail?id=2ZyXwVuTsRqPoNmLkJiHgF&sz=w1000';
prod21.cell(row21, 16).v = 'https://drive.google.com/file/d/2ZyXwVuTsRqPoNmLkJiHgF/view';
var got22 = s21.guest.shopSee().items.filter(function (x) { return x.sku === sku21 })[0];
eq('ได้รูปครบสองรูปตามลำดับคอลัมน์ O แล้ว P', got22.imgs, [THUMB, THUMB2]);
eq('รูปเล็กในตะกร้ายังเป็นรูปแรกเสมอ', got22.img, THUMB);

prod21.cell(row21, 15).v = '';
var got22b = s21.guest.shopSee().items.filter(function (x) { return x.sku === sku21 })[0];
eq('เว้นรูปแรกไว้ รูปที่สองเลื่อนขึ้นมาเป็นรูปหลัก ไม่มีช่องว่างคั่น',
   got22b.imgs, [THUMB2]);

prod21.cell(row21, 15).v = 'https://drive.google.com/file/d/2ZyXwVuTsRqPoNmLkJiHgF/view';
var got22c = s21.guest.shopSee().items.filter(function (x) { return x.sku === sku21 })[0];
eq('ก๊อปลิงก์เดียวกันลงสองช่อง ไม่โชว์ซ้ำสองรูป', got22c.imgs, [THUMB2]);

prod21.cell(row21, 16).v = 'ถ่ายไว้ในมือถือ';
var got22d = s21.guest.shopSee().items.filter(function (x) { return x.sku === sku21 })[0];
eq('รูปที่สองใส่มั่ว ตกไปเงียบ ๆ เหลือรูปเดียว ไม่ปล่อยรูปแตก', got22d.imgs, [THUMB2]);

prod21.cell(row21, 15).v = '';
prod21.cell(row21, 16).v = '';
var got22e = s21.guest.shopSee().items.filter(function (x) { return x.sku === sku21 })[0];
eq('ไม่ใส่รูปเลยได้ชุดว่าง หน้าร้านขึ้นกรอบชื่อสินค้าแทน', got22e.imgs, []);
eq('ไม่ใส่รูปเลย img ก็ว่าง', got22e.img, '');

/* ============================================ 23. หน้าร้านแบบใหม่ */
console.log('\n23. แบนเนอร์ · หมวดมีรูป · ป้ายสินค้า · ขายดี');
var s23 = shopFixture();
var fx23 = s23.fx;
var IMG_A = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view';
var THUMB_A = 'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUv&sz=w1000';

var ban23 = fx23.sheets['แบนเนอร์หน้าร้าน'];
truthy('setup สร้างชีท แบนเนอร์หน้าร้าน ให้', !!ban23);
var scat23 = fx23.sheets['หมวดหน้าร้าน'];
truthy('setup สร้างชีท หมวดหน้าร้าน ให้', !!scat23);

eq('ยังไม่กรอกอะไร แบนเนอร์เป็นก้อนว่าง หน้าร้านไม่พัง',
   s23.guest.shopSee().banners, {});

/* แถวที่ยังไม่เปิดใช้ ต้องไม่โผล่ */
ban23.cell(DATA_ROW, 2).v = 'โปรโมชั่นเด่น';
ban23.cell(DATA_ROW, 3).v = 'โปรกันยา';
ban23.cell(DATA_ROW, 4).v = IMG_A;
ban23.cell(DATA_ROW, 5).v = 'Buy Now';
ban23.cell(DATA_ROW, 6).v = 'หมวด:TOOLING';
eq('ยังไม่พิมพ์ เปิด แบนเนอร์ไม่ขึ้น', s23.guest.shopSee().banners, {});

ban23.cell(DATA_ROW, 7).v = 'เปิด';
var b23 = s23.guest.shopSee().banners;
eq('พิมพ์ เปิด แล้วขึ้นในแถบที่ตั้งไว้', (b23['โปรโมชั่นเด่น'] || []).length, 1);
eq('ลิงก์รูปถูกแปลงเป็นที่อยู่รูปจริง', b23['โปรโมชั่นเด่น'][0].img, THUMB_A);
eq('ลิงก์ปุ่มแบบหมวด แปลงเป็นคำสั่งเข้าหน้าหมวด',
   b23['โปรโมชั่นเด่น'][0].go, { kind: 'cat', v: 'TOOLING' });

ban23.cell(DATA_ROW + 1, 2).v = 'ติดต่อเรา';
ban23.cell(DATA_ROW + 1, 4).v = 'ยังไม่ได้อัปโหลด';
ban23.cell(DATA_ROW + 1, 7).v = 'เปิด';
eq('เปิดใช้แต่ลิงก์รูปมั่ว ตกไปเงียบ ๆ ไม่เหลือกรอบเปล่า',
   (s23.guest.shopSee().banners['ติดต่อเรา'] || []).length, 0);

eq('ลิงก์ปุ่มเป็นที่อยู่เว็บ', s23.guest.shopHref_('https://ast.example/promo'),
   { kind: 'url', v: 'https://ast.example/promo' });
eq('ลิงก์ปุ่มเป็นรหัสสินค้า', s23.guest.shopHref_('สินค้า: SKU-141'),
   { kind: 'sku', v: 'SKU-141' });
eq('ลิงก์ปุ่มว่าง = ไม่มีปุ่ม', s23.guest.shopHref_(''), null);
eq('ลิงก์ปุ่มมั่ว = ไม่มีปุ่ม ไม่ใช่ลิงก์เสีย', s23.guest.shopHref_('กดตรงนี้'), null);
eq('ไม่รับ http ธรรมดา', s23.guest.shopHref_('http://ast.example'), null);

/* หมวด — setup เติมชื่อหมวดจาก ฐานสินค้า ให้แล้ว */
var cc23 = s23.guest.shopSee().catCards;
truthy('มีการ์ดหมวดอย่างน้อยหนึ่งใบ', cc23.length > 0);
truthy('การ์ดหมวดมีจำนวนสินค้าติดมาด้วย', cc23[0].n > 0);
eq('ยังไม่ใส่รูป ไอคอนเป็นค่าว่าง ไม่ใช่ลิงก์เสีย', cc23[0].icon, '');

var g23 = cc23[0].group, row23 = 0;
for (var r23 = DATA_ROW; r23 <= scat23.getMaxRows(); r23++) {
  if (String(scat23.cell(r23, 2).v || '').trim() === g23) { row23 = r23; break; }
}
truthy('setup เติมชื่อหมวดลงชีท หมวดหน้าร้าน ให้แล้ว', row23 > 0);
scat23.cell(row23, 3).v = 'เครื่องมือตัด';
scat23.cell(row23, 4).v = IMG_A;
scat23.cell(row23, 5).v = IMG_A;
var cc23b = s23.guest.shopSee().catCards.filter(function (c) { return c.group === g23 })[0];
eq('ตั้งชื่อที่โชว์เองได้ ไม่ต้องแก้ชื่อหมวดในฐานสินค้า', cc23b.label, 'เครื่องมือตัด');
eq('รูปไอคอนแปลงให้แล้ว', cc23b.icon, THUMB_A);
eq('รูปปกแปลงให้แล้ว', cc23b.cover, THUMB_A);

scat23.cell(row23, 6).v = 'ซ่อน';
eq('พิมพ์ ซ่อน แล้วการ์ดหมวดหาย',
   s23.guest.shopSee().catCards.filter(function (c) { return c.group === g23 }).length, 0);
truthy('แต่สินค้าในหมวดนั้นยังขายอยู่ ไม่ได้หายไปจากหน้าร้าน',
   s23.guest.shopSee().items.some(function (p) { return p.group === g23 }));
scat23.cell(row23, 6).v = 'โชว์';

/* ป้ายหน้าร้าน */
var prod23 = fx23.sheets['ฐานสินค้า'];
var sku23 = s23.guest.shopSee().items[0].sku, prow23 = 0;
for (var q23 = DATA_ROW; q23 <= prod23.getMaxRows(); q23++) {
  if (String(prod23.cell(q23, 2).v || '').trim() === sku23) { prow23 = q23; break; }
}
eq('ไม่ติดป้าย ได้ชุดว่าง',
   s23.guest.shopSee().items.filter(function (p) { return p.sku === sku23 })[0].tags, []);
prod23.cell(prow23, 17).v = 'ใหม่, โปรโมชั่น';
eq('ติดสองป้ายคั่นด้วยจุลภาค แยกให้ถูกและตัดช่องว่างให้',
   s23.guest.shopSee().items.filter(function (p) { return p.sku === sku23 })[0].tags,
   ['ใหม่', 'โปรโมชั่น']);

/* ขายดี — ต้องมาจากยอดขายจริง ไม่ใช่ลำดับในชีท และห้ามบอกจำนวนที่ขายได้ */
var best23 = s23.guest.shopSee().best;
truthy('ขายดีเป็นรายการรหัสสินค้า', Array.isArray(best23));
truthy('ขายดีไม่เกินจำนวนที่ตั้งไว้', best23.length <= 8);
truthy('ขายดีมีแต่ของที่ยังขายอยู่', best23.every(function (sku) {
  return s23.guest.shopSee().items.some(function (p) { return p.sku === sku });
}));
truthy('คำตอบทั้งก้อนไม่มีจำนวนที่ขายได้ติดไปด้วย',
   JSON.stringify(s23.guest.shopSee()).indexOf('"sold"') < 0);

/* แผนที่ — ไม่ได้ใส่ลิงก์เอง ต้องได้ลิงก์ค้นหาจากที่อยู่ */
var app23 = fx23.sheets['ตั้งค่าแอป'];
for (var a23 = DATA_ROW; a23 <= app23.getMaxRows(); a23++) {
  if (String(app23.cell(a23, 1).v || '').trim() === 'ที่อยู่ผู้ส่ง') {
    app23.cell(a23, 2).v = '2/1 ซ.ตัวอย่าง\nแขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ 10000';
    break;
  }
}
var m23 = s23.guest.shopSee().map;
truthy('ได้ลิงก์แผนที่จากที่อยู่ผู้ส่ง', /^https:\/\/www\.google\.com\/maps/.test(m23.url));
eq('ป้ายบนแถบเอาแค่บรรทัดแรก ที่อยู่เต็มยาวเกินกว่าจะอ่านบนแถบเตี้ย ๆ',
   m23.label, '2/1 ซ.ตัวอย่าง');

/* ใส่ลิงก์แผนที่เองแล้วต้องใช้ตัวนั้น ไม่ใช่ไปค้นที่อยู่เอง */
for (var a24 = DATA_ROW; a24 <= app23.getMaxRows(); a24++) {
  if (String(app23.cell(a24, 1).v || '').trim() === 'ลิงก์แผนที่ร้าน') {
    app23.cell(a24, 2).v = 'https://maps.app.goo.gl/abcdef';
    break;
  }
}
eq('ใส่ลิงก์แผนที่เองแล้วใช้ตัวนั้น',
   s23.guest.shopSee().map.url, 'https://maps.app.goo.gl/abcdef');

/* ====================================== 24. อีเมลแจ้งร้านทันทีที่มีคนสั่ง

   ก่อนหน้านี้คำขอไปนอนรออยู่ในชีทเงียบ ๆ ไม่มีอะไรเด้งบอกสักอย่าง
   ลูกค้าสั่งตอนตีสองแล้วไม่มีใครเปิดแอป ออเดอร์ค้างข้ามคืนโดยไม่มีใครรู้    */
console.log('\n24. อีเมลแจ้งร้านทันทีที่ลูกค้าสั่งจากหน้าเว็บ');

function setApp(fx, key, val) {
  var app = fx.sheets['ตั้งค่าแอป'];
  for (var r = DATA_ROW; r <= app.getMaxRows(); r++) {
    if (String(app.cell(r, 1).v || '').trim() === key) { app.cell(r, 2).v = val; return true }
  }
  return false;
}

var s24 = shopFixture();
truthy('setup สร้างช่องอีเมลแจ้งเตือนให้ในชีทตั้งค่าแอป',
   setApp(s24.fx, 'อีเมลแจ้งเตือนออเดอร์จากเว็บ', 'aey@chem-inno-tech.com'));

var shelf24 = s24.guest.shopData().items;
var r24 = s24.guest.shopOrder({
  clientKey: 'web-mail-1', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '99/9 ถ.ตัวอย่าง จ.ระยอง 21000', note: 'รบกวนส่งด่วน',
  items: [{ sku: shelf24[0].sku, qty: 3 }]
});
eq('ส่งอีเมลออกไปหนึ่งฉบับ', s24.fx.MAILS.length, 1);
var m24 = s24.fx.MAILS[0] || {};
eq('ส่งถึงอีเมลที่กรอกไว้ ไม่ใช่เดาเอง', m24.to, 'aey@chem-inno-tech.com');
truthy('หัวข้อมีเลขคำขอ จะได้เห็นตั้งแต่ยังไม่เปิดอ่าน',
   String(m24.subject).indexOf(r24.no) > -1);
truthy('หัวข้อมียอดเงินด้วย', /\d/.test(String(m24.subject)) &&
   String(m24.subject).indexOf('บาท') > -1);

/* ข้อมูลที่ต้องใช้ตัดสินใจ ต้องอยู่ในอีเมลครบ ไม่ใช่ไล่ให้ไปเปิดแอปดูเอง
   คนอ่านอีเมลนี้ตอนตีสองบนมือถือ ต้องรู้ทันทีว่าควรลุกหรือรอเช้า */
['มานี ใจดี', '0812345678', '99/9', 'รบกวนส่งด่วน', shelf24[0].name]
  .forEach(function (want) {
    truthy('ในอีเมลมี "' + String(want).slice(0, 22) + '"',
      String(m24.body).indexOf(want) > -1);
  });
truthy('บอกว่ายังไม่ตัดสต๊อก และต้องไปกดรับเป็นออเดอร์',
   /ยังไม่ตัดสต๊อก/.test(m24.body) && /รับเป็นออเดอร์/.test(m24.body));
truthy('บอกวิธีปิดการแจ้งเตือนไว้ท้ายอีเมล', /"ปิด"/.test(m24.body));

console.log('\n   โหมดเข้าชีทเลย ยิ่งต้องรู้ทันที เพราะตัดสต๊อกไปแล้วจริง ๆ');
var s24b = shopFixture('direct');
setApp(s24b.fx, 'อีเมลแจ้งเตือนออเดอร์จากเว็บ', 'aey@chem-inno-tech.com');
var shelf24b = s24b.guest.shopData().items;
var r24b = s24b.guest.shopOrder({
  clientKey: 'web-mail-2', cust: 'สมชาย', tel: '0899999999',
  addr: '1 ถ.ทดสอบ ต.เนินพระ อ.เมือง จ.ระยอง 21000', items: [{ sku: shelf24b[0].sku, qty: 1 }]
});
eq('ส่งอีเมลออกไปด้วย', s24b.fx.MAILS.length, 1);
truthy('หัวข้อใช้เลขออเดอร์จริง',
   String(s24b.fx.MAILS[0].subject).indexOf(r24b.no) > -1);
truthy('และบอกว่าตัดสต๊อกไปแล้ว ไม่ใช่ข้อความของคำขอ',
   /ตัดสต๊อก(และตัดล็อต)?ไป/.test(s24b.fx.MAILS[0].body));

console.log('\n   ส่งอีเมลไม่ได้ ห้ามทำให้ลูกค้าสั่งไม่สำเร็จ');
/* ตอนนี้คำขอลงชีทไปแล้ว งานสำคัญที่สุดสำเร็จแล้ว ถ้าปล่อย error ให้หลุดออกไป
   ลูกค้าจะเห็นหน้าจอแดงแล้วกดสั่งซ้ำ ได้คำขอซ้ำสองใบทั้งที่ของเข้าระบบแล้ว */
var s24c = shopFixture();
setApp(s24c.fx, 'อีเมลแจ้งเตือนออเดอร์จากเว็บ', 'aey@chem-inno-tech.com');
s24c.guest.__mailFail = true;
var shelf24c = s24c.guest.shopData().items;
var r24c = s24c.guest.shopOrder({
  clientKey: 'web-mail-3', cust: 'ลูกค้าเน็ตล่ม', tel: '0800000000',
  addr: '2 ถ.ทดสอบ ต.เนินพระ อ.เมือง จ.ระยอง 21000', items: [{ sku: shelf24c[0].sku, qty: 1 }]
});
truthy('ลูกค้ายังได้เลขคำขอกลับไปตามปกติ', /^REQ-/.test(r24c.no));
eq('ไม่มีอีเมลออกไปเลย', s24c.fx.MAILS.length, 0);
/* และของต้องอยู่ในชีทจริง ไม่ใช่แค่ตอบกลับสวย ๆ แล้วไม่มีอะไรถูกบันทึก */
var req24 = s24c.fx.sheets['คำขอสั่งซื้อ'];
var found24 = false;
for (var q24 = DATA_ROW; q24 <= req24.getMaxRows(); q24++) {
  if (String(req24.cell(q24, 2).v || '') === r24c.no) { found24 = true; break }
}
truthy('คำขอยังถูกบันทึกลงชีทครบ', found24);

console.log('\n   พิมพ์ว่า "ปิด" แล้วต้องไม่ส่ง · เว้นว่างแล้วส่งเข้าอีเมลเจ้าของสคริปต์');
var s24d = shopFixture();
setApp(s24d.fx, 'อีเมลแจ้งเตือนออเดอร์จากเว็บ', 'ปิด');
var shelf24d = s24d.guest.shopData().items;
s24d.guest.shopOrder({ clientKey: 'web-mail-4', cust: 'ลูกค้า ก', tel: '0811111111',
  addr: '3 ถ.ทดสอบ ต.เนินพระ อ.เมือง จ.ระยอง 21000', items: [{ sku: shelf24d[0].sku, qty: 1 }] });
eq('พิมพ์ปิดแล้วไม่ส่งเลย', s24d.fx.MAILS.length, 0);

var s24e = shopFixture();   /* ไม่กรอกช่องอีเมลเลย */
var shelf24e = s24e.guest.shopData().items;
s24e.guest.shopOrder({ clientKey: 'web-mail-5', cust: 'ลูกค้า ข', tel: '0822222222',
  addr: '4 ถ.ทดสอบ ต.เนินพระ อ.เมือง จ.ระยอง 21000', items: [{ sku: shelf24e[0].sku, qty: 1 }] });
eq('ลืมกรอก ก็ยังส่งให้ ไม่ใช่เงียบหาย', s24e.fx.MAILS.length, 1);
eq('ส่งเข้าอีเมลเจ้าของสคริปต์', s24e.fx.MAILS[0].to, 'citisales01@chem-inno-tech.com');

console.log('\n   ลูกค้าต้องไม่เห็นอะไรเพิ่มจากเดิม');
truthy('คำตอบที่ส่งกลับไม่มีอีเมลของร้านติดไปด้วย',
   JSON.stringify(r24).indexOf('chem-inno-tech.com') < 0);

/* ====================================== 25. สั่ง setup แล้วต้องได้แถวตั้งค่าครบ

   ของจริง 24 ก.ย. 69: บอกเจ้าของร้านให้สั่ง setup เพื่อให้ได้แถว
   "อีเมลแจ้งเตือนออเดอร์จากเว็บ" สั่งแล้วเปิดชีทดู ไม่มีแถวนั้นเลย
   เพราะแถวตั้งค่าของหน้าร้านทั้งชุดอยู่ใน shopSwitchRow_ ซึ่ง setup ไม่เคยเรียก
   มีแต่ setupShopPages ที่เรียก — คำสั่งที่บอกไปจึงไม่มีทางได้ผล

   ข้อสอบเดิมไม่มีข้อไหนดูว่า setup สร้างแถวอะไรบ้างในชีทตั้งค่าแอป
   จึงไม่มีอะไรจับได้ว่าเส้นทางนี้ขาด                                        */
console.log('\n25. สั่ง setup ครั้งเดียว ต้องได้แถวตั้งค่าหน้าร้านครบ');
var fx25 = FS.build();
var api25 = FS.load(fx25, {});
api25.setup();

var app25 = fx25.sheets['ตั้งค่าแอป'];
var keys25 = [];
for (var r25 = DATA_ROW; r25 <= app25.getMaxRows(); r25++) {
  var k25 = String(app25.cell(r25, 1).v || '').trim();
  if (k25) keys25.push(k25);
}
[ 'เปิดรับออเดอร์หน้าเว็บ', 'ออเดอร์จากเว็บ', 'โลโก้ร้าน (ลิงก์รูป)',
  'ภาพหัวหน้าร้าน (ลิงก์รูป)', 'ลิงก์แผนที่ร้าน', 'อีเมลแจ้งเตือนออเดอร์จากเว็บ',
  'วงเงินสูงสุดเก็บเงินปลายทาง'
].forEach(function (want) {
  truthy('setup สร้างแถว "' + want + '"', keys25.indexOf(want) > -1);
});

/* สั่งซ้ำต้องไม่ได้แถวซ้ำ — ชีทตั้งค่ามีแถวซ้ำเมื่อไร ค่าที่อ่านได้จะขึ้นกับ
   ว่าแถวไหนอยู่บนกว่ากัน ซึ่งเป็นอาการที่ไล่หาสาเหตุยากมาก */
api25.setup();
var dup25 = {}, dupes = [];
for (var q25 = DATA_ROW; q25 <= app25.getMaxRows(); q25++) {
  var d25 = String(app25.cell(q25, 1).v || '').trim();
  if (!d25) continue;
  if (dup25[d25]) dupes.push(d25);
  dup25[d25] = 1;
}
eq('สั่ง setup ซ้ำ ไม่มีแถวไหนซ้ำ', dupes, []);

/* ====================================== 26. แคชหน้าร้าน — เปิดครั้งที่สองต้องไว

   ของจริง: ลูกค้าเปิดหน้าร้านแล้วค้างอยู่ที่ "กำลังโหลดสินค้าจากระบบ…" หลายวินาที
   เพราะทุกครั้งที่มีคนเปิด ระบบอ่าน ฐานสินค้า 118 แถว + ชีทสต๊อกซึ่งเป็นสูตรทั้งใบ
   + แบนเนอร์ + หมวด + ขายดี ใหม่หมด ทั้งที่ไม่มีอะไรเปลี่ยนเลย
   บนหน้าร้าน ช้าคือเสียลูกค้า ไม่ใช่แค่รอนาน                                */
console.log('\n26. แคชหน้าร้าน — คนที่สองต้องไม่ต้องรออ่านชีทใหม่');
var s26 = shopFixture();

FS.CELLS_READ.n = 0;
var d26a = s26.guest.shopData();
var read1 = FS.CELLS_READ.n;

FS.CELLS_READ.n = 0;
var d26b = s26.guest.shopData();
var read2 = FS.CELLS_READ.n;

truthy('เปิดครั้งแรกต้องอ่านชีทจริง (' + read1 + ' ช่อง)', read1 > 100);
eq('เปิดครั้งที่สอง ไม่แตะชีทเลย', read2, 0);
eq('และได้ข้อมูลชุดเดียวกันเป๊ะ', JSON.stringify(d26b), JSON.stringify(d26a));

console.log('\n   พนักงานแก้อะไรที่ลูกค้าเห็น ต้องล้างแคชทันที');
/* ไม่ล้าง = ลูกค้ายังเห็นราคาเก่าไปอีกห้านาที ซึ่งแย่กว่าช้า */
var sku26 = d26a.items[0].sku;
s26.staff.saveShopProduct({ sku: sku26, price: 4321 });
FS.CELLS_READ.n = 0;
var d26c = s26.guest.shopData();
truthy('แก้ราคาแล้วอ่านชีทใหม่จริง', FS.CELLS_READ.n > 100);
eq('ลูกค้าเห็นราคาใหม่ทันที ไม่ต้องรอแคชหมดอายุ',
   d26c.items.filter(function (x) { return x.sku === sku26 })[0].price, 4321);

console.log('\n   ขายของออกไปแล้ว ป้ายของหมดต้องไม่ค้าง');
var s26b = shopFixture('direct');
var shelf26 = s26b.guest.shopData().items;
FS.CELLS_READ.n = 0;
s26b.guest.shopData();
eq('ยืนยันว่าแคชติดแล้ว', FS.CELLS_READ.n, 0);
s26b.guest.shopOrder({
  clientKey: 'web-cache-1', cust: 'ลูกค้าทดสอบ', tel: '0812345678',
  addr: '5 ถ.ทดสอบ ต.เนินพระ อ.เมือง จ.ระยอง 21000',
  items: [{ sku: shelf26[0].sku, qty: 1 }]
});
FS.CELLS_READ.n = 0;
s26b.guest.shopData();
truthy('หลังมีออเดอร์ ต้องอ่านชีทใหม่', FS.CELLS_READ.n > 100);

console.log('\n   แคชพังหรือใหญ่เกิน ต้องไม่ทำให้หน้าร้านล่ม');
var s26c = shopFixture();
s26c.guest.__cacheOff = true;      /* อ่านแคชไม่ได้เลย */
truthy('อ่านแคชไม่ได้ ก็ยังส่งข้อมูลให้ตามปกติ',
   (s26c.guest.shopData().items || []).length > 0);

/* ============================== 27. เก็บเงินปลายทาง — วงเงินสูงสุด

   เจ้าของร้านสั่งว่า "เกิน2000ไม่มีปุ่มปลายทาง" ข้อสอบชุดนี้คุมสองเรื่อง

     1. เกินวงเงินแล้วสั่งปลายทางไม่ได้จริง แม้ยิงตรงมาที่ shopOrder
        หน้าเว็บซ่อนปุ่มให้แล้วก็จริง แต่ปุ่มที่ซ่อนด้วย CSS เปิด DevTools ก็โผล่
        ถ้าด่านนี้ไม่มี ร้านจะแพ็คของหลักหมื่นส่งออกไปโดยยังไม่ได้เงินสักบาท
     2. ใบปลายทางต้องไม่มีลิงก์โอนเงินติดไปด้วย ไม่งั้นลูกค้าจ่ายสองรอบ    */
console.log('\n27. เก็บเงินปลายทาง — วงเงินสูงสุด');

function codRow(fx) {
  var app = fx.sheets['ตั้งค่าแอป'];
  for (var r = DATA_ROW; r <= app.getMaxRows(); r++) {
    if (String(app.cell(r, 1).v || '').trim() === 'วงเงินสูงสุดเก็บเงินปลายทาง') return r;
  }
  return 0;
}
function setCodMax(fx, v) {
  var r = codRow(fx);
  if (r) fx.sheets['ตั้งค่าแอป'].cell(r, 2).v = v;
  return r;
}

var s27 = shopFixture('direct');
truthy('setup สร้างช่องวงเงินปลายทางให้ในชีทตั้งค่าแอป', codRow(s27.fx) > 0);
eq('ค่าเริ่มต้นในชีทคือ 2000', s27.fx.sheets['ตั้งค่าแอป'].cell(codRow(s27.fx), 2).v, 2000);

var sku27 = s27.guest.shopData().items[0].sku;
s27.staff.saveShopProduct({ sku: sku27, price: 900 });   /* 900 + ค่าส่ง 50 */
eq('หน้าร้านรู้วงเงินปลายทาง เอาไปซ่อน/โชว์ปุ่มเองได้', s27.guest.shopSee().cod.max, 2000);

/* ---- ยอดไม่เกินวงเงิน: สั่งปลายทางได้ ---- */
var ok27 = s27.guest.shopOrder({
  clientKey: 'cod-ok', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
  cod: true, items: [{ sku: sku27, qty: 2 }]   /* 1,800 · เกิน 1,000 ส่งฟรี */
});
var head27 = s27.fx.sheets['ออเดอร์_หัวบิล'];
eq('ยอด 1,800 สั่งปลายทางได้', ok27.net, 1800);
eq('สถานะใบเป็น "เก็บเงินปลายทาง" ไม่ใช่ "รอชำระ"',
   String(head27.cell(DATA_ROW, 17).v), 'เก็บเงินปลายทาง');
truthy('หมายเหตุบอกว่าลูกค้าเลือกปลายทางเอง',
   String(head27.cell(DATA_ROW, 20).v).indexOf('ลูกค้าเลือกเก็บเงินปลายทาง') > -1);
eq('บอกหน้าร้านว่าใบนี้ปลายทาง', ok27.cod, true);
eq('ไม่มีลิงก์โอนเงินติดไปด้วย — ไม่งั้นลูกค้าจ่ายสองรอบ', ok27.payUrl, '');
eq('และไม่สร้างแถวลิงก์ไว้ให้ใครส่งต่อด้วย — แถวลิงก์คือลิงก์ที่ส่งต่อได้จริง',
   String(s27.fx.sheets['ลิงก์ชำระเงิน'].cell(DATA_ROW, 2).v || ''), '');

/* กดซ้ำเพราะเน็ตช้า ต้องได้ใบเดิมและยังเป็นปลายทางเหมือนเดิม */
var dup27 = s27.guest.shopOrder({
  clientKey: 'cod-ok', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
  cod: true, items: [{ sku: sku27, qty: 2 }]
});
eq('กดซ้ำได้ใบเดิม', dup27.no, ok27.no);
eq('กดซ้ำแล้วยังเป็นปลายทาง ไม่เผลอยื่นปุ่มโอนเงินให้', dup27.cod, true);
eq('และยังไม่มีลิงก์โอนเงิน', dup27.payUrl, '');

/* ---- ยอดเกินวงเงิน: ต้องไม่ผ่าน แม้ยิงตรงมา ---- */
var s27b = shopFixture('direct');
var sku27b = s27b.guest.shopData().items[0].sku;
s27b.staff.saveShopProduct({ sku: sku27b, price: 900 });
throws('ยอด 2,750 สั่งปลายทางไม่ผ่าน แม้ยิงตรงมาที่ shopOrder', function () {
  s27b.guest.shopOrder({
    clientKey: 'cod-over', cust: 'มานี ใจดี', tel: '0812345678',
    addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
    cod: true, items: [{ sku: sku27b, qty: 3 }]   /* 2,700 + 50 */
  });
}, 'ไม่เกิน 2,000');
eq('และต้องไม่มีออเดอร์หลุดลงชีทเลย',
   String(s27b.fx.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, 1).v || ''), '');

/* ยอดเท่าวงเงินพอดี ต้องผ่าน — ขอบเขตที่คนพลาดบ่อยที่สุด */
var s27c = shopFixture('direct');
var sku27c = s27c.guest.shopData().items[0].sku;
s27c.staff.saveShopProduct({ sku: sku27c, price: 2000 });
var edge27 = s27c.guest.shopOrder({
  clientKey: 'cod-edge', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
  cod: true, items: [{ sku: sku27c, qty: 1 }]   /* 2,000 พอดี ไม่เกินวงเงิน */
});
eq('ยอด 2,000 พอดี ยังสั่งปลายทางได้', edge27.net, 2000);
eq('และเป็นใบปลายทางจริง', edge27.cod, true);

/* ---- ไม่เลือกปลายทาง = เหมือนเดิมทุกอย่าง ---- */
var s27d = shopFixture('direct');
var sku27d = s27d.guest.shopData().items[0].sku;
var plain27 = s27d.guest.shopOrder({
  clientKey: 'cod-no', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
  items: [{ sku: sku27d, qty: 1 }]
});
eq('ใบโอนเงินยังเป็น "รอชำระ" เหมือนเดิม',
   String(s27d.fx.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, 17).v), 'รอชำระ');
eq('ไม่ได้ถูกตีเป็นใบปลายทาง', plain27.cod, false);
eq('และสร้างแถวลิงก์ให้ตามปกติ — ต่างกับใบปลายทางตรงนี้',
   String(s27d.fx.sheets['ลิงก์ชำระเงิน'].cell(DATA_ROW, 2).v || ''), plain27.no);

/* ---- ปิดปลายทางทั้งร้านด้วยเลข 0 ---- */
var s27e = shopFixture('direct');
setCodMax(s27e.fx, 0);
var sku27e = s27e.guest.shopData().items[0].sku;
eq('ตั้ง 0 แล้วหน้าร้านรู้ว่าปิดปลายทาง', s27e.guest.shopSee().cod.max, 0);
throws('ตั้ง 0 แล้วสั่งปลายทางไม่ได้เลย', function () {
  s27e.guest.shopOrder({
    clientKey: 'cod-off', cust: 'มานี ใจดี', tel: '0812345678',
    addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
    cod: true, items: [{ sku: sku27e, qty: 1 }]
  });
}, 'ยังไม่เปิดรับเก็บเงินปลายทาง');

/* ช่องว่าง = ยังไม่เคยตั้ง ต้องใช้ 2000 ไม่ใช่ตีเป็น 0 แล้วปิดปลายทางให้เงียบ ๆ */
var s27f = shopFixture('direct');
setCodMax(s27f.fx, '');
eq('เว้นว่างในชีท = ใช้ค่าเริ่มต้น 2,000 ไม่ใช่ปิดปลายทาง',
   s27f.guest.shopSee().cod.max, 2000);

/* ---- โหมดเข้าคิว: ไม่ตั้งสถานะให้เอง แค่บันทึกว่าลูกค้าขอมา ---- */
console.log('\n   โหมดเข้าคิว — พนักงานตัดสินเป็นใบ ๆ ตอนกดรับ');
var s27g = shopFixture();                 /* ค่าเริ่มต้น = เข้าคิวก่อน */
var sku27g = s27g.guest.shopData().items[0].sku;
s27g.staff.saveShopProduct({ sku: sku27g, price: 900 });
var q27 = s27g.guest.shopOrder({
  clientKey: 'cod-q', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '99/9 ถ.ตัวอย่าง ต.เนินพระ อ.เมือง จ.ระยอง 21000',
  note: 'ขอใบกำกับภาษี', cod: true, items: [{ sku: sku27g, qty: 1 }]
});
var req27 = s27g.fx.sheets['คำขอสั่งซื้อ'];
truthy('ได้เลขคำขอ ไม่ใช่เลขออเดอร์', /^REQ-/.test(q27.no));
truthy('หมายเหตุขึ้นต้นด้วย "เก็บเงินปลายทาง" คนกดรับจะได้เห็นก่อนตัดท้าย',
   /^เก็บเงินปลายทาง/.test(String(req27.cell(DATA_ROW, 7).v)));
truthy('ข้อความที่ลูกค้าฝากไว้ยังอยู่ครบ',
   String(req27.cell(DATA_ROW, 7).v).indexOf('ขอใบกำกับภาษี') > -1);
eq('คำขอยังเป็นสถานะ "ใหม่" ระบบไม่ตัดสินใจแทนพนักงาน',
   String(req27.cell(DATA_ROW, 11).v), 'ใหม่');
eq('ยังไม่มีออเดอร์จริงในชีทหัวบิล',
   String(s27g.fx.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, 1).v || ''), '');
eq('บอกหน้าร้านว่าเป็นคำขอปลายทาง จะได้ไม่เขียนว่าให้รอโอนเงิน', q27.cod, true);

/* เกินวงเงิน โหมดคิวก็ต้องกันเหมือนกัน ไม่ใช่กันแค่โหมดเข้าชีทเลย */
var s27h = shopFixture();
var sku27h = s27h.guest.shopData().items[0].sku;
s27h.staff.saveShopProduct({ sku: sku27h, price: 900 });
throws('โหมดคิว: ยอดเกินวงเงินก็สั่งปลายทางไม่ได้', function () {
  s27h.guest.shopOrder({
    clientKey: 'cod-q-over', cust: 'มานี ใจดี', tel: '0812345678',
    addr: '99/9 ถ.ตัวอย่าง ต.เนินพระ อ.เมือง จ.ระยอง 21000',
    cod: true, items: [{ sku: sku27h, qty: 3 }]
  });
}, 'ไม่เกิน 2,000');
eq('และไม่มีคำขอหลุดลงชีทด้วย',
   String(s27h.fx.sheets['คำขอสั่งซื้อ'].cell(DATA_ROW, 1).v || ''), '');

/* ---- อีเมลแจ้งร้านต้องเตือนว่าใบนี้ปลายทาง ---- */
var s27i = shopFixture('direct');
var app27i = s27i.fx.sheets['ตั้งค่าแอป'];
for (var r27 = DATA_ROW; r27 <= app27i.getMaxRows(); r27++) {
  if (String(app27i.cell(r27, 1).v || '').trim() === 'อีเมลแจ้งเตือนออเดอร์จากเว็บ') {
    app27i.cell(r27, 2).v = 'shop@example.com'; break;
  }
}
var sku27i = s27i.guest.shopData().items[0].sku;
s27i.staff.saveShopProduct({ sku: sku27i, price: 900 });
s27i.fx.MAILS.length = 0;
s27i.guest.shopOrder({
  clientKey: 'cod-mail', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '1/1 ถ.ทดสอบ ต.ทดสอบ อ.เมือง จ.ระยอง 21000',
  cod: true, items: [{ sku: sku27i, qty: 1 }]
});
eq('ส่งอีเมลแจ้งร้านหนึ่งฉบับ', s27i.fx.MAILS.length, 1);
truthy('หัวข้ออีเมลบอกว่าเป็นปลายทาง ตั้งแต่ยังไม่เปิดอ่าน',
   s27i.fx.MAILS[0].subject.indexOf('เก็บเงินปลายทาง') > -1);
truthy('ในเนื้อเมลเตือนห้ามส่งลิงก์โอนเงินให้ลูกค้า',
   s27i.fx.MAILS[0].body.indexOf('อย่าส่งลิงก์โอนเงินให้') > -1);

/* ---- พนักงานกดรับคำขอเป็นใบปลายทาง ---- */
console.log('\n   พนักงานกดรับ — คนอนุมัติปลายทางคือพนักงาน ไม่ใช่ลูกค้า');
var s27j = shopFixture();
var sku27j = s27j.guest.shopData().items[0].sku;
s27j.staff.saveShopProduct({ sku: sku27j, price: 900 });
var q27j = s27j.guest.shopOrder({
  clientKey: 'cod-acc', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '99/9 ถ.ตัวอย่าง ต.เนินพระ อ.เมือง จ.ระยอง 21000',
  cod: true, items: [{ sku: sku27j, qty: 1 }]
});
var seen27 = s27j.staff.getRequests(20).filter(function (x) { return x.no === q27j.no })[0];
eq('หน้าจอพนักงานรู้ว่าลูกค้าขอปลายทาง จะได้ติ๊กมาให้ล่วงหน้า', seen27.cod, true);

var acc27 = s27j.staff.acceptRequest({ no: q27j.no, status: 'เก็บเงินปลายทาง' });
eq('กดรับเป็นใบปลายทางได้', String(
   s27j.fx.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, 17).v), 'เก็บเงินปลายทาง');
truthy('ได้เลขออเดอร์จริง', /^AST-/.test(acc27.no));

/* พนักงานเผลอติ๊กปลายทางให้ใบที่เกินวงเงิน ต้องถูกกันเหมือนกัน
   ด่านนี้สำคัญกว่าฝั่งลูกค้าอีก เพราะใบที่กดรับคือใบที่ตัดสต๊อกจริง */
var s27k = shopFixture();
var sku27k = s27k.guest.shopData().items[0].sku;
s27k.staff.saveShopProduct({ sku: sku27k, price: 900 });
var q27k = s27k.guest.shopOrder({
  clientKey: 'cod-acc-over', cust: 'มานี ใจดี', tel: '0812345678',
  addr: '99/9 ถ.ตัวอย่าง ต.เนินพระ อ.เมือง จ.ระยอง 21000',
  items: [{ sku: sku27k, qty: 3 }]          /* ลูกค้าไม่ได้ขอปลายทาง ยอด 2,700 */
});
eq('ลูกค้าไม่ได้ขอปลายทาง หน้าจอพนักงานต้องไม่ติ๊กให้',
   s27k.staff.getRequests(20)[0].cod, false);
throws('พนักงานติ๊กปลายทางให้ใบ 2,700 ไม่ผ่าน', function () {
  s27k.staff.acceptRequest({ no: q27k.no, status: 'เก็บเงินปลายทาง' });
}, 'เกินวงเงินเก็บเงินปลายทาง');
eq('และไม่มีออเดอร์หลุดลงชีท',
   String(s27k.fx.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, 1).v || ''), '');
truthy('รับเป็น "รอชำระ" แทนได้ตามปกติ',
   /^AST-/.test(s27k.staff.acceptRequest({ no: q27k.no }).no));
eq('และใบนั้นเป็น "รอชำระ" ไม่ใช่ปลายทาง',
   String(s27k.fx.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, 17).v), 'รอชำระ');

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
