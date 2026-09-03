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
var SH_TEL = 5;   // ออเดอร์_หัวบิล คอลัมน์ E = เบอร์โทรลูกค้า

var fails = 0;
function eq(label, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label +
    '  ได้ ' + JSON.stringify(got) + (ok ? '' : '  ควรได้ ' + JSON.stringify(want)));
}
function truthy2(label, got) {
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

/* =========================== 16. สินค้าซื้อมาขายไป (พิมพ์ชื่อเอง ไม่มี SKU) */
console.log('\n16. สินค้าซื้อมาขายไป');

var fx16 = FS.build();
var api16 = FS.load(fx16);
var p16 = fx16.sheets['ฐานสินค้า'], rc16 = fx16.sheets['รับเข้า'];
var it16 = fx16.sheets['ออเดอร์_รายการ'], hd16 = fx16.sheets['ออเดอร์_หัวบิล'];

console.log('\n   ใส่ต้นทุนมาด้วย → ลงฐานสินค้าและลงรับเข้าให้ครบ');
var f1 = api16.createOrder(order({
  items: [{ free: true, name: 'สายลมร้อน 2000W', qty: 3, price: 1200, cost: 820 }]
}));
eq('บันทึกผ่าน', f1.ok, true);
eq('ยอดสินค้า = 3 x 1200', f1.subtotal, 3600);

var newRow = rowsWith(p16, 2).slice(-1)[0];
eq('เพิ่มสินค้าเข้าฐานสินค้าหนึ่งแถว', rowsWith(p16, 2).length, fx16.demo.length + 1);
eq('รหัสที่ออกให้เป็นชุด SKU-X', p16.cell(newRow, 2).v, 'SKU-X001');
eq('อยู่หมวดซื้อมาขายไป ไม่ปนกับของในสต๊อกจริง', p16.cell(newRow, 3).v, 'ซื้อมาขายไป');
eq('ชื่อสินค้าเก็บตามที่พิมพ์', p16.cell(newRow, 4).v, 'สายลมร้อน 2000W');
eq('เก็บต้นทุนและราคาขายไว้ครบ', [p16.cell(newRow, 7).v, p16.cell(newRow, 8).v], [820, 1200]);
eq('ยอดยกมาเป็นศูนย์ ของยังไม่เคยเข้าสต๊อก', p16.cell(newRow, 9).v, 0);

var rcRow = rowsWith(rc16, 6).slice(-1)[0];
eq('ลงรับเข้าให้หนึ่งแถว', rowsWith(rc16, 6).length, 1);
eq('รับเข้าอ้างรหัสเดียวกับที่เพิ่งเพิ่ม', rc16.cell(rcRow, 6).v, 'SKU-X001');
eq('รับเข้าเท่าจำนวนที่ขายพอดี สต๊อกจึงสุทธิเป็นศูนย์ ไม่ติดลบ', rc16.cell(rcRow, 8).v, 3);
eq('ต้นทุนต่อหน่วยลงตามที่กรอก', rc16.cell(rcRow, 9).v, 820);
eq('ประเภทเลือกจากรายการในชีท ไม่ใช่คำที่คิดเอง', rc16.cell(rcRow, 4).v, 'ซื้อเข้า');
eq('อ้างเลขออเดอร์ไว้ ตามรอยกลับได้', rc16.cell(rcRow, 3).v, f1.no);

eq('บรรทัดในออเดอร์อ้างรหัสที่เพิ่งออก ไม่ใช่ชื่อดิบ', it16.cell(6, 4).v, 'SKU-X001');
eq('ชีทคิดยอดของบรรทัดนี้ได้ถูก', it16.cell(6, 10).v, 3600);
eq('ลง Log ว่าสินค้าตัวนี้มาจากไหน',
  rowsWith(fx16.sheets['Log'], 2).map(function (r) { return fx16.sheets['Log'].cell(r, 4).v; })
    .indexOf('เพิ่มสินค้า') > -1, true);

console.log('\n   ขายชื่อเดิมซ้ำที่ต้นทุนเดิม → ใช้รหัสเดิม ไม่สร้างรหัสใหม่');
var f2 = api16.createOrder(order({
  items: [{ free: true, name: '  สายลมร้อน 2000W ', qty: 1, price: 1250, cost: 820 }]
}));
eq('ไม่มีสินค้าใหม่เพิ่มอีก', rowsWith(p16, 2).length, fx16.demo.length + 1);
eq('ยังใช้รหัสเดิม', it16.cell(7, 4).v, 'SKU-X001');
eq('แต่ลงรับเข้าเพิ่มตามจำนวนที่ขายรอบนี้', rowsWith(rc16, 6).length, 2);
eq('ราคาขายรอบนี้ต่างจากเดิมได้ ไม่ไปแก้ราคาในฐานสินค้า', p16.cell(newRow, 8).v, 1200);
eq('ยอดใบนี้ใช้ราคาที่กรอกรอบนี้', f2.subtotal, 1250);

console.log('\n   ชื่อเดิมแต่ต้นทุนเปลี่ยน → แยกรหัสใหม่ กำไรของใบเก่าจะได้ไม่เพี้ยนตาม');
api16.createOrder(order({
  items: [{ free: true, name: 'สายลมร้อน 2000W', qty: 2, price: 1300, cost: 900 }]
}));
var newRow2 = rowsWith(p16, 2).slice(-1)[0];
eq('ได้รหัสใหม่', p16.cell(newRow2, 2).v, 'SKU-X002');
eq('ต้นทุนของรหัสเดิมไม่ถูกแก้', p16.cell(newRow, 7).v, 820);
eq('รหัสใหม่เก็บต้นทุนรอบนี้', p16.cell(newRow2, 7).v, 900);

/* ไม่ใส่ต้นทุนก็ต้องลงฐานสินค้า

   ของเดิมไม่ลง แล้วเขียนชื่อลงช่องรหัสแทน ยอดเงินถูกก็จริง แต่ช่องชื่อสินค้าในชีท
   เป็นสูตร VLOOKUP หารหัสในฐานสินค้า หาไม่เจอจึงได้คำว่า "ไม่พบ SKU"
   แล้วคำนั้นไปพิมพ์บนใบกำกับภาษีที่ส่งลูกค้าจริง (ONIV26-00245)
   ชื่อสินค้าบนใบภาษีผิด = ใบใช้ไม่ได้ทั้งใบ */
console.log('\n   ไม่ใส่ต้นทุน → ยังลงฐานสินค้า แค่เว้นช่องต้นทุนไว้');
var before = rowsWith(p16, 2).length, beforeRecv = rowsWith(rc16, 6).length;
var f4 = api16.createOrder(order({
  items: [{ free: true, name: 'ขาตั้งชั่วคราว', qty: 2, price: 500, cost: '' }]
}));
eq('ยอดยังคิดถูก', f4.subtotal, 1000);
eq('เพิ่มสินค้าเข้าฐานให้หนึ่งตัว', rowsWith(p16, 2).length, before + 1);
eq('ลงรับเข้าเท่าที่ขาย สต๊อกจึงไม่ติดลบ', rowsWith(rc16, 6).length, beforeRecv + 1);

var pr4 = rowsWith(p16, 2).slice(-1)[0];
eq('ได้รหัสชุดซื้อมาขายไป', String(p16.cell(pr4, 2).v).slice(0, 5), 'SKU-X');
eq('ชื่อในฐานสินค้าคือชื่อที่พิมพ์', p16.cell(pr4, 4).v, 'ขาตั้งชั่วคราว');
eq('ช่องต้นทุนเว้นว่างไว้ ไม่ใช่เดาเป็นศูนย์', p16.cell(pr4, 7).v, '');

var ir4 = rowsWith(it16, 2).slice(-1)[0];
eq('ช่องรหัสสินค้าเป็นรหัสจริง ไม่ใช่ชื่อ', String(it16.cell(ir4, 4).v).slice(0, 5), 'SKU-X');

/* ข้อสอบสำคัญของหมวดนี้: ชื่อที่จะไปพิมพ์บนใบ ต้องเป็นชื่อสินค้าจริง */
var got4 = api16.getOrders(0).filter(function (o) { return o.no === f4.no })[0];
eq('ชื่อที่จะพิมพ์บนใบคือชื่อสินค้าจริง', got4.items[0].name, 'ขาตั้งชั่วคราว');

console.log('\n   ชื่อเดิม ต้นทุนว่างเหมือนกัน ต้องใช้รหัสเดิม ไม่สร้างรหัสใหม่ทุกใบ');
var beforeAgain = rowsWith(p16, 2).length;
var f4b = api16.createOrder(order({
  items: [{ free: true, name: 'ขาตั้งชั่วคราว', qty: 1, price: 500, cost: '' }]
}));
eq('ไม่มีรหัสใหม่เพิ่ม', rowsWith(p16, 2).length, beforeAgain);
eq('ใช้รหัสเดิม', it16.cell(rowsWith(it16, 2).slice(-1)[0], 4).v, p16.cell(pr4, 2).v);

console.log('\n   ชื่อเดิมแต่ครั้งนี้ใส่ต้นทุน = คนละตัว ต้องแยกรหัส');
/* ต้นทุนว่าง (ยังไม่รู้) กับต้นทุน 0 (รู้ว่าไม่มีทุน) ไม่ใช่เรื่องเดียวกัน
   ถ้าตีรวมกัน ของที่ยังไม่รู้ต้นทุนจะไปเกาะรหัสเดิม แล้วกำไรของใบเก่าเปลี่ยนตามเงียบ ๆ */
api16.createOrder(order({
  items: [{ free: true, name: 'ขาตั้งชั่วคราว', qty: 1, price: 500, cost: 0 }]
}));
eq('ได้รหัสใหม่แยกจากตัวที่ต้นทุนว่าง', rowsWith(p16, 2).length, beforeAgain + 1);

/* พิมพ์ซ้ำใบที่คีย์ไปแล้วก่อนแก้ ต้องได้ชื่อจริง ไม่ใช่คำว่า "ไม่พบ SKU"
   จำลองแถวแบบเดิม: ช่องรหัสเป็นชื่อสินค้า ช่องชื่อเป็นผลลัพธ์สูตรที่หาไม่เจอ */
console.log('\n   ใบที่คีย์ไปแล้วก่อนแก้ ต้องพิมพ์ซ้ำได้ชื่อจริง');
var oldRow = rowsWith(it16, 2).slice(-1)[0] + 1;
it16.cell(oldRow, 2).v = f4.no;
it16.cell(oldRow, 4).v = 'เหล็กฉากสั่งพิเศษ';
it16.cell(oldRow, 5).v = 'ไม่พบ SKU';
it16.cell(oldRow, 7).v = 3;
it16.cell(oldRow, 9).v = 120;
var got5 = api16.getOrders(0).filter(function (o) { return o.no === f4.no })[0];
var line5 = got5.items.filter(function (i) { return i.sku === 'เหล็กฉากสั่งพิเศษ' })[0];
truthy2('เจอบรรทัดเก่า', !!line5);
eq('พิมพ์ชื่อจริงแทนคำว่า "ไม่พบ SKU"', line5.name, 'เหล็กฉากสั่งพิเศษ');

console.log('\n   กรอกไม่ครบ ต้องปฏิเสธตั้งแต่ยังไม่เขียนอะไรลงชีท');
var rows16 = rowsWith(hd16, 1).length;
throws('พิมพ์ชื่อเองแต่ไม่ใส่ชื่อ', function () {
  api16.createOrder(order({ items: [{ free: true, name: '  ', qty: 1, price: 100 }] }));
}, 'ยังไม่ได้ใส่ชื่อ');
throws('พิมพ์ชื่อเองแต่ไม่ใส่ราคาขาย', function () {
  api16.createOrder(order({ items: [{ free: true, name: 'ของไม่มีราคา', qty: 1, price: '' }] }));
}, 'ต้องใส่ราคาขายด้วย');
throws('ต้นทุนติดลบ', function () {
  api16.createOrder(order({ items: [{ free: true, name: 'ของทุนติดลบ', qty: 1, price: 10, cost: -5 }] }));
}, 'ต้นทุนไม่ถูกต้อง');
eq('ใบที่ปฏิเสธไม่ทิ้งหัวบิลไว้เลย', rowsWith(hd16, 1).length, rows16);

console.log('\n   ล้มกลางทางหลังเขียนสินค้าไปแล้ว ต้องถอยให้เกลี้ยง');
var fx16b = FS.build();
var api16b = FS.load(fx16b);
var p16b = fx16b.sheets['ฐานสินค้า'], rc16b = fx16b.sheets['รับเข้า'];
var realRecalc16 = fx16b.recalc;
fx16b.recalc = function () { realRecalc16(); fx16b.sheets['ออเดอร์_หัวบิล'].cell(6, 10).v = 1; };
throws('บันทึกล้มกลางทาง', function () {
  api16b.createOrder(order({
    items: [{ free: true, name: 'ของที่บันทึกไม่สำเร็จ', qty: 1, price: 900, cost: 600 }]
  }));
});
eq('ไม่มีหัวบิลค้าง', rowsWith(fx16b.sheets['ออเดอร์_หัวบิล'], 1), []);
eq('ไม่มีสินค้าแปลกหน้าค้างในฐานสินค้า', rowsWith(p16b, 2).length, fx16b.demo.length);
eq('ไม่มีแถวรับเข้าค้าง ทำให้สต๊อกเกินจริง', rowsWith(rc16b, 6), []);

var over16 = [];
for (var n16 in fx16.sheets) over16 = over16.concat(fx16.sheets[n16].overwrittenFormulas);
for (var n16b in fx16b.sheets) over16 = over16.concat(fx16b.sheets[n16b].overwrittenFormulas);
eq('ยังไม่มีสูตรถูกเขียนทับเลย', over16, []);

/* ================ 17. ล้างออเดอร์เก่า เก็บของวันนี้ไว้ (เลิกทดลอง เริ่มของจริง) */
console.log('\n17. ล้างออเดอร์เก่า เก็บของวันนี้');

function isoToday() {
  var d = new Date();
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

var fx17 = FS.build({
  lots: [{ sku: 'CHEM-001', lotNo: 'L-2610', exp: '2026-10-31', recv: '2026-08-01', qty: 50 }]
});
var api17 = FS.load(fx17);
var TODAY = isoToday();

/* สามใบของเมื่อวาน (ใบทดลอง) + สองใบของวันนี้ (ของจริงที่เพิ่งคีย์) */
api17.createOrder(order({ date: '2026-08-20', cust: 'ทดลอง ก' }));
api17.createOrder(order({ date: '2026-08-21', cust: 'ทดลอง ข',
  items: [{ sku: 'CHEM-001', qty: 4, price: '' }] }));
api17.createOrder(order({ date: '2026-08-22', cust: 'ทดลอง ค' }));
var keepA = api17.createOrder(order({ date: TODAY, cust: 'ลูกค้าจริง ก' }));
var keepB = api17.createOrder(order({ date: TODAY, cust: 'ลูกค้าจริง ข',
  items: [{ sku: 'CHEM-001', qty: 6, price: '' }] }));

var h17 = fx17.sheets['ออเดอร์_หัวบิล'], i17 = fx17.sheets['ออเดอร์_รายการ'];
var c17 = fx17.sheets['ตัดล็อต'], lot17 = fx17.sheets['ล็อตสินค้า'];
eq('ตั้งต้นมีห้าใบ', rowsWith(h17, 1).length, 5);
eq('ล็อตถูกตัดไปแล้ว 10 ชิ้น เหลือ 40', lot17.cell(DATA_ROW, 9).v, 40);

console.log('\n   ดูก่อน ต้องยังไม่ลบอะไรเลย');
var pv17 = api17.previewClearOldOrders();
truthy2('บอกว่ายังไม่ได้ลบ', /ยังไม่ได้ลบอะไรเลย/.test(pv17));
truthy2('บอกว่าเก็บของวันนี้ไว้ 2 ใบ', /เก็บไว้ \(ของวันนี้\): 2 ใบ/.test(pv17));
truthy2('บอกว่าจะล้าง 3 ใบ', /จะล้าง \(ก่อนวันนี้\): 3 ใบ/.test(pv17));
eq('พรีวิวแล้วออเดอร์ยังอยู่ครบห้าใบ', rowsWith(h17, 1).length, 5);

console.log('\n   สั่งจริงต้องพิมพ์คำยืนยันให้ตรง');
throws('พิมพ์คำยืนยันผิด ต้องไม่ลบอะไร', function () { api17.clearOldOrders('ลบเลย'); }, 'กันกดพลาด');
eq('ยังอยู่ครบห้าใบ', rowsWith(h17, 1).length, 5);

console.log('\n   ล้างจริง');
var msg17 = api17.clearOldOrders('ล้างออเดอร์เก่า');
eq('เหลือเฉพาะของวันนี้ 2 ใบ', rowsWith(h17, 1).length, 2);
eq('ใบที่เหลือคือใบจริงทั้งคู่',
  rowsWith(h17, 1).map(function (r) { return h17.cell(r, 4).v; }).sort(),
  ['ลูกค้าจริง ก', 'ลูกค้าจริง ข']);
eq('เลขใบที่เหลือไม่ถูกแตะ',
  rowsWith(h17, 1).map(function (r) { return h17.cell(r, 1).v; }).sort(),
  [keepA.no, keepB.no].sort());

var leftNos = {};
rowsWith(h17, 1).forEach(function (r) { leftNos[h17.cell(r, 1).v] = true; });
eq('บรรทัดสินค้าที่เหลือ อ้างเฉพาะใบที่ยังอยู่',
  rowsWith(i17, 2).filter(function (r) { return !leftNos[i17.cell(r, 2).v]; }), []);
eq('แถวตัดล็อตที่เหลือ อ้างเฉพาะใบที่ยังอยู่',
  rowsWith(c17, 2).filter(function (r) { return !leftNos[c17.cell(r, 2).v]; }), []);

eq('ของในล็อตที่ใบทดลองตัดไป คืนกลับมาแล้ว', lot17.cell(DATA_ROW, 9).v, 50 - 6);
truthy2('รายงานบอกว่าชีทเอกสารไม่ถูกแตะ', /เอกสาร: ไม่แตะเลย/.test(msg17));
eq('ลง Log ไว้ว่าใครล้าง',
  rowsWith(fx17.sheets['Log'], 2).map(function (r) { return fx17.sheets['Log'].cell(r, 4).v; })
    .indexOf('ล้างออเดอร์') > -1, true);

console.log('\n   สั่งซ้ำอีกรอบ ต้องไม่ไปกินใบของวันนี้');
api17.clearOldOrders('ล้างออเดอร์เก่า');
eq('ยังเหลือสองใบเท่าเดิม', rowsWith(h17, 1).length, 2);

var over17 = [];
for (var n17 in fx17.sheets) over17 = over17.concat(fx17.sheets[n17].overwrittenFormulas);
eq('ล้างแล้วสูตรของชีทยังอยู่ครบ ไม่โดนล้างไปด้วย', over17, []);

/* ============ 18. ปุ่ม Run ในหน้า Apps Script ส่งค่าเข้าฟังก์ชันไม่ได้ */
console.log('\n18. สั่งล้างจากปุ่ม Run (กดสองครั้ง)');

var fx18 = FS.build();
var api18 = FS.load(fx18);
api18.createOrder(order({ date: '2026-08-20' }));
api18.createOrder(order({ date: isoToday() }));
var h18 = fx18.sheets['ออเดอร์_หัวบิล'];

console.log('\n   กดครั้งแรก ต้องได้แต่ตัวเลข ยังไม่ลบ');
var first = api18.clearOldOrdersNow();
truthy2('บอกว่ายังไม่ได้ลบอะไร', /ยังไม่ได้ลบอะไรเลย/.test(first));
truthy2('บอกให้กดซ้ำถึงจะล้างจริง', /กด Run ที่ clearOldOrdersNow อีกครั้ง/.test(first));
truthy2('เห็นตัวเลขก่อนว่าจะหายกี่ใบ', /จะล้าง \(ก่อนวันนี้\): 1 ใบ/.test(first));
eq('ออเดอร์ยังอยู่ครบสองใบ', rowsWith(h18, 1).length, 2);

console.log('\n   ปลดล็อกของคนละฟังก์ชันต้องไม่ทะลุถึงกัน');
var firstAll = api18.clearAllOrdersNow();
truthy2('กดตัวล้างทั้งหมดครั้งแรก ก็ยังไม่ลบเหมือนกัน', /ยังไม่ได้ลบอะไรเลย/.test(firstAll));
eq('ยังอยู่ครบสองใบ', rowsWith(h18, 1).length, 2);

console.log('\n   กดซ้ำครั้งที่สอง ถึงล้างจริง');
api18.clearOldOrdersNow();
eq('ล้างของเก่าไป เหลือของวันนี้', rowsWith(h18, 1).length, 1);

console.log('\n   ปลดล็อกหมดไปกับการกดครั้งที่สอง กด Run ซ้ำต้องไม่ล้างซ้ำ');
truthy2('กลับไปเป็นแค่รายงานอีกครั้ง',
  /ยังไม่ได้ลบอะไรเลย/.test(api18.clearOldOrdersNow()));
eq('ใบของวันนี้ยังอยู่', rowsWith(h18, 1).length, 1);

console.log('\n   armClear ปลดล็อกล่วงหน้าให้ทั้งสองตัว กดครั้งเดียวก็ล้างเลย');
api18.armClear();
api18.clearAllOrdersNow();
eq('ล้างทั้งหมดแล้ว', rowsWith(h18, 1), []);

var over18 = [];
for (var n18 in fx18.sheets) over18 = over18.concat(fx18.sheets[n18].overwrittenFormulas);
eq('สูตรของชีทยังอยู่ครบ', over18, []);

/* ================= 19. เอกสารออกผิด — ยกเลิกใบเดิม แล้วออกใบใหม่แทน */
console.log('\n19. ยกเลิกเอกสารที่ออกผิด');

var fx19 = FS.build();
var api19 = FS.load(fx19);
api19.setup();
var o19 = api19.createOrder(order({ cust: 'ลูกค้าที่พิมพ์ชื่อผิด' }));
var doc19 = fx19.sheets['เอกสาร'];
var DC = 5;   // E = เลขที่ออเดอร์
var DV = 20;  // T = เหตุผลที่ยกเลิก

var d1 = api19.issueDoc({
  clientKey: 'dk-1', type: 'rec', orderNo: o19.no,
  cust: { name: 'ชื่อที่พิมพ์ผิด', taxId: '0105500000000' }, by: 'น้องบี'
});
eq('ออกใบเสร็จ/ใบกำกับภาษีได้', d1.ok, true);

console.log('\n   ยังไม่ยกเลิก ต้องออกใบชนิดเดิมซ้ำไม่ได้');
throws('กันออกใบกำกับภาษีสองใบให้การขายครั้งเดียว', function () {
  api19.issueDoc({ clientKey: 'dk-2', type: 'rec', orderNo: o19.no, cust: { name: 'ชื่อที่ถูก' } });
}, 'ไปแล้วเป็นใบ');

console.log('\n   เหตุผลสั้นไป ต้องไม่ยอมให้ยกเลิก');
throws('บังคับให้บอกเหตุผล', function () { api19.voidDoc(d1.no, 'ผิด'); }, 'อย่างน้อย 5 ตัวอักษร');
throws('ไม่บอกเลยก็ไม่ได้', function () { api19.voidDoc(d1.no, ''); }, 'อย่างน้อย 5 ตัวอักษร');
throws('ใบที่ไม่มีจริง', function () { api19.voidDoc('ONIV26-99999', 'ออกผิดชนิดเอกสาร'); }, 'ไม่พบเอกสาร');

var row19 = 0;
for (var r19 = DATA_ROW; r19 <= doc19.getMaxRows(); r19++) {
  if (doc19.cell(r19, 2).v === d1.no) { row19 = r19; break; }
}
eq('ยังไม่ถูกยกเลิก เพราะเหตุผลไม่ผ่าน', doc19.cell(row19, DV).v, '');

console.log('\n   ยกเลิกจริง');
var vd = api19.voidDoc(d1.no, 'ชื่อลูกค้าบนใบผิด ออกใบใหม่แทน', 'น้องบี');
eq('บอกกลับมาว่ายกเลิกใบไหน', vd.no, d1.no);
truthy2('เขียนเหตุผลลงชีทจริง', /ชื่อลูกค้าบนใบผิด/.test(String(doc19.cell(row19, DV).v)));
truthy2('ติดชื่อคนกดยกเลิกไว้ด้วย', /ยกเลิกโดย น้องบี/.test(String(doc19.cell(row19, DV).v)));

eq('แถวเดิมยังอยู่ ไม่ได้ถูกลบทิ้ง', doc19.cell(row19, 2).v, d1.no);
eq('ยอดของใบเดิมไม่ถูกแตะ', doc19.cell(row19, 17).v > 0, true);
eq('ยังอ้างออเดอร์เดิมอยู่', doc19.cell(row19, DC).v, o19.no);
truthy2('ยังมีภาพถ่ายของใบไว้พิมพ์ย้อนหลัง', String(doc19.cell(row19, 21).v).length > 10);

var back = api19.getDoc(d1.no);
truthy2('ดึงใบที่ยกเลิกกลับมาดูได้', back.ok);
truthy2('และบอกว่าถูกยกเลิกแล้ว', /ชื่อลูกค้าบนใบผิด/.test(back.meta.voidWhy));

console.log('\n   ยกเลิกซ้ำใบเดิมไม่ได้ เหตุผลครั้งแรกจะได้ไม่ถูกทับ');
var keep = String(doc19.cell(row19, DV).v);
throws('บอกว่ายกเลิกไปแล้ว', function () { api19.voidDoc(d1.no, 'ลองยกเลิกซ้ำดู'); }, 'ถูกยกเลิกไปแล้ว');
eq('เหตุผลเดิมยังอยู่ครบ', String(doc19.cell(row19, DV).v), keep);

console.log('\n   ยกเลิกแล้วออกใบใหม่ให้ออเดอร์เดิมได้ทันที');
var d2 = api19.issueDoc({
  clientKey: 'dk-3', type: 'rec', orderNo: o19.no, cust: { name: 'ชื่อที่ถูกต้อง' }
});
eq('ออกใบใหม่ได้โดยไม่ต้องยืนยันซ้ำ', d2.ok, true);
truthy2('เป็นเลขใบใหม่ ไม่เอาเลขเดิมมาใช้ซ้ำ', d2.no !== d1.no);

var docs19 = api19.listDocs(o19.no);
eq('ออเดอร์นี้มีสองใบในทะเบียน', docs19.length, 2);
eq('ใบที่ยกเลิกยังอยู่ในรายการ พร้อมเหตุผล',
  docs19.filter(function (d) { return d.voidWhy; }).length, 1);
eq('และมีใบที่ยังใช้ได้อยู่หนึ่งใบ',
  docs19.filter(function (d) { return !d.voidWhy; }).map(function (d) { return d.no; }), [d2.no]);

eq('ลง Log ว่ายกเลิกใบไหน',
  rowsWith(fx19.sheets['Log'], 2).map(function (r) { return fx19.sheets['Log'].cell(r, 4).v; })
    .indexOf('ยกเลิกเอกสาร') > -1, true);

var over19 = [];
for (var n19 in fx19.sheets) over19 = over19.concat(fx19.sheets[n19].overwrittenFormulas);
eq('ยกเลิกแล้วไม่มีสูตรถูกเขียนทับ', over19, []);

/* ========== 20. ตรวจว่าแอปอ่านไฟล์ไหน และในไฟล์นั้นมีรหัสอะไรอยู่จริง */
console.log('\n20. ตัวตรวจว่าแอปอ่านไฟล์ไหน');

var fx20 = FS.build({ products: [
  { sku: 'SKU-141', name: 'End Mill 3.0', price: 129, cost: 35 },
  { sku: 'SKU-Chem-99', name: 'ล้างคราบน้ำมัน So Cleaner O-014 (1000ml)', price: 250, cost: 120 },
  { sku: 'SKU-Chem-104', name: 'Acetone 99.9% (20 ลิตร)', price: 1200, cost: 800 }
] });
var api20 = FS.load(fx20);
var chk = api20.checkSheet();

truthy2('บอกชื่อไฟล์ที่แอปกำลังอ่าน', /AST_ระบบออเดอร์และสต๊อก3008/.test(chk));
truthy2('บอกลิงก์ไฟล์ให้กดเทียบได้', /docs\.google\.com\/spreadsheets/.test(chk));
truthy2('นับสินค้าทั้งหมด', /ฐานสินค้า: 3 รายการ/.test(chk));
truthy2('แยกเฉพาะเคมีออกมา', /เป็นเคมี 2 รายการ/.test(chk));
truthy2('โชว์รหัสเคมีที่อยู่ในชีทจริง', /SKU-Chem-99/.test(chk) && /SKU-Chem-104/.test(chk));
truthy2('ไม่เอาสินค้าที่ไม่ใช่เคมีมาปน', chk.indexOf('SKU-141  End Mill') < 0);
truthy2('บอกทั้งยอดยกมาและยอดคงเหลือ', /ยกมา 1000/.test(chk) && /คงเหลือ 1000/.test(chk));
truthy2('รายงานอาการของชีทสต๊อกด้วย', /สูตรที่ถูกพิมพ์ทับเป็นเลขนิ่ง/.test(chk));

console.log('\n   ยังไม่มีออเดอร์ ต้องบอกตรง ๆ ว่าอาจเขียนลงคนละไฟล์');
truthy2('บอกว่าไม่มีออเดอร์เลย', /ออเดอร์ในไฟล์นี้: 0 ใบ/.test(chk));
truthy2('เตือนว่าอาจเป็นคนละไฟล์กับที่เปิดดูอยู่', /คนละไฟล์/.test(chk));

console.log('\n   พอมีออเดอร์แล้ว ต้องโชว์เลขใบให้เอาไปกรอกในใบสรุปได้');
var only141 = [{ sku: 'SKU-141', qty: 1, price: '' }];
api20.createOrder(order({ cust: 'ลูกค้าใบแรก', items: only141 }));
api20.createOrder(order({ cust: 'ลูกค้าใบสอง', items: only141 }));
var chk3 = api20.checkSheet();
truthy2('นับออเดอร์ถูก', /ออเดอร์ในไฟล์นี้: 2 ใบ/.test(chk3));
truthy2('โชว์เลขใบล่าสุดให้เอาไปใช้ได้', /AST-26-0001, AST-26-0002/.test(chk3));
truthy2('บอกเลขใบต่อไป', /ใบต่อไปจะเป็น: AST-26-0003/.test(chk3));
truthy2('อธิบายว่าใบสรุปออเดอร์โชว์ทีละใบ', /ใบสรุปออเดอร์ โชว์ทีละใบ/.test(chk3));
truthy2('และบอกว่า #N\/A เป็นเรื่องปกติ ไม่ใช่ของเสีย', /ไม่ใช่ของเสีย/.test(chk3));
truthy2('ชีทดี ต้องบอกว่ายอดที่เห็นเชื่อได้', /ยอดคงเหลือที่เห็นในแอปเชื่อได้/.test(chk));

console.log('\n   ชีทสต๊อกพัง ต้องเตือนว่ายอดที่เห็นยังเชื่อไม่ได้');
var st20 = fx20.sheets['สต๊อกคงเหลือ'];
st20.cell(8, 9).v = 1234; st20.cell(8, 9).f = '';   // สูตรถูกพิมพ์ทับเป็นเลขนิ่ง
var chk2 = api20.checkSheet();
truthy2('จับได้ว่ามีสูตรถูกพิมพ์ทับ', /เป็นเลขนิ่ง [1-9]/.test(chk2));
truthy2('และบอกให้ไปซ่อมก่อน', /repairStockSheet/.test(chk2));

eq('ตัวตรวจอ่านอย่างเดียว ไม่แก้อะไรในชีทเลย',
  (function () {
    var o = [];
    for (var k in fx20.sheets) o = o.concat(fx20.sheets[k].overwrittenFormulas);
    return o;
  })(), []);

/* ============ 21. เบอร์ผู้รับที่ชีทเก็บเป็นตัวเลข ศูนย์หน้าต้องไม่หาย */
console.log('\n21. เบอร์โทรผู้รับบนใบปะหน้า');

var fx21 = FS.build();
var api21 = FS.load(fx21);
api21.createOrder(order({ cust: 'ลูกค้าเบอร์ศูนย์นำหน้า' }));

/* ชีทจริงตั้งช่องเบอร์เป็นตัวเลข พอคีย์ 0614035852 ลงไปจะเหลือ 614035852
   จำลองอาการนั้นตรง ๆ ด้วยการเขียนค่าเป็นตัวเลขทับลงไป */
fx21.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, SH_TEL).v = 614035852;
var got21 = api21.getOrders(5)[0];
eq('เติมศูนย์หน้าคืนให้ คนส่งของจะได้โทรหาผู้รับได้', got21.tel, '0614035852');

fx21.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, SH_TEL).v = '0812345678';
eq('เบอร์ที่เก็บเป็นข้อความอยู่แล้ว ต้องไม่ถูกแก้', api21.getOrders(5)[0].tel, '0812345678');

