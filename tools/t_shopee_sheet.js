/*
 * ทดสอบการนำเข้าออเดอร์ Shopee บนชีทจำลอง — รัน Stock.gs / Api.gs ของจริง
 *
 *   node tools/t_shopee_sheet.js
 *
 * ข้อสอบที่สำคัญที่สุดของชุดนี้ เรียงตามความเจ็บถ้าพลาด
 *   1. นำเข้าไฟล์เดิมซ้ำ ต้องไม่ตัดสต๊อกสองรอบ
 *   2. ตรวจก่อนตัด (preview) ต้องไม่เขียนอะไรลงชีทเลยสักช่อง
 *   3. ไม่มีสูตรของชีทถูกเขียนทับแม้แต่ช่องเดียว
 *   4. ใบที่ล็อตไม่พอ ต้องถูกกันไว้ตั้งแต่ตอนตรวจ ไม่ใช่ล้มตอนเขียนแล้วค้างครึ่งชุด
 *   5. คืนสินค้าแล้วของต้องกลับเข้าล็อตครบ
 */
'use strict';
var FS = require('./fakesheet');
var S = require('../apps-script/Shopee.gs');
var DATA_ROW = FS.DATA_ROW;

var fails = 0;
function eq(label, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label +
    (ok ? '' : '\n         ได้ ' + JSON.stringify(got) + '\n         ควรได้ ' + JSON.stringify(want)));
}
function ok_(label, cond, detail) {
  if (!cond) fails++;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (cond ? '' : '  ' + (detail || '')));
}

var HEAD = ['หมายเลขคำสั่งซื้อ', 'สถานะการสั่งซื้อ', 'เวลาการสั่งซื้อ', 'ชื่อสินค้า',
  'ชื่อตัวเลือกสินค้า', 'เลขอ้างอิง SKU (ตัวเลือกสินค้า)', 'จำนวน', 'ราคาขาย',
  'ยอดขายสินค้า(฿)', 'ค่าคอมมิชชั่น', 'ชื่อผู้รับ', 'หมายเลขโทรศัพท์',
  'ที่อยู่ในการจัดส่ง', 'ตัวเลือกการจัดส่ง', 'หมายเลขติดตามพัสดุ*'];

function file(rows) { return S.shopeeParse([HEAD].concat(rows), S.shopeeMatchCols(HEAD), 0).orders; }

function fixture(extra) {
  var f = FS.build({
    lots: [
      { sku: 'SKU-141', lotNo: 'L2601', exp: '2027-01-31', recv: '2026-01-05', qty: 30 },
      { sku: 'SKU-141', lotNo: 'L2602', exp: '2027-06-30', recv: '2026-03-01', qty: 50 },
      { sku: 'SKU-143', lotNo: 'L2610', exp: '2027-03-31', recv: '2026-02-01', qty: 10 }
    ],
    skuMap: (extra && extra.skuMap) || [
      { code: 'SP-141', sku: 'SKU-141', mult: 1 },
      { code: 'SP-143', sku: 'SKU-143', mult: 1 },
      { code: 'SP-PACK5', sku: 'SKU-141', mult: 5 }
    ]
  });
  return { f: f, ctx: FS.load(f, {}) };
}

function lotRemain(f, lotNo) {
  var lot = f.sheets['ล็อตสินค้า'];
  for (var r = DATA_ROW; r <= 1005; r++) {
    if (lot.cell(r, 4).v === lotNo) return Number(lot.cell(r, 9).v || 0);
  }
  return null;
}
function overwritten(f) {
  var all = [];
  Object.keys(f.sheets).forEach(function (n) {
    (f.sheets[n].overwrittenFormulas || []).forEach(function (x) { all.push(n + ' ' + JSON.stringify(x)); });
  });
  return all;
}
function rowsWith(sheet, col) {
  var out = [];
  for (var r = DATA_ROW; r <= sheet.getMaxRows(); r++) {
    var v = sheet.cell(r, col).v;
    if (v !== '' && v !== null && v !== undefined) out.push(r);
  }
  return out;
}

/* ============================================================ ตรวจก่อนตัด */

