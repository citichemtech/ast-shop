/*
 * ทดสอบการเขียนออเดอร์ลงชีท — รัน Sheets.gs / Api.gs จริงบนชีทจำลอง
 *
 *   node tools/t_order_sheet.js
 *
 * สิ่งที่ต้องพิสูจน์ให้ได้ ไม่ใช่แค่ "บันทึกแล้วไม่ error"
 *   - ไม่มีสูตรของชีทถูกเขียนทับแม้แต่ช่องเดียว
 *   - บันทึกล้ม แล้วในชีทต้องไม่เหลือออเดอร์ครึ่งใบ
 *   - กดซ้ำ / เน็ตหลุดแล้วยิงใหม่ ต้องไม่ได้ออเดอร์สองใบ
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
function throws(label, fn, needle) {
  var msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  var ok = msg !== null && (!needle || msg.indexOf(needle) > -1);
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + '  ' +
    (msg === null ? 'ไม่ได้ error เลย' : 'error: ' + msg.slice(0, 110)));
  return msg;
}

function order(extra) {
  var o = {
    clientKey: 'k-' + Math.random(),
    date: '2026-08-29', channel: 'เพจ Facebook', cust: 'คุณทดสอบ ระบบ',
    tel: '0812345678', addr: '1/2 ถ.ทดสอบ ต.ในเมือง อ.เมือง เชียงใหม่ 50000',
    carrier: 'Flash Express', track: '', vat: false, discount: 0, ship: 50,
    status: 'รอชำระ', note: '',
    items: [{ sku: 'SKU-141', qty: 20, price: 110 }, { sku: 'SKU-143', qty: 5, price: '' }]
  };
  for (var k in (extra || {})) o[k] = extra[k];
  return o;
}

function rowsWith(sheet, col) {
  var out = [];
  for (var r = DATA_ROW; r <= sheet.getMaxRows(); r++) {
    var v = sheet.cell(r, col).v;
    if (v !== '' && v !== null && v !== undefined) out.push(r);
  }
  return out;
}

/* ============================================================ 1. บันทึกปกติ */
console.log('\n1. บันทึกออเดอร์ปกติ');
var fx = FS.build();
var api = FS.load(fx);
var r1 = api.createOrder(order());
eq('ได้เลขออเดอร์ใบแรก', r1.no, 'AST-26-0001');
eq('ยอดสินค้า = 20x110 + 5x149', r1.subtotal, 20 * 110 + 5 * 149);
eq('ยอดสุทธิ = ยอดสินค้า + ค่าส่ง 50', r1.net, 20 * 110 + 5 * 149 + 50);

var head = fx.sheets['ออเดอร์_หัวบิล'], item = fx.sheets['ออเดอร์_รายการ'];
eq('เขียนหัวบิล 1 แถว', rowsWith(head, 1), [6]);
eq('เขียนรายการ 2 แถว', rowsWith(item, 2), [6, 7]);
eq('ชื่อลูกค้าลงถูกช่อง', head.cell(6, 4).v, 'คุณทดสอบ ระบบ');
eq('ค่าจัดส่งลงถูกช่อง', head.cell(6, 12).v, 50);
eq('ราคาขายจริงบรรทัดแรก = 110', item.cell(6, 9).v, 110);
eq('บรรทัดที่ไม่ได้ตั้งราคาพิเศษ ต้องปล่อยว่างไว้ให้ชีทใช้ราคามาตรฐาน', item.cell(7, 9).v, '');

console.log('\n   ตรวจว่าไม่มีสูตรถูกเขียนทับ');
var over = [];
for (var n in fx.sheets) over = over.concat(fx.sheets[n].overwrittenFormulas);
eq('จำนวนช่องสูตรที่ถูกเขียนทับ', over, []);

/* ================================================== 2. เลขออเดอร์ไม่ซ้ำกัน */
console.log('\n2. เลขออเดอร์เดินต่อ ไม่ซ้ำ');
var r2 = api.createOrder(order());
eq('ใบที่สอง', r2.no, 'AST-26-0002');
var r3 = api.createOrder(order());
eq('ใบที่สาม', r3.no, 'AST-26-0003');
eq('หัวบิลมี 3 แถว', rowsWith(head, 1).length, 3);
eq('รายการมี 6 แถว', rowsWith(item, 2).length, 6);

