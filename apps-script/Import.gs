/**
 * นำเข้าข้อมูลจากแอปเดิมครั้งเดียว
 *
 * ไฟล์นี้เป็นแค่ "เครื่องมือ" ไม่มีข้อมูลจริงอยู่ข้างใน
 * ข้อมูลจริง (ล็อต · ออเดอร์ · ชื่อลูกค้า) อยู่ในไฟล์ ImportData.gs ที่ส่งให้แยกต่างหาก
 * และ **ห้ามขึ้น repo เด็ดขาด** เพราะมีชื่อ เบอร์ และที่อยู่ลูกค้าจริง
 *
 * วิธีใช้
 *   1. วางไฟล์นี้กับ ImportData.gs ลงในโปรเจกต์ Apps Script
 *   2. สั่งฟังก์ชัน  clearDemoRows()   ล้างข้อมูลตัวอย่างที่ติดมากับชีท
 *   3. สั่งฟังก์ชัน  importAll()       นำเข้าของจริง
 *   4. เช็คผลตามที่ Logger บอก แล้วลบไฟล์ ImportData.gs ทิ้งจากโปรเจกต์
 *
 * สั่งซ้ำได้ ไม่เกิดข้อมูลซ้ำ — ทุกอย่างเช็คกุญแจก่อนเขียน
 */

/* ------------------------------------------------- ล้างข้อมูลตัวอย่างของชีท */

/**
 * ชีทมาพร้อมออเดอร์ตัวอย่าง 5 ใบ (คุณสมชาย ใจดี ฯลฯ) กับรายการรับเข้า/Log ตัวอย่าง
 * ฟังก์ชันนี้ล้างเฉพาะแถวที่ "รู้จักว่าเป็นตัวอย่าง" เท่านั้น
 *
 * ล้างเฉพาะช่องกรอก ไม่แตะช่องสูตร — แถวว่างยังพร้อมรับข้อมูลจริงต่อได้ทันที
 */
function clearDemoRows() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    var out = [];
    out.push(clearBy_('head', SH.head.IN.no, function (v) {
      return /^AST-26-000[1-5]$/.test(String(v));
    }));
    out.push(clearBy_('item', SH.item.IN.no, function (v) {
      return /^AST-26-000[1-5]$/.test(String(v));
    }));
    out.push(clearBy_('recv', SH.recv.IN.doc, function (v) {
      return /^(PO-26-001|CNT-26-001|ADJ-26-001)$/.test(String(v));
    }));
    out.push(clearBy_('log', SH.log.IN.staff, function (v) {
      return /^พนักงาน [AB]$/.test(String(v));
    }));
    SpreadsheetApp.flush();
    var msg = 'ล้างข้อมูลตัวอย่างแล้ว\n' + out.join('\n');
    Logger.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

function clearBy_(key, col, isDemo) {
  var s = sheet_(key);
  var last = formulaLimit_(key);
  if (last < DATA_ROW) return SH[key].name + ': ไม่มีข้อมูล';
  var v = s.getRange(DATA_ROW, col, last - DATA_ROW + 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < v.length; i++) {
    if (v[i][0] !== '' && v[i][0] !== null && isDemo(v[i][0])) { clearRow_(key, DATA_ROW + i); n++; }
  }
  return SH[key].name + ': ล้าง ' + n + ' แถว';
}

/* ------------------------------------------------------------- นำเข้าของจริง */