console.log('\n— ตรวจก่อนตัดสต๊อก —');
var A = fixture();
var orders = file([
  ['2609A1', 'ที่ต้องจัดส่ง', '2026-09-01 10:00', 'ดอกกัด', '3.0', 'SP-141', 10, 129, 1290, 129,
   'คุณเอ', '0812345678', '1 ถ.ทดสอบ', 'Flash Express', 'TH1'],
  ['2609A2', 'ยังไม่ได้ชำระเงิน', '2026-09-01 11:00', 'ดอกกัด', '3.0', 'SP-141', 3, 129, 387, 38.7,
   'คุณบี', '0898765432', '2 ถ.ทดสอบ', 'Flash Express', ''],
  ['2609A3', 'ที่ต้องจัดส่ง', '2026-09-01 12:00', 'ของแปลก', 'ไซซ์เดียว', 'SP-ไม่รู้จัก', 1, 50, 50, 5,
   'คุณซี', '0800000000', '3 ถ.ทดสอบ', 'Flash Express', ''],
  ['2609A4', 'ที่ต้องจัดส่ง', '2026-09-01 13:00', 'ดอกกัด', 'แพ็ค 5', 'SP-PACK5', 2, 600, 1200, 120,
   'คุณดี', '0811111111', '4 ถ.ทดสอบ', 'Flash Express', '']
]);
eq('อ่านไฟล์ได้ 4 ใบ', orders.length, 4);

var pv = A.ctx.previewShopee(orders, { by: 'พนักงาน A' });
eq('พร้อมตัด 2 ใบ (A1 กับ A4)', pv.ready.map(function (x) { return x.sn; }), ['2609A1', '2609A4']);
eq('ข้ามใบที่ยังไม่จ่ายเงิน', pv.skipped.map(function (x) { return x.sn; }), ['2609A2']);
eq('กันใบที่จับคู่ SKU ไม่ได้', pv.blocked.map(function (x) { return x.sn; }), ['2609A3']);
eq('บอกว่าตัวไหนยังไม่ได้จับคู่', pv.unmapped.map(function (x) { return x.code; }), ['SP-ไม่รู้จัก']);
eq('สินค้าจัดเซตคูณจำนวนให้ถูก (2 แพ็ค x5 = 10 ชิ้น)', pv.ready[1].items[0].qty, 10);
eq('ราคาต่อชิ้นหารกลับจากยอดจริง ไม่ใช่ราคาแพ็ค', pv.ready[1].items[0].price, 120);
eq('ยอดของใบจัดเซตยังเท่าที่ Shopee เก็บลูกค้า', pv.ready[1].subtotal, 1200);
eq('ล็อต FEFO เลือกใบที่หมดอายุก่อน', pv.ready[0].items[0].lots, 'L2601 x10');
ok_('บอกความจุที่เหลือของชีทมาด้วย', pv.capacity.head === 495 && pv.capacity.item === 1195,
  JSON.stringify(pv.capacity));
eq('ที่ว่างพอ', pv.enough, true);

eq('ตรวจแล้วต้องไม่มีอะไรถูกเขียนลงชีทออเดอร์',
  rowsWith(A.f.sheets['ออเดอร์_หัวบิล'], 1).length, 0);
eq('ตรวจแล้วต้องไม่มีอะไรถูกเขียนลงทะเบียนนำเข้า',
  rowsWith(A.f.sheets['นำเข้า Shopee'], 2).length, 0);
eq('ตรวจแล้วยอดล็อตต้องไม่ขยับ', lotRemain(A.f, 'L2601'), 30);

/* ============================================================== ตัดจริง */

console.log('\n— ตัดสต๊อกจริง —');
var res = A.ctx.commitShopee(orders, { by: 'พนักงาน A' });
eq('บันทึกสำเร็จ 2 ใบ', res.saved.length, 2);
eq('ได้เลขออเดอร์เรียงกัน', res.saved.map(function (x) { return x.orderNo; }),
  ['AST-26-0001', 'AST-26-0002']);
eq('ยอดของใบแรกตรงกับที่ Shopee เก็บลูกค้า', res.saved[0].subtotal, 1290);
/* สองใบรวมกันตัด SKU-141 ไป 20 ชิ้น (A1 10 ชิ้น + A4 แพ็ค 5 สองแพ็ค = 10 ชิ้น)
   ล็อตที่หมดอายุก่อนต้องถูกกินจนหมดก่อนเสมอ ล็อตที่สองยังไม่ถูกแตะ */
eq('ล็อตที่หมดอายุก่อนถูกตัดรวม 20 ชิ้น', lotRemain(A.f, 'L2601'), 10);
eq('ล็อตที่หมดอายุทีหลังยังไม่ถูกแตะ', lotRemain(A.f, 'L2602'), 50);
eq('ทะเบียนนำเข้าเก็บไว้ 2 ใบ', rowsWith(A.f.sheets['นำเข้า Shopee'], 2).length, 2);
eq('ไม่มีสูตรถูกเขียนทับ', overwritten(A.f), []);

