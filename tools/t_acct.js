/*
 * ทดสอบ "ส่งบัญชี" — สถานะบัญชี · เขียนไฟล์ลงไดรฟ์ · จดในชีท
 *
 *   node tools/t_acct.js
 *
 * ข้อที่สำคัญที่สุดของชุดนี้: ถ้าเขียนไฟล์ไม่ครบ ชีทต้องไม่จดว่า "ส่งบัญชีแล้ว"
 * เพราะสถานะที่โกหกแปลว่าไม่มีใครรู้เลยว่าบัญชีไม่ได้รับของ จนกว่าจะถึงสิ้นเดือน
 */
'use strict';
var FS = require('./fakesheet');
var DATA_ROW = FS.DATA_ROW;
var HEAD_ROW = FS.HEAD_ROW;

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

/* รูป 1x1 จุด ใช้แทนภาพใบที่หน้าจอวาดมา — ข้อสอบสนใจเส้นทางของไฟล์ ไม่ใช่เนื้อรูป */
var PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function start(opts) {
  var fx = FS.build();
  var ctx = FS.load(fx, opts || {});
  ctx.setup();
  var no = ctx.createOrder({
    clientKey: 'acct-' + Math.random(),
    date: '2026-09-07', channel: 'เพจ Facebook', cust: 'คุณทดสอบ บัญชี',
    tel: '0812345678', addr: '1/2 ถ.ทดสอบ', carrier: 'Flash Express',
    vat: true, discount: 0, ship: 50, status: 'ส่งแล้ว',
    items: [{ sku: 'SKU-141', qty: 2, price: 129 }]
  }).no;
  return { fx: fx, ctx: ctx, no: no, head: fx.sheets['ออเดอร์_หัวบิล'] };
}

/* ============================================ 1. ติดตั้งคอลัมน์สถานะบัญชี */
console.log('\n1. setup() เพิ่มคอลัมน์ V W X ให้ชีทหัวบิล');
var s1 = start();
eq('หัวคอลัมน์ V', s1.head.cell(HEAD_ROW, 22).v, 'สถานะบัญชี');
eq('หัวคอลัมน์ W', s1.head.cell(HEAD_ROW, 23).v, 'วันที่ส่งบัญชี');
eq('หัวคอลัมน์ X', s1.head.cell(HEAD_ROW, 24).v, 'ส่งบัญชีอะไรไปบ้าง');
eq('เติมตัวเลือกสถานะบัญชีในชีท ตั้งค่า',
  [DATA_ROW + 1, DATA_ROW + 5].map(function (r) { return s1.fx.sheets['ตั้งค่า'].cell(r, 9).v; }),
  ['ยังไม่ส่งบัญชี', 'บัญชีตีกลับ']);
eq('รายการสถานะบัญชีอ่านกลับมาได้ครบ', s1.ctx.cfgLists_().acct,
  ['ยังไม่ส่งบัญชี', 'รอเอกสาร', 'พร้อมส่งบัญชี', 'ส่งบัญชีแล้ว', 'บัญชีตีกลับ']);

console.log('\n   สั่ง setup ซ้ำต้องไม่พังและไม่เขียนทับ');
var againMsg = null;
try { s1.ctx.setup(); } catch (e) { againMsg = e.message; }
eq('สั่งซ้ำได้', againMsg, null);
eq('หัวคอลัมน์ยังเหมือนเดิม', s1.head.cell(HEAD_ROW, 22).v, 'สถานะบัญชี');

console.log('\n   คอลัมน์ V มีของอื่นอยู่ก่อน ต้องหยุด ไม่ทับ');
var s1b = FS.build();
var c1b = FS.load(s1b, {});
s1b.sheets['ออเดอร์_หัวบิล'].cell(HEAD_ROW, 22).v = 'ของเจ้าของร้านเอง';
throws('หยุดแล้วบอกว่าเจออะไรอยู่', function () { c1b.setup(); }, 'ไม่เขียนทับของเดิม');