function importAll() {
  if (typeof IMPORT === 'undefined') {
    throw new Error('ไม่พบไฟล์ ImportData.gs — ต้องวางไฟล์ข้อมูลลงในโปรเจกต์ก่อน');
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    var out = [];
    out.push(importChannels_(IMPORT.channels || []));
    out.push(importProducts_(IMPORT.products || []));
    out.push(updatePrices_(IMPORT.prices || []));
    SpreadsheetApp.flush();
    out.push(importLots_(IMPORT.lots || []));
    out.push(importRecv_(IMPORT.recv || []));
    SpreadsheetApp.flush();
    out.push(importOrders_(IMPORT.orders || []));
    SpreadsheetApp.flush();
    var msg = 'นำเข้าเรียบร้อย\n' + out.join('\n');
    Logger.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

/**
 * เพิ่มตัวเลือกช่องทางขายที่ชีทยังไม่มี (เช่น LINE OA)
 * ต้องขยายช่วง dropdown ของ ออเดอร์_หัวบิล ด้วย ไม่งั้นค่าใหม่จะขึ้นเตือนว่าไม่อยู่ในรายการ
 */
function importChannels_(names) {
  if (!names.length) return 'ช่องทางขาย: ไม่มีอะไรต้องเพิ่ม';
  var s = sheet_('cfg');
  var have = cfgLists_().channel;
  var added = [];
  var row = DATA_ROW + 1;                       // ตัวเลือกเริ่มที่ D7
  while (String(s.getRange(row, 4).getValue() || '').trim()) row++;
  for (var i = 0; i < names.length; i++) {
    if (have.indexOf(names[i]) > -1) continue;
    s.getRange(row, 4).setValue(names[i]);
    added.push(names[i]);
    row++;
  }
  if (!added.length) return 'ช่องทางขาย: มีครบแล้ว';

  var head = sheet_('head');
  head.getRange(DATA_ROW, SH.head.IN.channel, 495, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(s.getRange('D7:D11'), true)
      .setAllowInvalid(true).build()
  );
  return 'ช่องทางขาย: เพิ่ม ' + added.join(', ') + ' และขยาย dropdown เป็น D7:D11';
}

/** เพิ่มสินค้าที่ชีทยังไม่มี — ต้นทุนเว้นว่างไว้ ชีทจะขึ้นเตือน "ยังไม่มีต้นทุน" ให้เอง */
function importProducts_(rows) {
  if (!rows.length) return 'ฐานสินค้า: ไม่มีอะไรต้องเพิ่ม';
  var have = {};
  var all = readAll_('prod');
  for (var i = 0; i < all.length; i++) {
    var sku = String(all[i][SH.prod.IN.sku - 1] || '').trim();
    if (sku) have[sku] = true;
  }
  var added = [];
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j];
    if (have[r.sku]) continue;
    var row = nextRow_('prod', SH.prod.IN.sku);
    if (!row) throw new Error('ชีท ' + SH.prod.name + ' เต็มแล้ว');
    writeRow_('prod', row, {
      sku: r.sku, group: r.group, name: r.name,
      perPack: r.perPack, unit: r.unit,
      cost: r.cost === '' ? undefined : r.cost,
      price: r.price, opening: 0, reorder: r.reorder || 10
    });
    added.push(r.sku);
    have[r.sku] = true;
  }
  return 'ฐานสินค้า: เพิ่ม ' + (added.length ? added.join(', ') : '0 รายการ');
}

/**
 * แก้ต้นทุน/ราคาขายของสินค้าที่มีอยู่แล้ว
 *
 * แตะแค่คอลัมน์ G (ต้นทุน) กับ H (ราคาขาย) ซึ่งเป็นช่องกรอก
 * กำไร · %กำไร · สถานะข้อมูล · มูลค่าสต๊อก เป็นสูตร ชีทคำนวณใหม่ให้เอง
 *
 * ลง Log ทุกแถวที่เปลี่ยนจริง พร้อมค่าเดิม — ย้อนดูได้ว่าใครเปลี่ยนอะไรเมื่อไร
 * แถวที่ค่าตรงอยู่แล้วไม่แตะและไม่ลง Log สั่งซ้ำจึงไม่รก
 */