var imp = A.f.sheets['นำเข้า Shopee'];
eq('ทะเบียนบันทึกเลขที่ Shopee', imp.cell(DATA_ROW, 2).v, '2609A1');
eq('ทะเบียนบันทึกเลขออเดอร์ในระบบ', imp.cell(DATA_ROW, 5).v, 'AST-26-0001');
eq('ทะเบียนบันทึกค่าธรรมเนียม Shopee', imp.cell(DATA_ROW, 7).v, 129);
eq('ทะเบียนบันทึกสถานะ', imp.cell(DATA_ROW, 8).v, 'ตัดสต๊อกแล้ว');

/* ------------------------------------------------- นำเข้าไฟล์เดิมซ้ำอีกรอบ */

console.log('\n— นำเข้าไฟล์เดิมซ้ำ —');
var pv2 = A.ctx.previewShopee(orders, { by: 'พนักงาน A' });
eq('ตรวจรอบสอง ไม่มีใบไหนพร้อมตัดอีกแล้ว', pv2.ready.length, 0);
ok_('บอกว่าเคยนำเข้าไปแล้วเป็นใบไหน',
  /AST-26-0001/.test(pv2.skipped.map(function (x) { return x.why; }).join(' ')),
  JSON.stringify(pv2.skipped));

var res2 = A.ctx.commitShopee(orders, { by: 'พนักงาน A' });
eq('ตัดซ้ำไม่เกิดออเดอร์ใหม่', res2.saved.length, 0);
eq('ยอดล็อตไม่ขยับจากการกดซ้ำ', lotRemain(A.f, 'L2601'), 10);
eq('ชีทหัวบิลยังมี 2 ใบเท่าเดิม', rowsWith(A.f.sheets['ออเดอร์_หัวบิล'], 1).length, 2);

/* ==================================================== ล็อตไม่พอ กันไว้ก่อน */

console.log('\n— ล็อตมีของไม่พอ —');
var B = fixture();
var big = file([
  ['2609B1', 'ที่ต้องจัดส่ง', '2026-09-02 10:00', 'ดอกกัด', '3.175', 'SP-143', 99, 149, 14751, 1475,
   'คุณอี', '0800000001', '5 ถ.ทดสอบ', 'Flash Express', ''],
  ['2609B2', 'ที่ต้องจัดส่ง', '2026-09-02 11:00', 'ดอกกัด', '3.0', 'SP-141', 5, 129, 645, 64,
   'คุณเอฟ', '0800000002', '6 ถ.ทดสอบ', 'Flash Express', '']
]);
var pvB = B.ctx.previewShopee(big, {});
eq('ใบที่ล็อตไม่พอถูกกันไว้', pvB.blocked.map(function (x) { return x.sn; }), ['2609B1']);
ok_('บอกตัวเลขจริงว่าเหลือเท่าไร', /เหลือ 10/.test(pvB.blocked[0].why), pvB.blocked[0].why);
eq('ใบที่เหลือยังตัดได้ตามปกติ', pvB.ready.map(function (x) { return x.sn; }), ['2609B2']);

/* ล็อตซ้อนกันข้ามใบ — ใบหลังต้องเห็นว่าไม่พอตั้งแต่ตอนตรวจ ไม่ใช่ไปล้มตอนเขียน */
var C = fixture();
var overlap = file([
  ['2609C1', 'ที่ต้องจัดส่ง', '2026-09-03 10:00', 'ดอกกัด', '3.175', 'SP-143', 8, 149, 1192, 119,
   'คุณจี', '0800000003', '7 ถ.ทดสอบ', 'Flash Express', ''],
  ['2609C2', 'ที่ต้องจัดส่ง', '2026-09-03 11:00', 'ดอกกัด', '3.175', 'SP-143', 8, 149, 1192, 119,
   'คุณเอช', '0800000004', '8 ถ.ทดสอบ', 'Flash Express', '']
]);
var pvC = C.ctx.previewShopee(overlap, {});
eq('สองใบแย่งล็อตเดียวกัน ใบหลังถูกกันไว้ตั้งแต่ตอนตรวจ',
  [pvC.ready.length, pvC.blocked.length], [1, 1]);

/* ==================================================== ชีทเต็ม ต้องบอกก่อน */

console.log('\n— ชีทออเดอร์ใกล้เต็ม —');
var D = { f: FS.build({ headLimit: 8, itemLimit: 20,
  lots: [{ sku: 'SKU-141', lotNo: 'L1', exp: '2027-01-31', recv: '2026-01-05', qty: 999 }],
  skuMap: [{ code: 'SP-141', sku: 'SKU-141', mult: 1 }] }) };