/* ================================================ 2. อ่านสถานะบัญชีกลับมา */
console.log('\n2. หน้าออเดอร์ต้องเห็นสถานะบัญชี');
var s2 = start();
var ord2 = s2.ctx.getOrders(40).filter(function (o) { return o.no === s2.no; })[0];
truthy('มีช่อง acct ติดมากับออเดอร์', Object.prototype.hasOwnProperty.call(ord2, 'acct'));
eq('ใบใหม่ยังไม่มีสถานะบัญชี (ว่าง)', ord2.acct, '');
eq('ยังไม่มีวันที่ส่งบัญชี', [ord2.acctAt, ord2.acctWhat], ['', '']);

console.log('\n   ชีทที่ยังไม่ได้สั่ง setup (มีแค่ 21 คอลัมน์) ต้องไม่ล้ม');
var fx2b = FS.build();
var c2b = FS.load(fx2b, {});
var no2b = c2b.createOrder({
  clientKey: 'k2b', date: '2026-09-07', channel: 'หน้าร้าน', cust: 'ก',
  carrier: 'Flash Express', vat: false, ship: 0, status: 'รอชำระ',
  items: [{ sku: 'SKU-141', qty: 1, price: 100 }]
}).no;
eq('ยังอ่านออเดอร์ได้ตามปกติ',
  c2b.getOrders(40).filter(function (o) { return o.no === no2b; })[0].acct, '');

/* ==================================================== 3. เปลี่ยนสถานะเฉย ๆ */
console.log('\n3. เปลี่ยนสถานะบัญชีอย่างเดียว (รอเอกสาร / บัญชีตีกลับ)');
var s3 = start();
var r3 = s3.ctx.setAcctStatus(s3.no, 'รอเอกสาร', 'ยังไม่ได้เลขผู้เสียภาษีของลูกค้า');
eq('คืนสถานะที่ตั้งให้', r3.acct, 'รอเอกสาร');
eq('ลงในชีทช่อง V จริง',
  s3.head.cell(s3.ctx.findOrderRow_(s3.no).row, 22).v, 'รอเอกสาร');
eq('หน้าออเดอร์เห็นค่าใหม่',
  s3.ctx.getOrders(40).filter(function (o) { return o.no === s3.no; })[0].acct, 'รอเอกสาร');
truthy('ลง Log ไว้ด้วย', (function () {
  var log = s3.fx.sheets['Log'];
  for (var r = DATA_ROW; r <= log.getMaxRows(); r++) {
    if (String(log.cell(r, 4).v || '').indexOf('แก้สถานะบัญชี') > -1) return true;
  }
  return false;
})());
throws('สถานะที่ไม่มีในรายการ ไม่ยอมรับ',
  function () { s3.ctx.setAcctStatus(s3.no, 'ส่งไปแล้วมั้ง'); }, 'ไม่มีในตัวเลือก');
throws('ใบที่ไม่มีอยู่จริง บอกตรง ๆ',
  function () { s3.ctx.setAcctStatus('AST-26-9999', 'รอเอกสาร'); }, 'ไม่พบออเดอร์');

/* ================================================= 4. ของที่ส่งบัญชีได้ */
console.log('\n4. acctPack — บอกว่าใบนี้มีอะไรให้ส่งบ้าง');
var s4 = start();
var pack4 = s4.ctx.acctPack(s4.no);
eq('ยังไม่ได้ออกเอกสาร จึงยังไม่มีใบให้ส่ง', pack4.docs.length, 0);
eq('บอกช่องทางขายกับยอดสุทธิมาด้วย', [pack4.channel, pack4.net > 0], ['เพจ Facebook', true]);

var doc4 = s4.ctx.issueDoc({
  clientKey: 'd4', type: 'rec', orderNo: s4.no, date: '2026-09-07',
  cust: { name: 'บริษัท ทดสอบ จำกัด', taxId: '0105558055790', branch: 'สำนักงานใหญ่',
          addr: '1 ถ.ทดสอบ', tel: '021234567', email: 'a@b.c' }
});
var pack4b = s4.ctx.acctPack(s4.no);
eq('ออกใบแล้วเห็นในรายการ', pack4b.docs.map(function (d) { return d.no; }), [doc4.no]);

