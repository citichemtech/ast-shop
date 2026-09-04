/**
 * สต๊อก · นำเข้าออเดอร์ Shopee · ประวัติการเคลื่อนไหว · คืนสินค้า
 *
 * หลักที่ยึดทั้งไฟล์
 *   1. ไม่เขียนอะไรลงชีทจนกว่าคนจะเห็นผลตรวจแล้วกดยืนยัน — previewShopee() ไม่เขียนเลยสักช่อง
 *   2. การตัดสต๊อกใช้ทางเดียวกับการคีย์ออเดอร์ด้วยมือ (planOrder_/commitOrder_/verifyOrder_)
 *      ไม่เขียนทางลัดของตัวเอง ถ้ามีทางเขียนสองทาง อีกทางจะพลาดกติกาบางข้อเสมอ
 *   3. ตัดซ้ำคือความผิดพลาดที่แพงที่สุด — กันด้วยทะเบียน "นำเข้า Shopee" ที่เปิดดูย้อนหลังได้
 */

/* ------------------------------------------------------------ ความจุของชีท */

/** จำนวนแถวว่างที่ยังมีสูตรรออยู่ของชีทหนึ่ง */
function freeRows_(key, keyCol) {
  var s = sheet_(key);
  var limit = formulaLimit_(key);
  if (limit < DATA_ROW) return 0;
  var v = s.getRange(DATA_ROW, keyCol, limit - DATA_ROW + 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < v.length; i++) if (v[i][0] === '' || v[i][0] === null) n++;
  return n;
}

/**
 * ที่ว่างที่เหลือของทุกชีทที่การนำเข้าต้องใช้
 *
 * ต้องโชว์ตัวเลขนี้ให้เห็นก่อนกดตัดเสมอ ไม่ใช่รอให้ล้มกลางทางแล้วค่อยบอก:
 * ชีทออเดอร์ของร้านมีสูตรถึงแถว 501/1201 เท่านั้น คิดเป็นออเดอร์ราว 495 ใบ
 * ที่ยอดขาย Shopee วันละหลายสิบใบ ชีทเต็มได้ภายในไม่กี่สัปดาห์
 */
function capacity_() {
  return {
    head: freeRows_('head', SH.head.IN.no),
    item: freeRows_('item', SH.item.IN.no),
    cut: freeRows_('cut', SH.cut.IN.no),
    imp: freeRows_('imp', SH.imp.IN.sn),
    recv: freeRows_('recv', SH.recv.IN.sku),
    headLimit: formulaLimit_('head'),
    itemLimit: formulaLimit_('item')
  };
}

/* --------------------------------------------------------------- หน้าสต๊อก */

/**
 * ข้อมูลทั้งหมดที่หน้าสต๊อกต้องใช้ในการเรียกครั้งเดียว
 * รวมรายการที่ต่ำกว่าจุดสั่งซื้อและล็อตที่ใกล้หมดอายุ ไม่ต้องให้หน้าจอคิดเอง
 */
function getStockBoard() {
  requireStaff_();
  var rows = readAll_('prod');
  var stock = readStock_();
  var lots = readLotSummary_();
  var cfg = cfgGet_();
  var today = todayMs();

  var out = [];
  var low = [];
  var expiring = [];
  for (var i = 0; i < rows.length; i++) {
    var sku = String(rows[i][SH.prod.IN.sku - 1] || '').trim();
    if (!sku) continue;
    var reorder = Number(rows[i][SH.prod.IN.reorder - 1] || 0) || Number(cfg.reorder || 0);
    var remain = stock[sku] === undefined ? null : Number(stock[sku]);
    var p = {
      sku: sku,
      group: String(rows[i][SH.prod.IN.group - 1] || ''),
      name: String(rows[i][SH.prod.IN.name - 1] || ''),
      unit: String(rows[i][SH.prod.IN.unit - 1] || 'ชิ้น'),
      cost: Number(rows[i][SH.prod.IN.cost - 1] || 0),
      price: Number(rows[i][SH.prod.IN.price - 1] || 0),
      reorder: reorder,
      remain: remain,
      lot: lots[sku] || null
    };
    /* ของหมดคือเรื่องด่วนกว่าของใกล้หมด จึงแยกระดับไว้ให้หน้าจอเรียงได้เลย */
    p.level = remain === null ? 'unknown'
      : (remain <= 0 ? 'out' : (reorder > 0 && remain <= reorder ? 'low' : 'ok'));
    if (p.level === 'out' || p.level === 'low') low.push(p);
    if (p.lot && p.lot.next && p.lot.next.exp !== null && p.lot.next.exp !== undefined) {
      var days = Math.round((p.lot.next.exp - today) / 86400000);
      if (days <= 60) expiring.push({ sku: sku, name: p.name, lotNo: p.lot.next.lotNo,
        exp: p.lot.next.exp, remain: p.lot.next.remain, days: days });
    }
    out.push(p);
  }

  low.sort(function (a, b) {
    if (a.level !== b.level) return a.level === 'out' ? -1 : 1;
    return (a.remain || 0) - (b.remain || 0);
  });
  expiring.sort(function (a, b) { return a.days - b.days; });

  return { products: out, low: low, expiring: expiring, capacity: capacity_() };
}

/* ------------------------------------------------------------- จับคู่ SKU */

