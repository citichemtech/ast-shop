/*
 * ทดสอบตรรกะ FEFO ด้วย node — ดึงฟังก์ชันจริงจาก apps-script/Fefo.gs มารัน
 * ไม่ต้องยิงขึ้น Google ไม่ต้องมีเน็ต
 *
 *   node tools/t_fefo_unit.js
 */
var path = require('path');
var F = require(path.join(__dirname, '..', 'apps-script', 'Fefo.gs'));

var fails = 0;
function eq(label, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label +
    '  ได้ ' + JSON.stringify(got) + (ok ? '' : '  ควรได้ ' + JSON.stringify(want)));
}

function d(s) { return new Date(s + 'T00:00:00').getTime(); }
function names(r) { return r.picks.map(function (p) { return p.lotNo + 'x' + p.take; }); }

/* ---------- 1. หมดอายุก่อน ตัดก่อน ---------- */
console.log('\n1. หมดอายุก่อน ตัดก่อน');
var lots1 = [
  { row: 6, lotNo: 'L-2703', exp: d('2027-03-31'), recv: d('2026-01-10'), remain: 50 },
  { row: 7, lotNo: 'L-2610', exp: d('2026-10-31'), recv: d('2026-02-20'), remain: 50 }
];
eq('ขาย 1 ชิ้น ต้องตัดล็อตที่หมดอายุ 10/2026', names(F.fefoPick(lots1, 1)), ['L-2610x1']);
eq('ขาย 60 ชิ้น ต้องตัด 10/2026 หมดก่อนแล้วค่อยไป 03/2027',
  names(F.fefoPick(lots1, 60)), ['L-2610x50', 'L-2703x10']);

/* ---------- 2. ล็อตที่ไม่ระบุวันหมดอายุไว้ท้ายสุด ---------- */
console.log('\n2. ล็อตไม่ระบุวันหมดอายุ');
var lots2 = [
  { row: 6, lotNo: 'ไม่ระบุ', exp: null, recv: d('2020-01-01'), remain: 100 },
  { row: 7, lotNo: 'L-2712', exp: d('2027-12-31'), recv: d('2026-08-01'), remain: 5 }
];
eq('ถึงจะรับเข้ามาก่อนตั้งนาน ก็ต้องปล่อยของที่รู้วันหมดอายุออกก่อน',
  names(F.fefoPick(lots2, 6)), ['L-2712x5', 'ไม่ระบุx1']);

/* ---------- 3. หมดอายุวันเดียวกัน ดูวันรับเข้า ---------- */
console.log('\n3. หมดอายุวันเดียวกัน');
var lots3 = [
  { row: 6, lotNo: 'ใหม่', exp: d('2027-01-01'), recv: d('2026-06-01'), remain: 10 },
  { row: 7, lotNo: 'เก่า', exp: d('2027-01-01'), recv: d('2026-01-01'), remain: 10 }
];
eq('ของเก่าออกก่อน', names(F.fefoPick(lots3, 3)), ['เก่าx3']);

/* ---------- 4. เท่ากันทุกอย่าง ต้องได้ผลเดิมทุกครั้ง ---------- */
console.log('\n4. ผลลัพธ์ต้องไม่สุ่ม');
var lots4 = [
  { row: 9, lotNo: 'B', exp: null, recv: null, remain: 5 },
  { row: 6, lotNo: 'A', exp: null, recv: null, remain: 5 }
];
eq('เรียงตามลำดับแถวในชีท', names(F.fefoPick(lots4, 7)), ['Ax5', 'Bx2']);

/* ---------- 5. ของไม่พอ ต้องไม่ตัด ---------- */
console.log('\n5. ล็อตมีของไม่พอ');
var r5 = F.fefoPick(lots1, 500);
eq('ตอบว่าไม่ผ่าน', r5.ok, false);
eq('บอกเหตุผล', r5.reason, 'short');
eq('บอกว่ามีจริงเท่าไร', r5.have, 100);
eq('ไม่ตัดอะไรเลย ไม่ตัดครึ่ง ๆ', r5.picks, []);

/* ---------- 6. สินค้าที่ไม่ได้คุมล็อต ---------- */
console.log('\n6. สินค้าที่ไม่มีล็อตเลย');
var r6 = F.fefoPick([], 10);
eq('ผ่าน (ไม่ได้คุมล็อต)', r6.ok, true);
eq('บอกว่าไม่ได้คุมล็อต', r6.tracked, false);
eq('ไม่มีล็อตให้ตัด', r6.picks, []);

/* ---------- 7. ล็อตที่ของหมดแล้ว ต้องข้าม ---------- */
console.log('\n7. ล็อตที่หมดแล้ว');
var lots7 = [
  { row: 6, lotNo: 'หมดแล้ว', exp: d('2026-09-01'), recv: d('2026-01-01'), remain: 0 },
  { row: 7, lotNo: 'ยังมี', exp: d('2027-01-01'), recv: d('2026-01-01'), remain: 4 }
];
eq('ข้ามล็อตที่เหลือ 0 ไม่เอามาคิด', names(F.fefoPick(lots7, 4)), ['ยังมีx4']);
var r7b = F.fefoPick(lots7, 5);
eq('ของไม่พอ นับเฉพาะล็อตที่ยังมีของ', [r7b.ok, r7b.have], [false, 4]);

/* ---------- 8. จำนวนที่ขอไม่ถูกต้อง ---------- */
console.log('\n8. จำนวนไม่ถูกต้อง');
eq('ขอ 0', F.fefoPick(lots1, 0).ok, false);
eq('ขอติดลบ', F.fefoPick(lots1, -3).ok, false);

/* ---------- 9. ล็อตหมดอายุแล้ว ต้องเตือน ---------- */
console.log('\n9. ตรวจจับล็อตที่หมดอายุแล้ว');
var now = d('2026-11-15');
var r9 = F.fefoPick(lots1, 1);
eq('ล็อต 10/2026 หมดอายุไปแล้วเมื่อเทียบกับ 15/11/2026',
  F.fefoExpired(r9.picks, lots1, now).map(function (x) { return x.lotNo; }), ['L-2610']);
eq('ถ้าวันนี้คือ 01/09/2026 ยังไม่หมดอายุ',
  F.fefoExpired(r9.picks, lots1, d('2026-09-01')), []);
eq('ล็อตไม่ระบุวันหมดอายุ ไม่นับว่าหมดอายุ',
  F.fefoExpired(F.fefoPick(lots2, 6).picks, lots2, d('2030-01-01'))
    .map(function (x) { return x.lotNo; }), ['L-2712']);

/* ---------- 10. ตัดพอดีเป๊ะ ---------- */
console.log('\n10. ตัดพอดีทั้งคลัง');
eq('ขอเท่าที่มีพอดี ต้องผ่านและตัดหมดทุกล็อต',
  names(F.fefoPick(lots1, 100)), ['L-2610x50', 'L-2703x50']);

console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทั้งหมด'));
process.exit(fails ? 1 : 0);