/* ============================================== 3. กดซ้ำ ต้องไม่ได้สองใบ */
console.log('\n3. กดบันทึกซ้ำด้วย clientKey เดิม');
var same = order({ clientKey: 'ปุ่มเดิม-กดสองที' });
var a = api.createOrder(same);
var b = api.createOrder(same);
eq('ครั้งแรกได้เลขใหม่', a.no, 'AST-26-0004');
eq('ครั้งที่สองได้เลขเดิม', b.no, 'AST-26-0004');
eq('ครั้งที่สองบอกว่าซ้ำ', b.duplicate, true);
eq('หัวบิลยังมีแค่ 4 แถว ไม่ใช่ 5', rowsWith(head, 1).length, 4);

console.log('\n   ไม่ส่ง clientKey มา ต้องไม่ยอมบันทึก');
throws('ปฏิเสธคำขอที่ไม่มี clientKey', function () {
  api.createOrder(order({ clientKey: '' }));
}, 'clientKey');

/* ================================================================ 4. FEFO */
console.log('\n4. ตัดล็อตแบบ FEFO');
var fx4 = FS.build({
  lots: [
    { sku: 'CHEM-001', lotNo: 'L-2703', exp: '2027-03-31', recv: '2026-01-10', qty: 10 },
    { sku: 'CHEM-001', lotNo: 'L-2610', exp: '2026-10-31', recv: '2026-02-20', qty: 4 }
  ]
});
var api4 = FS.load(fx4);
var r4 = api4.createOrder(order({ items: [{ sku: 'CHEM-001', qty: 6, price: '' }] }));
var cut = fx4.sheets['ตัดล็อต'], lot = fx4.sheets['ล็อตสินค้า'];
eq('ตัดสองล็อต', rowsWith(cut, 2).length, 2);
eq('ล็อตที่หมดอายุก่อน ถูกตัดก่อนและตัดหมด 4', [cut.cell(6, 5).v, cut.cell(6, 6).v], ['L-2610', 4]);
eq('ที่เหลือ 2 ไปเอาจากล็อตถัดไป', [cut.cell(7, 5).v, cut.cell(7, 6).v], ['L-2703', 2]);
eq('คงเหลือล็อต L-2703 = 8', lot.cell(6, 9).v, 8);
eq('คงเหลือล็อต L-2610 = 0', lot.cell(7, 9).v, 0);
eq('บอกกลับไปให้หน้าจอเห็นว่าตัดล็อตไหน', r4.lots, ['CHEM-001: L-2610 x4, L-2703 x2']);

console.log('\n   สินค้าที่ไม่ได้คุมล็อต ต้องบันทึกได้ตามปกติ');
var r4b = api4.createOrder(order({ items: [{ sku: 'SKU-141', qty: 3, price: '' }] }));
eq('บันทึกผ่าน', r4b.ok, true);
eq('ไม่มีบรรทัดตัดล็อตเพิ่ม', rowsWith(cut, 2).length, 2);

console.log('\n   สินค้าตัวเดียวกันสองบรรทัดในใบเดียว ต้องไม่แย่งล็อตเดียวกัน');
var fx4c = FS.build({
  lots: [{ sku: 'CHEM-001', lotNo: 'L-A', exp: '2026-12-31', recv: '2026-01-01', qty: 5 },
         { sku: 'CHEM-001', lotNo: 'L-B', exp: '2027-12-31', recv: '2026-01-01', qty: 5 }]
});
var api4c = FS.load(fx4c);
api4c.createOrder(order({ items: [{ sku: 'CHEM-001', qty: 3, price: '' }, { sku: 'CHEM-001', qty: 4, price: '' }] }));
var cut4c = fx4c.sheets['ตัดล็อต'];
var picks = rowsWith(cut4c, 2).map(function (r) { return cut4c.cell(r, 5).v + 'x' + cut4c.cell(r, 6).v; });
eq('รวมกันต้องไม่เกินของที่มี', picks, ['L-Ax3', 'L-Ax2', 'L-Bx2']);
eq('ล็อต L-A ถูกตัดหมดพอดี ไม่ติดลบ', fx4c.sheets['ล็อตสินค้า'].cell(6, 9).v, 0);

