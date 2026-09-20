/*
 * โหมดแก้ไขร้าน ฝั่งพนักงาน — เขียนลงชีทได้ จึงต้องคุมสองอย่างพร้อมกัน
 *
 *   node tools/t_shopedit.js
 *
 *   1. ลูกค้า (ไม่มีอีเมล) เรียกไม่ได้สักตัว — ไฟล์นี้แก้ราคาสินค้าได้
 *   2. ไม่มีช่องสูตรถูกเขียนทับแม้แต่ช่องเดียว
 *
 * ข้อ 2 คือกฎเหล็กของทั้งโปรเจกต์ ชีทของเจ้าของร้านคำนวณกำไรและสต๊อกด้วยสูตร
 * เขียนทับไปช่องเดียว ตัวเลขทั้งชีทจะผิดโดยไม่มีอะไรฟ้อง
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

function fixture() {
  var fx = FS.build();
  var staff = FS.load(fx, {});
  staff.setup();
  staff.setupShopColumns();
  var guest = FS.load(fx, { email: '' });
  return { fx: fx, staff: staff, guest: guest };
}

var DRIVE = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing';
var THUMB = 'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUv&sz=w1000';
var DRIVE2 = 'https://drive.google.com/file/d/2ZyXwVuTsRqPoNmLkJiHgF/view';
var THUMB2 = 'https://drive.google.com/thumbnail?id=2ZyXwVuTsRqPoNmLkJiHgF&sz=w1000';

/* ============================================ 1. ลูกค้าต้องเรียกไม่ได้สักตัว */
console.log('1. ลูกค้าที่ไม่ได้ล็อกอิน ห้ามเรียกได้สักตัว');
var f1 = fixture();
[
  ['getShopEdit', function () { f1.guest.getShopEdit() }],
  ['saveShopProduct', function () { f1.guest.saveShopProduct({ sku: 'SKU-141', price: 1 }) }],
  ['saveShopBanner', function () { f1.guest.saveShopBanner({ slot: 'โปรโมชั่นเด่น', img: DRIVE }) }],
  ['deleteShopBanner', function () { f1.guest.deleteShopBanner(DATA_ROW) }],
  ['saveShopCat', function () { f1.guest.saveShopCat({ group: 'TOOLING' }) }],
  ['saveShopLook', function () { f1.guest.saveShopLook({ logo: DRIVE }) }]
].forEach(function (t) {
  throws('ลูกค้าเรียก ' + t[0] + ' ไม่ได้', t[1]);
});

/* ============================================ 2. พนักงานอ่านข้อมูลได้ครบ */
console.log('\n2. พนักงานเปิดโหมดแก้ไขแล้วได้ข้อมูลครบ');
var d2 = f1.staff.getShopEdit();
truthy('ได้รายการสินค้า', d2.products.length > 0);
truthy('ได้รายการหมวด', d2.cats.length > 0);
eq('ยังไม่มีแบนเนอร์', d2.banners, []);
eq('ส่งตำแหน่งแบนเนอร์ที่เลือกได้มาด้วย', d2.slots.length, 3);
eq('ส่งป้ายที่ติดได้มาด้วย', d2.tags, ['แนะนำ', 'ใหม่', 'ขายดี', 'โปรโมชั่น']);
truthy('ได้ค่าหน้าตาหัวหน้าร้าน', !!d2.look);
truthy('พนักงานเห็นทุกตัว รวมตัวที่ซ่อนจากหน้าร้าน',
   d2.products.length >= f1.staff.shopItems_().length);

/* ============================================ 3. แก้สินค้า */
console.log('\n3. แก้ข้อมูลหน้าร้านของสินค้า');
var sku3 = d2.products[0].sku;

f1.staff.saveShopProduct({ sku: sku3, img: DRIVE, img2: DRIVE2, tag: 'ใหม่, โปรโมชั่น' });
var p3 = f1.staff.getShopEdit().products.filter(function (p) { return p.sku === sku3 })[0];
eq('ลิงก์รูปที่กรอกถูกเก็บตามที่พิมพ์ ไม่ถูกแปลงทิ้ง', p3.img, DRIVE);
eq('รูปตัวอย่างเป็นที่อยู่รูปจริง', p3.show, [THUMB, THUMB2]);
eq('ป้ายถูกเก็บเป็นข้อความคั่นจุลภาค แบบเดียวกับที่คนพิมพ์เองในชีท',
   p3.tag, 'ใหม่, โปรโมชั่น');
eq('หน้าร้านเห็นป้ายด้วย',
   f1.guest.shopData().items.filter(function (p) { return p.sku === sku3 })[0].tags,
   ['ใหม่', 'โปรโมชั่น']);