s4.ctx.voidDoc(doc4.no, 'ออกผิดใบ', 'แอดมิน');
/* ของเดิมกรองใบที่ยกเลิกทิ้ง ด้วยเหตุผลที่ฟังดูเข้าท่าว่าส่งไปแล้วต้องตามถอนออก
   ซึ่งผิด — เล่มใบกำกับภาษีต้องมีเลขครบทุกเลขเรียงต่อกันไม่ขาด ใบที่ยกเลิก
   ลงรายงานภาษีขายเป็นยอด 0 พร้อมหมายเหตุ ไม่ใช่หายไปจากเล่ม
   เดือนไหนมีใบยกเลิก เล่มที่ส่งบัญชีจะขาดเลขทันที แล้วรู้ตัวตอนยื่นภาษี
   (เจ้าของร้านถามเองเมื่อ 15 ก.ย. 69 ว่าใบที่ยกเลิกจะส่งบัญชียังไง
   คำตอบตอนนั้นคือ "ส่งไม่ได้" ซึ่งเป็นปัญหาจริงที่ระบบสร้างขึ้นมาเอง) */
var pack4c = s4.ctx.acctPack(s4.no);
eq('ใบที่ยกเลิกยังอยู่ในรายการให้เลือกส่ง', pack4c.docs.map(function (d) { return d.no; }),
  [doc4.no]);
truthy('และติดป้ายมาด้วยว่ายกเลิกเพราะอะไร',
  String(pack4c.docs[0].voidWhy || '').indexOf('ออกผิดใบ') > -1);

/* ==================================================== 5. ส่งบัญชีสำเร็จ */
console.log('\n5. ส่งบัญชี — ไฟล์ลงไดรฟ์ แล้วชีทจดว่าส่งอะไรไปเมื่อไร');
var s5 = start();
var doc5 = s5.ctx.issueDoc({
  clientKey: 'd5', type: 'rec', orderNo: s5.no, date: '2026-09-07',
  cust: { name: 'บริษัท ทดสอบ จำกัด', taxId: '0105558055790', branch: 'สำนักงานใหญ่',
          addr: '1 ถ.ทดสอบ', tel: '021234567', email: 'a@b.c' }
});
var res5 = s5.ctx.sendToAccounting({
  clientKey: 'ak5', no: s5.no, date: '2026-09-07', by: 'แอดมิน',
  files: [{ name: doc5.no, data: PNG1 }],
  extras: ['order', 'cust']
});
truthy('บอกลิงก์โฟลเดอร์กลับมา', /drive\.google\.com/.test(res5.folderUrl));
eq('เขียนสองไฟล์: ใบกับใบสรุป', res5.sent.length, 2);
eq('ไฟล์ลงไดรฟ์จริงสองไฟล์', s5.ctx.__drive.live().length, 2);
eq('ชื่อไฟล์ที่จดไว้ในชีทตรงกับที่ส่ง', res5.sent, [doc5.no, 'สรุป-' + s5.no + '.txt']);
var row5 = s5.ctx.findOrderRow_(s5.no).row;
eq('สถานะบัญชีกลายเป็นส่งแล้ว', s5.head.cell(row5, 22).v, 'ส่งบัญชีแล้ว');
truthy('ลงวันเวลาที่ส่ง', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(s5.head.cell(row5, 23).v)));
truthy('จดว่าส่งอะไรไปบ้าง',
  String(s5.head.cell(row5, 24).v).indexOf(doc5.no) > -1);
eq('หน้าออเดอร์เห็นสถานะใหม่',
  s5.ctx.getOrders(40).filter(function (o) { return o.no === s5.no; })[0].acct, 'ส่งบัญชีแล้ว');

console.log('\n   ใบสรุปต้องมีเลขผู้เสียภาษีและช่องทางขายอยู่จริง');
var txt5 = s5.ctx.__drive.live().filter(function (f) {
  return /^สรุป-/.test(f.getName());
})[0].getBlob().getDataAsString();
truthy('มีเลขผู้เสียภาษี', txt5.indexOf('0105558055790') > -1);
truthy('มีช่องทางขาย', txt5.indexOf('เพจ Facebook') > -1);
truthy('มีเลขออเดอร์', txt5.indexOf(s5.no) > -1);
truthy('บอกว่าการชำระเงินดูจากรายการเดินบัญชี',
  txt5.indexOf('รายการเดินบัญชี') > -1);

