/**
 * โหมดแก้ไขร้าน — ฝั่งพนักงาน
 *
 * ทำไมต้องมี: ทุกอย่างที่หน้าร้านใช้อยู่ในชีทหมดแล้ว แก้ในชีทได้ตรง ๆ
 * แต่งานที่ทำบ่อยที่สุด (เปลี่ยนแบนเนอร์ · ใส่รูปสินค้า · ติดป้ายสินค้าแนะนำ)
 * เป็นงานที่ต้องทำจากมือถือ ระหว่างยืนอยู่หน้าชั้นของ ไม่ใช่นั่งหน้าคอม
 * และการเปิดชีท 17 คอลัมน์บนมือถือแล้วเลื่อนหาคอลัมน์ O คือเรื่องที่ทำไม่ได้จริง
 *
 * ---------------------------------------------------------------------------
 * ความปลอดภัย
 * ---------------------------------------------------------------------------
 * ทุกฟังก์ชันในไฟล์นี้เรียก requireStaff_() เป็นบรรทัดแรก ห้ามมีข้อยกเว้น
 * ไฟล์นี้เขียนลงชีทได้ ถ้าหลุดให้ลูกค้าเรียกได้ ใครก็แก้ราคาสินค้าได้
 *
 * และห้ามรับ "ชื่อชีท" จากฝั่งหน้าจอเด็ดขาด — ระบุ key เองในโค้ดเท่านั้น
 * เลขแถวที่รับมาต้องตรวจว่าอยู่ในช่วงข้อมูลจริงก่อนใช้ทุกครั้ง
 * ทุกการเขียนไปผ่าน writeRow_() ซึ่งกันช่องสูตรไว้ให้อยู่แล้ว
 */

/** ทุกอย่างที่หน้าโหมดแก้ไขต้องใช้ ดึงรอบเดียวจบ */
function getShopEdit() {
  requireStaff_();
  return {
    ok: true,
    products: editProducts_(),
    banners: editBanners_(),
    cats: editCats_(),
    slots: BAN_SLOTS,
    tags: PROD_TAGS,
    look: editLook_()
  };
}

function editProducts_() {
  var all = readProducts_();
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var p = all[i];
    if (!p.sku) continue;
    out.push({
      sku: p.sku,
      name: p.name,
      group: p.group,
      unit: p.unit,
      price: Number(p.price) || 0,
      web: String(p.web == null ? '' : p.web).trim(),
      hidden: shopHidden_(p.web),
      img: String(p.img || ''),
      img2: String(p.img2 || ''),
      /* ส่งทั้งลิงก์ดิบและลิงก์ที่แปลงแล้ว — ช่องกรอกโชว์ตัวดิบให้แก้ได้
         รูปตัวอย่างข้าง ๆ ใช้ตัวที่แปลงแล้ว จะได้เห็นทันทีว่าลิงก์นี้ขึ้นจริงไหม */
      show: shopImgs_(p),
      tag: String(p.tag || '')
    });
  }
  return out;
}

function editBanners_() {
  var out = [];
  var rows = shopRows_('ban');
  var IN = SH.ban.IN;
  for (var i = 0; i < rows.length; i++) {
    var img = String(rows[i][IN.img - 1] || '').trim();
    var slot = String(rows[i][IN.slot - 1] || '').trim();
    if (!img && !slot) continue;
    out.push({
      row: DATA_ROW + i,
      slot: slot,
      title: String(rows[i][IN.title - 1] || ''),
      img: img,
      show: shopImg_(img),
      btn: String(rows[i][IN.btn - 1] || ''),
      href: String(rows[i][IN.href - 1] || ''),
      on: String(rows[i][IN.on - 1] || '').trim() === 'เปิด',
      note: String(rows[i][IN.note - 1] || '')
    });
  }
  return out;
}

function editCats_() {
  var out = [];
  var rows = shopRows_('scat');
  var IN = SH.scat.IN;
  for (var i = 0; i < rows.length; i++) {
    var g = String(rows[i][IN.group - 1] || '').trim();
    if (!g) continue;
    var icon = String(rows[i][IN.icon - 1] || '').trim();
    var cover = String(rows[i][IN.cover - 1] || '').trim();
    out.push({
      row: DATA_ROW + i,
      group: g,
      label: String(rows[i][IN.label - 1] || ''),
      icon: icon, iconShow: shopImg_(icon),
      cover: cover, coverShow: shopImg_(cover),
      home: String(rows[i][IN.home - 1] || '').trim() !== 'ซ่อน'
    });
  }
  return out;
}