f1.staff.saveShopProduct({ sku: sku3, tag: 'ใหม่, ของดี, โปรโมชั่น' });
eq('ป้ายที่ไม่มีในรายการถูกตัดทิ้ง ไม่ปล่อยให้พิมพ์อะไรก็ได้ลงชีท',
   f1.staff.getShopEdit().products.filter(function (p) { return p.sku === sku3 })[0].tag,
   'ใหม่, โปรโมชั่น');

f1.staff.saveShopProduct({ sku: sku3, web: 'ไม่' });
eq('ปิดขายหน้าเว็บแล้วหายจากหน้าร้าน',
   f1.guest.shopData().items.filter(function (p) { return p.sku === sku3 }).length, 0);
f1.staff.saveShopProduct({ sku: sku3, web: '' });
eq('เปิดกลับแล้วขึ้นอีกครั้ง',
   f1.guest.shopData().items.filter(function (p) { return p.sku === sku3 }).length, 1);

eq('ส่งค่าเดิมมาซ้ำ ไม่นับว่าแก้', f1.staff.saveShopProduct({ sku: sku3, img: DRIVE }).changed, 0);
throws('รหัสที่ไม่มีในชีท ต้องฟ้อง ไม่ใช่เขียนมั่ว',
   function () { f1.staff.saveShopProduct({ sku: 'SKU-ไม่มีจริง', price: 9 }) }, 'ไม่เจอรหัส');
throws('ไม่บอกรหัสมาเลย ต้องฟ้อง',
   function () { f1.staff.saveShopProduct({ price: 9 }) });
throws('ราคาเป็นตัวหนังสือ ต้องฟ้อง',
   function () { f1.staff.saveShopProduct({ sku: sku3, price: 'ถูกมาก' }) }, 'ตัวเลข');

eq('แก้สินค้าแล้วไม่มีช่องสูตรถูกเขียนทับ',
   f1.fx.sheets['ฐานสินค้า'].overwrittenFormulas, []);

/* ============================================ 4. แบนเนอร์ */
console.log('\n4. แบนเนอร์ — เพิ่ม แก้ ลบ');
var r4 = f1.staff.saveShopBanner({
  slot: 'โปรโมชั่นเด่น', title: 'โปรกันยา', img: DRIVE,
  btn: 'Buy Now', href: 'หมวด:TOOLING', on: true, note: ''
});
truthy('เพิ่มแบนเนอร์ได้ ได้แถวใหม่', r4.fresh && r4.row >= DATA_ROW);
var b4 = f1.staff.getShopEdit().banners;
eq('โหมดแก้ไขเห็นแบนเนอร์หนึ่งอัน', b4.length, 1);
eq('รูปตัวอย่างเป็นที่อยู่รูปจริง', b4[0].show, THUMB);
eq('หน้าร้านเห็นแบนเนอร์ด้วย',
   (f1.guest.shopData().banners['โปรโมชั่นเด่น'] || []).length, 1);

f1.staff.saveShopBanner({ row: b4[0].row, slot: 'โปรโมชั่นเด่น', img: DRIVE, on: false });
eq('ปิดแล้วหน้าร้านไม่เห็น',
   (f1.guest.shopData().banners['โปรโมชั่นเด่น'] || []).length, 0);
eq('แต่โหมดแก้ไขยังเห็นอยู่ ไม่ได้หายไปไหน', f1.staff.getShopEdit().banners.length, 1);

throws('ไม่ใส่รูป ต้องฟ้องก่อนบันทึก',
   function () { f1.staff.saveShopBanner({ slot: 'โปรโมชั่นเด่น', img: '' }) }, 'ลิงก์รูป');
throws('ลิงก์รูปมั่ว ต้องฟ้อง ไม่ใช่ปล่อยเป็นกรอบเปล่าบนหน้าร้าน',
   function () { f1.staff.saveShopBanner({ slot: 'โปรโมชั่นเด่น', img: 'รูปอยู่ในมือถือ' }) },
   'ใช้ไม่ได้');
throws('ตำแหน่งที่ไม่มีในรายการ ต้องฟ้อง',
   function () { f1.staff.saveShopBanner({ slot: 'หน้าสุดท้าย', img: DRIVE }) });
throws('ลิงก์ปุ่มมั่ว ต้องฟ้อง',
   function () {
     f1.staff.saveShopBanner({ slot: 'โปรโมชั่นเด่น', img: DRIVE, href: 'กดตรงนี้' });
   }, 'ลิงก์ปุ่ม');
throws('เลขแถวนอกชีท ต้องฟ้อง ไม่ใช่เขียนลงไปดื้อ ๆ',
   function () { f1.staff.saveShopBanner({ row: 99999, slot: 'โปรโมชั่นเด่น', img: DRIVE }) },
   'ไม่อยู่ในชีท');

