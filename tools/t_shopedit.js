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

/* ============================================ 9. ดึงเฉพาะที่ต้องใช้ */
console.log('\n9. แต่ละหน้าดึงเฉพาะก้อนที่ตัวเองใช้ ไม่ลากทั้งร้านมาทุกครั้ง');
var f9 = fixture();
var look9 = f9.staff.getShopEdit('look');
eq('ขอแค่หน้าตาหัวร้าน ได้ look มา', typeof look9.look, 'object');
eq('และไม่ลากสินค้ามาด้วย', look9.products, undefined);
eq('ไม่ลากแบนเนอร์มาด้วย', look9.banners, undefined);
eq('ไม่ลากหมวดมาด้วย', look9.cats, undefined);
truthy('แต่ยังส่งตัวเลือกที่หน้าจอต้องใช้มาเสมอ', look9.slots.length === 3);

var ban9 = f9.staff.getShopEdit('ban');
eq('ขอแบนเนอร์ ได้แบนเนอร์', Array.isArray(ban9.banners), true);
eq('และไม่ลากสินค้ามาด้วย', ban9.products, undefined);

var cat9 = f9.staff.getShopEdit('cat');
eq('ขอหมวด ได้หมวด', Array.isArray(cat9.cats), true);
eq('และไม่ลากสินค้ามาด้วย', cat9.products, undefined);

var prod9 = f9.staff.getShopEdit('prod');
eq('ขอสินค้า ได้สินค้า', Array.isArray(prod9.products), true);
eq('และไม่ลากแบนเนอร์มาด้วย', prod9.banners, undefined);

var all9 = f9.staff.getShopEdit();
truthy('ไม่บอก scope = เอาทั้งหมด (หน้าจอรุ่นเก่าที่ยังไม่ส่ง scope ต้องใช้ได้)',
   !!all9.products && !!all9.banners && !!all9.cats && !!all9.look);
var bad9 = f9.staff.getShopEdit('อะไรก็ไม่รู้');
truthy('scope มั่ว = เอาทั้งหมด ไม่ใช่คืนก้อนว่างแล้วหน้าจอโล่ง',
   !!bad9.products && !!bad9.look);

truthy('หน้าแก้ข้อมูลร้านไม่มียอดคงเหลือหลุดมาด้วย',
   prod9.products.every(function (p) { return p.remain === undefined }));

/* พิสูจน์ว่าหน้าเบา ๆ ไม่ได้ไปแตะชีทใหญ่จริง ๆ
   ถ้าวันหลังมีใครเผลอเอา readProducts_() กลับไปใส่ในทางของหน้า look
   ข้อสอบจะฟ้องทันที ก่อนที่เจ้าของร้านจะเจอหน้าค้างสิบวินาที */
function readOf(names) {
  var before = {};
  names.forEach(function (n) { before[n] = FS.SHEET_READ[n] || 0 });
  return function () {
    var d = 0;
    names.forEach(function (n) { d += (FS.SHEET_READ[n] || 0) - before[n] });
    return d;
  };
}

var heavy9 = ['ฐานสินค้า', 'สต๊อกคงเหลือ'];
var t9 = readOf(heavy9);
f9.staff.getShopEdit('look');
eq('หน้าหน้าตาหัวร้านไม่แตะชีท ฐานสินค้า และ สต๊อกคงเหลือ เลยสักช่อง', t9(), 0);

t9 = readOf(heavy9);
f9.staff.getShopEdit('ban');
eq('หน้าแบนเนอร์ก็ไม่แตะ', t9(), 0);

/* หน้าหมวดต้องรู้ว่าแต่ละหมวดมีสินค้ากี่ตัว (หมวดที่ไม่มีของ ลูกค้าไม่เห็น
   ต้องบอกให้เจ้าของร้านรู้) จึงอ่าน ฐานสินค้า ได้ แต่อ่านแค่คอลัมน์หมวดคอลัมน์เดียว
   ไม่ใช่ลากทั้งชีท และห้ามแตะชีทสต๊อกที่เป็นสูตรทั้งใบ */