/** อ่านตารางจับคู่ทั้งแผ่น คืนทั้งแถวดิบ (ให้หน้าจอแก้) และดัชนีที่ใช้ค้นจริง */
function readMapRows_() {
  var s = sheet_('map');
  var limit = formulaLimit_('map');
  if (limit < DATA_ROW) return [];
  var v = s.getRange(DATA_ROW, 1, limit - DATA_ROW + 1, 9).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var code = String(v[i][SH.map.IN.code - 1] || '').trim();
    var name = String(v[i][SH.map.IN.name - 1] || '').trim();
    var sku = String(v[i][SH.map.IN.sku - 1] || '').trim();
    if (!code && !name && !sku) continue;
    out.push({
      row: DATA_ROW + i,
      code: code, name: name,
      variant: String(v[i][SH.map.IN.variant - 1] || '').trim(),
      sku: sku,
      mult: Number(v[i][SH.map.IN.mult - 1] || 1) || 1,
      prodName: String(v[i][6] || ''),
      check: String(v[i][7] || ''),
      note: String(v[i][SH.map.IN.note - 1] || '')
    });
  }
  return out;
}

/**
 * ดัชนีค้นหา: คีย์ที่ผ่าน shopeeNorm_ แล้ว → { sku, mult }
 * แถวที่ยังไม่ใส่ SKU ในระบบไม่เข้าดัชนี — ถือว่ายังจับคู่ไม่เสร็จ
 */
function mapIndex_(rows) {
  var idx = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r.sku) continue;
    var hit = { sku: r.sku, mult: r.mult > 0 ? r.mult : 1, row: r.row };
    if (r.code) idx[shopeeNorm_(r.code)] = hit;
    if (r.name && r.variant) idx[shopeeNorm_(r.name + '|' + r.variant)] = hit;
    if (r.name && !r.variant) idx[shopeeNorm_(r.name)] = hit;
  }
  return idx;
}

function getSkuMap() {
  requireStaff_();
  return { rows: readMapRows_(), products: readProducts_(), free: freeRows_('map', SH.map.IN.sku) };
}

/**
 * บันทึกการจับคู่ — แถวที่ส่ง row มาคือแก้ของเดิม ไม่ส่งมาคือเพิ่มใหม่
 * เขียนเฉพาะช่องกรอก คอลัมน์ตรวจสอบ (H) เป็นสูตร ระบบไม่แตะ
 */
function saveSkuMap(rows) {
  var email = requireStaff_();
  rows = rows || [];
  if (!rows.length) return { ok: true, saved: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    var prods = {};
    var plist = readProducts_();
    for (var i = 0; i < plist.length; i++) prods[plist[i].sku] = true;

    var fresh = [];
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k];
      var sku = String(r.sku || '').trim();
      if (sku && !prods[sku]) {
        throw new Error('SKU "' + sku + '" ไม่มีในฐานสินค้า — เพิ่มสินค้าในชีท ' +
          SH.prod.name + ' ก่อน แล้วค่อยจับคู่');
      }
      var mult = Number(r.mult || 1);
      if (!(mult > 0)) throw new Error('ตัวคูณของ "' + (r.code || r.name) + '" ต้องมากกว่า 0');
      if (!String(r.code || '').trim() && !String(r.name || '').trim()) {
        throw new Error('ต้องใส่รหัสหรือชื่อสินค้าฝั่ง Shopee อย่างน้อยหนึ่งอย่าง');
      }
      if (!r.row) fresh.push(k);
    }

    var free = fresh.length ? nextRows_('map', SH.map.IN.sku, fresh.length) : [];
    if (fresh.length && !free.length) {
      throw new Error('ชีท ' + SH.map.name + ' เต็มแล้ว (สูตรมีถึงแถว ' + formulaLimit_('map') +
        ') — ต้องลากสูตรลงเพิ่มก่อน');
    }

    var n = 0, f = 0;
    for (var j = 0; j < rows.length; j++) {
      var it = rows[j];
      var row = it.row ? Number(it.row) : free[f++];
      writeRow_('map', row, {
        code: String(it.code || '').trim(),
        name: String(it.name || '').trim(),
        variant: String(it.variant || '').trim(),
        sku: String(it.sku || '').trim(),
        mult: Number(it.mult || 1),
        note: String(it.note || '').trim()
      });
      n++;
    }
    SpreadsheetApp.flush();
    writeLog_(email, 'จับคู่ SKU', SH.map.name, '', 'จับคู่สินค้า Shopee', '', n + ' แถว',
      'บันทึกจากแอปโดย ' + email);
    return { ok: true, saved: n, rows: readMapRows_() };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------- ทะเบียนออเดอร์ Shopee */

/** เลขที่คำสั่งซื้อ Shopee ที่นำเข้าไปแล้ว → ข้อมูลแถวนั้น */
function readImported_() {
  var s = sheet_('imp');
  var limit = formulaLimit_('imp');
  var by = {};
  if (limit < DATA_ROW) return by;
  var C = SH.imp.IN;
  var v = s.getRange(DATA_ROW, C.sn, limit - DATA_ROW + 1, C.note - C.sn + 1).getValues();
  for (var i = 0; i < v.length; i++) {
    var sn = String(v[i][0] || '').trim();
    if (!sn) continue;
    by[sn] = {
      row: DATA_ROW + i, sn: sn,
      orderNo: String(v[i][C.orderNo - C.sn] || '').trim(),
      state: String(v[i][C.state - C.sn] || '').trim(),
      status: String(v[i][C.status - C.sn] || '').trim(),
      amount: Number(v[i][C.amount - C.sn] || 0),
      fee: Number(v[i][C.fee - C.sn] || 0)
    };
  }
  return by;
}