function editLook_() {
  var c = appCfg_();
  return {
    logo: String(c.shopLogo || ''), logoShow: shopImg_(c.shopLogo),
    cover: String(c.shopCover || ''), coverShow: shopImg_(c.shopCover),
    map: String(c.shopMap || ''),
    open: c.shopOpen !== false,
    mode: c.shopMode
  };
}

/* ------------------------------------------------------------------ สินค้า */

/**
 * แก้ข้อมูลหน้าร้านของสินค้าหนึ่งตัว
 *
 * หาแถวจาก "รหัสสินค้า" ไม่ใช่จากเลขแถวที่หน้าจอส่งมา
 * เลขแถวที่หน้าจอถืออยู่เป็นของตอนโหลด ถ้าระหว่างนั้นมีคนแทรกแถวในชีท
 * เลขนั้นจะชี้ไปคนละตัว แล้วรูปกับราคาจะไปลงผิดสินค้าโดยไม่มีใครรู้
 */
function saveShopProduct(p) {
  var email = requireStaff_();
  if (!p || !p.sku) throw new Error('ไม่ได้บอกว่าจะแก้สินค้าตัวไหน');

  var sku = String(p.sku).trim();
  var hit = null;
  var all = readProducts_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].sku === sku) { hit = all[i]; break; }
  }
  if (!hit) throw new Error('ไม่เจอรหัส ' + sku + ' ในชีท ' + SH.prod.name);

  var obj = {}, changed = [];

  if (p.web !== undefined) {
    var web = shopHidden_(p.web) ? 'ไม่' : '';
    if (web !== String(hit.web == null ? '' : hit.web).trim()) {
      obj.web = web; changed.push(['ขายหน้าเว็บ', hit.web, web || '(ขาย)']);
    }
  }
  ['img', 'img2'].forEach(function (f) {
    if (p[f] === undefined) return;
    var v = String(p[f] || '').trim();
    if (v === String(hit[f] || '').trim()) return;
    obj[f] = v;
    changed.push([f === 'img' ? 'ลิงก์รูป 1' : 'ลิงก์รูป 2', hit[f], v]);
  });
  if (p.tag !== undefined) {
    /* เก็บเป็นข้อความคั่นจุลภาค รูปแบบเดียวกับที่คนพิมพ์เองในชีท
       จะได้แก้ในชีทกับแก้ในแอปสลับกันได้ ไม่ต้องเลือกว่าจะใช้ทางไหนทางเดียว */
    var tag = shopTags_(p.tag).filter(function (t) { return PROD_TAGS.indexOf(t) > -1 })
      .join(', ');
    if (tag !== String(hit.tag || '').trim()) {
      obj.tag = tag; changed.push(['ป้ายหน้าร้าน', hit.tag, tag || '(ไม่มีป้าย)']);
    }
  }
  if (p.price !== undefined && p.price !== '' && p.price !== null) {
    var price = Number(p.price);
    if (!(price >= 0) || !isFinite(price)) throw new Error('ราคาต้องเป็นตัวเลข');
    if (price !== Number(hit.price)) {
      obj.price = price; changed.push(['ราคาขาย', hit.price, price]);
    }
  }

  if (!changed.length) return { ok: true, changed: 0 };

  writeRow_('prod', hit.row, obj);
  for (var k = 0; k < changed.length; k++) {
    writeLog_(email, 'แก้ไข', SH.prod.name, sku, changed[k][0],
      changed[k][1], changed[k][2], 'แก้จากโหมดแก้ไขร้าน');
  }
  return { ok: true, changed: changed.length };
}

/* --------------------------------------------------------------- แบนเนอร์ */