console.log('\n   ใบสรุปต้องกำกับไว้ว่าใบไหนยกเลิก ไม่ใช่ลงเป็นบรรทัดเหมือนใบปกติ');
/* บัญชีเปิดไฟล์ปะหน้าไฟล์เดียวแล้วต้องรู้ทันทีว่าเลขไหนใช้ได้ เลขไหนยกเลิก
   ไม่ใช่ต้องเปิดไฟล์ทีละใบดูว่ามีตราประทับทับอยู่หรือเปล่า */
var s5v = start();
var d5a = s5v.ctx.issueDoc({ clientKey: 'd5a', type: 'rec', orderNo: s5v.no,
  date: '2026-09-07', cust: { name: 'บริษัท ทดสอบ จำกัด' } });
s5v.ctx.voidDoc(d5a.no, 'ลูกค้าไม่รับของ', 'แอดมิน');
s5v.ctx.sendToAccounting({
  clientKey: 'ak5v', no: s5v.no, date: '2026-09-07', by: 'แอดมิน',
  files: [{ name: d5a.no, data: PNG1 }], extras: ['order']
});
var txt5v = s5v.ctx.__drive.live().filter(function (f) {
  return /^สรุป-/.test(f.getName());
})[0].getBlob().getDataAsString();
truthy('เลขใบที่ยกเลิกยังอยู่ในใบสรุป ไม่หายไปจากเล่ม', txt5v.indexOf(d5a.no) > -1);
truthy('และเขียนกำกับว่ายกเลิก', txt5v.indexOf('ยกเลิก') > -1);
truthy('บอกเหตุผลที่ยกเลิกด้วย', txt5v.indexOf('ลูกค้าไม่รับของ') > -1);
truthy('สรุปท้ายบอกจำนวนใบที่ยกเลิก',
  txt5v.indexOf('มีใบที่ยกเลิก 1 ใบ') > -1);
truthy('และย้ำว่าเลขไม่ถูกเอากลับมาใช้ซ้ำ',
  txt5v.indexOf('ไม่ถูกนำกลับมาใช้ซ้ำ') > -1);

console.log('\n   กดส่งซ้ำด้วยกุญแจเดิม ต้องไม่ได้ไฟล์ชุดที่สอง');
var before5 = s5.ctx.__drive.live().length;
var again5 = s5.ctx.sendToAccounting({
  clientKey: 'ak5', no: s5.no, date: '2026-09-07',
  files: [{ name: doc5.no, data: PNG1 }], extras: ['order']
});
truthy('บอกว่าเป็นการกดซ้ำ', again5.duplicate);
eq('ไม่มีไฟล์เพิ่ม', s5.ctx.__drive.live().length, before5);

/* ============================================ 6. เขียนไฟล์ล้มกลางทาง */
console.log('\n6. ไดรฟ์ล้มกลางทาง — ห้ามจดในชีทว่าส่งแล้ว');
var s6 = start({ driveFail: 1 });
var doc6 = s6.ctx.issueDoc({
  clientKey: 'd6', type: 'rec', orderNo: s6.no, date: '2026-09-07',
  cust: { name: 'ก', taxId: '', branch: '', addr: '', tel: '', email: '' }
});
throws('บอกว่าไม่ได้เขียนอะไรลงชีท', function () {
  s6.ctx.sendToAccounting({
    clientKey: 'ak6', no: s6.no, date: '2026-09-07',
    files: [{ name: doc6.no, data: PNG1 }, { name: doc6.no + '-copy', data: PNG1 }],
    extras: ['order']
  });
}, 'ไม่ได้เขียนอะไรลงชีท');
var row6 = s6.ctx.findOrderRow_(s6.no).row;
eq('สถานะบัญชียังว่างอยู่', s6.head.cell(row6, 22).v, '');
eq('ไม่มีวันที่ส่ง', s6.head.cell(row6, 23).v, '');
eq('ไฟล์ที่เขียนไปแล้วถูกเก็บกวาด ไม่ทิ้งของครึ่ง ๆ ไว้', s6.ctx.__drive.live().length, 0);