/* -------------------------------------------------- อ่านไฟล์ที่หน้าจอส่งมา */

/**
 * อ่านตารางจากไฟล์ Shopee — เรียกจากหน้าจอ ตรรกะจริงอยู่ใน Shopee.gs
 *
 * ทำไมหน้าจอไม่อ่านเอง: ตรรกะการอ่านหัวตารางกับการรวมแถวเป็นใบ เป็นจุดที่ผิดแล้ว
 * ตัดสต๊อกผิดจำนวน ถ้ามีสำเนาอยู่สองที่ (ในเบราว์เซอร์กับบนเซิร์ฟเวอร์)
 * วันที่แก้ที่เดียวคือวันที่สองที่เริ่มให้ผลไม่ตรงกัน โดยไม่มีอะไรฟ้อง
 * ชุดทดสอบด้วย node จับได้เฉพาะฝั่งนี้ จึงเก็บไว้ฝั่งเดียวและให้หน้าจอเรียกเอา
 *
 * cols/headerRow ส่งมาเมื่อคนเลือกคอลัมน์เองที่หน้าจอ ไม่ส่งมาก็ให้ระบบเดาให้
 */
function shopeeRead(table, cols, headerRow) {
  requireStaff_();
  table = table || [];
  var hr = (headerRow === undefined || headerRow === null || headerRow < 0)
    ? shopeeHeaderRow(table) : Number(headerRow);
  var guessed = false;
  if (hr < 0) { hr = 0; guessed = true; }
  var use = {};
  var any = false;
  for (var k in (cols || {})) { use[k] = cols[k]; any = true; }
  if (!any) use = shopeeMatchCols(table[hr] || []);

  var r = shopeeParse(table, use, hr);
  return {
    headerRow: hr, cols: use, unsure: guessed,
    header: (table[hr] || []).map(function (x) { return String(x == null ? '' : x); }),
    fields: SHOPEE_COLS.map(function (f) { return { key: f.key, label: f.label, req: !!f.req }; }),
    orders: r.orders, skipped: r.skipped
  };
}

/* ------------------------------------------------------- เตรียมออเดอร์หนึ่งใบ */

/** สถานะในชีทที่ตรงกับสถานะฝั่ง Shopee มากที่สุด — ไม่เจอก็ใช้ตัวแรกของรายการ */
function statusFor_(kind, list) {
  function find(re) {
    for (var i = 0; i < list.length; i++) if (re.test(list[i])) return list[i];
    return '';
  }
  var want = kind === 'cancelled' ? find(/ยกเลิก/)
    : kind === 'done' || kind === 'shipped' ? find(/ส่งแล้ว|จัดส่ง/)
    : kind === 'toship' ? (find(/จัดของ|เตรียม/) || find(/ชำระแล้ว/))
    : find(/รอชำระ|ยังไม่/);
  return want || list[0] || '';
}

/**
 * แปลงออเดอร์ Shopee หนึ่งใบเป็น payload ของ createOrder
 *
 * ราคาต่อชิ้นต้องหารด้วยตัวคูณเสมอเมื่อเป็นสินค้าจัดเซต
 * ไม่งั้นแพ็ค 5 ราคา 500 จะกลายเป็น 5 ชิ้น ชิ้นละ 500 = ยอดขาย 2,500 ในชีท
 * ตัวเลขผิดแบบนี้ไปโผล่ที่กำไรและที่ยอดส่งบัญชี
 */
function shopeePayload_(o, idx, opts) {
  var items = [];
  var unmapped = [];
  for (var i = 0; i < o.items.length; i++) {
    var it = o.items[i];
    var keys = shopeeKeys(it);
    var hit = null;
    for (var k = 0; k < keys.length && !hit; k++) hit = idx[keys[k]] || null;
    if (!hit) {
      unmapped.push({ code: it.code, name: it.name, variant: it.variant, qty: it.qty });
      continue;
    }
    var qty = Math.round(Number(it.qty || 0) * hit.mult);
    var amount = Number(it.amount || 0);
    var price = qty > 0 ? round2_(amount / qty) : 0;
    items.push({ sku: hit.sku, qty: qty, price: price, from: it });
  }

  var cust = String(o.recip || o.buyer || '').trim() || ('ลูกค้า Shopee ' + o.sn);
  var note = 'Shopee ' + o.sn + (o.fee ? ' · ค่าธรรมเนียม ' + round2_(o.fee) : '');
  return {
    payload: {
      clientKey: 'shopee:' + o.sn,
      date: o.date || undefined,
      channel: opts.channel,
      cust: cust,
      tel: tel_(o.tel),
      addr: String(o.addr || '').trim(),
      carrier: opts.carrier,
      track: String(o.track || '').trim(),
      vat: false,
      /* ค่าธรรมเนียม Shopee ไม่ใช่ "ส่วนลดที่ให้ลูกค้า" แต่เป็นเงินที่ร้านไม่ได้รับ
         ร้านที่อยากเห็นกำไรใกล้ความจริงเลือกโหมดนี้ได้ ระบบไม่เลือกให้เอง
         เพราะมันเปลี่ยนฐานภาษีของใบนั้นด้วย */
      discount: opts.feeMode === 'discount' ? round2_(o.fee || 0) : 0,
      ship: opts.keepShip ? round2_(o.ship || 0) : 0,
      status: opts.status,
      by: opts.by,
      note: note,
      items: items.map(function (x) { return { sku: x.sku, qty: x.qty, price: x.price }; })
    },
    items: items,
    unmapped: unmapped
  };
}