D.ctx = FS.load(D.f, {});
var many = [];
for (var i = 1; i <= 5; i++) {
  many.push(['2609D' + i, 'ที่ต้องจัดส่ง', '2026-09-04 10:00', 'ดอกกัด', '3.0', 'SP-141',
    1, 129, 129, 12, 'ลูกค้า ' + i, '0800000000', 'ที่อยู่', 'Flash Express', '']);
}
var pvD = D.ctx.previewShopee(file(many), {});
eq('ชีทรับได้แค่ 3 ใบ แต่จะนำเข้า 5 ใบ → บอกว่าไม่พอ', pvD.enough, false);
eq('บอกจำนวนที่ต้องใช้', pvD.need.head, 5);
eq('บอกที่ว่างที่เหลือจริง', pvD.capacity.head, 3);

/* ======================================================== คืนสินค้า */

console.log('\n— คืนสินค้า —');
var before = lotRemain(A.f, 'L2601');
var ret = A.ctx.recordReturn({ orderNo: 'AST-26-0001', why: 'ลูกค้าตีกลับ ของไม่ตรงรุ่น', by: 'พนักงาน A' });
eq('คืนของครบตามที่ขายไป', ret.back[0].qty, 10);
eq('ของกลับเข้าล็อตเดิม', lotRemain(A.f, 'L2601'), before + 10);
eq('ลงชีทรับเข้าไว้ด้วย 1 บรรทัด', rowsWith(A.f.sheets['รับเข้า'], 6).length, 1);
eq('ชนิดรายการคือของคืนจากลูกค้า', A.f.sheets['รับเข้า'].cell(DATA_ROW, 4).v, 'คืนจากลูกค้า');
eq('อ้างเลขออเดอร์ที่คืนไว้', A.f.sheets['รับเข้า'].cell(DATA_ROW, 5).v, 'AST-26-0001');
eq('ทะเบียนนำเข้าเปลี่ยนสถานะเป็นคืนของแล้ว', imp.cell(DATA_ROW, 8).v, 'คืนของแล้ว');
eq('ยังไม่มีสูตรถูกเขียนทับหลังคืนของ', overwritten(A.f), []);

var bad = null;
try { A.ctx.recordReturn({ orderNo: 'AST-26-0001', why: '' }); } catch (e) { bad = e.message; }
ok_('คืนของโดยไม่บอกเหตุผลไม่ได้', bad !== null && /เหตุผล/.test(bad), String(bad));

/* ======================================================== ประวัติเคลื่อนไหว */

console.log('\n— ประวัติรับเข้า–ขายออก–คืนสินค้า —');
var mv = A.ctx.getMoves({});
var kinds = {};
mv.moves.forEach(function (m) { kinds[m.kind] = (kinds[m.kind] || 0) + 1; });
ok_('มีทั้งขายออกและของคืนอยู่ในเส้นเดียวกัน', kinds.out >= 2 && kinds.ret === 1, JSON.stringify(kinds));
ok_('ขายออกบันทึกเป็นจำนวนติดลบ',
  mv.moves.filter(function (m) { return m.kind === 'out'; })[0].qty < 0);
var one = A.ctx.getMoves({ sku: 'SKU-143' });
ok_('กรองตาม SKU ได้', one.moves.every(function (m) { return m.sku === 'SKU-143'; }));

/* ======================================================== หน้าสต๊อก */

console.log('\n— หน้าสต๊อก —');
var board = A.ctx.getStockBoard();
ok_('คืนรายการสินค้าครบ', board.products.length === 3, board.products.length);
ok_('บอกความจุชีทมาด้วย', board.capacity.head === 493, JSON.stringify(board.capacity));
ok_('เตือนล็อตที่ใกล้หมดอายุได้ (ยังไม่มีในชุดทดสอบนี้)', Array.isArray(board.expiring));

/* ======================================================== ช่องเชื่อม API */

console.log('\n— ช่องเชื่อม Shopee API —');
var st = A.ctx.shopeeApiStatus();
eq('ยังไม่ได้ตั้งค่า → ไม่พร้อม', st.ready, false);
eq('บอกว่าขาดค่าอะไรบ้าง', st.missing.length, 4);
var apiErr = null;
try { A.ctx.shopeeFetchOrders('2026-09-01', '2026-09-05'); } catch (e) { apiErr = e.message; }
ok_('เรียก API ทั้งที่ยังไม่ตั้งค่า → บอกตรง ๆ ว่าต้องทำอะไร',
  apiErr !== null && /ยังไม่ได้เชื่อม/.test(apiErr), String(apiErr));
eq('ลายเซ็นคำนวณตรงตามสูตรของ Shopee',
  A.ctx.shopeeSign_('1000/api/v2/order/get_order_list1600000000tok2000', 'testkey'),
  require('crypto').createHmac('sha256', 'testkey')
    .update('1000/api/v2/order/get_order_list1600000000tok2000').digest('hex'));

console.log(fails ? '\nไม่ผ่าน ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