var row4 = f1.staff.getShopEdit().banners[0].row;
f1.staff.deleteShopBanner(row4);
eq('ลบแล้วหายจากโหมดแก้ไข', f1.staff.getShopEdit().banners.length, 0);
eq('ลบแล้วหายจากหน้าร้านด้วย', f1.guest.shopData().banners, {});
truthy('ลบแล้วสูตรลำดับของแถวนั้นยังอยู่ ไม่ได้ลบทั้งแถว',
   String(f1.fx.sheets['แบนเนอร์หน้าร้าน'].cell(row4, 1).f || '').indexOf('=') === 0);

/* ============================================ 5. หมวด */
console.log('\n5. หมวด — รูปไอคอน รูปปก ชื่อที่โชว์');
var g5 = f1.staff.getShopEdit().cats[0].group;
f1.staff.saveShopCat({ group: g5, label: 'เครื่องมือตัด', icon: DRIVE, cover: DRIVE2, home: true });
var c5 = f1.staff.getShopEdit().cats.filter(function (c) { return c.group === g5 })[0];
eq('ชื่อที่โชว์ถูกเก็บ', c5.label, 'เครื่องมือตัด');
eq('รูปไอคอนตัวอย่างแปลงแล้ว', c5.iconShow, THUMB);
eq('รูปปกตัวอย่างแปลงแล้ว', c5.coverShow, THUMB2);
eq('หน้าร้านใช้ชื่อที่ตั้งไว้',
   f1.guest.shopData().catCards.filter(function (c) { return c.group === g5 })[0].label,
   'เครื่องมือตัด');

f1.staff.saveShopCat({ group: g5, home: false });
eq('ซ่อนแล้วหายจากหน้าแรก',
   f1.guest.shopData().catCards.filter(function (c) { return c.group === g5 }).length, 0);
throws('ลิงก์รูปหมวดมั่ว ต้องฟ้อง',
   function () { f1.staff.saveShopCat({ group: g5, icon: 'รูปในมือถือ' }) }, 'ใช้ไม่ได้');
throws('ไม่บอกหมวด ต้องฟ้อง', function () { f1.staff.saveShopCat({ label: 'x' }) });

var fresh5 = f1.staff.saveShopCat({ group: 'หมวดใหม่ที่ยังไม่มีในชีท', label: 'ของใหม่' });
truthy('หมวดที่ยังไม่มีแถว ระบบเติมแถวให้เอง', fresh5.fresh);

/* ============================================ 6. หน้าตาหัวหน้าร้าน */
console.log('\n6. โลโก้ · ภาพหัว · ลิงก์แผนที่');
f1.staff.saveShopLook({ logo: DRIVE, cover: DRIVE2, map: 'https://maps.app.goo.gl/abc' });
var l6 = f1.staff.getShopEdit().look;
eq('โลโก้เก็บลิงก์ดิบไว้ให้แก้ต่อได้', l6.logo, DRIVE);
eq('โลโก้ตัวอย่างแปลงแล้ว', l6.logoShow, THUMB);
eq('หน้าร้านได้โลโก้', f1.guest.shopData().logo, THUMB);
eq('หน้าร้านได้ภาพหัว', f1.guest.shopData().cover, THUMB2);
eq('หน้าร้านใช้ลิงก์แผนที่ที่ใส่เอง',
   f1.guest.shopData().map.url, 'https://maps.app.goo.gl/abc');
throws('โลโก้ใส่ลิงก์มั่ว ต้องฟ้อง',
   function () { f1.staff.saveShopLook({ logo: 'รูปในเครื่อง' }) }, 'ใช้ไม่ได้');
throws('ลิงก์แผนที่ที่ไม่ใช่ https ต้องฟ้อง',
   function () { f1.staff.saveShopLook({ map: 'ไปตามถนนพัฒนาชนบท' }) }, 'https');

/* ============================================ 7. กฎเหล็ก */
console.log('\n7. กฎเหล็ก — ห้ามมีช่องสูตรถูกเขียนทับแม้แต่ช่องเดียว');
var f7 = fixture();
/* ล้างร่องรอยจากตอน setup ทิ้งก่อน — setup เป็นคนวางสูตรเอง จึงไม่นับ */
Object.keys(f7.fx.sheets).forEach(function (n) {
  f7.fx.sheets[n].overwrittenFormulas.length = 0;
});