/* ---------------------------------------------------------------- ตรวจก่อนตัด */

/**
 * ตรวจทั้งชุดโดยไม่เขียนอะไรลงชีทเลยแม้แต่ช่องเดียว
 *
 * ตรวจล็อตแบบ "กันของซ้อนกันทั้งชุด" — ถ้าออเดอร์ใบที่ 1 กินล็อตจนหมด
 * ใบที่ 7 ต้องเห็นว่าไม่พอตั้งแต่ตอนตรวจ ไม่ใช่ไปล้มเอาตอนเขียนจริงแล้วค้างครึ่งชุด
 */
function previewShopee(orders, opts) {
  requireStaff_();
  orders = orders || [];
  opts = normOpts_(opts);

  var idx = mapIndex_(readMapRows_());
  var done = readImported_();
  var prods = {};
  var plist = readProducts_();
  for (var i = 0; i < plist.length; i++) prods[plist[i].sku] = plist[i];
  var lotsBySku = readLots_();
  var used = {};

  var ready = [], blocked = [], skipped = [];
  var unmappedAll = {};
  var needHead = 0, needItem = 0, needCut = 0;

  for (var n = 0; n < orders.length; n++) {
    var o = orders[n];
    var sn = String(o.sn || '').trim();
    if (!sn) continue;

    if (done[sn]) {
      skipped.push({ sn: sn, why: 'นำเข้าไปแล้วเป็นออเดอร์ ' + (done[sn].orderNo || '(ไม่ระบุเลข)') +
        (done[sn].state ? ' · ' + done[sn].state : ''), orderNo: done[sn].orderNo });
      continue;
    }
    if (opts.cutKinds.indexOf(o.kind) < 0) {
      skipped.push({ sn: sn, why: 'สถานะ "' + (o.status || o.kind) + '" ไม่อยู่ในกลุ่มที่ตั้งไว้ให้ตัดสต๊อก' });
      continue;
    }

    var built = shopeePayload_(o, idx, opts);
    for (var u = 0; u < built.unmapped.length; u++) {
      var um = built.unmapped[u];
      var key = (um.code || '') + '|' + (um.name || '') + '|' + (um.variant || '');
      if (!unmappedAll[key]) unmappedAll[key] = { code: um.code, name: um.name, variant: um.variant, n: 0 };
      unmappedAll[key].n++;
    }
    if (built.unmapped.length) {
      blocked.push({ sn: sn, date: o.date, status: o.status, why: 'ยังจับคู่ SKU ไม่ครบ ' +
        built.unmapped.length + ' รายการ', unmapped: built.unmapped });
      continue;
    }
    if (!built.items.length) {
      blocked.push({ sn: sn, date: o.date, status: o.status, why: 'ใบนี้ไม่มีรายการสินค้าที่อ่านได้' });
      continue;
    }

    /* ตรวจของและล็อตแบบเดียวกับตอนบันทึกจริง แต่ไม่เขียน */
    var problem = '', lines = [], sub = 0, cutRows = 0;
    for (var t = 0; t < built.items.length && !problem; t++) {
      var it = built.items[t];
      var prod = prods[it.sku];
      if (!prod) { problem = 'ไม่พบ SKU ' + it.sku + ' ในฐานสินค้า'; break; }
      if (!(it.qty > 0)) { problem = 'จำนวนของ ' + it.sku + ' ไม่ถูกต้อง'; break; }

      var pool = (lotsBySku[it.sku] || []).map(function (l) {
        return { row: l.row, lotNo: l.lotNo, exp: l.exp, recv: l.recv, remain: l.remain - (used[l.row] || 0) };
      });
      var pick = fefoPick(pool, it.qty);
      if (!pick.ok) {
        problem = it.sku + ' (' + prod.name + '): ล็อตไม่พอ สั่ง ' + it.qty + ' เหลือ ' + pick.have;
        break;
      }
      var bad = fefoExpired(pick.picks, pool);
      if (bad.length) {
        problem = it.sku + ': ล็อต ' + bad.map(function (b) { return b.lotNo; }).join(', ') + ' หมดอายุแล้ว';
        break;
      }
      for (var q = 0; q < pick.picks.length; q++) {
        used[pick.picks[q].row] = (used[pick.picks[q].row] || 0) + pick.picks[q].take;
      }
      cutRows += pick.picks.length;
      sub += round2_(it.qty * it.price);
      lines.push({
        sku: it.sku, name: prod.name, qty: it.qty, price: it.price,
        total: round2_(it.qty * it.price), remain: prod.remain,
        lots: pick.picks.map(function (x) { return x.lotNo + ' x' + x.take; }).join(', ')
      });
    }

    var card = {
      sn: sn, date: o.date, status: o.status, kind: o.kind,
      cust: built.payload.cust, items: lines,
      subtotal: round2_(sub), fee: round2_(o.fee || 0),
      discount: built.payload.discount, ship: built.payload.ship
    };
    if (problem) { card.why = problem; blocked.push(card); continue; }

    needHead++; needItem += built.items.length; needCut += cutRows;
    ready.push(card);
  }

  var cap = capacity_();
  var fit = { head: needHead <= cap.head, item: needItem <= cap.item,
              cut: needCut <= cap.cut, imp: needHead <= cap.imp };
  var unmapList = Object.keys(unmappedAll).map(function (k) { return unmappedAll[k]; })
    .sort(function (a, b) { return b.n - a.n; });

  return {
    ready: ready, blocked: blocked, skipped: skipped, unmapped: unmapList,
    need: { head: needHead, item: needItem, cut: needCut },
    capacity: cap, fit: fit,
    enough: fit.head && fit.item && fit.cut && fit.imp,
    maxPerRun: SHOPEE_MAX_PER_RUN,
    opts: opts
  };
}