function saveShopBanner(b) {
  var email = requireStaff_();
  if (!b) throw new Error('ไม่มีข้อมูลแบนเนอร์');

  var slot = pickFrom_(b.slot, BAN_SLOTS, 'ตำแหน่งแบนเนอร์');
  var img = String(b.img || '').trim();
  if (!img) throw new Error('ต้องใส่ลิงก์รูปก่อน แบนเนอร์ที่ไม่มีรูปจะไม่ขึ้นหน้าร้าน');
  if (!shopImg_(img)) {
    throw new Error('ลิงก์รูปนี้ใช้ไม่ได้ — ต้องเป็นลิงก์แชร์ Google ไดรฟ์ ' +
      'หรือที่อยู่รูปที่ขึ้นต้นด้วย https://');
  }
  var href = String(b.href || '').trim();
  if (href && !shopHref_(href)) {
    throw new Error('ลิงก์ปุ่มใช้ไม่ได้ — ใส่ได้สามแบบ: ที่อยู่เว็บ https:// · ' +
      'หมวด:ชื่อหมวด · สินค้า:รหัสสินค้า');
  }

  var row = editBanRow_(b.row);
  var fresh = !row;
  if (fresh) row = editFreeRow_('ban', SH.ban.IN.img, BAN_LAST);

  writeRow_('ban', row, {
    slot: slot,
    title: String(b.title || '').trim(),
    img: img,
    btn: String(b.btn || '').trim(),
    href: href,
    on: b.on ? 'เปิด' : 'ปิด',
    note: String(b.note || '').trim()
  });
  writeLog_(email, fresh ? 'เพิ่ม' : 'แก้ไข', SH.ban.name, String(row), 'แบนเนอร์',
    '', slot + ' · ' + (b.on ? 'เปิด' : 'ปิด'), 'แก้จากโหมดแก้ไขร้าน');
  return { ok: true, row: row, fresh: fresh };
}

/**
 * ลบแบนเนอร์ = ล้างค่าในช่องกรอกของแถวนั้น ไม่ใช่ลบทั้งแถว
 *
 * ลบทั้งแถวทีไร สูตรของชีทอื่นที่ชี้มาจะพังทุกที — เคยเกิดมาแล้วกับ ฐานสินค้า
 * ตอนนั้น สต๊อกคงเหลือ พังไป 38 แถวเป็น #REF! และมูลค่าสต๊อกดูไม่ได้ทั้งชีท
 */
function deleteShopBanner(row) {
  var email = requireStaff_();
  var r = editBanRow_(row);
  if (!r) throw new Error('ไม่เจอแบนเนอร์แถวนี้');
  var was = sheet_('ban').getRange(r, SH.ban.IN.slot).getValue();
  clearRow_('ban', r);
  writeLog_(email, 'ลบ', SH.ban.name, String(r), 'แบนเนอร์', String(was || ''), '',
    'ลบจากโหมดแก้ไขร้าน');
  return { ok: true };
}

/** เลขแถวที่หน้าจอส่งมา ต้องอยู่ในช่วงข้อมูลของชีทแบนเนอร์เท่านั้น */
function editBanRow_(row) {
  var r = Number(row);
  if (!r || !isFinite(r)) return 0;
  r = Math.floor(r);
  if (r < DATA_ROW || r > BAN_LAST) {
    throw new Error('เลขแถว ' + row + ' ไม่อยู่ในชีท ' + SH.ban.name);
  }
  return r;
}

/** แถวว่างแถวแรกถัดจากข้อมูลที่มีอยู่ */
function editFreeRow_(key, col, lastRow) {
  var s = sheet_(key);
  var n = lastRow - DATA_ROW + 1;
  var v = s.getRange(DATA_ROW, col, n, 1).getValues();
  for (var i = 0; i < n; i++) {
    if (!String(v[i][0] || '').trim()) return DATA_ROW + i;
  }
  throw new Error('ชีท ' + SH[key].name + ' เต็มแล้ว (' + n + ' แถว) ' +
    'ลบของเก่าที่ไม่ใช้ออกก่อน');
}

/* ------------------------------------------------------------------ หมวด */

/**
 * แก้รูปและชื่อที่โชว์ของหมวด
 *
 * หาแถวจากชื่อหมวด ไม่ใช่เลขแถว ด้วยเหตุผลเดียวกับสินค้า
 * หมวดที่ยังไม่มีแถวในชีท ให้เติมแถวใหม่ให้เลย จะได้ไม่ต้องไปสั่งฟังก์ชันตั้งค่าอีกรอบ
 */