function updatePrices_(rows) {
  if (!rows.length) return 'ราคาสินค้า: ไม่มีอะไรต้องแก้';
  var s = sheet_('prod');
  var last = formulaLimit_('prod');
  if (last < DATA_ROW) return 'ราคาสินค้า: ฐานสินค้าว่าง';

  var v = s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, SH.prod.IN.price).getValues();
  var at = {};
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][SH.prod.IN.sku - 1] || '').trim();
    if (sku) at[sku] = { row: DATA_ROW + i, cost: v[i][SH.prod.IN.cost - 1], price: v[i][SH.prod.IN.price - 1] };
  }

  var who = whoami_();
  var changed = [], missing = [];
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j];
    var cur = at[r.sku];
    if (!cur) { missing.push(r.sku); continue; }
    var patch = {}, note = [];
    if (r.cost !== undefined && r.cost !== '' && Number(cur.cost) !== Number(r.cost)) {
      patch.cost = Number(r.cost); note.push('ต้นทุน ' + cur.cost + '→' + r.cost);
    }
    if (r.price !== undefined && r.price !== '' && Number(cur.price) !== Number(r.price)) {
      patch.price = Number(r.price); note.push('ราคาขาย ' + cur.price + '→' + r.price);
    }
    if (!note.length) continue;
    writeRow_('prod', cur.row, patch);
    writeLog_(who, 'ตั้งค่าราคา', SH.prod.name, r.sku,
      note.join(' · '),
      cur.cost + ' / ' + cur.price,
      (patch.cost === undefined ? cur.cost : patch.cost) + ' / ' + (patch.price === undefined ? cur.price : patch.price),
      r.why || 'เจ้าของร้านสั่งแก้ตอนย้ายระบบ');
    changed.push(r.sku + ' (' + note.join(', ') + ')');
  }
  return 'ราคาสินค้า: แก้ ' + changed.length + ' รายการ'
    + (changed.length ? '\n  ' + changed.join('\n  ') : '')
    + (missing.length ? '\n  !! ไม่พบในชีท: ' + missing.join(', ') : '');
}

/** ล็อตเคมี — กุญแจกันซ้ำคือ SKU|เลขล็อต */
function importLots_(rows) {
  if (!rows.length) return 'ล็อตสินค้า: ไม่มีอะไรต้องเพิ่ม';
  var s = sheet_('lot');
  var last = formulaLimit_('lot');
  var have = {};
  if (last >= DATA_ROW) {
    var v = s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, SH.lot.IN.lotNo).getValues();
    for (var i = 0; i < v.length; i++) {
      var k = String(v[i][SH.lot.IN.sku - 1] || '') + '|' + String(v[i][SH.lot.IN.lotNo - 1] || '');
      if (k !== '|') have[k] = true;
    }
  }
  var n = 0, skip = 0;
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j];
    if (have[r.sku + '|' + r.lotNo]) { skip++; continue; }
    var row = nextRow_('lot', SH.lot.IN.sku);
    if (!row) throw new Error('ชีท ' + SH.lot.name + ' เต็มแล้ว');
    writeRow_('lot', row, {
      sku: r.sku, lotNo: r.lotNo,
      exp: r.exp ? parseDate_(r.exp) : undefined,
      recv: r.recv ? parseDate_(r.recv) : undefined,
      qty: r.qty, note: r.note || ''
    });
    n++;
  }
  return 'ล็อตสินค้า: เพิ่ม ' + n + ' ล็อต' + (skip ? ' (ข้ามที่มีอยู่แล้ว ' + skip + ')' : '');
}

/**
 * รับเข้า — ต้องลงคู่กับล็อตเสมอ
 * ถ้าลงแต่ล็อตแล้วไม่ลงรับเข้า ยอดคงเหลือในชีทจะยังเป็น 0 ทั้งที่ล็อตบอกว่ามีของ
 * แล้วช่องตรวจยอดที่หัวชีทล็อตจะขึ้นเตือนว่ายอดไม่ตรงกัน
 */
function importRecv_(rows) {
  if (!rows.length) return 'รับเข้า: ไม่มีอะไรต้องเพิ่ม';
  var s = sheet_('recv');
  var last = formulaLimit_('recv');
  var have = {};
  if (last >= DATA_ROW) {
    var v = s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, SH.recv.IN.sku).getValues();
    for (var i = 0; i < v.length; i++) {
      var k = String(v[i][SH.recv.IN.doc - 1] || '') + '|' + String(v[i][SH.recv.IN.sku - 1] || '');
      if (k !== '|') have[k] = true;
    }
  }
  var n = 0, skip = 0;
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j];
    if (have[r.doc + '|' + r.sku]) { skip++; continue; }
    var row = nextRow_('recv', SH.recv.IN.sku);
    if (!row) throw new Error('ชีท ' + SH.recv.name + ' เต็มแล้ว');
    writeRow_('recv', row, {
      date: parseDate_(r.date), doc: r.doc, type: r.type, ref: r.ref,
      sku: r.sku, qty: r.qty, cost: r.cost, staff: r.staff, note: r.note || ''
    });
    n++;
  }
  return 'รับเข้า: เพิ่ม ' + n + ' รายการ' + (skip ? ' (ข้ามที่มีอยู่แล้ว ' + skip + ')' : '');
}