/**
 * นำเข้าได้ครั้งละกี่ใบ
 *
 * Apps Script ตัดการทำงานที่ 6 นาที และการบันทึก 1 ใบต้องอ่านชีทหลายรอบ
 * (ฐานสินค้า · สต๊อก · ล็อต) แล้ว flush รอสูตรคิดใหม่ก่อนใบถัดไปเสมอ
 * ตัดที่ 30 ใบเพื่อให้จบก่อนหมดเวลาแน่ ๆ แล้วบอกให้กดต่อ ดีกว่าโดนตัดกลางคัน
 */
var SHOPEE_MAX_PER_RUN = 30;

function normOpts_(opts) {
  opts = opts || {};
  var lists = cfgLists_();
  var kinds = opts.cutKinds && opts.cutKinds.length ? opts.cutKinds : SHOPEE_CUT_KINDS;
  return {
    cutKinds: kinds,
    channel: pickFrom_(opts.channel || 'Shopee', lists.channel, 'ช่องทางขาย'),
    carrier: opts.carrier ? pickFrom_(opts.carrier, lists.carrier, 'ช่องทางจัดส่ง') : lists.carrier[0],
    status: opts.status ? pickFrom_(opts.status, lists.status, 'สถานะออเดอร์') : '',
    feeMode: opts.feeMode === 'discount' ? 'discount' : 'none',
    keepShip: !!opts.keepShip,
    by: String(opts.by || '').trim().slice(0, 40)
  };
}

/* --------------------------------------------------------------- ตัดสต๊อกจริง */

/**
 * บันทึกออเดอร์ Shopee ลงชีทและตัดสต๊อก
 *
 * ล็อกทั้งชุดครั้งเดียว แล้วเขียนทีละใบ — ใบไหนล้ม ถอยเฉพาะใบนั้น ใบก่อนหน้ายังอยู่
 * และทะเบียนนำเข้าถูกเขียน "หลัง" ใบผ่านการตรวจยอดแล้วเท่านั้น
 * (ถ้าเขียนทะเบียนก่อน แล้วใบล้ม ระบบจะจำผิดว่าตัดไปแล้ว แล้วใบนั้นจะหายไปเงียบ ๆ)
 */
function commitShopee(orders, opts) {
  var email = requireStaff_();
  orders = orders || [];
  opts = normOpts_(opts);
  if (!orders.length) return { ok: true, saved: [], failed: [], skipped: [] };
  if (orders.length > SHOPEE_MAX_PER_RUN) {
    throw new Error('นำเข้าได้ครั้งละไม่เกิน ' + SHOPEE_MAX_PER_RUN + ' ใบ ' +
      '(ส่งมา ' + orders.length + ' ใบ) — กดนำเข้าซ้ำเพื่อทำชุดถัดไป');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(45000)) throw new Error('มีคนกำลังบันทึกออเดอร์อยู่ ลองใหม่อีกครั้ง');
  try {
    var idx = mapIndex_(readMapRows_());
    var done = readImported_();
    var props = PropertiesService.getScriptProperties();
    var lists = cfgLists_();
    var saved = [], failed = [], skipped = [];

    for (var n = 0; n < orders.length; n++) {
      var o = orders[n];
      var sn = String(o.sn || '').trim();
      if (!sn) continue;
      if (done[sn]) { skipped.push({ sn: sn, orderNo: done[sn].orderNo, why: 'นำเข้าไปแล้ว' }); continue; }
      if (opts.cutKinds.indexOf(o.kind) < 0) {
        skipped.push({ sn: sn, why: 'สถานะไม่อยู่ในกลุ่มที่ตัดสต๊อก' });
        continue;
      }

      var built = shopeePayload_(o, idx, opts);
      if (built.unmapped.length || !built.items.length) {
        failed.push({ sn: sn, why: 'ยังจับคู่ SKU ไม่ครบ' });
        continue;
      }
      if (!built.payload.status) {
        built.payload.status = statusFor_(o.kind, lists.status);
      }

      /* กดซ้ำ/เน็ตหลุดแล้วยิงใหม่ ต้องไม่ได้ออเดอร์สองใบ — ด่านเดียวกับที่ createOrder ใช้ */
      var hit = props.getProperty('ck_shopee:' + sn);
      if (hit) {
        /* ซ่อมทะเบียนให้ตรงกับความจริง แต่ห้ามให้ใบเดียวพาทั้งชุดล้ม */
        try { registerImport_(sn, o, hit, 'ตัดสต๊อกแล้ว', email, opts); }
        catch (e) { Logger.log('ลงทะเบียน ' + sn + ' ซ้ำไม่ได้: ' + e.message); }
        skipped.push({ sn: sn, orderNo: hit, why: 'เคยบันทึกไว้แล้ว' });
        continue;
      }

      var written = { head: 0, item: [], cut: [] };
      try {
        var plan = planOrder_(built.payload, email);
        plan.no = reserveOrderNo_();
        written = commitOrder_(plan);
        SpreadsheetApp.flush();
        verifyOrder_(plan);

        /* ลงทะเบียนก่อน แล้วค่อยจำ clientKey — ลำดับนี้สำคัญ
           ถ้าจำก่อนแล้วลงทะเบียนล้ม (ทะเบียนเต็ม) ระบบจะถอยออเดอร์ทิ้งไปแล้ว
           แต่ยังจำว่า "ใบนี้บันทึกแล้ว" กลายเป็นออเดอร์ที่หายไปเงียบ ๆ กู้ไม่ได้
           ทำกลับกัน อย่างแย่ที่สุดคือมีแถวทะเบียนแล้วรอบหน้าข้ามใบนี้ ซึ่งปลอดภัยกว่า */
        registerImport_(sn, o, plan.no, 'ตัดสต๊อกแล้ว', email, opts);
        props.setProperty('ck_shopee:' + sn, plan.no);
        writeLog_(email, 'นำเข้า Shopee', SH.head.name, plan.no, 'เลขที่คำสั่งซื้อ Shopee',
          '', sn, 'นำเข้าจากไฟล์ Shopee โดย ' + email);
        saved.push({ sn: sn, orderNo: plan.no, net: plan.net, subtotal: plan.subtotal });
        done[sn] = { orderNo: plan.no };
      } catch (err) {
        rollback_(written);
        failed.push({ sn: sn, why: err && err.message ? err.message : String(err) });
      }
    }

    SpreadsheetApp.flush();
    return { ok: true, saved: saved, failed: failed, skipped: skipped, capacity: capacity_() };
  } finally {
    lock.releaseLock();
  }
}