/* ================================== 7. แปลงเป็น PDF ไม่ได้ ต้องยังส่งได้ */
console.log('\n7. ตัวแปลง PDF ของ Google ใช้ไม่ได้ — ต้องลงเป็นรูปแทน ไม่ใช่ล้มทั้งการส่ง');
var s7 = start({ noPdf: true });
var res7 = s7.ctx.sendToAccounting({
  clientKey: 'ak7', no: s7.no, date: '2026-09-07',
  files: [{ name: 'ใบทดสอบ', data: PNG1 }], extras: []
});
truthy('ส่งสำเร็จ', res7.ok);
eq('บอกตรง ๆ ว่าที่ลงไปเป็นรูป ไม่ใช่ PDF', res7.kinds, ['image']);
eq('ไฟล์ยังลงไดรฟ์', s7.ctx.__drive.live().length, 1);
eq('ชื่อไฟล์ยังเป็นรูป',
  /\.png$/.test(s7.ctx.__drive.live()[0].getName()), true);

/* ========================================== 8. เรื่องที่ต้องไม่ยอมให้ทำ */
console.log('\n8. เรื่องที่ต้องไม่ยอมให้ทำ');
var s8 = start();
throws('ไม่ได้เลือกอะไรเลย', function () {
  s8.ctx.sendToAccounting({ clientKey: 'ak8', no: s8.no, files: [], extras: [] });
}, 'ยังไม่ได้เลือก');
throws('ไม่มี clientKey = กันส่งซ้ำไม่ได้ ไม่ส่งให้', function () {
  s8.ctx.sendToAccounting({ no: s8.no, files: [{ name: 'ก', data: PNG1 }] });
}, 'clientKey');
throws('ใบที่ไม่มีอยู่จริง', function () {
  s8.ctx.sendToAccounting({
    clientKey: 'ak8b', no: 'AST-26-9999', files: [{ name: 'ก', data: PNG1 }]
  });
}, 'ไม่พบออเดอร์');
throws('รูปที่ส่งมาไม่ครบ', function () {
  s8.ctx.sendToAccounting({
    clientKey: 'ak8c', no: s8.no, files: [{ name: 'ก', data: 'ไม่ใช่รูป' }]
  });
}, 'ส่งมาไม่ครบ');
eq('ทั้งหมดข้างบนไม่มีอะไรลงไดรฟ์เลย', s8.ctx.__drive.live().length, 0);
eq('และไม่มีอะไรลงชีท', s8.head.cell(s8.ctx.findOrderRow_(s8.no).row, 22).v, '');

/* ====================================== 9. ไม่แตะช่องสูตรของชีทเลยสักช่อง */
console.log('\n9. ตลอดทั้งชุดนี้ ห้ามมีช่องสูตรถูกเขียนทับ');
var s9 = start();
var doc9 = s9.ctx.issueDoc({
  clientKey: 'd9', type: 'rec', orderNo: s9.no, date: '2026-09-07',
  cust: { name: 'ก', taxId: '', branch: '', addr: '', tel: '', email: '' }
});
s9.ctx.setAcctStatus(s9.no, 'พร้อมส่งบัญชี');
s9.ctx.sendToAccounting({
  clientKey: 'ak9', no: s9.no, date: '2026-09-07',
  files: [{ name: doc9.no, data: PNG1 }], extras: ['order', 'cust']
});
var touched = [];
for (var nm in s9.fx.sheets) {
  var sh = s9.fx.sheets[nm];
  (sh.overwrittenFormulas || []).forEach(function (x) { touched.push(nm + ' ' + x); });
}
eq('ไม่มีช่องสูตรถูกแตะ', touched, []);

