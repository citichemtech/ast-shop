/**
 * FEFO — ล็อตที่หมดอายุก่อน ตัดออกก่อน (First Expired, First Out)
 *
 * ทั้งไฟล์นี้ไม่แตะ SpreadsheetApp เลย รับ array เข้า คืน array ออก
 * เพื่อให้ทดสอบด้วย node ได้จริงโดยไม่ต้องยิงขึ้น Google
 * (ดู tools/t_fefo_unit.js — ดึงโค้ดจากไฟล์นี้ไปรันตรง ๆ)
 */

/**
 * เรียงล็อตตามลำดับที่ต้องตัด
 *   1. หมดอายุก่อน ตัดก่อน
 *   2. ล็อตที่ไม่ระบุวันหมดอายุ ไว้ท้ายสุด — ของที่รู้วันหมดอายุต้องได้ออกไปก่อน
 *   3. หมดอายุวันเดียวกัน ดูวันรับเข้า ของเก่าออกก่อน
 *   4. เท่ากันหมด เรียงตามลำดับแถวในชีท ให้ผลเหมือนเดิมทุกครั้ง
 */
function fefoSort(lots) {
  return lots.slice().sort(function (a, b) {
    var ae = a.exp === null || a.exp === undefined ? null : a.exp;
    var be = b.exp === null || b.exp === undefined ? null : b.exp;
    if (ae === null && be !== null) return 1;
    if (ae !== null && be === null) return -1;
    if (ae !== null && be !== null && ae !== be) return ae - be;

    var ar = a.recv === null || a.recv === undefined ? null : a.recv;
    var br = b.recv === null || b.recv === undefined ? null : b.recv;
    if (ar === null && br !== null) return 1;
    if (ar !== null && br === null) return -1;
    if (ar !== null && br !== null && ar !== br) return ar - br;

    return a.row - b.row;
  });
}

/**
 * แบ่งจำนวนที่สั่งลงล็อตต่าง ๆ ตามลำดับ FEFO
 *
 * lots  = [{ row, lotNo, exp, recv, remain }]  exp/recv เป็น ms หรือ null
 * need  = จำนวนที่ต้องตัด (จำนวนเต็มบวก)
 *
 * คืน { ok:true, picks:[{row, lotNo, take}] }
 *   - ถ้าสินค้าตัวนี้ไม่มีล็อตเลย คืน picks:[] แปลว่าไม่ได้คุมล็อต ปล่อยผ่านได้
 *   - ถ้ามีล็อตแต่ของไม่พอ คืน { ok:false, ... } พร้อมตัวเลขจริง ให้คนตัดสินใจ
 *     ไม่ตัดครึ่ง ๆ กลาง ๆ และไม่ปล่อยให้ยอดติดลบ
 */
function fefoPick(lots, need) {
  need = Number(need);
  if (!(need > 0)) return { ok: false, reason: 'bad-qty', need: need, have: 0, picks: [] };

  var live = [];
  for (var i = 0; i < lots.length; i++) {
    if (Number(lots[i].remain) > 0) live.push(lots[i]);
  }
  if (lots.length === 0) return { ok: true, tracked: false, have: 0, picks: [] };

  var have = 0;
  for (var j = 0; j < live.length; j++) have += Number(live[j].remain);
  if (have < need) {
    return { ok: false, reason: 'short', tracked: true, need: need, have: have, picks: [] };
  }

  var order = fefoSort(live);
  var left = need;
  var picks = [];
  for (var k = 0; k < order.length && left > 0; k++) {
    var take = Math.min(left, Number(order[k].remain));
    if (take <= 0) continue;
    picks.push({ row: order[k].row, lotNo: order[k].lotNo, take: take });
    left -= take;
  }
  return { ok: true, tracked: true, need: need, have: have, picks: picks };
}

/** ms ของวันนี้ตอนเที่ยงคืน ใช้เทียบว่าล็อตหมดอายุหรือยัง */
function todayMs(now) {
  var d = now ? new Date(now) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** ล็อตที่หมดอายุแล้ว ไม่ควรถูกตัดขายออกไป — คืนรายการที่ต้องเตือน */
function fefoExpired(picks, lots, now) {
  var t = todayMs(now);
  var byRow = {};
  for (var i = 0; i < lots.length; i++) byRow[lots[i].row] = lots[i];
  var bad = [];
  for (var j = 0; j < picks.length; j++) {
    var lot = byRow[picks[j].row];
    if (lot && lot.exp !== null && lot.exp !== undefined && lot.exp < t) {
      bad.push({ lotNo: lot.lotNo, exp: lot.exp, take: picks[j].take });
    }
  }
  return bad;
}

/* ให้ node ดึงไปทดสอบได้ ตอนรันบน Apps Script บรรทัดนี้ไม่ทำงาน */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fefoSort: fefoSort, fefoPick: fefoPick, fefoExpired: fefoExpired, todayMs: todayMs };
}
