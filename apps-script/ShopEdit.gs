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

/**
 * ข้อมูลของหน้าโหมดแก้ไข — ดึงเฉพาะส่วนที่หน้านั้นใช้จริง
 *
 * ของเดิมดึงทุกอย่างรอบเดียว ซึ่งแปลว่าหน้า "หน้าตาหัวร้าน" ที่มีสามช่อง
 * ต้องรออ่านสินค้า 119 ตัวกับชีทสต๊อกทั้งใบก่อนถึงจะขึ้น รอเป็นสิบวินาที
 * บนเน็ตมือถือยิ่งนานกว่านั้น จนดูเหมือนแอปค้าง
 *
 * scope รับได้: look · ban · cat · prod · all
 * ค่าที่ไม่รู้จักถือเป็น all เพื่อให้หน้าจอรุ่นเก่าที่ไม่ได้ส่ง scope มายังใช้ได้
 */
function getShopEdit(scope) {
  requireStaff_();
  var what = String(scope || 'all').trim();
  var all = (what !== 'look' && what !== 'ban' && what !== 'cat' && what !== 'prod');

  var out = { ok: true, scope: all ? 'all' : what, slots: BAN_SLOTS, tags: PROD_TAGS };
  if (all || what === 'look') out.look = editLook_();
  if (all || what === 'ban') out.banners = editBanners_();
  if (all || what === 'cat') out.cats = editCats_();
  if (all || what === 'prod') {
    out.products = editProducts_();
    /* หน้าจอต้องมีรายชื่อหมวดที่มีอยู่ให้เลือก ไม่งั้นต้องพิมพ์เองทุกครั้ง
       แล้วพิมพ์ผิดตัวเดียวก็ได้หมวดใหม่ที่มีสินค้าอยู่ตัวเดียวโดยไม่ตั้งใจ */
    var g = {}, gl = [];
    for (var i = 0; i < out.products.length; i++) {
      var n = String(out.products[i].group || '').trim();
      if (!n || g[n]) continue;
      g[n] = 1; gl.push(n);
    }
    out.groups = gl.sort();
  }
  return out;
}

function editProducts_() {
  /* ไม่ต้องอ่านชีทสต๊อก หน้านี้ไม่ได้โชว์ยอดคงเหลือ และชีทนั้นเป็นสูตรทั้งใบ อ่านช้า */
  var all = readProducts_(true);
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
  var live = groupCounts_();
  var seen = {};
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
      home: String(rows[i][IN.home - 1] || '').trim() !== 'ซ่อน',
      /* หมวดที่ยังไม่มีสินค้าเลย หน้าจอต้องบอกให้เห็น ไม่งั้นเจ้าของร้าน
         ตั้งหมวดใส่รูปเสร็จสวยงาม แล้วไปดูหน้าร้านไม่เจอ โดยไม่รู้ว่าเพราะอะไร
         (กติกาคือหมวดที่ไม่มีของขาย ไม่โชว์ให้ลูกค้า กดเข้าไปแล้วเจอหน้าว่าง
          ทำให้ลูกค้าคิดว่าเว็บเสีย) */
      n: live[g] || 0
    });
    seen[g] = 1;
  }

  /* หมวดที่มีสินค้าอยู่จริง แต่ยังไม่มีแถวในชีท หมวดหน้าร้าน ก็ต้องโชว์ให้แก้ได้
     ไม่งั้นเพิ่มหมวดใหม่จากหน้าสินค้าแล้วมาหาที่หน้าหมวดไม่เจอ */
  for (var g2 in live) {
    if (seen[g2]) continue;
    out.push({ row: 0, group: g2, label: '', icon: '', iconShow: '',
               cover: '', coverShow: '', home: true, n: live[g2] });
  }
  return out;
}