function saveShopCat(c) {
  var email = requireStaff_();
  if (!c || !String(c.group || '').trim()) throw new Error('ไม่ได้บอกว่าจะแก้หมวดไหน');
  var group = String(c.group).trim();

  ['icon', 'cover'].forEach(function (f) {
    var v = String(c[f] || '').trim();
    if (v && !shopImg_(v)) {
      throw new Error((f === 'icon' ? 'ลิงก์รูปไอคอน' : 'ลิงก์รูปปก') +
        ' ใช้ไม่ได้ — ต้องเป็นลิงก์แชร์ Google ไดรฟ์ หรือที่อยู่รูปที่ขึ้นต้นด้วย https://');
    }
  });

  var row = 0;
  var rows = shopRows_('scat');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][SH.scat.IN.group - 1] || '').trim() === group) {
      row = DATA_ROW + i; break;
    }
  }
  var fresh = !row;
  if (fresh) row = editFreeRow_('scat', SH.scat.IN.group, SCAT_LAST);

  writeRow_('scat', row, {
    group: group,
    label: String(c.label || '').trim(),
    icon: String(c.icon || '').trim(),
    cover: String(c.cover || '').trim(),
    home: c.home === false ? 'ซ่อน' : 'โชว์'
  });
  writeLog_(email, fresh ? 'เพิ่ม' : 'แก้ไข', SH.scat.name, group, 'หมวดหน้าร้าน',
    '', (c.home === false ? 'ซ่อน' : 'โชว์'), 'แก้จากโหมดแก้ไขร้าน');
  return { ok: true, row: row, fresh: fresh };
}

/* ------------------------------------------------------- หน้าตาหัวหน้าร้าน */

/** โลโก้ ภาพหัว ลิงก์แผนที่ — สามแถวในชีท ตั้งค่าแอป */
function saveShopLook(v) {
  var email = requireStaff_();
  if (!v) throw new Error('ไม่มีข้อมูล');

  var WANT = [
    ['โลโก้ร้าน (ลิงก์รูป)', 'logo', 1],
    ['ภาพหัวหน้าร้าน (ลิงก์รูป)', 'cover', 1],
    ['ลิงก์แผนที่ร้าน', 'map', 0]
  ];
  for (var i = 0; i < WANT.length; i++) {
    var f = WANT[i][1], isImg = WANT[i][2];
    if (v[f] === undefined) continue;
    var t = String(v[f] || '').trim();
    if (!t) continue;
    if (isImg && !shopImg_(t)) {
      throw new Error(WANT[i][0] + ' ใช้ไม่ได้ — ต้องเป็นลิงก์แชร์ Google ไดรฟ์ ' +
        'หรือที่อยู่รูปที่ขึ้นต้นด้วย https://');
    }
    if (!isImg && !/^https:\/\//.test(t)) {
      throw new Error(WANT[i][0] + ' ต้องขึ้นต้นด้วย https://');
    }
  }

  var s = findSheet_(ss_(), SH.app.name);
  if (!s) throw new Error('ไม่เจอชีท ' + SH.app.name + ' — สั่ง setup ก่อน');

  var last = Math.max(DATA_ROW, s.getLastRow());
  var names = s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, 1).getValues();
  var n = 0;
  for (var k = 0; k < WANT.length; k++) {
    if (v[WANT[k][1]] === undefined) continue;
    var row = 0;
    for (var r = 0; r < names.length; r++) {
      if (String(names[r][0] || '').trim() === WANT[k][0]) { row = DATA_ROW + r; break; }
    }
    if (!row) throw new Error('ไม่เจอแถว "' + WANT[k][0] + '" ในชีท ' + SH.app.name +
      ' — สั่ง setupShopColumns ก่อนหนึ่งครั้ง');
    var before = s.getRange(row, 2).getValue();
    var after = String(v[WANT[k][1]] || '').trim();
    if (String(before || '').trim() === after) continue;
    s.getRange(row, 2).setValue(after);
    writeLog_(email, 'แก้ไข', SH.app.name, WANT[k][0], 'ค่า', before, after,
      'แก้จากโหมดแก้ไขร้าน');
    n++;
  }
  return { ok: true, changed: n };
}