var sku7 = f7.staff.getShopEdit().products[0].sku;
f7.staff.saveShopProduct({ sku: sku7, img: DRIVE, img2: DRIVE2, tag: 'แนะนำ', price: 199 });
var br7 = f7.staff.saveShopBanner({ slot: 'ติดต่อเรา', img: DRIVE, on: true, btn: 'แอดไลน์' });
f7.staff.saveShopBanner({ row: br7.row, slot: 'ติดต่อเรา', img: DRIVE2, on: false });
f7.staff.deleteShopBanner(br7.row);
f7.staff.saveShopCat({ group: f7.staff.getShopEdit().cats[0].group, icon: DRIVE, cover: DRIVE2 });
f7.staff.saveShopLook({ logo: DRIVE, cover: DRIVE2 });

var broke7 = [];
Object.keys(f7.fx.sheets).forEach(function (n) {
  broke7 = broke7.concat(f7.fx.sheets[n].overwrittenFormulas);
});
eq('ทำครบทุกอย่างแล้วไม่มีช่องสูตรถูกเขียนทับ', broke7, []);

/* ============================================ 8. อัปรูปจากเครื่อง */
console.log('\n8. อัปรูปจากเครื่องขึ้นไดรฟ์ แล้วได้ลิงก์กลับมาเลย');
var f8 = fixture();
var PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

throws('ลูกค้าอัปรูปไม่ได้', function () { f8.guest.uploadShopImage({ data: PNG }) });

var r8 = f8.staff.uploadShopImage({ data: PNG, kind: 'prod', tag: 'SKU-141' });
truthy('อัปได้ ได้ลิงก์ไดรฟ์กลับมา', /^https:\/\/drive\.google\.com\/file\/d\//.test(r8.url));
truthy('และได้ที่อยู่รูปจริงมาโชว์ตัวอย่างทันที',
   /^https:\/\/drive\.google\.com\/thumbnail\?id=/.test(r8.show));
truthy('ชื่อไฟล์บอกได้ว่าเป็นรูปของอะไร',
   r8.name.indexOf('สินค้า') === 0 && r8.name.indexOf('SKU-141') > -1);

/* ข้อสำคัญที่สุดของทั้งข้อ — ลืมตั้งแชร์แล้วลูกค้าเห็นกรอบเปล่า
   และเจ้าของร้านจะไม่มีทางรู้ เพราะบนจอตัวเองรูปขึ้นปกติ */
var up8 = f8.staff.__drive.live().filter(function (f) { return f._share })[0];
truthy('ไฟล์ถูกตั้งแชร์ให้คนนอกดูได้ตั้งแต่ตอนอัป', !!up8);
eq('ตั้งเป็น "ทุกคนที่มีลิงก์"', up8._share.access, 'ANYONE_WITH_LINK');
eq('และดูได้อย่างเดียว แก้ไม่ได้', up8._share.perm, 'VIEW');

/* เอาลิงก์ที่ได้ไปใส่สินค้าจริง แล้วหน้าร้านต้องเห็น */
var sku8 = f8.staff.getShopEdit().products[0].sku;
f8.staff.saveShopProduct({ sku: sku8, img: r8.url });
eq('ลิงก์ที่อัปได้ ใส่เป็นรูปสินค้าแล้วหน้าร้านเห็นเลย',
   f8.guest.shopData().items.filter(function (p) { return p.sku === sku8 })[0].img, r8.show);

throws('ไฟล์ที่ไม่ใช่รูป ต้องฟ้อง',
   function () { f8.staff.uploadShopImage({ data: 'data:application/pdf;base64,AAA' }) },
   'รับเฉพาะรูป');
throws('ไม่ได้เลือกไฟล์มา ต้องฟ้อง',
   function () { f8.staff.uploadShopImage({ data: '' }) }, 'ยังไม่ได้เลือกรูป');
throws('รูปใหญ่เกิน 8 MB ต้องฟ้องพร้อมบอกขนาดจริง',
   function () {
     var big = 'data:image/png;base64,' + new Array(13 * 1024 * 1024).join('A');
     f8.staff.uploadShopImage({ data: big });
   }, 'เกิน 8 MB');

/* Workspace ที่ปิดการแชร์สาธารณะ — ต้องไม่ทิ้งไฟล์ที่คนนอกเปิดไม่ได้ค้างไว้ */
var f8b = fixture();
var before8b = f8b.staff.__drive.live().length;
f8b.staff.__denyShare();
throws('ตั้งแชร์ไม่ได้ ต้องบอกชัดว่าติดที่ผู้ดูแลระบบ',
   function () { f8b.staff.uploadShopImage({ data: PNG, kind: 'logo' }) }, 'แชร์');
eq('และต้องลบไฟล์ที่คนนอกเปิดไม่ได้ทิ้ง ไม่ปล่อยค้างไว้ให้เข้าใจผิด',
   f8b.staff.__drive.live().length, before8b);

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