/** จำนวนสินค้าในแต่ละหมวด — อ่านแค่คอลัมน์หมวดของ ฐานสินค้า ไม่ลากทั้งชีท */
function groupCounts_() {
  var out = {};
  try {
    var s = sheet_('prod');
    var last = dataLast_('prod');
    if (last < DATA_ROW) return out;
    var v = s.getRange(DATA_ROW, SH.prod.IN.group, last - DATA_ROW + 1, 1).getValues();
    for (var i = 0; i < v.length; i++) {
      var g = String(v[i][0] || '').trim();
      if (g) out[g] = (out[g] || 0) + 1;
    }
  } catch (e) {
    Logger.log('นับสินค้าตามหมวดไม่ได้: ' + e.message);
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
  if (p.group !== undefined) {
    var grp = shopGroupName_(p.group);
    if (grp !== String(hit.group || '').trim()) {
      obj.group = grp; changed.push(['หมวด', hit.group, grp]);
    }
  }
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

/**
 * ชื่อหมวดที่ยอมให้บันทึก
 *
 * หมวดเป็นช่องกรอกธรรมดาในชีท พิมพ์อะไรลงไปก็ได้ แต่ชื่อหมวดคือกุญแจที่ใช้
 * จับคู่กับชีท หมวดหน้าร้าน และใช้จัดกลุ่มบนหน้าร้าน เว้นวรรคหน้าหลังเกินมาตัวเดียว
 * ก็กลายเป็นคนละหมวดทันที โดยที่ตาคนมองไม่เห็นความต่าง จึงต้องตัดให้สะอาดก่อนเสมอ
 */
function shopGroupName_(v) {
  var t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (t.length > 60) throw new Error('ชื่อหมวดยาวเกินไป (เกิน 60 ตัวอักษร)');
  return t;
}

/**
 * ย้ายสินค้าหลายตัวไปหมวดเดียวกันในครั้งเดียว
 *
 * ทำไมต้องมี: ร้านนี้มีสินค้า 119 ตัวแต่มีหมวดแค่ 3 หมวด แก้ทีละตัวคือ 119 รอบ
 * ซึ่งไม่มีใครทำจริง แล้วหน้าร้านก็จะมีหมวดสามหมวดไปตลอด
 * ท่าที่ใช้ได้จริงคือค้นชื่อ ("Endmill Corn") แล้วย้ายทั้งชุดทีเดียว
 *
 * เพดาน 200 ตัวต่อครั้ง เพราะเขียนทีละช่อง เกินกว่านี้ Apps Script จะหมดเวลาเอง
 * แล้วจะเหลือของที่ย้ายไปครึ่งเดียวโดยไม่มีใครรู้ว่าค้างตรงไหน
 */
var MOVE_MAX = 200;

function moveShopCategory(p) {
  var email = requireStaff_();
  if (!p || !p.skus || !p.skus.length) throw new Error('ยังไม่ได้เลือกสินค้า');
  var group = shopGroupName_(p.group);
  if (!group) throw new Error('ยังไม่ได้ใส่ชื่อหมวด');
  if (p.skus.length > MOVE_MAX) {
    throw new Error('ย้ายได้ครั้งละไม่เกิน ' + MOVE_MAX + ' ตัว — ' +
      'ค้นให้แคบลงแล้วย้ายเป็นชุด ๆ');
  }

  var want = {};
  for (var i = 0; i < p.skus.length; i++) want[String(p.skus[i]).trim()] = 1;

  var all = readProducts_(true);
  var moved = 0, same = 0, miss = [];
  var seen = {};
  for (var k = 0; k < all.length; k++) {
    if (!want[all[k].sku]) continue;
    seen[all[k].sku] = 1;
    if (String(all[k].group || '').trim() === group) { same++; continue; }
    writeRow_('prod', all[k].row, { group: group });
    writeLog_(email, 'แก้ไข', SH.prod.name, all[k].sku, 'หมวด',
      all[k].group, group, 'ย้ายหมวดเป็นชุดจากโหมดแก้ไขร้าน');
    moved++;
  }
  for (var w in want) if (!seen[w]) miss.push(w);

  return { ok: true, moved: moved, same: same, miss: miss, group: group };
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
    ['โลโก้ร้าน (ลิงก์รูป)', 'logo', 1,
      'โลโก้กลม ๆ บนหัวหน้าร้าน เว้นว่างได้'],
    ['ภาพหัวหน้าร้าน (ลิงก์รูป)', 'cover', 1,
      'ภาพพื้นหลังด้านบนสุดของหน้าร้าน เว้นว่าง = ใช้พื้นหลังไล่สีฟ้าของระบบ'],
    ['ลิงก์แผนที่ร้าน', 'map', 0,
      'ลิงก์ Google Maps ของหน้าร้าน เว้นว่าง = ระบบเอาที่อยู่ผู้ส่งไปค้นให้เอง']
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
    /* ยังไม่มีแถวนี้ในชีท ให้เติมให้เลย ไม่ใช่โยน error ไล่ให้ไปสั่งฟังก์ชันตั้งค่า
       เจ้าของร้านไม่ควรต้องรู้ว่าแถวไหนถูกสร้างโดยฟังก์ชันชื่ออะไร
       และตอนนั้นเขาอัปรูปไปแล้ว การบอกให้ไปทำอย่างอื่นก่อนคือทิ้งงานที่ทำมาแล้ว */
    if (!row) {
      row = Math.max(DATA_ROW - 1, s.getLastRow()) + 1;
      s.getRange(row, 1).setValue(WANT[k][0]);
      s.getRange(row, 2).setNote(WANT[k][3]);
      names = s.getRange(DATA_ROW, 1, Math.max(1, s.getLastRow() - DATA_ROW + 1), 1).getValues();
    }
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

/* ------------------------------------------------------- อัปโหลดรูปจากเครื่อง */

var SHOPIMG_FOLDER_PROP = 'SHOPIMG_FOLDER_ID';
var SHOPIMG_FOLDER_NAME = 'AST_รูปหน้าร้าน';

/** รับเฉพาะรูป — PDF ใส่เป็นรูปสินค้าไม่ได้ เบราว์เซอร์แสดงใน <img> ไม่ขึ้น */
var SHOPIMG_MIME = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif'
};
var SHOPIMG_MAX_BYTES = 8 * 1024 * 1024;

/** ชื่อไฟล์ให้อ่านออกว่าเป็นรูปของอะไร เผื่อวันหลังต้องไปหาในไดรฟ์ */
var SHOPIMG_KIND = {
  logo: 'โลโก้', cover: 'ภาพหัวร้าน', prod: 'สินค้า',
  ban: 'แบนเนอร์', icon: 'ไอคอนหมวด', cat: 'ปกหมวด'
};

/**
 * อัปรูปจากเครื่องขึ้นไดรฟ์ แล้วคืนลิงก์ที่หน้าร้านใช้ได้ทันที
 *
 * ทำไมต้องมี: ของเดิมให้เจ้าของร้านไปอัปขึ้นไดรฟ์เอง → ตั้งแชร์เอง → ก๊อปลิงก์มาวางเอง
 * สามขั้นนั้นทำบนคอมยังน่าเบื่อ ทำบนมือถือคือแทบเป็นไปไม่ได้
 * และขั้น "ตั้งแชร์เป็นทุกคนที่มีลิงก์" คือขั้นที่คนลืมบ่อยที่สุด
 * ลืมแล้วรูปไม่ขึ้นบนหน้าร้าน โดยไม่มีอะไรบอกว่าเพราะอะไร
 *
 * ตัวนี้ตั้งแชร์ให้เองตั้งแต่ตอนอัป จึงไม่มีทางลืม
 */
function uploadShopImage(p) {
  var email = requireStaff_();
  if (!p) throw new Error('ไม่มีไฟล์ส่งมา');

  var m = /^data:([^;]+);base64,(.*)$/.exec(String(p.data || ''));
  if (!m) throw new Error('ยังไม่ได้เลือกรูป หรือไฟล์อ่านไม่ออก');

  var mime = String(m[1]).toLowerCase();
  var ext = SHOPIMG_MIME[mime];
  if (!ext) {
    throw new Error('ไฟล์ชนิด ' + mime + ' ใส่เป็นรูปสินค้าไม่ได้ — ' +
      'รับเฉพาะรูป JPG · PNG · WEBP · HEIC');
  }

  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > SHOPIMG_MAX_BYTES) {
    throw new Error('รูปใหญ่ ' + Math.round(bytes.length / 1024 / 1024 * 10) / 10 +
      ' MB เกิน 8 MB — ย่อรูปก่อนแล้วลองใหม่');
  }

  var kind = SHOPIMG_KIND[String(p.kind || '').trim()] || 'รูป';
  var tag = String(p.tag || '').trim().replace(/[\\\/:*?"<>|]/g, ' ').slice(0, 40);
  var stamp = Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss');
  var fname = kind + (tag ? ' ' + tag : '') + ' ' + stamp + '.' + ext;

  var file = driveDo_('เก็บรูปหน้าร้าน', function () {
    return shopImgFolder_().createFile(Utilities.newBlob(bytes, mime, fname));
  });

  /* ขั้นที่ขาดไม่ได้ — ลูกค้าเปิดหน้าร้านแบบไม่ล็อกอิน ไดรฟ์จะไม่ยอมให้ดู
     ถ้าไม่ตั้งตรงนี้ รูปจะขึ้นเฉพาะบนจอของเจ้าของร้าน แล้วนึกว่าเรียบร้อยแล้ว */
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    /* บาง Workspace ปิดการแชร์ออกนอกองค์กรไว้ ลบไฟล์ทิ้งแล้วบอกให้ชัด
       ปล่อยไฟล์ที่คนนอกเปิดไม่ได้ค้างไว้ = เจ้าของร้านเห็นรูปขึ้น ลูกค้าเห็นกรอบเปล่า */
    try { file.setTrashed(true); } catch (e2) {}
    throw new Error('อัปรูปได้ แต่ตั้งให้คนนอกดูไม่ได้ — ' +
      'ผู้ดูแล Google Workspace ปิดการแชร์ลิงก์สาธารณะไว้\n' +
      'ให้เปิดสิทธิ์แชร์ก่อน หรือเอารูปไปฝากที่อื่นแล้ววางลิงก์แทน\n' +
      '(ข้อความจาก Google: ' + e.message + ')');
  }

  var url = 'https://drive.google.com/file/d/' + file.getId() + '/view';
  writeLog_(email, 'เพิ่ม', 'ไดรฟ์', file.getId(), 'อัปรูปหน้าร้าน', '', fname, '');

  /* คืนทั้งลิงก์ที่เก็บลงชีท และที่อยู่รูปจริงสำหรับโชว์ตัวอย่างทันที
     จะได้ไม่ต้องรอบันทึกก่อนถึงจะรู้ว่ารูปขึ้นไหม */
  return { ok: true, url: url, show: shopImg_(url), name: fname };
}

/** โฟลเดอร์เก็บรูปหน้าร้าน อยู่ที่เดียวกับไฟล์ชีท — หาครั้งเดียวแล้วจำไว้ */
function shopImgFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty(SHOPIMG_FOLDER_PROP) || '').trim();
  if (id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) { props.deleteProperty(SHOPIMG_FOLDER_PROP); }
  }
  var parent = null;
  try {
    var it = DriveApp.getFileById(SHEET_ID).getParents();
    if (it.hasNext()) parent = it.next();
  } catch (e2) { parent = null; }
  var f = driveDo_('สร้างโฟลเดอร์เก็บรูปหน้าร้าน', function () {
    return parent ? parent.createFolder(SHOPIMG_FOLDER_NAME)
                  : DriveApp.createFolder(SHOPIMG_FOLDER_NAME);
  });
  props.setProperty(SHOPIMG_FOLDER_PROP, f.getId());
  return f;
}