/**
 * ออเดอร์เก่า — ออกเลขใหม่ตามรูปแบบของชีท เก็บเลขเดิมไว้ในช่องหมายเหตุ
 *
 * ทำไมต้องออกเลขใหม่: เลขเดิมเป็นรูปแบบ AST-260829-4912 ถ้าเก็บไว้ ตัวนับเลขใบต่อไป
 * จะอ่าน 260829 เป็นเลขลำดับ แล้วใบถัดไปกลายเป็น AST-26-260830 — ตัวนับพังทันที
 *
 * กุญแจกันซ้ำคือเลขเดิมที่ฝากไว้ในหมายเหตุ สั่งซ้ำจึงไม่ได้ออเดอร์สองใบ
 */
function importOrders_(rows) {
  if (!rows.length) return 'ออเดอร์: ไม่มีอะไรต้องเพิ่ม';
  var s = sheet_('head');
  var last = formulaLimit_('head');
  var have = {};
  if (last >= DATA_ROW) {
    var v = s.getRange(DATA_ROW, SH.head.IN.note, last - DATA_ROW + 1, 1).getValues();
    for (var i = 0; i < v.length; i++) {
      var m = String(v[i][0] || '').match(/เลขเดิม (\S+)/);
      if (m) have[m[1]] = true;
    }
  }

  var done = [];
  for (var j = 0; j < rows.length; j++) {
    var o = rows[j];
    if (have[o.oldNo]) continue;

    var no = peekNextOrderNo_();
    var note = ['เลขเดิม ' + o.oldNo];
    if (o.pay === 'cod') note.push('เก็บเงินปลายทาง');
    if (o.extraChannels) note.push('ช่องทางอื่น: ' + o.extraChannels);
    if (o.memo) note.push(o.memo);

    var hRow = nextRow_('head', SH.head.IN.no);
    if (!hRow) throw new Error('ชีท ' + SH.head.name + ' เต็มแล้ว');
    writeRow_('head', hRow, {
      no: no, date: parseDate_(o.date), channel: o.channel, cust: o.cust,
      tel: o.tel, addr: o.addr, carrier: o.carrier, track: o.track,
      vat: o.vat ? 'รับ VAT' : 'ไม่รับ VAT',
      discount: Number(o.discount || 0), ship: Number(o.ship || 0),
      status: o.status, staff: o.staff || whoami_(), note: note.join(' · ')
    });

    var iRows = nextRows_('item', SH.item.IN.no, o.items.length);
    if (!iRows.length) throw new Error('ชีท ' + SH.item.name + ' เหลือที่ว่างไม่พอ');
    for (var k = 0; k < o.items.length; k++) {
      var it = o.items[k];
      writeRow_('item', iRows[k], {
        no: no, sku: it.sku, qty: it.qty,
        price: (it.price === '' || it.price === null || it.price === undefined) ? undefined : it.price
      });
    }

    SpreadsheetApp.flush();
    var got = Number(s.getRange(hRow, SH.head.subtotal).getValue() || 0);
    if (Math.abs(got - Number(o.subtotal)) > 0.05) {
      throw new Error('ออเดอร์ ' + o.oldNo + ': ยอดที่ชีทคำนวณได้ ' + got +
        ' ไม่ตรงกับยอดเดิม ' + o.subtotal + ' — หยุดนำเข้าไว้ก่อน แถวนี้ยังอยู่ในชีท ให้ตรวจแล้วลบเองถ้าไม่ถูก');
    }
    done.push(o.oldNo + ' → ' + no + ' (' + got + ' บาท)');
  }
  return 'ออเดอร์: นำเข้า ' + done.length + ' ใบ' + (done.length ? '\n  ' + done.join('\n  ') : '');
}