/** ลงทะเบียนว่าใบนี้เข้าระบบแล้ว — เขียนทับแถวเดิมถ้าเคยมี ไม่สร้างแถวซ้ำ */
function registerImport_(sn, o, orderNo, state, email, opts) {
  var s = sheet_('imp');
  var limit = formulaLimit_('imp');
  var row = 0;
  if (limit >= DATA_ROW) {
    var v = s.getRange(DATA_ROW, SH.imp.IN.sn, limit - DATA_ROW + 1, 1).getValues();
    for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === sn) { row = DATA_ROW + i; break; }
  }
  if (!row) row = nextRow_('imp', SH.imp.IN.sn);
  if (!row) {
    throw new Error('ชีท ' + SH.imp.name + ' เต็มแล้ว — ระบบไม่ตัดสต๊อกต่อ ' +
      'เพราะจะกันตัดซ้ำรอบหน้าไม่ได้');
  }
  var amount = 0;
  for (var k = 0; k < (o.items || []).length; k++) amount += Number(o.items[k].amount || 0);
  writeRow_('imp', row, {
    sn: sn,
    date: o.date ? parseDate_(o.date) : '',
    status: String(o.status || ''),
    orderNo: orderNo,
    amount: round2_(amount),
    fee: round2_(o.fee || 0),
    state: state,
    at: new Date(),
    by: (opts && opts.by) || email,
    note: ''
  });
}

/* ------------------------------------------------------------- คืนสินค้า */

/**
 * คืนของเข้าสต๊อก สำหรับออเดอร์ที่ลูกค้าตีกลับหรือ Shopee ยกเลิกหลังตัดไปแล้ว
 *
 * ทำสองอย่างพร้อมกัน เพราะยอดคงเหลือของร้านมาจากสองที่คนละทาง
 *   1. ชีท รับเข้า ชนิด "คืนจากลูกค้า" — ทำให้ยอดในชีท สต๊อกคงเหลือ กลับมา
 *   2. ชีท ตัดล็อต แถวจำนวนติดลบ — ทำให้ยอดในล็อตกลับมา
 * ทำอย่างเดียวไม่พอ ยอดสองที่จะเริ่มไม่ตรงกัน แล้วชีทล็อตจะขึ้นเตือนว่ายอดเพี้ยน
 *
 * ไม่ลบแถวออเดอร์เดิมทิ้ง — การขายเกิดขึ้นจริงและมีเอกสารออกไปแล้ว
 * ที่เปลี่ยนคือของกลับเข้าคลัง ไม่ใช่การขายนั้นไม่เคยเกิด
 */