/* ================================================= 5. ของไม่พอ ต้องไม่เขียน */
console.log('\n5. ล็อตมีของไม่พอ');
var fx5 = FS.build({ lots: [{ sku: 'CHEM-001', lotNo: 'L-1', exp: '2027-01-01', recv: '2026-01-01', qty: 2 }] });
var api5 = FS.load(fx5);
throws('บอกตัวเลขจริงว่าเหลือเท่าไร', function () {
  api5.createOrder(order({ items: [{ sku: 'CHEM-001', qty: 9, price: '' }] }));
}, 'เหลือรวม 2');
eq('ไม่เขียนหัวบิลเลย', rowsWith(fx5.sheets['ออเดอร์_หัวบิล'], 1), []);
eq('ไม่เขียนรายการเลย', rowsWith(fx5.sheets['ออเดอร์_รายการ'], 2), []);
eq('ไม่เขียนบรรทัดตัดล็อตเลย', rowsWith(fx5.sheets['ตัดล็อต'], 2), []);

console.log('\n   ล็อตหมดอายุแล้ว ต้องไม่ยอมตัดขาย');
var fx5b = FS.build({ lots: [{ sku: 'CHEM-001', lotNo: 'L-เก่า', exp: '2020-01-01', recv: '2019-01-01', qty: 50 }] });
var api5b = FS.load(fx5b);
throws('ปฏิเสธพร้อมบอกเลขล็อต', function () {
  api5b.createOrder(order({ items: [{ sku: 'CHEM-001', qty: 1, price: '' }] }));
}, 'L-เก่า');
eq('ไม่เขียนอะไรลงชีท', rowsWith(fx5b.sheets['ออเดอร์_หัวบิล'], 1), []);

/* ====================================== 6. ข้อมูลไม่ถูกต้อง ต้องกันตั้งแต่ต้น */
console.log('\n6. ข้อมูลไม่ถูกต้อง');
var fx6 = FS.build();
var api6 = FS.load(fx6);
throws('ไม่มีชื่อลูกค้า', function () { api6.createOrder(order({ cust: '' })); }, 'ชื่อลูกค้า');
throws('ไม่มีรายการสินค้า', function () { api6.createOrder(order({ items: [] })); }, 'รายการสินค้า');
throws('SKU ไม่มีในฐานสินค้า', function () {
  api6.createOrder(order({ items: [{ sku: 'SKU-ไม่มีจริง', qty: 1 }] }));
}, 'ไม่พบ SKU');
throws('จำนวนเป็น 0', function () {
  api6.createOrder(order({ items: [{ sku: 'SKU-141', qty: 0 }] }));
}, 'จำนวน');
throws('จำนวนเป็นทศนิยม', function () {
  api6.createOrder(order({ items: [{ sku: 'SKU-141', qty: 2.5 }] }));
}, 'จำนวนเต็ม');
throws('ช่องทางขายที่ไม่มีในชีท ตั้งค่า', function () {
  api6.createOrder(order({ channel: 'TikTok' }));
}, 'ไม่มีในตัวเลือก');
eq('ทั้งหมดนี้ไม่ทิ้งอะไรไว้ในชีทเลย', rowsWith(fx6.sheets['ออเดอร์_หัวบิล'], 1), []);

/* =============================================== 7. ชีทเต็ม ต้องบอกตรง ๆ */
console.log('\n7. ชีทเต็ม (สูตรลากมาไม่ถึง)');
var fx7 = FS.build({ headLimit: 7 });   // มีที่ว่างแค่ 2 แถว
var api7 = FS.load(fx7);
api7.createOrder(order());
api7.createOrder(order());
var m7 = throws('ใบที่สามต้องถูกปฏิเสธพร้อมบอกวิธีแก้', function () { api7.createOrder(order()); }, 'เต็มแล้ว');
eq('บอกด้วยว่าสูตรมีถึงแถวไหน', /แถว 7/.test(m7 || ''), true);
eq('หัวบิลยังมี 2 แถวเท่าเดิม', rowsWith(fx7.sheets['ออเดอร์_หัวบิล'], 1).length, 2);
eq('ไม่มีรายการค้างจากใบที่บันทึกไม่สำเร็จ', rowsWith(fx7.sheets['ออเดอร์_รายการ'], 2).length, 4);