fx21.sheets['ออเดอร์_หัวบิล'].cell(DATA_ROW, SH_TEL).v = '02-123-4567';
eq('เบอร์บ้านที่มีขีดคั่น ต้องไม่ถูกแตะ', api21.getOrders(5)[0].tel, '02-123-4567');

/* ====== 22. เปิดชีทไม่ได้ ต้องบอกว่าบัญชีไหนและต้องแชร์ให้ใคร */
console.log('\n22. เปิดชีทไม่ได้ ต้องบอกทางแก้ให้ครบ');

var fx22 = FS.build();
var api22 = FS.load(fx22);
truthy2('เปิดได้ปกติ ต้องบอกว่าใช้งานได้เลย', /ใช้งานได้เลย/.test(api22.whoAmI()));
truthy2('บอกบัญชีที่รันสคริปต์', /citisales01@chem-inno-tech\.com/.test(api22.whoAmI()));
truthy2('บอกลิงก์ไฟล์ที่ผูกอยู่', /spreadsheets\/d\//.test(api22.whoAmI()));

var blocked = FS.load(FS.build(), { canOpen: false, owner: 'robot@chem-inno-tech.com' });
var w22 = blocked.whoAmI();
truthy2('เปิดไม่ได้ ต้องบอกตรง ๆ', /เปิดไฟล์นี้ไม่ได้/.test(w22));
truthy2('บอกอีเมลที่ต้องเอาไปแชร์', /robot@chem-inno-tech\.com/.test(w22));
truthy2('บอกว่าต้องให้สิทธิ์ระดับไหน', /ผู้แก้ไข/.test(w22));

var msg22 = throws('งานอื่นที่ต้องเปิดชีท ต้องได้ข้อความเดียวกัน ไม่ใช่ error ดิบของ Google',
  function () { blocked.getBootstrap(); }, 'เปิดชีทไม่ได้ด้วยบัญชี');
truthy2('ในข้อความมีอีเมลที่ต้องแชร์ให้', /robot@chem-inno-tech\.com/.test(msg22));
truthy2('และมีลิงก์ไฟล์ให้กดเปิดไปแชร์ได้เลย', /spreadsheets\/d\//.test(msg22));

/* ====== 23. สูตรของชีทออเดอร์ถูกพิมพ์ทับ ต้องซ่อมได้โดยไม่กินข้อมูลที่คนกรอก */
console.log('\n23. ซ่อมสูตรของชีทออเดอร์');

var fx23 = FS.build();
var api23 = FS.load(fx23);
api23.createOrder(order({ cust: 'ลูกค้าที่ต้องไม่หาย' }));
var i23 = fx23.sheets['ออเดอร์_รายการ'], h23 = fx23.sheets['ออเดอร์_หัวบิล'];

/* จำลองอาการจริง: วางทับจนสูตรของแถวต้น ๆ กลายเป็นค่านิ่ง
   (ชีทจริงเสีย 333 ช่อง ราว 28 แถวแรก ส่วนแถวลึก ๆ ยังดี) */
var CALC_ITEM = [1, 3, 5, 6, 8, 10, 11, 12, 13, 14, 15, 16];
for (var r23 = DATA_ROW; r23 < DATA_ROW + 20; r23++) {
  CALC_ITEM.forEach(function (c) { i23.cell(r23, c).f = ''; i23.cell(r23, c).v = ''; });
}
var keepNo = i23.cell(DATA_ROW, 2).v, keepSku = i23.cell(DATA_ROW, 4).v, keepQty = i23.cell(DATA_ROW, 7).v;
truthy2('ก่อนซ่อม ข้อมูลออเดอร์ยังอยู่', !!keepNo && !!keepSku);

var msg23 = api23.repairOrderSheets();
truthy2('รายงานบอกว่าซ่อมชีทออเดอร์_รายการ', /ออเดอร์_รายการ: ซ่อม \d+ ช่อง/.test(msg23));
truthy2('บอกว่าใช้แถวไหนเป็นต้นแบบ', /ใช้แถว \d+ เป็นต้นแบบ/.test(msg23));
truthy2('บอกว่าไม่แตะคอลัมน์ที่คนกรอกเอง', /ไม่ถูกแตะเลย/.test(msg23));

eq('สูตรกลับมาครบ ไม่เหลือช่องที่เป็นค่านิ่ง',
  (function () {
    var n = 0;
    for (var r = DATA_ROW; r < DATA_ROW + 20; r++)
      CALC_ITEM.forEach(function (c) { if (String(i23.cell(r, c).f || '').charAt(0) !== '=') n++; });
    return n;
  })(), 0);

console.log('\n   ข้อมูลที่คนกรอกเองต้องอยู่ครบเป๊ะ ห้ามถูกสูตรทับ');
eq('เลขออเดอร์ในบรรทัดยังอยู่', i23.cell(DATA_ROW, 2).v, keepNo);
eq('รหัสสินค้ายังอยู่', i23.cell(DATA_ROW, 4).v, keepSku);
eq('จำนวนยังอยู่', i23.cell(DATA_ROW, 7).v, keepQty);
eq('ชื่อลูกค้าในหัวบิลยังอยู่', h23.cell(DATA_ROW, 4).v, 'ลูกค้าที่ต้องไม่หาย');

console.log('\n   ชีทที่ดีอยู่แล้ว ต้องไม่ไปแตะ');
var msg23b = api23.repairOrderSheets();
truthy2('สั่งซ้ำแล้วบอกว่าปกติดีอยู่แล้ว', /ปกติดีอยู่แล้ว/.test(msg23b));
truthy2('และไม่ได้ซ่อมอะไรเพิ่ม', /รวมซ่อม 0 ช่อง/.test(msg23b));

console.log('\n   ไม่มีแถวไหนสูตรครบเลย ต้องบอกตรง ๆ ไม่ใช่เดาสูตรเอง');
var fx23c = FS.build();
var api23c = FS.load(fx23c);
var i23c = fx23c.sheets['ออเดอร์_รายการ'];
for (var r = DATA_ROW; r <= 1200; r++) i23c.cell(r, 15).f = '';
truthy2('บอกว่าไม่มีต้นแบบให้คัดลอก',
  /ไม่มีแถวไหนสูตรครบเลย/.test(api23c.repairOrderSheets()));

console.log('\n   คอลัมน์ที่ใช้วัดถูกล้างหมด ต้องไม่ข้ามไปเงียบ ๆ');
var fx23d = FS.build();
var api23d = FS.load(fx23d);
var i23d = fx23d.sheets['ออเดอร์_รายการ'];
for (var r = DATA_ROW; r <= 1200; r++) i23d.cell(r, 10).f = '';
truthy2('บอกว่าไม่เหลือสูตรเลย และให้ไปกู้จากประวัติเวอร์ชัน',
  /ไม่เหลือสูตรเลยแม้แต่แถวเดียว/.test(api23d.repairOrderSheets()));

/* ====== 24. ยอดไม่ตรง ต้องบอกสาเหตุและปุ่มที่ต้องกด ไม่ใช่แค่ "สูตรอาจถูกแก้" */
console.log('\n24. ยอดไม่ตรง ต้องบอกทางแก้');

console.log('\n   กรณีสูตรหายจริง ต้องชี้ชีทและบอกให้สั่งตัวซ่อม');
var fx24 = FS.build();
var api24 = FS.load(fx24);
var i24 = fx24.sheets['ออเดอร์_รายการ'];
/* สูตรยอดรวมของแถวต้น ๆ หาย ยอดของบิลจึงรวมได้ 0 — อาการเดียวกับที่เจอจริง */
for (var r24 = DATA_ROW; r24 < DATA_ROW + 10; r24++) i24.cell(r24, 10).f = '';
var realRecalc24 = fx24.recalc;
fx24.recalc = function () { realRecalc24(); fx24.sheets['ออเดอร์_หัวบิล'].cell(6, 10).v = 0; };

var m24 = throws('บันทึกไม่ผ่านเพราะยอดไม่ตรง',
  function () { api24.createOrder(order()); }, 'ไม่ตรงกับที่ควรเป็น');
truthy2('บอกว่าเป็นเพราะสูตรถูกพิมพ์ทับ', /สูตรในชีทถูกพิมพ์ทับจนหายไป/.test(m24));
truthy2('ชี้ชื่อชีทที่เสียพร้อมจำนวนช่อง', /ออเดอร์_รายการ \d+ ช่อง/.test(m24));
truthy2('บอกชื่อฟังก์ชันที่ต้องกด', /repairOrderSheets/.test(m24));
truthy2('บอกว่าข้อมูลในฟอร์มยังอยู่', /ยังอยู่ครบ/.test(m24));
eq('และยังถอยออเดอร์ออกหมดเหมือนเดิม', rowsWith(fx24.sheets['ออเดอร์_หัวบิล'], 1), []);

console.log('\n   กรณีสูตรครบแต่ยอดยังไม่ตรง ต้องไม่โทษว่าสูตรหาย');
var fx24b = FS.build();
var api24b = FS.load(fx24b);
var realRecalc24b = fx24b.recalc;
fx24b.recalc = function () { realRecalc24b(); fx24b.sheets['ออเดอร์_หัวบิล'].cell(6, 10).v = 1; };
var m24b = throws('บันทึกไม่ผ่าน', function () { api24b.createOrder(order()); }, 'ไม่ตรงกับที่ควรเป็น');
truthy2('บอกว่าสูตรยังครบดี', /สูตรของชีทยังครบดี/.test(m24b));
truthy2('และให้ไปดูสูตรจริงด้วย checkFormulas', /checkFormulas/.test(m24b));
truthy2('ไม่ไปแนะนำตัวซ่อมทั้งที่ไม่มีอะไรให้ซ่อม', m24b.indexOf('repairOrderSheets') < 0);

/* ====== 25. ชีทต้องไม่ตีความเบอร์โทรเป็นตัวเลข และวันที่ต้องไม่เลื่อนวัน */
console.log('\n25. เบอร์โทรกับวันที่ที่ชีทชอบตีความเอง');

var fx25 = FS.build();
var api25 = FS.load(fx25);
api25.createOrder(order({ date: '2026-09-01', tel: '0932592583', track: '0012345678' }));
var h25 = fx25.sheets['ออเดอร์_หัวบิล'];

console.log('\n   เบอร์โทร: ของจริงเคยกลายเป็น -932592583 บนใบปะหน้า');
eq('ช่องเบอร์ถูกตั้งเป็นข้อความก่อนเขียน', h25.cell(DATA_ROW, 5).fmt, '@');
eq('เบอร์เก็บครบทุกหลัก ศูนย์หน้าไม่หาย', h25.cell(DATA_ROW, 5).v, '0932592583');
eq('เลขพัสดุก็เป็นข้อความเหมือนกัน', h25.cell(DATA_ROW, 8).fmt, '@');
eq('ชื่อลูกค้าเป็นข้อความอยู่แล้ว ไม่ต้องไปตั้งรูปแบบให้',
  h25.cell(DATA_ROW, 4).fmt, undefined);

console.log('\n   วันที่: ของจริงคีย์ 1 ก.ย. แต่ชีทลง 31 ส.ค. 10:00');
var d25 = h25.cell(DATA_ROW, 2).v;
truthy2('เก็บเป็นวันที่จริง ไม่ใช่ข้อความ', d25 instanceof Date);
eq('ตรงวันที่คีย์ ไม่เลื่อนไปวันก่อนหน้า',
  [d25.getFullYear(), d25.getMonth() + 1, d25.getDate()], [2026, 9, 1]);
eq('ตั้งเป็นเที่ยงวัน ห่างเส้นวันทั้งสองฝั่ง 12 ชั่วโมง', d25.getHours(), 12);

console.log('\n   เบอร์ที่มีขีดคั่นก็ต้องอยู่ครบ ไม่กลายเป็นการลบเลข');
api25.createOrder(order({ tel: '093-259-2583' }));
eq('เก็บตามที่พิมพ์ทุกตัวอักษร', h25.cell(DATA_ROW + 1, 5).v, '093-259-2583');

/* ====== 26. เขตเวลาของชีทกับของสคริปต์ต้องตรงกัน ไม่งั้นวันที่เลื่อน */
console.log('\n26. ตั้งเขตเวลาให้ตรงกัน');

var fx26 = FS.build();
fx26.tz = 'America/Los_Angeles';   // ค่าตั้งต้นของบัญชีที่สมัครแบบสหรัฐฯ
var api26 = FS.load(fx26);

truthy2('checkSheet บอกว่าเขตเวลาไม่ตรงกัน', /ไม่ตรงกัน! ให้ Run ที่ fixTimeZone/.test(api26.checkSheet()));

var m26 = api26.fixTimeZone();
truthy2('บอกเขตเวลาเดิมก่อนแก้', /America\/Los_Angeles/.test(m26));
truthy2('บอกว่าตั้งให้ตรงกันแล้ว', /ตั้งให้ตรงกันแล้ว/.test(m26));
eq('เปลี่ยนเป็นเวลาไทยจริง', fx26.tz, 'Asia/Bangkok');
truthy2('บอกว่าออเดอร์เก่าจะแสดงวันที่ถูกเอง', /แสดงวันที่ถูกเองทันที/.test(m26));
truthy2('บอกว่าสูตร TODAY จะนับถูกด้วย', /TODAY\(\)/.test(m26));

console.log('\n   สั่งซ้ำต้องไม่แก้อะไรอีก');
truthy2('บอกว่าตรงกันดีอยู่แล้ว', /ตรงกันดีอยู่แล้ว/.test(api26.fixTimeZone()));
truthy2('checkSheet ไม่เตือนแล้ว', /ตรงกันดี/.test(api26.checkSheet()));

/* ====== 27. ล้างออเดอร์แล้วเลขต้องไม่วนกลับไปชนใบที่ลูกค้าถืออยู่

   ของจริง: ล้างออเดอร์ทดลองทิ้ง เลขวนกลับไป 0001 แต่ชีทเอกสารยังเก็บใบที่
   ออกให้ลูกค้าไปแล้วถึง AST-26-0014 — ค้น AST-26-0002 ทีเดียวเจอลูกค้าสองราย
   และพอจะออกใบชนิดเดิมให้ออเดอร์ใหม่ ระบบจะปฏิเสธโดยชี้ไปที่ใบของอีกคน */
console.log('\n27. เลขออเดอร์ต้องเดินต่อจากใบที่ออกไปแล้ว ไม่ใช่แค่จากชีทออเดอร์');

var fx27 = FS.build();
var api27 = FS.load(fx27);
var d27 = fx27.sheets['เอกสาร'];

/* ใบที่ออกให้ลูกค้าไปแล้ว แล้วออเดอร์ถูกล้างทีหลัง — เหลือแต่ใบ */
d27.cell(DATA_ROW, 2).v = 'ONIV26-00235';
d27.cell(DATA_ROW, 3).v = 'ใบเสร็จรับเงิน';
d27.cell(DATA_ROW, 5).v = 'AST-26-0014';
d27.cell(DATA_ROW + 1, 2).v = 'IV26-00001';
d27.cell(DATA_ROW + 1, 3).v = 'ใบแจ้งหนี้';
d27.cell(DATA_ROW + 1, 5).v = 'AST-26-0006';

eq('ชีทออเดอร์ว่าง แต่เลขถัดไปเดินต่อจากใบที่ออกไปแล้ว',
  api27.getBootstrap().nextNo, 'AST-26-0015');

var r27 = api27.createOrder(order());
eq('ใบที่คีย์จริงได้เลขนั้น ไม่ทับของเก่า', r27.no, 'AST-26-0015');
eq('ใบต่อไปเดินต่อตามปกติ', api27.getBootstrap().nextNo, 'AST-26-0016');

console.log('\n   ช่องที่ไม่ใช่เลขออเดอร์ในชีทเอกสารต้องไม่ถูกนับ');
d27.cell(DATA_ROW + 2, 2).v = 'QO26-00001';
d27.cell(DATA_ROW + 2, 3).v = 'ใบเสนอราคา';
d27.cell(DATA_ROW + 2, 5).v = '';              // ใบเสนอราคายังไม่ผูกออเดอร์
eq('ใบเสนอราคาที่ยังไม่ผูกออเดอร์ไม่ดันเลข', api27.getBootstrap().nextNo, 'AST-26-0016');

console.log('\n   ชีทเอกสารว่างเปล่าก็ยังเริ่มที่ 0001 เหมือนเดิม');
var api27b = FS.load(FS.build());
eq('ไม่มีทั้งออเดอร์และเอกสาร → เริ่มที่ใบแรก',
  api27b.getBootstrap().nextNo, 'AST-26-0001');

/* ====== 28. ยกยอดเลขเอกสารจากเล่มเดิม */
console.log('\n28. ยกยอดเลขใบแจ้งหนี้มาจากเล่มกระดาษ');

var fx28 = FS.build();
var api28 = FS.load(fx28, {});
api28.setup();

/* เล่มใบแจ้งหนี้ที่ร้านใช้อยู่เดินมาถึง 240 แล้ว เล่มใหม่ต้องต่อจากนั้น ไม่ใช่เริ่มหนึ่ง */
var rec28 = api28.peekDocNos().rec;
var cfg28 = fx28.sheets['ตั้งค่าแอป'], found28 = false;
for (var i28 = 1; i28 < 80; i28++) {
  if (String(cfg28.cell(i28, 1).v || '') === 'ยกยอดเลขใบแจ้งหนี้มาจาก') {
    cfg28.cell(i28, 2).v = 240; found28 = true;
  }
}
truthy2('ชีทตั้งค่าแอปมีช่องยกยอดเลขใบแจ้งหนี้ให้กรอก', found28);
eq('ใบแจ้งหนี้ใบแรกเดินต่อจากเล่มเดิม', api28.peekDocNos().inv, 'IV26-00241');
eq('แก้เล่มใบแจ้งหนี้แล้วเล่มใบเสร็จไม่ขยับตาม', api28.peekDocNos().rec, rec28);

/* ====== 29. ลายเซ็น

   สองที่เก็บ ตั้งใจให้แยกกัน
     ตั้งค่าแอป  ลายเซ็นฝั่งร้าน เซ็นครั้งเดียวใช้ทุกใบ
     เอกสาร     ลายเซ็นผู้รับของ เป็นของใบนั้นใบเดียว และมาทีหลังตอนของถึงมือ
   ห้ามเขียนปนกับช่อง snap เพราะ snap คือ "ใบตอนที่ออก" ที่ต้องพิมพ์ซ้ำได้เหมือนเดิม */
console.log('\n29. ลายเซ็น');

/* คอลัมน์ของชีท เอกสาร — ต้องตรงกับ SH.doc.IN ใน Sheets.gs
   ถ้าคอลัมน์ขยับแล้วลืมแก้ตรงนี้ ข้อสอบจะฟ้องทันทีเพราะค่าที่อ่านได้ไม่ตรง */
var DOC_TOTAL = 17, DOC_SNAP = 21, DOC_SIGN = 22;

var fx29 = FS.build();
var api29 = FS.load(fx29, {});
api29.setup();
var cfg29 = fx29.sheets['ตั้งค่าแอป'];

function cfgVal29(name) {
  for (var r = 1; r < 80; r++) {
    if (String(cfg29.cell(r, 1).v || '') === name) return cfg29.cell(r, 2);
  }
  return null;
}

truthy2('setup เติมแถวลายเซ็นผู้มีอำนาจลงนามให้', !!cfgVal29('ลายเซ็นผู้มีอำนาจลงนาม'));
truthy2('setup เติมแถวลายเซ็นผู้รับเงินให้', !!cfgVal29('ลายเซ็นผู้รับเงิน/พนักงานขาย'));
eq('ยังไม่ได้เซ็น ช่องต้องว่าง ไม่ใช่ค่าเดา', cfgVal29('ลายเซ็นผู้มีอำนาจลงนาม').v, '');

var SIG = JSON.stringify({ w: 600, h: 200, s: [[10, 20, 300, 40, 590, 180]] });
api29.saveSignature('auth', SIG);
eq('เก็บลายเซ็นลงชีทตั้งค่าแอปจริง', cfgVal29('ลายเซ็นผู้มีอำนาจลงนาม').v, SIG);
eq('ตั้งช่องเป็นข้อความก่อนเขียน ไม่ให้ชีทเดาชนิดเอง',
  cfgVal29('ลายเซ็นผู้มีอำนาจลงนาม').fmt, '@');
eq('แอปอ่านกลับไปใช้ได้', api29.getBootstrap().app.sign.auth, SIG);
eq('อีกช่องไม่ถูกแตะ', api29.getBootstrap().app.sign.cashier, '');

console.log('\n   ลบลายเซ็นทิ้งได้ ไม่ใช่เซ็นแล้วเซ็นตลอดไป');
api29.saveSignature('auth', '');
eq('ลบแล้วช่องว่างจริง', cfgVal29('ลายเซ็นผู้มีอำนาจลงนาม').v, '');

console.log('\n   ค่าที่ไม่ใช่ลายเซ็นต้องไม่ถูกเก็บลงชีท');
throws('ไม่ใช่ JSON', function(){ api29.saveSignature('auth', 'ลายเซ็นของฉัน') }, 'รูปแบบลายเซ็น');
throws('JSON ที่ไม่มีเส้น', function(){ api29.saveSignature('auth', '{"w":600,"h":200,"s":[]}') }, 'ว่างเปล่า');
throws('ไม่รู้ว่าเป็นลายเซ็นของใคร', function(){ api29.saveSignature('somebody', SIG) }, 'ลายเซ็นของใคร');
var HUGE = '{"w":600,"h":200,"s":[[' + new Array(30000).join('1,') + '1]]}';
throws('ยาวเกินช่องในชีท', function(){ api29.saveSignature('auth', HUGE) }, 'ยาวเกินไป');
eq('ของที่ล้มเหลวไม่ทิ้งอะไรไว้ในชีท', cfgVal29('ลายเซ็นผู้มีอำนาจลงนาม').v, '');

console.log('\n   รูปลายเซ็นที่สแกนมาก็ใช้ได้ แต่ลิงก์จากเน็ตห้าม');
var IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
api29.saveSignature('cashier', IMG);
eq('เก็บรูปลายเซ็นได้', api29.getBootstrap().app.sign.cashier, IMG);
throws('ลิงก์รูปจากเน็ตไม่รับ',
  function(){ api29.saveSignature('cashier', 'https://example.com/sig.png') }, 'รูปแบบลายเซ็น');

console.log('\n   ลูกค้าเซ็นรับของบนใบที่ออกไปแล้ว');
var d29 = fx29.sheets['เอกสาร'];
d29.cell(DATA_ROW, 2).v = 'ONIV26-00243';
d29.cell(DATA_ROW, 3).v = 'ใบเสร็จรับเงิน';
d29.cell(DATA_ROW, 5).v = 'AST-26-0015';
d29.cell(DATA_ROW, DOC_SNAP).v = '{"v":1,"no":"ONIV26-00243"}';

api29.signDoc('ONIV26-00243', SIG, 'น้องบี');
eq('ลายเซ็นลงคอลัมน์ของตัวเอง', d29.cell(DATA_ROW, DOC_SIGN).v, SIG);
eq('ภาพถ่ายของใบตอนที่ออกไม่ถูกแตะแม้แต่ตัวอักษรเดียว',
  d29.cell(DATA_ROW, DOC_SNAP).v, '{"v":1,"no":"ONIV26-00243"}');
eq('เลขที่เอกสารไม่ถูกแตะ', d29.cell(DATA_ROW, 2).v, 'ONIV26-00243');
eq('ยอดเงินไม่ถูกแตะ', d29.cell(DATA_ROW, DOC_TOTAL).v, '');
throws('ใบที่ไม่มีจริง', function(){ api29.signDoc('ONIV26-99999', SIG) }, 'ไม่พบเอกสาร');

console.log('\n   ใบที่ยกเลิกไปแล้วเซ็นรับของไม่ได้ — เป็นหลักฐานที่ขัดกันเอง');
api29.voidDoc('ONIV26-00243', 'ออกผิดชนิดเอกสาร', 'น้องบี');
throws('เซ็นบนใบที่ยกเลิกแล้ว',
  function(){ api29.signDoc('ONIV26-00243', SIG) }, 'ถูกยกเลิกไปแล้ว');

console.log('\n   ไม่มีสูตรถูกเขียนทับเลยตลอดหมวดนี้');
var over29 = [];
for (var nm29 in fx29.sheets) over29 = over29.concat(fx29.sheets[nm29].overwrittenFormulas);
eq('ไม่มีช่องสูตรถูกแตะ', over29, []);

/* ====== 30. แก้รายการสินค้าของออเดอร์ที่คีย์ไปแล้ว

   ลูกค้าขอเพิ่มของก่อนร้านแพ็คส่ง — ของเดิมทำได้ทางเดียวคือยกเลิกใบแล้วคีย์ใหม่
   สิ่งที่ต้องถูกทั้งหมด: หัวบิลไม่ขยับ · ล็อตเก่าคืนเข้าสต๊อก · ล็อตใหม่ตัดตาม FEFO
   และถ้าออกใบกำกับภาษีไปแล้วต้องแก้ไม่ได้ เพราะใบที่ลูกค้าถืออยู่จะไม่ตรงกับของจริง */
console.log('\n30. แก้รายการสินค้าของออเดอร์ที่คีย์ไปแล้ว');

/* คอลัมน์ของ ออเดอร์_หัวบิล — ต้องตรงกับ SH.head.IN ใน Sheets.gs */
var SH_HEAD_CUST = 4, SH_HEAD_SHIP = 12;

var fx30 = FS.build({
  lots: [
    { sku: 'CHEM-001', lotNo: 'L-EARLY', exp: '2026-10-01', recv: '2026-08-01', qty: 3 },
    { sku: 'CHEM-001', lotNo: 'L-LATE',  exp: '2027-03-01', recv: '2026-08-01', qty: 50 }
  ]
});
var api30 = FS.load(fx30, {});
api30.setup();
var hd30 = fx30.sheets['ออเดอร์_หัวบิล'];
var it30 = fx30.sheets['ออเดอร์_รายการ'];
var ct30 = fx30.sheets['ตัดล็อต'];

var made = api30.createOrder(order({
  items: [{ sku: 'SKU-141', qty: 2, price: 100 }]
}));
var hRow30 = rowsWith(hd30, 1)[0];
eq('ตั้งต้นมีบรรทัดเดียว', linesOf30(made.no).length, 1);
eq('ยอดสินค้าตั้งต้น', made.subtotal, 200);

function linesOf30(no) {
  return rowsWith(it30, 2).filter(function (r) { return it30.cell(r, 2).v === no });
}

var custBefore = hd30.cell(hRow30, SH_HEAD_CUST).v;
var shipBefore = hd30.cell(hRow30, SH_HEAD_SHIP).v;

console.log('\n   ลูกค้าขอเพิ่มของอีกอย่าง');
var r30 = api30.editOrderItems(made.no, [
  { sku: 'SKU-141', qty: 2, price: 100 },
  { sku: 'SKU-143', qty: 3, price: 50 }
], 'น้องบี', 'ck-edit-1');

eq('บอกว่าจากกี่รายการเป็นกี่รายการ', [r30.before, r30.after], [1, 2]);
eq('ยอดสินค้าใหม่', r30.subtotal, 350);
eq('ชีทมีสองบรรทัดแล้ว', linesOf30(made.no).length, 2);

console.log('\n   หัวบิลต้องไม่ถูกแตะเลย');
eq('ยังมีหัวบิลใบเดียว', rowsWith(hd30, 1).length, 1);
eq('เลขออเดอร์เดิม', hd30.cell(hRow30, 1).v, made.no);
eq('ชื่อลูกค้าเดิม', hd30.cell(hRow30, SH_HEAD_CUST).v, custBefore);
eq('ค่าจัดส่งเดิม', hd30.cell(hRow30, SH_HEAD_SHIP).v, shipBefore);

console.log('\n   ลดจำนวนแล้วล็อตต้องคืนเข้าสต๊อก ไม่ใช่ค้างตัดไว้');
var api30b = FS.load(fx30, {});
var mk = api30b.createOrder(order({ items: [{ sku: 'CHEM-001', qty: 3, price: 1200 }] }));
var cutOf = function (no) {
  return rowsWith(ct30, 2).filter(function (r) { return ct30.cell(r, 2).v === no })
    .map(function (r) { return ct30.cell(r, 5).v + ' x' + ct30.cell(r, 6).v });
};
eq('ตัดล็อตที่หมดอายุก่อนจนหมดล็อต', cutOf(mk.no), ['L-EARLY x3']);

api30b.editOrderItems(mk.no, [{ sku: 'CHEM-001', qty: 1, price: 1200 }], 'น้องบี', 'ck-edit-2');
eq('ตัดใหม่เหลือหนึ่งชิ้น จากล็อตที่หมดอายุก่อนเหมือนเดิม', cutOf(mk.no), ['L-EARLY x1']);

console.log('\n   เพิ่มจนเกินล็อตแรก ต้องไหลไปล็อตถัดไปตามวันหมดอายุ');
api30b.editOrderItems(mk.no, [{ sku: 'CHEM-001', qty: 5, price: 1200 }], 'น้องบี', 'ck-edit-3');
eq('ล็อตหมดอายุก่อนหมดแล้วค่อยไปล็อตหลัง', cutOf(mk.no), ['L-EARLY x3', 'L-LATE x2']);

console.log('\n   ออกใบกำกับภาษีไปแล้ว ห้ามแก้ของในใบ');
var d30 = fx30.sheets['เอกสาร'];
d30.cell(DATA_ROW, 2).v = 'ONIV26-00250';
d30.cell(DATA_ROW, 3).v = 'ใบเสร็จรับเงิน';
d30.cell(DATA_ROW, 5).v = made.no;
throws('มีใบที่ยังไม่ยกเลิกอยู่',
  function () { api30.editOrderItems(made.no, [{ sku: 'SKU-141', qty: 1, price: 100 }], 'บี', 'ck-x1') },
  'ออกเอกสารไปแล้ว');
eq('ของเดิมยังอยู่ครบ ไม่ถูกรื้อทิ้ง', linesOf30(made.no).length, 2);

console.log('\n   ยกเลิกใบนั้นแล้วแก้ได้');
d30.cell(DATA_ROW, 20).v = 'ออกผิด ยกเลิกเพื่อแก้รายการ';
var r30c = api30.editOrderItems(made.no, [{ sku: 'SKU-141', qty: 1, price: 100 }], 'บี', 'ck-x2');
eq('แก้ผ่านแล้ว', r30c.after, 1);

console.log('\n   สิ่งที่ต้องปฏิเสธ');
throws('ออเดอร์ที่ไม่มีจริง',
  function () { api30.editOrderItems('AST-26-9999', [{ sku: 'SKU-141', qty: 1 }], 'บี', 'ck-x3') },
  'ไม่พบออเดอร์');
throws('รายการว่างเปล่า',
  function () { api30.editOrderItems(made.no, [], 'บี', 'ck-x4') }, 'อย่างน้อยหนึ่งบรรทัด');

console.log('\n   กดซ้ำเพราะเน็ตช้า ต้องไม่ได้ผลสองรอบ');
var beforeDup = linesOf30(made.no).length;
var dup = api30.editOrderItems(made.no,
  [{ sku: 'SKU-141', qty: 1, price: 100 }, { sku: 'SKU-143', qty: 1, price: 50 }], 'บี', 'ck-x2');
truthy2('ตอบว่าเป็นการกดซ้ำ', !!dup.duplicate);
eq('ไม่มีบรรทัดงอกเพิ่ม', linesOf30(made.no).length, beforeDup);

console.log('\n   แก้ไม่สำเร็จ ต้องเขียนรายการเดิมคืน ไม่ทิ้งหัวบิลเปล่า');
var beforeFail = linesOf30(made.no).map(function (r) {
  return it30.cell(r, 4).v + '|' + it30.cell(r, 7).v;
});
throws('สินค้าที่ไม่มีในฐาน',
  function () {
    api30.editOrderItems(made.no, [{ sku: 'SKU-ไม่มีจริง', qty: 1, price: 10 }], 'บี', 'ck-x5');
  }, 'ไม่พบ SKU');
eq('รายการเดิมกลับมาเหมือนเดิมทุกบรรทัด',
  linesOf30(made.no).map(function (r) { return it30.cell(r, 4).v + '|' + it30.cell(r, 7).v }),
  beforeFail);

console.log('\n   ไม่มีสูตรถูกเขียนทับเลยตลอดหมวดนี้');
var over30 = [];
for (var nm30 in fx30.sheets) over30 = over30.concat(fx30.sheets[nm30].overwrittenFormulas);
eq('ไม่มีช่องสูตรถูกแตะ', over30, []);

/* ====== 31. ยกเลิกทั้งออเดอร์ — ลูกค้าเปลี่ยนใจไม่รับของ

   ข้อสอบข้อสำคัญที่สุดของหมวดนี้คือ "ของกลับเข้าสต๊อกจริงไหม"
   ไม่ใช่แค่ช่องสถานะเปลี่ยนเป็นคำว่ายกเลิก เพราะถ้าของไม่คืน
   ยอดในชีทจะน้อยกว่าของบนชั้นตลอดไป และรอบหน้าระบบจะบอกว่าของไม่พอทั้งที่พอ */
console.log('\n31. ยกเลิกทั้งออเดอร์');

var SH_HEAD_STATUS = 17, SH_HEAD_NOTE = 20, SH_HEAD_DISC = 11, SH_HEAD_NET = 14;

var fx31 = FS.build({
  lots: [
    { sku: 'CHEM-001', lotNo: 'L-A', exp: '2026-10-01', recv: '2026-08-01', qty: 10 },
    { sku: 'CHEM-001', lotNo: 'L-B', exp: '2027-03-01', recv: '2026-08-01', qty: 10 }
  ]
});
var api31 = FS.load(fx31, {});
api31.setup();
var hd31 = fx31.sheets['ออเดอร์_หัวบิล'];
var it31 = fx31.sheets['ออเดอร์_รายการ'];
var ct31 = fx31.sheets['ตัดล็อต'];
var lt31 = fx31.sheets['ล็อตสินค้า'];
var rc31 = fx31.sheets['รับเข้า'];

function lotLeft31(lotNo) {
  var rows = rowsWith(lt31, 2);
  for (var i = 0; i < rows.length; i++) {
    if (lt31.cell(rows[i], 4).v === lotNo) return lt31.cell(rows[i], 9).v;
  }
  return null;
}

var c31 = api31.createOrder(order({
  cust: 'คุณเปลี่ยนใจ ไม่รับของ', ship: 50, discount: 20,
  items: [{ sku: 'CHEM-001', qty: 4, price: 1200 }]
}));
var row31 = rowsWith(hd31, 1).filter(function (r) { return hd31.cell(r, 1).v === c31.no })[0];
eq('ตัดล็อตที่หมดอายุก่อนไป 4 ชิ้น', lotLeft31('L-A'), 6);
eq('ยอดสุทธิก่อนยกเลิก', hd31.cell(row31, SH_HEAD_NET).v, 4 * 1200 - 20 + 50);

console.log('\n   เหตุผลสั้นเกินไป ต้องไม่ยอมให้ยกเลิก');
throws('เหตุผลว่างเปล่า', function () { api31.cancelOrder(c31.no, '', 'บี', 'x1') },
  'อย่างน้อย 5 ตัวอักษร');
eq('ของยังไม่คืน สถานะยังไม่เปลี่ยน', lotLeft31('L-A'), 6);

console.log('\n   ยกเลิกจริง');
var x31 = api31.cancelOrder(c31.no, 'ลูกค้าเปลี่ยนใจไม่รับของ', 'น้องบี', 'x2');
eq('บอกจำนวนบรรทัดที่รื้อออก', [x31.items, x31.cuts], [1, 1]);
eq('บอกยอดเดิมของใบที่ยกเลิก', x31.netBefore, 4 * 1200 - 20 + 50);
eq('ของคืนเข้าล็อตครบ', lotLeft31('L-A'), 10);
eq('รายการสินค้าของใบนี้ถูกรื้อออกหมด',
  rowsWith(it31, 2).filter(function (r) { return it31.cell(r, 2).v === c31.no }).length, 0);
eq('แถวตัดล็อตของใบนี้ถูกรื้อออกหมด',
  rowsWith(ct31, 2).filter(function (r) { return ct31.cell(r, 2).v === c31.no }).length, 0);

console.log('\n   หัวบิลยังอยู่ แต่ยอดต้องเป็นศูนย์');
eq('หัวบิลไม่ถูกลบทิ้ง', hd31.cell(row31, 1).v, c31.no);
eq('ชื่อลูกค้ายังอยู่', hd31.cell(row31, SH_HEAD_CUST).v, 'คุณเปลี่ยนใจ ไม่รับของ');
eq('สถานะเป็นยกเลิก', hd31.cell(row31, SH_HEAD_STATUS).v, 'ยกเลิก');
eq('ยอดสินค้าเป็นศูนย์', hd31.cell(row31, 10).v, 0);
eq('ค่าส่งกับส่วนลดถูกล้าง ยอดสุทธิจึงเป็นศูนย์', hd31.cell(row31, SH_HEAD_NET).v, 0);
eq('ส่วนลดเดิมถูกล้าง', hd31.cell(row31, SH_HEAD_DISC).v, 0);
truthy2('เหตุผลถูกจดไว้ในหมายเหตุ',
  String(hd31.cell(row31, SH_HEAD_NOTE).v).indexOf('ลูกค้าเปลี่ยนใจไม่รับของ') > -1);
truthy2('หมายเหตุบอกด้วยว่าใครเป็นคนยกเลิก',
  String(hd31.cell(row31, SH_HEAD_NOTE).v).indexOf('น้องบี') > -1);

console.log('\n   Log ต้องจดของที่คืนเข้าสต๊อกไว้ ไม่ใช่หายไปเฉย ๆ');
var log31 = fx31.sheets['Log'];
var logLine31 = rowsWith(log31, 2).map(function (r) {
  return [log31.cell(r, 4).v, log31.cell(r, 6).v, log31.cell(r, 10).v].join(' ');
}).filter(function (t) { return t.indexOf('ยกเลิกออเดอร์') === 0 })[0] || '';
truthy2('Log บอกว่าเป็นการยกเลิกใบไหน', logLine31.indexOf(c31.no) > -1);
truthy2('Log บอกว่าของอะไรคืนเข้าสต๊อก', logLine31.indexOf('CHEM-001 x4') > -1);
truthy2('Log บอกล็อตที่คืน', logLine31.indexOf('L-A x4') > -1);

console.log('\n   กดซ้ำเพราะเน็ตช้า ต้องไม่ทำงานสองรอบ');
var dup31 = api31.cancelOrder(c31.no, 'ลูกค้าเปลี่ยนใจไม่รับของ', 'น้องบี', 'x2');
truthy2('ตอบว่าเป็นการกดซ้ำ', !!dup31.duplicate);

console.log('\n   ยกเลิกซ้ำใบเดิมด้วยกุญแจใหม่ ต้องปฏิเสธ');
throws('ยกเลิกไปแล้ว', function () { api31.cancelOrder(c31.no, 'กดผิด กดซ้ำอีกที', 'บี', 'x3') },
  'ถูกยกเลิกไปแล้ว');

console.log('\n   ของซื้อมาขายไป — ขารับต้องถูกรื้อพร้อมขาขาย');
var f31 = api31.createOrder(order({
  cust: 'คุณซื้อมาขายไป', ship: 0, discount: 0,
  items: [{ free: true, name: 'ดอกกัดพิเศษสั่งทำ', qty: 2, price: 500, cost: 300 }]
}));
function recvOf31(no) {
  return rowsWith(rc31, 6).filter(function (r) { return rc31.cell(r, 3).v === no; });
}
eq('ตอนขายมีแถวรับเข้าคู่ไว้หนึ่งแถว', recvOf31(f31.no).length, 1);
var xf31 = api31.cancelOrder(f31.no, 'ลูกค้ายกเลิกของสั่งทำ', 'บี', 'x4');
eq('บอกว่ารื้อแถวรับเข้าไปด้วย', xf31.recv, 1);
eq('แถวรับเข้าถูกรื้อออก ไม่เหลือของผีในสต๊อก', recvOf31(f31.no).length, 0);

console.log('\n   ออกใบกำกับภาษีไปแล้ว ยกเลิกออเดอร์เฉย ๆ ไม่ได้');
var g31 = api31.createOrder(order({ cust: 'คุณมีใบแล้ว', items: [{ sku: 'SKU-141', qty: 1, price: 100 }] }));
var doc31 = fx31.sheets['เอกสาร'];
doc31.cell(DATA_ROW, 2).v = 'ONIV26-00300';
doc31.cell(DATA_ROW, 3).v = 'ใบเสร็จรับเงิน/ใบกำกับภาษี';
doc31.cell(DATA_ROW, 5).v = g31.no;
throws('มีใบที่ยังไม่ยกเลิกอยู่',
  function () { api31.cancelOrder(g31.no, 'ลูกค้าเปลี่ยนใจไม่รับของ', 'บี', 'x5') },
  'ออกเอกสารไปแล้ว');
eq('ของยังไม่ถูกรื้อ ใบยังอยู่ครบ',
  rowsWith(it31, 2).filter(function (r) { return it31.cell(r, 2).v === g31.no }).length, 1);

console.log('\n   ยกเลิกใบเอกสารก่อน แล้วจึงยกเลิกออเดอร์ได้');
doc31.cell(DATA_ROW, 20).v = 'ลูกค้าไม่รับของ ยกเลิกทั้งใบ';
var g31x = api31.cancelOrder(g31.no, 'ลูกค้าเปลี่ยนใจไม่รับของ', 'บี', 'x6');
eq('ยกเลิกผ่านแล้ว', g31x.items, 1);

console.log('\n   ออเดอร์ที่ไม่มีจริง');
throws('ไม่มีเลขนี้ในชีท',
  function () { api31.cancelOrder('AST-26-9999', 'ลูกค้าเปลี่ยนใจไม่รับของ', 'บี', 'x7') },
  'ไม่พบออเดอร์');

console.log('\n   ใบที่ยกเลิกแล้วต้องไม่ถูกแก้รายการต่อ');
throws('แก้ของในใบที่ยกเลิกไปแล้ว',
  function () { api31.editOrderItems(c31.no, [{ sku: 'SKU-141', qty: 1, price: 10 }], 'บี', 'x8') },
  'ถูกยกเลิกไปแล้ว');

console.log('\n   ไม่มีสูตรถูกเขียนทับเลยตลอดหมวดนี้');
var over31 = [];
for (var nm31 in fx31.sheets) over31 = over31.concat(fx31.sheets[nm31].overwrittenFormulas);
eq('ไม่มีช่องสูตรถูกแตะ', over31, []);

/* ====== 32. รายชื่อลูกค้าเก่า — คีย์ออเดอร์ซ้ำลูกค้าเดิมไม่ต้องพิมพ์ที่อยู่ใหม่ */
console.log('\n32. รายชื่อลูกค้าเก่า');

var fx32 = FS.build();
var api32 = FS.load(fx32, {});
api32.setup();

api32.createOrder(order({
  cust: 'บริษัท ทดสอบ จำกัด', tel: '021234567', date: '2026-08-01',
  addr: 'ที่อยู่เก่า 1 ถ.เก่า', items: [{ sku: 'SKU-141', qty: 1, price: 100 }]
}));
api32.createOrder(order({
  cust: 'บริษัท ทดสอบ จำกัด', tel: '0812223333', date: '2026-09-01',
  addr: 'ที่อยู่ใหม่ 99 ถ.ใหม่', items: [{ sku: 'SKU-141', qty: 1, price: 100 }]
}));
api32.createOrder(order({
  cust: 'คุณอีกคน', tel: '0899999999', date: '2026-08-15',
  addr: 'บ้านเลขที่ 5', items: [{ sku: 'SKU-141', qty: 1, price: 100 }]
}));

var cs32 = api32.getCustomers();
eq('รวมชื่อซ้ำเป็นคนเดียว ไม่ขึ้นสองบรรทัด', cs32.length, 2);
eq('เรียงคนที่ซื้อล่าสุดขึ้นก่อน', cs32[0].name, 'บริษัท ทดสอบ จำกัด');
eq('นับจำนวนครั้งที่ซื้อ', cs32[0].n, 2);
eq('ใช้ที่อยู่ของครั้งล่าสุด ไม่ใช่ครั้งแรก', cs32[0].addr, 'ที่อยู่ใหม่ 99 ถ.ใหม่');
eq('ใช้เบอร์ของครั้งล่าสุด', cs32[0].tel, '0812223333');

console.log('\n   เบอร์ที่ขึ้นต้นด้วยศูนย์ต้องไม่หายไปกับการเป็นตัวเลข');
eq('ศูนย์หน้ายังอยู่', cs32[1].tel, '0899999999');

console.log('\n   ข้อมูลผู้เสียภาษีมาจากชีทเอกสาร');
var doc32 = fx32.sheets['เอกสาร'];
doc32.cell(DATA_ROW, 2).v = 'ONIV26-00400';
doc32.cell(DATA_ROW, 3).v = 'ใบเสร็จรับเงิน/ใบกำกับภาษี';
doc32.cell(DATA_ROW, 4).v = new Date('2026-09-02T00:00:00');
doc32.cell(DATA_ROW, 6).v = 'บริษัท ทดสอบ จำกัด';
doc32.cell(DATA_ROW, 7).v = '0105511000011';
doc32.cell(DATA_ROW, 8).v = 'สำนักงานใหญ่';
doc32.cell(DATA_ROW, 9).v = 'ที่อยู่ตามใบกำกับภาษี 77';
doc32.cell(DATA_ROW, 11).v = 'acc@test.co.th';
var cs32b = api32.getCustomers();
var one32 = cs32b.filter(function (c) { return c.name === 'บริษัท ทดสอบ จำกัด' })[0];
eq('ได้เลขผู้เสียภาษีมาด้วย', one32.taxId, '0105511000011');
eq('ได้อีเมลมาด้วย', one32.email, 'acc@test.co.th');
eq('ได้สาขามาด้วย', one32.branch, 'สำนักงานใหญ่');
eq('ที่อยู่ตามใบกำกับภาษีเก็บแยก', one32.taxAddr, 'ที่อยู่ตามใบกำกับภาษี 77');
eq('ที่อยู่ส่งของไม่ถูกที่อยู่จดทะเบียนทับ', one32.addr, 'ที่อยู่ใหม่ 99 ถ.ใหม่');

console.log('\n   อ่านอย่างเดียว ต้องไม่เขียนอะไรลงชีทเลย');
var over32 = [];
for (var nm32 in fx32.sheets) over32 = over32.concat(fx32.sheets[nm32].overwrittenFormulas);
eq('ไม่มีช่องสูตรถูกแตะ', over32, []);

/* ====== 33. ซ่อมใบเก่าที่คีย์ของซื้อมาขายไปโดยไม่ใส่ต้นทุน

   ของจริงคือใบ AST-26-0018 — ชื่อสินค้าไปอยู่ในช่องรหัส ช่องชื่อจึงขึ้นว่า "ไม่พบ SKU"
   (ช่องชื่อเป็นสูตร VLOOKUP) ต้นทุนเป็น 0 กำไรจึงเท่ากับยอดขายทั้งก้อน

   ทางซ่อมที่จะบอกให้เจ้าของร้านกด คือกดแก้รายการแล้วใส่ต้นทุนลงไป
   หมวดนี้พิสูจน์ว่ากดแล้วได้ครบทั้งสี่อย่าง ไม่ใช่แค่ตัวเลขต้นทุนเปลี่ยน
     ลงฐานสินค้าให้เป็นรหัสจริง · ช่องชื่อเลิกขึ้น "ไม่พบ SKU" ·
     ลงรับเข้าเท่าที่ขายจึงไม่มีสต๊อกผี · ยอดขายไม่ขยับแม้แต่สตางค์ */
console.log('\n33. ซ่อมใบเก่าที่ไม่ได้ใส่ต้นทุน (แบบใบ AST-26-0018)');

var fx33 = FS.build();
var api33 = FS.load(fx33, {});
api33.setup();
var hd33 = fx33.sheets['ออเดอร์_หัวบิล'];
var it33 = fx33.sheets['ออเดอร์_รายการ'];
var pd33 = fx33.sheets['ฐานสินค้า'];
var rc33 = fx33.sheets['รับเข้า'];

/* สร้างใบให้เหมือนของจริง: 2 ขวด ขาย 247 แล้วเขียนชื่อสินค้าลงช่องรหัส
   ซึ่งคือรูปร่างที่โค้ดรุ่นก่อนทิ้งไว้ในชีทจริง */
var NAME33 = 'น้ำยาหล่อเย็นชนิดน้ำนม 1000ml';
var b33 = api33.createOrder(order({
  cust: 'ลูกค้าใบซื้อมาขายไป', ship: 50, discount: 0,
  items: [{ sku: 'SKU-141', qty: 2, price: 247 }]
}));
var iRow33 = rowsWith(it33, 2).filter(function (r) { return it33.cell(r, 2).v === b33.no })[0];
var hRow33 = rowsWith(hd33, 1).filter(function (r) { return hd33.cell(r, 1).v === b33.no })[0];
it33.cell(iRow33, 4).v = NAME33;      /* ช่องรหัส = ชื่อสินค้า (อาการของจริง) */
fx33.recalc();

eq('ตั้งต้น: ช่องชื่อสินค้าขึ้นว่าไม่พบ SKU', it33.cell(iRow33, 5).v, 'ไม่พบ SKU');
eq('ตั้งต้น: ยอดขายถูกอยู่แล้ว', hd33.cell(hRow33, 10).v, 494);

console.log('\n   กดแก้รายการแล้วใส่ต้นทุน 210 ต่อขวด');
var pd33Before = rowsWith(pd33, 2).length;
var r33 = api33.editOrderItems(b33.no,
  [{ free: true, name: NAME33, qty: 2, price: 247, cost: 210 }], 'AEY', 'ck-fix-18');
eq('ยอดสินค้าไม่ขยับ ยังเป็น 494 เท่าเดิม', r33.subtotal, 494);
eq('ยอดสินค้าในชีทก็ยัง 494', hd33.cell(hRow33, 10).v, 494);
eq('ยอดสุทธิยังรวมค่าส่ง 50 เหมือนเดิม', hd33.cell(hRow33, 14).v, 544);

console.log('\n   สินค้าต้องเข้าฐานสินค้าเป็นรหัสจริง');
eq('ฐานสินค้าได้สินค้าใหม่หนึ่งตัว', rowsWith(pd33, 2).length, pd33Before + 1);
var pRow33 = rowsWith(pd33, 2).filter(function (r) { return pd33.cell(r, 4).v === NAME33 })[0];
truthy2('หารหัสของสินค้าตัวนั้นได้', !!pRow33);
eq('รหัสเป็นชุดซื้อมาขายไป', String(pd33.cell(pRow33, 2).v).slice(0, 6), 'SKU-X0');
eq('หมวดเป็นซื้อมาขายไป', pd33.cell(pRow33, 3).v, 'ซื้อมาขายไป');
eq('ต้นทุนต่อหน่วยลงเป็น 210', pd33.cell(pRow33, 7).v, 210);
eq('ราคาขายลงเป็น 247', pd33.cell(pRow33, 8).v, 247);

console.log('\n   ช่องชื่อบนใบกำกับภาษีต้องเลิกขึ้นว่าไม่พบ SKU');
var iRow33b = rowsWith(it33, 2).filter(function (r) { return it33.cell(r, 2).v === b33.no })[0];
eq('ช่องรหัสเป็นรหัสจริงแล้ว', it33.cell(iRow33b, 4).v, pd33.cell(pRow33, 2).v);
eq('ช่องชื่อขึ้นชื่อสินค้าจริง', it33.cell(iRow33b, 5).v, NAME33);

console.log('\n   ต้องลงรับเข้าคู่ไว้ ไม่งั้นสต๊อกติดลบ');
var rRow33 = rowsWith(rc33, 6).filter(function (r) { return rc33.cell(r, 3).v === b33.no })[0];
truthy2('มีแถวรับเข้าของใบนี้', !!rRow33);
eq('รับเข้าเท่าจำนวนที่ขายพอดี', rc33.cell(rRow33, 8).v, 2);
eq('ต้นทุนในแถวรับเข้าตรงกัน', rc33.cell(rRow33, 9).v, 210);

console.log('\n   กดซ่อมสองรอบต้องไม่ได้สินค้าซ้ำสองรหัส');
api33.editOrderItems(b33.no,
  [{ free: true, name: NAME33, qty: 2, price: 247, cost: 210 }], 'AEY', 'ck-fix-18b');
eq('ฐานสินค้าไม่งอกรหัสใหม่', rowsWith(pd33, 2).length, pd33Before + 1);
eq('แถวรับเข้าก็ไม่งอกเป็นสองแถว',
  rowsWith(rc33, 6).filter(function (r) { return rc33.cell(r, 3).v === b33.no }).length, 1);

console.log('\n   ต้นทุนคนละราคาถือเป็นคนละรหัส กำไรใบเก่าจะได้ไม่เปลี่ยนตาม');
api33.editOrderItems(b33.no,
  [{ free: true, name: NAME33, qty: 2, price: 247, cost: 356 }], 'AEY', 'ck-fix-18c');
eq('ได้รหัสใหม่เพราะต้นทุนไม่เท่าเดิม', rowsWith(pd33, 2).length, pd33Before + 2);

console.log('\n   ไม่มีสูตรถูกเขียนทับเลยตลอดหมวดนี้');
var over33 = [];
for (var nm33 in fx33.sheets) over33 = over33.concat(fx33.sheets[nm33].overwrittenFormulas);
eq('ไม่มีช่องสูตรถูกแตะ', over33, []);

/* ====== 34. ออเดอร์เก่ากว่า 40 ใบล่าสุด ต้องยังออกเอกสารและแก้รายการได้

   ที่ร้านคีย์วันละ 8-10 ใบ ใบที่ 41 มาถึงในไม่กี่วัน
   ถ้าตัวหาออเดอร์มองเห็นแค่ 40 ใบล่าสุด ใบเก่ากว่านั้นจะขึ้นว่า "ไม่พบออเดอร์"
   ทั้งที่อยู่ในชีทครบ — ออกใบกำกับภาษีย้อนหลังไม่ได้ ซึ่งเป็นงานที่ต้องทำได้เสมอ */
console.log('\n34. ออเดอร์เก่ากว่า 40 ใบล่าสุด');

var fx34 = FS.build();
var api34 = FS.load(fx34, {});
api34.setup();
var hd34 = fx34.sheets['ออเดอร์_หัวบิล'];

var old34 = api34.createOrder(order({
  cust: 'ลูกค้าใบเก่า', date: '2026-08-01',
  items: [{ sku: 'SKU-141', qty: 1, price: 100 }]
}));

/* ดันใบนั้นให้ตกอันดับ ด้วยหัวบิลอีก 44 ใบที่วันที่ใหม่กว่า */
var pad34 = rowsWith(hd34, 1).length;
for (var i34 = 0; i34 < 44; i34++) {
  var r34 = DATA_ROW + pad34 + i34;
  hd34.cell(r34, 1).v = 'AST-26-9' + (100 + i34);
  hd34.cell(r34, 2).v = new Date('2026-09-10T12:00:00');
  hd34.cell(r34, 4).v = 'ลูกค้าใบใหม่ ' + i34;
  hd34.cell(r34, 17).v = 'รอชำระ';
}
fx34.recalc();

eq('ในชีทมีออเดอร์ทั้งหมด 45 ใบ', rowsWith(hd34, 1).length, 45);
eq('หน้าจอยังโหลดมาแค่ 40 ใบล่าสุดตามที่ขอ', api34.getOrders(40).length, 40);
eq('ขอ 0 = เอาทั้งชีท ไม่ใช่ตกกลับไปเป็น 40', api34.getOrders(0).length, 45);

console.log('\n   ใบเก่าที่ตกอันดับไปแล้ว ต้องยังทำงานได้ทุกอย่าง');
var r34 = api34.editOrderItems(old34.no,
  [{ sku: 'SKU-141', qty: 3, price: 100 }], 'บี', 'ck-old-1');
eq('แก้รายการใบเก่าได้', r34.subtotal, 300);

var d34 = api34.issueDoc({
  type: 'rec', orderNo: old34.no, cust: { name: 'ลูกค้าใบเก่า' },
  date: '2026-08-01', by: 'บี', vatMode: 'excl', clientKey: 'dk-old-1'
});
truthy2('ออกใบเสร็จย้อนหลังให้ใบเก่าได้', !!d34.no);
/* 300 + ค่าส่ง 50 = 350 แล้วบวก VAT 7% ตามที่สั่งออกใบแบบ excl */
eq('ยอดบนใบตรงกับที่แก้ไว้', d34.doc.total, 374.5);

console.log('\n   ไม่มีสูตรถูกเขียนทับเลยตลอดหมวดนี้');
var over34 = [];
for (var nm34 in fx34.sheets) over34 = over34.concat(fx34.sheets[nm34].overwrittenFormulas);
eq('ไม่มีช่องสูตรถูกแตะ', over34, []);

/* ====== 35. แก้เนื้อใบที่ออกผิดแต่ยังไม่ได้ส่งลูกค้า — เลขใบเดิม

   ของเดิมมีทางเดียวคือยกเลิกแล้วออกใหม่ ซึ่งเผาเลขทิ้งใบหนึ่งทุกครั้งที่พิมพ์ผิด
   เล่มจริงของร้านจึงเต็มไปด้วยใบยกเลิก และเจ้าของร้านตามเลขไม่ทัน

   สิ่งที่ต้องถูกทั้งหมด: เลขไม่เปลี่ยน · วันที่ไม่ขยับ · ยอดใหม่ตรงกับออเดอร์ตอนนี้
   ภาพถ่ายของใบถูกเขียนใหม่ด้วย (ไม่งั้นพิมพ์ซ้ำจะได้ใบเก่า) และยอดเดิมต้องตามย้อนได้ */
console.log('\n35. แก้เนื้อใบที่ยังไม่ได้ส่งลูกค้า');

var DOC_NO = 2, DOC_DATE = 4, DOC_BASE = 15, DOC_VAT = 16, DOC_TOTAL = 17,
    DOC_NOTE = 19, DOC_VOID = 20, DOC_SNAP = 21;

var fx35 = FS.build();
var api35 = FS.load(fx35, {});
api35.setup();
var doc35 = fx35.sheets['เอกสาร'];

var o35 = api35.createOrder(order({
  cust: 'บริษัท ทดสอบแก้ใบ จำกัด', ship: 0, discount: 0,
  items: [{ sku: 'SKU-141', qty: 10, price: 100 }]
}));
var d35 = api35.issueDoc({
  type: 'rec', orderNo: o35.no, cust: { name: 'บริษัท ทดสอบแก้ใบ จำกัด', taxId: '0105511000011' },
  date: '2026-09-03', by: 'AEY', vatMode: 'excl', clientKey: 'dk-35-1'
});
var row35 = rowsWith(doc35, DOC_NO).filter(function (r) { return doc35.cell(r, DOC_NO).v === d35.no })[0];
eq('ออกใบแรกได้ ยอด 1,000 + VAT', doc35.cell(row35, DOC_TOTAL).v, 1070);
var date35 = doc35.cell(row35, DOC_DATE).v;

console.log('\n   แก้รายการทั้งที่ออกใบแล้ว ต้องเตือนก่อน ไม่แก้ให้เงียบ ๆ');
throws('ไม่ได้ติ๊กว่าให้แก้ใบตาม',
  function () { api35.editOrderItems(o35.no, [{ sku: 'SKU-141', qty: 10, price: 80 }], 'AEY', 'ck-35-0') },
  'ออกเอกสารไปแล้ว');
eq('ใบยังเป็นยอดเดิม ยังไม่ถูกแตะ', doc35.cell(row35, DOC_TOTAL).v, 1070);

console.log('\n   ลูกค้าขอลดราคา แก้ออเดอร์แล้วแก้ใบด้วยเลขเดิม');
api35.editOrderItems(o35.no, [{ sku: 'SKU-141', qty: 10, price: 80 }], 'AEY', 'ck-35-1',
  { reviseDocs: true });
eq('ใบถูกแก้ตามให้เลยตอนแก้ออเดอร์', doc35.cell(row35, DOC_TOTAL).v, 856);
eq('ยังเป็นใบเดียว ไม่มีใบใหม่งอก', rowsWith(doc35, DOC_NO).length, 1);
console.log('\n   กดปุ่มแก้ใบตรง ๆ ก็ได้ ใช้เลขเดิมเหมือนกัน');
var r35 = api35.reviseDoc({
  no: d35.no, why: 'ตรวจแล้วชื่อผู้เสียภาษีตกหล่น', by: 'AEY',
  cust: { name: 'บริษัท ทดสอบแก้ใบ จำกัด', taxId: '0105511000011' },
  vatMode: 'excl', clientKey: 'rk-35-1'
});
eq('ยังเป็นใบเลขเดิม', r35.no, d35.no);
eq('นับต่อเป็นครั้งที่ 2', r35.times, 2);
eq('ยอดยังเป็นยอดที่ตรงกับออเดอร์', doc35.cell(row35, DOC_TOTAL).v, 856);
eq('ฐานภาษีใหม่', doc35.cell(row35, DOC_BASE).v, 800);
eq('วันที่บนใบไม่ขยับ', doc35.cell(row35, DOC_DATE).v, date35);
eq('ไม่มีแถวใบใหม่งอกขึ้นมา', rowsWith(doc35, DOC_NO).length, 1);
truthy2('ชื่อผู้เสียภาษีที่ส่งมาใหม่ถูกเขียนลงใบ',
  String(doc35.cell(row35, 7).v) === '0105511000011');

console.log('\n   ภาพถ่ายของใบต้องถูกเขียนใหม่ ไม่งั้นพิมพ์ซ้ำได้ใบเก่า');
truthy2('ภาพถ่ายเก็บยอดใหม่', String(doc35.cell(row35, DOC_SNAP).v).indexOf('856') > -1);
var got35 = api35.getDoc(d35.no);
eq('พิมพ์ซ้ำแล้วได้ยอดใหม่', got35.doc.total, 856);
truthy2('ยังเป็นใบที่มีภาพถ่ายจริง ไม่ใช่ประกอบใหม่แบบเดา', got35.exact);

console.log('\n   ยอดเดิมต้องตามย้อนได้ ไม่ใช่หายไปกับการเขียนทับ');
var note35 = String(doc35.cell(row35, DOC_NOTE).v);
truthy2('หมายเหตุบอกว่าแก้ครั้งที่ 1', note35.indexOf('แก้ไขครั้งที่ 1') > -1);
truthy2('หมายเหตุจดยอดเดิมไว้', note35.indexOf('1070') > -1);
truthy2('หมายเหตุบอกเหตุผล', note35.indexOf('แก้รายการสินค้าในออเดอร์') > -1);
var log35 = fx35.sheets['Log'];
var lg35 = rowsWith(log35, 2).map(function (r) {
  return [log35.cell(r, 4).v, log35.cell(r, 6).v, log35.cell(r, 8).v, log35.cell(r, 9).v].join(' ');
}).filter(function (t) { return t.indexOf('แก้ไขเอกสาร') === 0 })[0] || '';
truthy2('Log จดทั้งยอดเดิมและยอดใหม่', /1070/.test(lg35) && /856/.test(lg35));

console.log('\n   แก้รอบสามต้องนับต่อ ไม่ทับร่องรอยเดิม');
api35.editOrderItems(o35.no, [{ sku: 'SKU-141', qty: 10, price: 90 }], 'AEY', 'ck-35-2',
  { reviseDocs: true });
var note35b = String(doc35.cell(row35, DOC_NOTE).v);
truthy2('ร่องรอยครั้งแรกยังอยู่', note35b.indexOf('แก้ไขครั้งที่ 1') > -1);
truthy2('และมีครั้งที่สามต่อท้าย', note35b.indexOf('แก้ไขครั้งที่ 3') > -1);
eq('ยอดตามออเดอร์ล่าสุด', doc35.cell(row35, DOC_TOTAL).v, 963);

console.log('\n   กดปุ่ม "ส่งแล้ว" เมื่อไร แก้ไม่ได้อีก');
var ms35 = api35.markSent(d35.no, 'AEY');
truthy2('บันทึกเวลาที่ส่งไว้', !!ms35.at);
eq('ช่องในชีทมีค่าแล้ว', doc35.cell(row35, 23).v, ms35.at);
throws('แก้ใบที่ส่งไปแล้ว',
  function () { api35.reviseDoc({ no: d35.no, why: 'ขอแก้อีกนิด', clientKey: 'rk-35-9' }) },
  'ส่งให้ลูกค้าแล้ว');
throws('แก้ออเดอร์แล้วให้ใบตามก็ไม่ได้',
  function () {
    api35.editOrderItems(o35.no, [{ sku: 'SKU-141', qty: 9, price: 90 }], 'AEY', 'ck-35-3',
      { reviseDocs: true });
  }, 'ส่งให้ลูกค้าแล้ว');
eq('ใบยังเป็นยอดเดิมทุกบาท', doc35.cell(row35, DOC_TOTAL).v, 963);

console.log('\n   ปลดเครื่องหมายส่งแล้วในชีท กลับมาแก้ได้เหมือนเดิม');
doc35.cell(row35, 23).v = '';
var r35c = api35.reviseDoc({ no: d35.no, why: 'ปลดแล้วแก้ต่อได้', by: 'AEY',
  vatMode: 'excl', clientKey: 'rk-35-10' });
eq('แก้ได้แล้ว นับเป็นครั้งที่ 4', r35c.times, 4);

console.log('\n   กดซ้ำเพราะเน็ตหลุด ต้องไม่แก้สองรอบ');
var dup35 = api35.reviseDoc({ no: d35.no, why: 'ปลดแล้วแก้ต่อได้', by: 'AEY',
  vatMode: 'excl', clientKey: 'rk-35-10' });
truthy2('ตอบว่าเป็นการกดซ้ำ', !!dup35.repeat);
eq('ยังนับเป็นครั้งที่ 4 อยู่',
  (String(doc35.cell(row35, DOC_NOTE).v).match(/แก้ไขครั้งที่ /g) || []).length, 4);

console.log('\n   สิ่งที่ต้องปฏิเสธ');
throws('ไม่บอกเหตุผล',
  function () { api35.reviseDoc({ no: d35.no, why: '', by: 'AEY', clientKey: 'rk-35-3' }) },
  'อย่างน้อย 5 ตัวอักษร');
throws('ใบที่ไม่มีจริง',
  function () { api35.reviseDoc({ no: 'ONIV26-99999', why: 'ยอดผิดต้องแก้', clientKey: 'rk-35-4' }) },
  'ไม่พบใบเลขที่');

console.log('\n   ใบที่ยกเลิกไปแล้วต้องแก้ไม่ได้ — ต้องออกใบใหม่แทน');
api35.voidDoc(d35.no, 'ยกเลิกเพื่อทดสอบ', 'AEY');
throws('ใบที่ยกเลิกแล้ว',
  function () { api35.reviseDoc({ no: d35.no, why: 'ขอแก้ยอดอีกที', clientKey: 'rk-35-5' }) },
  'ถูกยกเลิกไปแล้ว');

console.log('\n   ไม่มีสูตรถูกเขียนทับเลยตลอดหมวดนี้');
var over35 = [];
for (var nm35 in fx35.sheets) over35 = over35.concat(fx35.sheets[nm35].overwrittenFormulas);
eq('ไม่มีช่องสูตรถูกแตะ', over35, []);

/* ====== 36. เลขเอกสารที่หายไปจากเล่ม ต้องเติมกลับได้

   เกิดขึ้นจริงกับร้านนี้สองทาง
     ตั้งช่องยกยอดสูงกว่าเลขที่ออกไปแล้ว ระบบเลยข้ามหนึ่งเลข (ONIV26-00241)
     ลบแถวใบที่ยกเลิกทิ้งทั้งแถว แทนที่จะปล่อยไว้พร้อมเหตุผล (00248-00250)

   สิ่งที่สรรพากรถามคือ "เลขนี้ไปไหน" เลขหายเฉย ๆ ตอบไม่ได้
   ใบยกเลิกที่ยังอยู่ในเล่มพร้อมเหตุผล ตอบได้ทันที */
console.log('\n36. เติมเลขเอกสารที่หายไปกลับเข้าเล่ม');

var fx36 = FS.build();
var api36 = FS.load(fx36, {});
api36.setup();
var doc36 = fx36.sheets['เอกสาร'];

/* วางเล่มให้เหมือนของจริง: มี 231-233 แล้วข้าม 234 ไป 235-236 */
[['ONIV26-00231', 'ใบเสร็จรับเงิน'],
 ['ONIV26-00232', 'ใบเสร็จรับเงิน'],
 ['ONIV26-00233', 'ใบเสร็จรับเงิน'],
 ['ONIV26-00235', 'ใบเสร็จรับเงิน'],
 ['ONIV26-00236', 'ใบเสร็จรับเงิน']].forEach(function (d, i) {
  doc36.cell(DATA_ROW + i, 2).v = d[0];
  doc36.cell(DATA_ROW + i, 3).v = d[1];
  doc36.cell(DATA_ROW + i, 17).v = 1000;
});
fx36.recalc();

console.log('\n   ดูก่อนว่าขาดเลขอะไร โดยยังไม่เขียนอะไรลงชีท');
var before36 = rowsWith(doc36, 2).length;
var pv36 = api36.previewDocGaps();
truthy2('บอกว่าเลข 00234 หายไป', pv36.indexOf('ONIV26-00234') > -1);
eq('ยังไม่เขียนแถวใหม่เลย', rowsWith(doc36, 2).length, before36);

console.log('\n   เติมจริง');
var r36 = api36.fillDocGaps();
truthy2('รายงานว่าเติมเลขไหน', r36.indexOf('ONIV26-00234') > -1);
eq('ได้แถวเพิ่มมาหนึ่งแถว', rowsWith(doc36, 2).length, before36 + 1);

var row36 = rowsWith(doc36, 2).filter(function (r) {
  return doc36.cell(r, 2).v === 'ONIV26-00234';
})[0];
truthy2('เลขที่เติมอยู่ในเล่มแล้ว', !!row36);
eq('ชนิดเอกสารถูกชุด', doc36.cell(row36, 3).v, 'ใบเสร็จรับเงิน');
truthy2('มีเหตุผลกำกับไว้ ไม่ใช่แถวเปล่า',
  String(doc36.cell(row36, 20).v).indexOf('ไม่ได้ใช้เลขนี้') > -1);
eq('ไม่ใส่ยอดเงิน จะได้ไม่กลายเป็นยอดขายผี', doc36.cell(row36, 17).v, '');
eq('ไม่ใส่วันที่ เพราะใบนี้ไม่ได้ออกจริง', doc36.cell(row36, 4).v, '');

console.log('\n   ของเดิมต้องไม่ถูกแตะแม้แต่แถวเดียว');
eq('ใบเดิมยังอยู่ครบ', rowsWith(doc36, 2).map(function (r) { return doc36.cell(r, 2).v }).sort(),
  ['ONIV26-00231', 'ONIV26-00232', 'ONIV26-00233', 'ONIV26-00234',
   'ONIV26-00235', 'ONIV26-00236']);
eq('ยอดของใบเดิมไม่ขยับ', doc36.cell(DATA_ROW, 17).v, 1000);

console.log('\n   เลขใบถัดไปต้องไม่เปลี่ยน เพราะเลขที่เติมต่ำกว่าเลขล่าสุด');
var peek36 = api36.peekDocNos();
eq('ใบเสร็จใบถัดไปยังเป็น 00237', peek36.rec, 'ONIV26-00237');

console.log('\n   สั่งซ้ำต้องไม่เติมซ้ำ');
var again36 = api36.fillDocGaps();
truthy2('บอกว่าเรียงครบแล้ว', again36.indexOf('เรียงครบ') > -1);
eq('จำนวนแถวเท่าเดิม', rowsWith(doc36, 2).length, before36 + 1);

console.log('\n   ไม่มีสูตรถูกเขียนทับเลยตลอดหมวดนี้');
var over36 = [];
for (var nm36 in fx36.sheets) over36 = over36.concat(fx36.sheets[nm36].overwrittenFormulas);
eq('ไม่มีช่องสูตรถูกแตะ', over36, []);

console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทั้งหมด'));
process.exit(fails ? 1 : 0);