var t9c = readOf(['สต๊อกคงเหลือ']);
var t9p = readOf(['ฐานสินค้า']);
f9.staff.getShopEdit('cat');
eq('หน้าหมวดไม่แตะชีทสต๊อก', t9c(), 0);
var t9pn = t9p();
truthy('หน้าหมวดอ่าน ฐานสินค้า แค่คอลัมน์เดียว (' + t9pn + ' ช่อง)',
   t9pn > 0 && t9pn < 400);

var t9b = readOf(['สต๊อกคงเหลือ']);
f9.staff.getShopEdit('prod');
eq('หน้าสินค้าอ่าน ฐานสินค้า แต่ไม่ต้องอ่านชีทสต๊อกที่เป็นสูตรทั้งใบ', t9b(), 0);

/* ============================================ 10. ชีทยังไม่มีแถว ต้องเติมให้เอง */
console.log('\n10. ชีท ตั้งค่าแอป ยังไม่มีแถวโลโก้ — ต้องเติมให้ ไม่ใช่โยน error ไล่ไปทำอย่างอื่น');
var f10 = FS.build();
var st10 = FS.load(f10, {});
st10.setup();
/* จงใจไม่สั่ง setupShopColumns — จำลองชีทของคนที่ตั้งระบบไว้ตั้งแต่ก่อนมีหน้าร้าน */
var app10 = f10.sheets['ตั้งค่าแอป'];
for (var r10 = DATA_ROW; r10 <= app10.getMaxRows(); r10++) {
  var k10 = String(app10.cell(r10, 1).v || '').trim();
  if (k10 === 'โลโก้ร้าน (ลิงก์รูป)' || k10 === 'ภาพหัวหน้าร้าน (ลิงก์รูป)' ||
      k10 === 'ลิงก์แผนที่ร้าน') {
    app10.cell(r10, 1).v = '';
    app10.cell(r10, 2).v = '';
  }
}
eq('เริ่มจากชีทที่ยังไม่มีแถวโลโก้', st10.getShopEdit('look').look.logo, '');

var DRIVE10 = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view';
st10.saveShopLook({ logo: DRIVE10 });
eq('บันทึกผ่าน ไม่ล้ม ไม่ไล่ให้ไปสั่งฟังก์ชันอื่นก่อน',
   st10.getShopEdit('look').look.logo, DRIVE10);
eq('และหน้าร้านเห็นโลโก้ทันที',
   FS.load(f10, { email: '' }).shopData().logo,
   'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUv&sz=w1000');

st10.saveShopLook({ cover: DRIVE10, map: 'https://maps.app.goo.gl/x' });
var l10 = st10.getShopEdit('look').look;
eq('เติมแถวที่สองได้ด้วย', l10.cover, DRIVE10);
eq('และแถวที่สาม', l10.map, 'https://maps.app.goo.gl/x');
eq('บันทึกซ้ำไม่สร้างแถวซ้ำ', (function () {
  st10.saveShopLook({ logo: DRIVE10 });
  var n = 0;
  for (var r = DATA_ROW; r <= app10.getMaxRows(); r++) {
    if (String(app10.cell(r, 1).v || '').trim() === 'โลโก้ร้าน (ลิงก์รูป)') n++;
  }
  return n;
})(), 1);

/* ============================================ 11. หมวดหมู่ */
console.log('\n11. เปลี่ยนหมวดสินค้า และย้ายทั้งชุดในครั้งเดียว');
var f11 = fixture();
var p11 = f11.staff.getShopEdit('prod');
truthy('ส่งรายชื่อหมวดที่มีอยู่มาให้เลือกด้วย', Array.isArray(p11.groups));
var sku11 = p11.products[0].sku;
var was11 = p11.products[0].group;

f11.staff.saveShopProduct({ sku: sku11, group: 'Router Bit' });
eq('เปลี่ยนหมวดของสินค้าตัวเดียวได้',
   f11.staff.getShopEdit('prod').products.filter(function (x) { return x.sku === sku11 })[0].group,
   'Router Bit');
truthy('หน้าร้านเห็นหมวดใหม่',
   f11.guest.shopData().cats.indexOf('Router Bit') > -1);
truthy('และมีการ์ดหมวดใหม่ให้ลูกค้ากด',
   f11.guest.shopData().catCards.some(function (c) { return c.group === 'Router Bit' }));