/* ============================ 8. ชีทคำนวณไม่ตรง ต้องถอยทั้งใบ ไม่ทิ้งครึ่งใบ */
console.log('\n8. สูตรในชีทถูกแก้จนยอดไม่ตรง');
var fx8 = FS.build();
var api8 = FS.load(fx8);
var realRecalc = fx8.recalc;
fx8.recalc = function () { realRecalc(); fx8.sheets['ออเดอร์_หัวบิล'].cell(6, 10).v = 1; };
throws('ต้องจับได้ว่ายอดไม่ตรง', function () { api8.createOrder(order()); }, 'ไม่ตรงกับที่ควรเป็น');
eq('ถอยหัวบิลออกหมด', rowsWith(fx8.sheets['ออเดอร์_หัวบิล'], 1), []);
eq('ถอยรายการออกหมด ไม่เหลือออเดอร์ครึ่งใบ', rowsWith(fx8.sheets['ออเดอร์_รายการ'], 2), []);
var over8 = [];
for (var n8 in fx8.sheets) over8 = over8.concat(fx8.sheets[n8].overwrittenFormulas);
eq('ตอนถอยกลับ ต้องไม่ไปล้างสูตรทิ้งด้วย', over8, []);

/* ==================================================== 9. สิทธิ์เข้าใช้งาน */
console.log('\n9. สิทธิ์เข้าใช้งาน');
var fx9 = FS.build();
throws('อีเมลนอกบริษัท ที่ไม่ได้ถูกแชร์ชีท เข้าไม่ได้', function () {
  FS.load(fx9, { email: 'someone@gmail.com', canOpen: false }).createOrder(order());
}, 'ไม่มีสิทธิ์');
throws('ระบบไม่รู้ว่าใคร ต้องปฏิเสธไว้ก่อน', function () {
  FS.load(fx9, { email: '' }).createOrder(order());
}, 'ไม่ทราบว่าคุณเป็นใคร');
eq('คนนอกยิงมาแล้วไม่มีอะไรลงชีท', rowsWith(fx9.sheets['ออเดอร์_หัวบิล'], 1), []);

console.log('\n   ชื่อคนบันทึกต้องเป็นอีเมลจริงของคนที่กด ไม่ใช่ค่าที่หน้าจอส่งมา');
var fx9b = FS.build();
var api9b = FS.load(fx9b, { email: 'malee@chem-inno-tech.com' });
api9b.createOrder(order({ staff: 'คนอื่น' }));
eq('ช่องพนักงาน', fx9b.sheets['ออเดอร์_หัวบิล'].cell(6, 19).v, 'malee@chem-inno-tech.com');

/* ================================== 10. คนสองคนกดพร้อมกัน ต้องไม่ทับกัน */
console.log('\n10. คนสองคนกดบันทึกพร้อมกัน');
var fx10 = FS.build();
var api10 = FS.load(fx10);
var lock = api10.LockService.getScriptLock();
lock.tryLock();   // จำลองว่าอีกคนถือ lock อยู่
throws('คนที่สองต้องถูกบอกให้รอ ไม่ใช่เขียนทับ', function () { api10.createOrder(order()); }, 'ลองกดใหม่');
eq('ไม่มีอะไรลงชีทระหว่างที่ถูกบล็อก', rowsWith(fx10.sheets['ออเดอร์_หัวบิล'], 1), []);
lock.releaseLock();
eq('พอปล่อย lock แล้วบันทึกได้ตามปกติ', api10.createOrder(order()).no, 'AST-26-0001');