/* ---------- ออกใบซ้ำ: ข้อความต้องชี้ปุ่มที่กดได้ ไม่ใช่ไล่ไปแก้ในชีท ---------- */
console.log('\nออกใบซ้ำ — ข้อความต้องบอกทางที่กดได้จริง');
var sDup = start();
sDup.ctx.issueDoc({
  clientKey: 'dup-1', type: 'rec', orderNo: sDup.no, date: '2026-09-07',
  cust: { name: 'บริษัท ทดสอบ จำกัด', taxId: '0105558055790', branch: 'สำนักงานใหญ่',
          addr: '1 ถ.ทดสอบ', tel: '021234567', email: 'a@b.c' }
});
var msgDup = '';
try {
  sDup.ctx.issueDoc({
    clientKey: 'dup-2', type: 'rec', orderNo: sDup.no, date: '2026-09-07',
    cust: { name: 'บริษัท ทดสอบ จำกัด', taxId: '0105558055790', branch: 'สำนักงานใหญ่',
            addr: '1 ถ.ทดสอบ', tel: '021234567', email: 'a@b.c' }
  });
} catch (eDup) { msgDup = eDup.message; }

truthy('ออกใบซ้ำไม่ได้ และบอกเลขใบเดิม', /ไปแล้วเป็นใบ/.test(msgDup));
truthy('บอกทางที่หนึ่ง — แก้ไขใบ ใช้เลขเดิม', /แก้ไขใบ/.test(msgDup));
truthy('บอกทางที่สอง — ยกเลิกแล้วออกใหม่', /ยกเลิก/.test(msgDup));
truthy('ชี้ไปที่รายการในหน้าจอ ไม่ใช่ไล่ให้ไปเปิดชีท',
   /เอกสารที่ออกไปแล้ว/.test(msgDup));
truthy('ไม่บอกให้ไปแก้ในชีทอีกแล้ว', !/ในชีท เอกสาร/.test(msgDup));

/* ============================ 8. เลขในเล่มที่ไม่มีออเดอร์ ก็ต้องส่งบัญชีได้

   ของจริง: fillDocGaps() เติม ONIV26-00248/249/250 กลับเข้าเล่มเพื่อให้เลขเรียงครบ
   แถวพวกนี้มีแค่เลขใบ ชนิด และเหตุผล ไม่มีออเดอร์ผูกอยู่
   แต่ปุ่มส่งบัญชีผูกกับ "เลขออเดอร์" เสมอ เลขพวกนี้จึงส่งไม่ได้เลยสักเลข
   แล้วเล่มที่ส่งให้บัญชีขาดเลข ซึ่งเป็นปัญหาตอนยื่นภาษี ไม่ใช่แค่ความไม่เรียบร้อย
   (เจ้าของร้านแจ้งเอง 1 ต.ค. 69: "ส่งบัญชีไม่ได้ เลขขาด")                      */
console.log('\n8. เลขที่เติมกลับเข้าเล่ม (ไม่มีออเดอร์) ต้องส่งบัญชีได้');
var s8 = start();
var D8 = s8.fx.sheets['เอกสาร'];
var IN8 = s8.ctx.SH.doc.IN;
/* เลียนแบบสิ่งที่ fillDocGaps เขียน: เลข ชนิด และเหตุผล เท่านั้น */
var row8 = s8.ctx.nextRow_('doc', IN8.no);
s8.ctx.writeRow_('doc', row8, {
  no: 'ONIV26-00248', type: 'ใบเสร็จรับเงิน',
  voidWhy: 'ไม่ได้ใช้เลขนี้ — เติมกลับเข้าเล่มให้เลขครบ'
});

console.log('\n   เปิดกล่องส่งบัญชีด้วยเลขใบได้ ไม่ต้องมีออเดอร์');
var pack8 = s8.ctx.acctPack('ONIV26-00248');
eq('บอกว่าเป็นใบที่ไม่มีออเดอร์', pack8.docOnly, true);
eq('มีใบเดียวให้ส่ง คือตัวมันเอง', pack8.docs.map(function (d) { return d.no }),
   ['ONIV26-00248']);
eq('ยังไม่เคยส่งบัญชี', pack8.acct, 'ยังไม่ส่งบัญชี');
truthy('ติดป้ายมาด้วยว่าเลขนี้ไม่ได้ใช้',
   String(pack8.docs[0].voidWhy || '').indexOf('ไม่ได้ใช้เลขนี้') > -1);