f11.staff.saveShopProduct({ sku: sku11, group: '  Router   Bit  ' });
eq('เว้นวรรคเกินมาถูกตัดให้สะอาด ไม่กลายเป็นคนละหมวด',
   f11.staff.getShopEdit('prod').products.filter(function (x) { return x.sku === sku11 })[0].group,
   'Router Bit');
eq('ส่งค่าเดิมซ้ำ ไม่นับว่าแก้',
   f11.staff.saveShopProduct({ sku: sku11, group: 'Router Bit' }).changed, 0);
throws('ชื่อหมวดยาวเกินไป ต้องฟ้อง',
   function () {
     f11.staff.saveShopProduct({ sku: sku11, group: new Array(80).join('ก') });
   }, 'ยาวเกินไป');

/* ย้ายเป็นชุด — ท่าที่ใช้ได้จริงกับสินค้าร้อยกว่าตัว */
var all11 = f11.staff.getShopEdit('prod').products;
var many11 = all11.slice(0, 3).map(function (x) { return x.sku });
var mv11 = f11.staff.moveShopCategory({ group: 'Endmill Corn', skus: many11 });
truthy('ย้ายเป็นชุดได้', mv11.ok === true);
eq('บอกจำนวนที่ย้ายจริง', mv11.moved, many11.length);
var after11 = f11.staff.getShopEdit('prod').products;
eq('ทุกตัวในชุดย้ายไปหมวดใหม่ครบ',
   after11.filter(function (x) { return many11.indexOf(x.sku) > -1 })
     .every(function (x) { return x.group === 'Endmill Corn' }), true);

var mv11b = f11.staff.moveShopCategory({ group: 'Endmill Corn', skus: many11 });
eq('ย้ายซ้ำเข้าหมวดเดิม ไม่นับว่าย้าย', mv11b.moved, 0);
eq('แต่บอกว่ามีกี่ตัวที่อยู่หมวดนั้นอยู่แล้ว', mv11b.same, many11.length);

var mv11c = f11.staff.moveShopCategory({ group: 'x', skus: many11.concat(['SKU-ไม่มีจริง']) });
eq('รหัสที่ไม่มีในชีท ถูกรายงานกลับมา ไม่เงียบหาย', mv11c.miss, ['SKU-ไม่มีจริง']);

throws('ไม่เลือกสินค้าเลย ต้องฟ้อง',
   function () { f11.staff.moveShopCategory({ group: 'x', skus: [] }) }, 'ยังไม่ได้เลือก');
throws('ไม่ใส่ชื่อหมวด ต้องฟ้อง',
   function () { f11.staff.moveShopCategory({ group: '  ', skus: many11 }) }, 'ชื่อหมวด');
throws('ย้ายทีละเป็นพัน ต้องฟ้องก่อน ไม่ใช่ปล่อยให้หมดเวลากลางทาง',
   function () {
     var big = [];
     for (var i = 0; i < 300; i++) big.push('SKU-' + i);
     f11.staff.moveShopCategory({ group: 'x', skus: big });
   }, 'ไม่เกิน');

throws('ลูกค้าย้ายหมวดไม่ได้',
   function () { f11.guest.moveShopCategory({ group: 'x', skus: ['SKU-141'] }) });

/* ชื่อที่โชว์ให้ลูกค้า — แยกจากชื่อหมวดในชีท
   (ข้อก่อนหน้าย้ายของไปหมวด x หมด ต้องย้ายกลับก่อน ไม่งั้นหมวดนี้ไม่มีสินค้า
    แล้วการ์ดหมวดจะหายไปตามกติกา "หมวดที่ไม่มีของขาย ไม่ต้องโชว์") */
f11.staff.moveShopCategory({ group: 'Endmill Corn', skus: many11 });
f11.staff.saveShopCat({ group: 'Endmill Corn', label: 'ดอกกัดข้าวโพด' });
eq('ลูกค้าเห็นชื่อที่ตั้งไว้ ไม่ใช่ชื่อในชีท',
   f11.guest.shopData().catCards.filter(function (c) { return c.group === 'Endmill Corn' })[0].label,
   'ดอกกัดข้าวโพด');
eq('แต่ชื่อหมวดในชีทยังเป็นของเดิม ไม่ถูกแก้ตาม',
   f11.staff.getShopEdit('prod').products
     .filter(function (x) { return many11.indexOf(x.sku) > -1 })[0].group,
   'Endmill Corn');

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