/* ======================== 11. มีช่องว่างกลางตาราง ต้องไม่เขียนทับของเดิม */
console.log('\n11. มีคนลบข้อมูลไว้กลางตาราง');
var fx11 = FS.build();
var api11 = FS.load(fx11);
api11.createOrder(order({ items: [{ sku: 'SKU-141', qty: 1 }] }));
api11.createOrder(order({ items: [{ sku: 'SKU-141', qty: 2 }] }));
api11.createOrder(order({ items: [{ sku: 'SKU-141', qty: 3 }] }));
// ลบใบกลางทิ้งด้วยมือ เหลือช่องว่างที่แถว 7
fx11.sheets['ออเดอร์_หัวบิล'].cell(7, 1).v = '';
fx11.sheets['ออเดอร์_รายการ'].cell(7, 2).v = '';
fx11.recalc();
var r11 = api11.createOrder(order({ items: [{ sku: 'SKU-141', qty: 9 }] }));
eq('ใบใหม่ไปลงช่องว่างกลางตาราง', fx11.sheets['ออเดอร์_หัวบิล'].cell(7, 1).v, r11.no);
eq('ใบที่สามที่อยู่แถว 8 ต้องยังอยู่ครบ', fx11.sheets['ออเดอร์_หัวบิล'].cell(8, 1).v, 'AST-26-0003');
eq('รายการของใบที่สามก็ยังอยู่', fx11.sheets['ออเดอร์_รายการ'].cell(8, 7).v, 3);
eq('เลขใหม่ไม่ซ้ำกับที่มีอยู่', r11.no, 'AST-26-0004');

/* ============================================== 12. ข้อมูลตั้งต้นของหน้าจอ */
console.log('\n12. ข้อมูลตั้งต้นที่ส่งให้หน้าจอ');
var fx12 = FS.build({ lots: [{ sku: 'CHEM-001', lotNo: 'L-9', exp: '2027-05-01', recv: '2026-01-01', qty: 7 }] });
var api12 = FS.load(fx12);
fx12.recalc();
var boot = api12.getBootstrap();
eq('ส่งสินค้าครบทุกตัว', boot.products.length, 3);
eq('มีราคาขายมาด้วย', boot.products[0].price, 129);
eq('มีตัวเลือกช่องทางขาย', boot.lists.channel, ['หน้าร้าน', 'Shopee', 'เพจ Facebook']);
eq('มีตัวเลือกขนส่ง', boot.lists.carrier.length, 5);
eq('บอกเลขออเดอร์ถัดไป', boot.nextNo, 'AST-26-0001');
eq('บอกว่า SKU ไหนคุมล็อตและเหลือเท่าไร', boot.lots['CHEM-001'].total, 7);
eq('บอกล็อตที่จะถูกตัดก่อน', boot.lots['CHEM-001'].next.lotNo, 'L-9');
eq('สินค้าที่ไม่ได้คุมล็อต ต้องไม่โผล่มา', boot.lots['SKU-141'], undefined);

/* ================================================= 13. setup() สั่งซ้ำได้ */
console.log('\n13. setup() สั่งซ้ำแล้วต้องไม่ทำข้อมูลหาย');
var fx13 = FS.build({ lots: [{ sku: 'CHEM-001', lotNo: 'L-เดิม', exp: '2027-01-01', recv: '2026-01-01', qty: 40 }] });
var api13 = FS.load(fx13);
api13.createOrder(order({ items: [{ sku: 'CHEM-001', qty: 5, price: '' }] }));
api13.setup();
api13.setup();   // สั่งซ้ำ
fx13.recalc();
eq('ล็อตเดิมยังอยู่', fx13.sheets['ล็อตสินค้า'].cell(6, 4).v, 'L-เดิม');
eq('จำนวนรับยังเท่าเดิม', fx13.sheets['ล็อตสินค้า'].cell(6, 7).v, 40);
eq('บรรทัดตัดล็อตยังอยู่', fx13.sheets['ตัดล็อต'].cell(6, 6).v, 5);
eq('ออเดอร์เดิมยังอยู่', fx13.sheets['ออเดอร์_หัวบิล'].cell(6, 1).v, 'AST-26-0001');
eq('บันทึกออเดอร์ต่อได้หลัง setup', api13.createOrder(order({ items: [{ sku: 'CHEM-001', qty: 1, price: '' }] })).no, 'AST-26-0002');