function recordReturn(payload) {
  var email = requireStaff_();
  var p = payload || {};
  var no = String(p.orderNo || '').trim();
  if (!no) throw new Error('ไม่ได้บอกว่าจะคืนของออเดอร์ไหน');
  var why = String(p.why || '').trim();
  if (!why) throw new Error('ต้องใส่เหตุผลที่คืน — ยอดสต๊อกที่ขยับโดยไม่มีเหตุผลกำกับ ตรวจย้อนหลังไม่ได้');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    var ord = findOrder_(no);
    if (!ord) throw new Error('ไม่พบออเดอร์ ' + no + ' ในชีท');

    /* คืนทั้งใบ หรือคืนเฉพาะบางรายการที่หน้าจอส่งมา */
    var wanted = null;
    if (p.items && p.items.length) {
      wanted = {};
      for (var w = 0; w < p.items.length; w++) {
        wanted[String(p.items[w].sku)] = Number(p.items[w].qty || 0);
      }
    }

    var back = [];
    for (var i = 0; i < ord.items.length; i++) {
      var it = ord.items[i];
      var qty = wanted ? Number(wanted[it.sku] || 0) : Number(it.qty || 0);
      if (!(qty > 0)) continue;
      if (qty > Number(it.qty || 0)) {
        throw new Error('คืน ' + it.sku + ' ' + qty + ' ชิ้น มากกว่าที่ขายไป ' + it.qty + ' ชิ้น');
      }
      back.push({ sku: it.sku, qty: qty, lineNo: i + 1 });
    }
    if (!back.length) throw new Error('ไม่มีรายการที่จะคืน');

    var cuts = cutsOfOrder_(no);
    var recvRows = nextRows_('recv', SH.recv.IN.sku, back.length);
    if (!recvRows.length) throw new Error('ชีท ' + SH.recv.name + ' เหลือที่ว่างไม่พอ ' + back.length + ' บรรทัด');

    /* ตัดสิ่งที่จะคืนเข้าล็อต โดยคืนล็อตที่ตัดไปล่าสุดก่อน (กลับทางกับตอนตัด) */
    var restore = [];
    for (var b = 0; b < back.length; b++) {
      var left = back[b].qty;
      var mine = cuts.filter(function (c) { return c.sku === back[b].sku; });
      for (var c = mine.length - 1; c >= 0 && left > 0; c--) {
        var take = Math.min(left, mine[c].qty - (mine[c].taken || 0));
        if (take <= 0) continue;
        mine[c].taken = (mine[c].taken || 0) + take;
        restore.push({ lineNo: mine[c].lineNo, sku: back[b].sku, lotNo: mine[c].lotNo, qty: -take });
        left -= take;
      }
      /* สินค้าที่ไม่ได้คุมล็อตจะไม่มีแถวตัดล็อต ปล่อยผ่านได้ ยอดคืนไปอยู่ที่ชีท รับเข้า แล้ว */
    }

    var cutRows = restore.length ? nextRows_('cut', SH.cut.IN.no, restore.length) : [];
    if (restore.length && !cutRows.length) {
      throw new Error('ชีท ' + SH.cut.name + ' เหลือที่ว่างไม่พอ ' + restore.length + ' บรรทัด');
    }

    var doc = 'RET-' + no;
    var when = parseDate_(p.date) || new Date();
    var written = { recv: [], cut: [] };
    try {
      for (var r = 0; r < back.length; r++) {
        writeRow_('recv', recvRows[r], {
          date: when, doc: doc, type: recvReturnType_(), ref: no,
          sku: back[r].sku, qty: back[r].qty,
          staff: String(p.by || '').trim().slice(0, 40) || email,
          note: why
        });
        written.recv.push(recvRows[r]);
      }
      for (var q = 0; q < restore.length; q++) {
        writeRow_('cut', cutRows[q], {
          no: no, lineNo: restore[q].lineNo, sku: restore[q].sku,
          lotNo: restore[q].lotNo, qty: restore[q].qty, date: when
        });
        written.cut.push(cutRows[q]);
      }
      SpreadsheetApp.flush();
    } catch (err) {
      for (var x = written.cut.length - 1; x >= 0; x--) clearRow_('cut', written.cut[x]);
      for (var y = written.recv.length - 1; y >= 0; y--) clearRow_('recv', written.recv[y]);
      SpreadsheetApp.flush();
      throw err;
    }

    markReturned_(no, why);
    writeLog_(email, 'คืนสินค้า', SH.recv.name, no, 'คืนของเข้าสต๊อก', '',
      back.map(function (x) { return x.sku + ' x' + x.qty; }).join(', '), why);

    return { ok: true, orderNo: no, back: back, lots: restore };
  } finally {
    lock.releaseLock();
  }
}

/** ชนิดรายการรับเข้าที่หมายถึงของคืนจากลูกค้า — เอาจากตัวเลือกจริงของชีท ไม่ตั้งชื่อเอง */
function recvReturnType_() {
  var list = cfgLists_().recvType || [];
  for (var i = 0; i < list.length; i++) if (/คืน/.test(list[i])) return list[i];
  for (var j = 0; j < list.length; j++) if (/เพิ่ม/.test(list[j])) return list[j];
  throw new Error('ชีท ' + SH.cfg.name + ' ไม่มีชนิดรายการรับเข้าที่หมายถึงของคืน ' +
    '— เพิ่มตัวเลือก "คืนจากลูกค้า" ในคอลัมน์ H ก่อน');
}

/** แถวตัดล็อตของออเดอร์ใบหนึ่ง เรียงตามลำดับที่ตัด (แถวติดลบคือของที่คืนไปแล้ว) */
function cutsOfOrder_(no) {
  var s = sheet_('cut');
  var limit = formulaLimit_('cut');
  var out = [];
  if (limit < DATA_ROW) return out;
  var v = s.getRange(DATA_ROW, 1, limit - DATA_ROW + 1, 7).getValues();
  var net = {};
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][SH.cut.IN.no - 1] || '').trim() !== no) continue;
    var key = v[i][SH.cut.IN.sku - 1] + '|' + v[i][SH.cut.IN.lotNo - 1] + '|' + v[i][SH.cut.IN.lineNo - 1];
    if (!net[key]) {
      net[key] = { lineNo: Number(v[i][SH.cut.IN.lineNo - 1] || 0),
        sku: String(v[i][SH.cut.IN.sku - 1] || ''), lotNo: String(v[i][SH.cut.IN.lotNo - 1] || ''), qty: 0 };
      out.push(net[key]);
    }
    net[key].qty += Number(v[i][SH.cut.IN.qty - 1] || 0);
  }
  return out.filter(function (c) { return c.qty > 0; });
}