console.log('\n   กดส่งแล้วไฟล์ต้องลงไดรฟ์จริง และชีทต้องจดไว้');
var out8 = s8.ctx.sendToAccounting({
  clientKey: 'ak8', no: 'ONIV26-00248', date: '2026-09-03', by: 'แอดมิน',
  files: [{ name: 'ONIV26-00248', data: PNG1 }]
});
eq('ส่งผ่าน', out8.ok, true);
eq('บอกว่าเป็นใบที่ไม่มีออเดอร์', out8.docOnly, true);
eq('ไฟล์ลงไดรฟ์จริง', s8.ctx.__drive.live().length, 1);
truthy('ลงวันเวลาไว้บนแถวเอกสาร ไม่ใช่แถวออเดอร์',
   /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(D8.cell(row8, IN8.acctAt).v)));

console.log('\n   เปิดดูอีกที ต้องรู้ว่าส่งไปแล้ว');
eq('สถานะเปลี่ยนเป็นส่งบัญชีแล้ว', s8.ctx.acctPack('ONIV26-00248').acct, 'ส่งบัญชีแล้ว');
/* หน้าจอต้องเห็นด้วย ไม่งั้นไม่มีทางรู้ว่าเลขไหนยังค้าง */
var seen8 = s8.ctx.findDocs('ONIV26-00248').rows.filter(function (d) {
  return d.no === 'ONIV26-00248';
})[0];
truthy('รายการในแฟ้มเอกสารบอกวันที่ส่งบัญชีด้วย', !!(seen8 && seen8.acctAt), seen8);
eq('และยังไม่มีเลขออเดอร์ผูกอยู่ (หน้าจอใช้ตัวนี้ตัดสินว่าจะโชว์ปุ่มไหม)',
   String(seen8.orderNo || ''), '');

console.log('\n   เลขที่ไม่มีทั้งออเดอร์และเอกสาร ต้องบอกตรง ๆ');
throws('เลขมั่วต้องไม่ผ่าน', function () {
  s8.ctx.acctPack('ONIV26-99999');
}, 'ไม่พบออเดอร์หรือเอกสาร');

console.log('\n   ใบที่มีออเดอร์ ยังจดบนแถวออเดอร์เหมือนเดิม ไม่เปลี่ยนพฤติกรรม');
eq('ไม่ได้ไปแตะช่องส่งบัญชีของแถวเอกสารที่มีออเดอร์',
   String(D8.cell(s8.ctx.docRow_(s8.ctx.issueDoc({
     clientKey: 'd8b', type: 'rec', orderNo: s8.no, date: '2026-09-07',
     cust: { name: 'บริษัท ทดสอบ จำกัด' }
   }).no), IN8.acctAt).v || ''), '');

console.log('\n   และต้องพิมพ์ซ้ำได้ด้วย — หน้าจอต้องวาดรูปใบก่อนถึงจะส่งไฟล์ให้บัญชีได้');
/* ของเดิม getDoc โยน error ใส่แถวแบบนี้ ("ออกก่อนที่ระบบจะเก็บรายการในใบ")
   ปุ่มส่งบัญชีที่เพิ่งทำจึงใช้ไม่ได้กับเลขที่มันถูกทำขึ้นมาเพื่อแก้พอดี */
var rp8 = s8.ctx.getDoc('ONIV26-00248');
eq('พิมพ์ซ้ำได้ ไม่โยน error', rp8.ok, true);
eq('บอกว่าเป็นเลขที่ไม่ได้ออกใบจริง', rp8.voidOnly, true);
eq('ไม่มีรายการสินค้าสักบรรทัด', rp8.doc.lines.length, 0);
eq('ยอดเป็นศูนย์ ไม่ใช่ยอดขายผี', rp8.doc.total, 0);
eq('ภาษีเป็นศูนย์', rp8.doc.vat, 0);
eq('ก่อนภาษีเป็นศูนย์', rp8.doc.base, 0);
eq('ชนิดใบตรงกับที่เติมกลับเข้าเล่มไว้', rp8.meta.type, 'ใบเสร็จรับเงิน');
eq('เลขที่บนใบคือเลขเดิม', rp8.meta.no, 'ONIV26-00248');
truthy('เหตุผลติดมาด้วย — หน้าจอเอาไปปั๊มตรา ยกเลิก/CANCELLED ทับทั้งใบ',
   String(rp8.meta.voidWhy || '').indexOf('ไม่ได้ใช้เลขนี้') > -1);