console.log('\n   ถ้าคอลัมน์ Q มีคนใช้ไปแล้ว ต้องหยุด ไม่เขียนทับ');
var fx13b = FS.build();
var api13b = FS.load(fx13b);
fx13b.sheets['ออเดอร์_รายการ'].cell(5, 17).v = 'คอลัมน์ที่เจ้าของร้านเพิ่มเอง';
throws('หยุดพร้อมบอกว่าเจออะไร', function () { api13b.setup(); }, 'มีหัวข้อ');
eq('ไม่เขียนทับหัวข้อเดิม', fx13b.sheets['ออเดอร์_รายการ'].cell(5, 17).v, 'คอลัมน์ที่เจ้าของร้านเพิ่มเอง');

/* ============================================ 14. อ่านออเดอร์กลับมาใช้งาน */
console.log('\n14. อ่านออเดอร์กลับมา (ใบปะหน้า / ข้อความแจ้งพัสดุ)');
var fx14 = FS.build();
var api14 = FS.load(fx14);
api14.setup();
api14.createOrder(order({ date: '2026-08-27', cust: 'ลูกค้าคนแรก' }));
api14.createOrder(order({ date: '2026-08-29', cust: 'ลูกค้าคนที่สอง', items: [{ sku: 'SKU-143', qty: 2 }] }));
var list = api14.getOrders(10);
eq('ได้ออเดอร์ครบ', list.length, 2);
eq('ใบล่าสุดอยู่บนสุด', list[0].cust, 'ลูกค้าคนที่สอง');
eq('มีรายการสินค้าติดมาด้วย', list[0].items.length, 1);
eq('รายการของแต่ละใบไม่ปนกัน', list[1].items.length, 2);
eq('ยอดสุทธิมาจากสูตรในชีท', list[1].net, 20 * 110 + 5 * 149 + 50);
eq('บรรทัดที่ไม่ตั้งราคาพิเศษ ใช้ราคามาตรฐาน', list[0].items[0].price, 149);
eq('ที่อยู่ครบสำหรับพิมพ์ใบปะหน้า', list[0].addr.indexOf('เชียงใหม่') > -1, true);

console.log('\n   ใส่เลขพัสดุย้อนหลัง');
var t14 = api14.setTracking(list[0].no, 'TH0011223344', 'ส่งแล้ว');
eq('บันทึกสำเร็จ', t14.changed, true);
var list2 = api14.getOrders(10);
eq('เลขพัสดุขึ้นแล้ว', list2[0].track, 'TH0011223344');
eq('สถานะเปลี่ยนแล้ว', list2[0].status, 'ส่งแล้ว');
eq('ยอดเงินของใบนั้นไม่ถูกแตะ', list2[0].net, list[0].net);
eq('ลง Log ไว้สองบรรทัด (เลขพัสดุ + สถานะ)', rowsWith(fx14.sheets['Log'], 2).length >= 2, true);
throws('ออเดอร์ที่ไม่มีจริง', function () { api14.setTracking('AST-26-9999', 'X'); }, 'ไม่พบออเดอร์');
throws('สถานะที่ไม่มีในชีท ตั้งค่า', function () {
  api14.setTracking(list[0].no, 'TH1', 'ส่งไปแล้วมั้ง');
}, 'ไม่มีในตัวเลือก');

var over14 = [];
for (var n14 in fx14.sheets) over14 = over14.concat(fx14.sheets[n14].overwrittenFormulas);
eq('ยังไม่มีสูตรถูกเขียนทับเลย', over14, []);

console.log('\n   เบอร์ผู้ส่งที่ชีทเก็บเป็นตัวเลข ต้องได้ศูนย์นำหน้าคืน');
var fx14b = FS.build();
var api14b = FS.load(fx14b, {});
api14b.setup();
/* ชีทของจริงแปลง '0961929993' เป็นตัวเลข 961929993 — จำลองให้เหมือนกัน */
fx14b.sheets['ตั้งค่าแอป'].cell(8, 2).v = 961929993;
eq('ใบปะหน้าต้องได้ 0961929993 ไม่ใช่ 961929993',
  api14b.getBootstrap().app.sender.tel, '0961929993');