/** ทำเครื่องหมายในทะเบียนนำเข้าว่าใบนี้คืนของแล้ว (ถ้าเป็นออเดอร์ที่มาจาก Shopee) */
function markReturned_(orderNo, why) {
  var s = sheet_('imp');
  var limit = formulaLimit_('imp');
  if (limit < DATA_ROW) return;
  var C = SH.imp.IN;
  var v = s.getRange(DATA_ROW, C.orderNo, limit - DATA_ROW + 1, 1).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0] || '').trim() !== orderNo) continue;
    writeRow_('imp', DATA_ROW + i, { state: 'คืนของแล้ว', note: why });
    return;
  }
}

/* ------------------------------------------------------------------- ประวัติ */

/**
 * ประวัติรับเข้า–ขายออก–คืนสินค้า รวมเป็นเส้นเดียวเรียงตามวัน
 *
 * รวมสามทางไว้ที่เดียวเพราะเวลาสต๊อกไม่ตรง คำถามคือ "ของหายไปตอนไหน"
 * ถ้าต้องเปิดสามชีทมาไล่เทียบเอง จะไม่มีใครไล่ และจะจบด้วยการนับใหม่ทั้งร้าน
 */
function getMoves(opts) {
  requireStaff_();
  opts = opts || {};
  var wantSku = String(opts.sku || '').trim();
  var from = String(opts.from || '');
  var to = String(opts.to || '');
  var limit = Number(opts.limit) || 300;

  var names = {};
  var plist = readProducts_();
  for (var i = 0; i < plist.length; i++) names[plist[i].sku] = plist[i].name;

  var out = [];
  var retType = '';
  try { retType = recvReturnType_(); } catch (e) { retType = 'คืนจากลูกค้า'; }

  /* รับเข้า + คืนจากลูกค้า — อยู่ชีทเดียวกัน แยกกันที่คอลัมน์ชนิด */
  var rs = sheet_('recv');
  var rLast = formulaLimit_('recv');
  if (rLast >= DATA_ROW) {
    var rv = rs.getRange(DATA_ROW, 1, rLast - DATA_ROW + 1, 13).getValues();
    for (var r = 0; r < rv.length; r++) {
      var sku = String(rv[r][SH.recv.IN.sku - 1] || '').trim();
      if (!sku) continue;
      var d = rv[r][SH.recv.IN.date - 1];
      var type = String(rv[r][SH.recv.IN.type - 1] || '');
      out.push({
        date: d instanceof Date ? isoDate_(d) : String(d || ''),
        kind: type === retType ? 'ret' : 'in',
        type: type, sku: sku, name: names[sku] || '',
        qty: Number(rv[r][SH.recv.IN.qty - 1] || 0),
        ref: String(rv[r][SH.recv.IN.doc - 1] || '') || String(rv[r][SH.recv.IN.ref - 1] || ''),
        by: String(rv[r][SH.recv.IN.staff - 1] || ''),
        note: String(rv[r][SH.recv.IN.note - 1] || '')
      });
    }
  }

  /* ขายออก — รายการสินค้าของออเดอร์ ผูกวันที่กับหัวบิล */
  var hs = sheet_('head');
  var hLast = formulaLimit_('head');
  var head = {};
  if (hLast >= DATA_ROW) {
    var hv = hs.getRange(DATA_ROW, 1, hLast - DATA_ROW + 1, SH.head.IN.status).getValues();
    for (var h = 0; h < hv.length; h++) {
      var hno = String(hv[h][SH.head.IN.no - 1] || '').trim();
      if (!hno) continue;
      var hd = hv[h][SH.head.IN.date - 1];
      head[hno] = {
        date: hd instanceof Date ? isoDate_(hd) : String(hd || ''),
        channel: String(hv[h][SH.head.IN.channel - 1] || ''),
        cust: String(hv[h][SH.head.IN.cust - 1] || ''),
        status: String(hv[h][SH.head.IN.status - 1] || '')
      };
    }
  }
  var is = sheet_('item');
  var iLast = formulaLimit_('item');
  if (iLast >= DATA_ROW) {
    var iv = is.getRange(DATA_ROW, 1, iLast - DATA_ROW + 1, SH.item.lot).getValues();
    for (var k = 0; k < iv.length; k++) {
      var ino = String(iv[k][SH.item.IN.no - 1] || '').trim();
      var isku = String(iv[k][SH.item.IN.sku - 1] || '').trim();
      if (!ino || !isku) continue;
      var hh = head[ino] || { date: '', channel: '', cust: '', status: '' };
      out.push({
        date: hh.date, kind: 'out', type: hh.channel || 'ขายออก',
        sku: isku, name: names[isku] || String(iv[k][4] || ''),
        qty: -Number(iv[k][SH.item.IN.qty - 1] || 0),
        ref: ino, by: hh.cust, note: hh.status,
        lot: String(iv[k][SH.item.lot - 1] || '')
      });
    }
  }

  var rows = out.filter(function (m) {
    if (wantSku && m.sku !== wantSku) return false;
    if (from && m.date && m.date < from) return false;
    if (to && m.date && m.date > to) return false;
    return true;
  });
  rows.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.kind < b.kind ? 1 : -1;
  });
  return { moves: rows.slice(0, limit), total: rows.length };
}