eq('ไม่ขึ้นคำเตือนว่าประกอบใหม่จากออเดอร์ เพราะไม่มีออเดอร์ให้ประกอบ',
   rp8.exact, true);

console.log('\n   แต่ใบที่เคยออกจริงแล้วข้อมูลหาย ยังต้องฟ้องเหมือนเดิม');
/* ไม่มีภาพถ่าย ไม่มีออเดอร์ แต่มียอดและไม่มีเหตุผลยกเลิก = ข้อมูลหาย ไม่ใช่เลขที่ไม่ได้ใช้
   พิมพ์ใบเปล่ายอด 0 แทนใบที่ลูกค้าถืออยู่จริง คือการออกใบที่ยอดไม่ตรงกับของจริง */
var rowC = s8.ctx.nextRow_('doc', IN8.no);
s8.ctx.writeRow_('doc', rowC, { no: 'ONIV26-00251', type: 'ใบเสร็จรับเงิน',
                                date: '2026-09-02', total: 1070 });
throws('ห้ามเอาใบเปล่าไปแทนใบที่เคยออกจริง', function () {
  s8.ctx.getDoc('ONIV26-00251');
}, 'ออกก่อนที่ระบบจะเก็บรายการในใบ');

console.log('\n   ชีทที่ยังไม่ได้สั่ง setup หลังอัปเดต ต้องไม่พังทั้งหน้า');
/* คอลัมน์ "ส่งบัญชีแล้วเมื่อ" เพิ่งเพิ่มเข้ามา ชีทของจริงยังกว้างเท่าเดิมจนกว่าจะสั่ง setup
   ถ้าโค้ดอ่านเลยขอบชีท แฟ้มเอกสารจะเปิดไม่ขึ้นทั้งหน้าเพราะคอลัมน์เดียวที่ยังไม่มี
   ซึ่งแย่กว่าการไม่มีข้อมูลช่องนั้นมาก */
var s9 = start();
var D9 = s9.fx.sheets['เอกสาร'];
var IN9 = s9.ctx.SH.doc.IN;
s9.ctx.issueDoc({ clientKey: 'd9', type: 'rec', orderNo: s9.no, date: '2026-09-07',
                  cust: { name: 'บริษัท ทดสอบ จำกัด' } });
/* หดชีทกลับไปเท่าเดิมก่อนมีคอลัมน์ใหม่ */
D9.__cols = IN9.acctAt - 1;
D9.getMaxColumns = function () { return IN9.acctAt - 1 };

truthy('แฟ้มเอกสารยังเปิดได้ ไม่โยน error เรื่องขอบชีท',
   s9.ctx.findDocs('').rows.length > 0);
truthy('รายการเอกสารของออเดอร์ก็ยังอ่านได้', s9.ctx.listDocs(s9.no).length > 0);
eq('ช่องที่ยังไม่มี อ่านได้เป็นค่าว่าง ไม่ใช่พัง',
   String(s9.ctx.findDocs('').rows[0].acctAt || ''), '');

console.log('\n   แต่ถ้าจะส่งบัญชีใบที่ไม่มีออเดอร์ ต้องบอกให้ไปสั่ง setup ก่อน');
var rowB = s9.ctx.nextRow_('doc', IN9.no);
s9.ctx.writeRow_('doc', rowB, { no: 'ONIV26-00249', type: 'ใบเสร็จรับเงิน',
                                voidWhy: 'ไม่ได้ใช้เลขนี้' });
throws('บอกทางแก้ที่กดได้จริง ไม่ใช่ error เรื่องขอบชีท', function () {
  s9.ctx.sendToAccounting({ clientKey: 'ak9', no: 'ONIV26-00249', date: '2026-09-03',
                            by: 'แอดมิน', files: [{ name: 'ONIV26-00249', data: PNG1 }] });
}, 'สั่งฟังก์ชัน setup');

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