console.log('\n   ค่าตั้งต้นสำหรับใบปะหน้า');
var boot14 = api14.getBootstrap();
eq('มีชื่อผู้ส่ง', boot14.app.sender.name, 'AST Chem-Tooling');
eq('มีค่าจัดส่งเริ่มต้น', boot14.app.shipFee, 50);
eq('มีลิงก์ติดตามของ Flash', /flashexpress/.test(boot14.app.track['Flash Express'] || ''), true);

/* ====================== 14.5 ใครเป็นคนคีย์ (ใช้บัญชี Google เดียวทั้งร้าน) */
console.log('\n14.5 ชื่อคนคีย์ออเดอร์');
var fx145 = FS.build();
var api145 = FS.load(fx145, { email: 'citisales01@chem-inno-tech.com' });
api145.setup();
var o145 = order(); o145.by = 'น้องบี';
api145.createOrder(o145);
eq('ช่องพนักงานเก็บชื่อคนคีย์ ไม่ใช่อีเมล',
  fx145.sheets['ออเดอร์_หัวบิล'].cell(6, 19).v, 'น้องบี');
eq('Log ยังเก็บอีเมลจริงไว้เป็นหลักฐาน',
  /citisales01@chem-inno-tech\.com/.test(
    rowsWith(fx145.sheets['Log'], 2).map(function (r) {
      return String(fx145.sheets['Log'].cell(r, 3).v) + ' ' +
             String(fx145.sheets['Log'].cell(r, 10).v);
    }).join(' ')), true);

var fx146 = FS.build();
var api146 = FS.load(fx146, { email: 'citisales01@chem-inno-tech.com' });
api146.setup();
api146.createOrder(order());
eq('ไม่ได้เลือกชื่อ ก็ใช้อีเมลไปก่อน ไม่ปล่อยว่าง',
  fx146.sheets['ออเดอร์_หัวบิล'].cell(6, 19).v, 'citisales01@chem-inno-tech.com');

/* ============================== 15. เปิดชีทได้ = ใช้แอปได้ */
console.log('\n15. สิทธิ์เดินตามการแชร์ชีท');
var fx15 = FS.build();
var api15 = FS.load(fx15, { email: 'freelance@gmail.com' });
eq('อีเมลนอกบริษัทแต่ถูกแชร์ชีทให้ ใช้ได้', api15.createOrder(order()).ok, true);
eq('ชื่อผู้บันทึกเป็นอีเมลจริง', fx15.sheets['ออเดอร์_หัวบิล'].cell(6, 19).v, 'freelance@gmail.com');

var fx15b = FS.build();
throws('เปิดชีทไม่ได้ และไม่ใช่โดเมนบริษัท → เข้าไม่ได้', function () {
  FS.load(fx15b, { email: 'stranger@gmail.com', canOpen: false }).createOrder(order());
}, 'ยังไม่มีสิทธิ์');
eq('คนนอกยิงมาแล้วไม่มีอะไรลงชีท', rowsWith(fx15b.sheets['ออเดอร์_หัวบิล'], 1), []);

// ข้อที่ทำให้เจ้าของร้านเข้าไม่ได้ทั้งที่แชร์ชีทแล้ว: เคยจำคำว่า "ไม่มีสิทธิ์" ไว้ 5 นาที
var fx15c = FS.build();
var denied = FS.load(fx15c, { email: 'newstaff@gmail.com', canOpen: false });
throws('ครั้งแรกยังไม่ได้แชร์ → ปฏิเสธ', function () { denied.createOrder(order()); }, 'ยังไม่มีสิทธิ์');
eq('พอแชร์ชีทให้แล้ว เข้าได้ทันที ไม่ต้องรอแคชหมดอายุ',
  FS.load(fx15c, { email: 'newstaff@gmail.com' }).createOrder(order()).ok, true);

throws('อ่านอีเมลไม่ออก → ปฏิเสธไว้ก่อน', function () {
  FS.load(FS.build(), { email: '' }).createOrder(order());
}, 'ไม่ทราบว่าคุณเป็นใคร');

console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทั้งหมด'));
process.exit(fails ? 1 : 0);
