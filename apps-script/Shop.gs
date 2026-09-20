/**
 * หน้าร้านที่ลูกค้าเปิดเองได้ — อ่านสินค้าจากชีท ไม่ใช่จากไฟล์ที่ต้องมาวางใหม่ทุกครั้ง
 *
 * ทำไมต้องอยู่ใน Apps Script ไม่ใช่ไฟล์ .html บน GitHub Pages
 *   ไฟล์บน Pages เก็บสินค้าไว้ในตัวไฟล์ แก้ราคาทีต้องปล่อยไฟล์ใหม่ทั้งก้อน
 *   และเขียนออเดอร์กลับเข้าชีทไม่ได้ (ยิงข้ามโดเมนไปหา Apps Script ติด CORS)
 *   อยู่ในนี้แล้วราคาเปลี่ยนที่ชีทที่เดียว หน้าร้านเปลี่ยนตามทันที
 *
 * ---------------------------------------------------------------------------
 * ความปลอดภัย — อ่านก่อนแก้ไฟล์นี้
 * ---------------------------------------------------------------------------
 * ลิงก์ที่ลูกค้าเปิดคือ deploy ตัวที่ตั้ง "ทำงานในชื่อ: ฉัน" + "ใครเข้าถึงได้: ทุกคน"
 * ซึ่งแปลว่าโค้ดทุกบรรทัดในโปรเจกต์นี้รันด้วยสิทธิ์ของเจ้าของร้าน
 *
 * ด่านที่กันไว้คือ requireStaff_() — ตอนลูกค้าเปิดแบบไม่ล็อกอิน
 * Session.getActiveUser().getEmail() คืนค่าว่าง ด่านจึงโยน error ทิ้งทุกครั้ง
 * ฟังก์ชันฝั่งพนักงานทุกตัวเรียกด่านนี้เป็นบรรทัดแรก ลูกค้าจึงเรียกไม่ได้
 *
 * ฟังก์ชันในไฟล์นี้ตั้งใจให้ "ไม่มีด่าน" เพราะลูกค้าต้องเรียกได้ กติกาจึงเป็น
 *   1. คืนเฉพาะช่องที่ลูกค้าควรเห็น — ห้ามคืนต้นทุน กำไร ยอดคงเหลือ หรือชื่อผู้ขาย
 *   2. ห้ามรับ "ชื่อชีท" หรือ "เลขแถว" จากฝั่งลูกค้า — ระบุเองในโค้ดเท่านั้น
 *   3. ทุกตัวที่เขียนลงชีท ต้องมีเพดานจำนวนและตรวจค่าที่รับมาให้ครบก่อนเขียน
 * มี t_shop.js คุมกติกาสามข้อนี้อยู่ ถ้าเผลอเปิดช่องใหม่ เทสต์จะฟ้อง
 */

/** ร้านเปิดรับออเดอร์จากหน้าเว็บอยู่ไหม — สวิตช์ปิดฉุกเฉินในชีท ตั้งค่าแอป */
function shopOpen_() {
  var c = appCfg_();
  return c.shopOpen !== false;
}

/**
 * สินค้าที่ลูกค้าเห็นบนหน้าร้าน
 *
 * ตัวไหนโผล่: มีรหัส มีชื่อ มีราคามากกว่าศูนย์ และช่อง "ขายหน้าเว็บ" ไม่ได้ปิดไว้
 * ช่องนั้นว่าง = ขาย เพื่อให้พฤติกรรมเท่าเดิมกับหน้าร้านชุดก่อนที่โชว์ทุกตัว
 * เจ้าของร้านค่อยไล่ปิดตัวที่ไม่อยากให้ลูกค้าเห็นทีหลัง
 */
function shopItems_() {
  var all = readProducts_();
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var p = all[i];
    if (!p.sku || !p.name) continue;
    if (!(Number(p.price) > 0)) continue;
    if (shopHidden_(p.web)) continue;
    out.push({
      sku: p.sku,
      name: p.name,
      group: p.group,
      unit: p.unit || 'ชิ้น',
      perPack: Number(p.perPack) || 1,
      price: Number(p.price),
      /* รูปได้สูงสุดสองรูปต่อสินค้า ช่องไหนว่างหรือใส่มั่วก็ตกไปเงียบ ๆ
         ส่ง img ตัวเดียวไปด้วย เพราะรูปเล็กในตะกร้าใช้แค่รูปแรกพอ */
      imgs: shopImgs_(p),
      img: shopImgs_(p)[0] || '',
      /* บอกแค่ "มี" หรือ "หมด" ไม่บอกว่าเหลือกี่ชิ้น
         จำนวนคงเหลือคือข้อมูลภายใน คู่แข่งอ่านได้ว่าเดือนหนึ่งขายไปเท่าไร */
      out: p.remain !== null && Number(p.remain) <= 0
    });
  }
  return out;
}

/**
 * ลิงก์รูปสินค้า — รับได้ทุกแบบที่เจ้าของร้านจะก๊อปมาวางจริง
 *
 * ลิงก์แชร์ของ Google ไดรฟ์ (drive.google.com/file/d/.../view) เอาไปใส่ <img> ตรง ๆ ไม่ขึ้น
 * เพราะมันคือหน้าเว็บของไดรฟ์ ไม่ใช่ตัวรูป — ต้องแปลงเป็นที่อยู่รูปจริงก่อน
 * ถ้าไม่แปลงให้ เจ้าของร้านจะวางลิงก์แล้วเจอกรอบเปล่า โดยไม่มีอะไรบอกว่าผิดตรงไหน
 *
 * รับ: ลิงก์แชร์ไดรฟ์ทุกหน้าตา · ลิงก์รูปธรรมดา (https://...jpg) · data: ที่ฝังรูปมาเลย
 * ไม่รับ: อย่างอื่นทั้งหมด คืนค่าว่าง ให้หน้าร้านขึ้นกรอบชื่อสินค้าแทน
 *         ปล่อยข้อความมั่ว ๆ ไปเป็น src จะได้ไอคอนรูปแตกซึ่งดูแย่กว่ากรอบเปล่า
 *
 * หมายเหตุสำคัญ: รูปในไดรฟ์ต้องตั้งแชร์เป็น "ทุกคนที่มีลิงก์ดูได้" ด้วย
 * ไม่งั้นลูกค้าที่ไม่ได้ล็อกอินจะเห็นเป็นกรอบเปล่าเหมือนเดิม
 */
/**
 * รูปทั้งชุดของสินค้าหนึ่งตัว — คอลัมน์ O แล้วตามด้วย P
 *
 * ทำไมเป็น array ไม่ใช่ img1 img2: หน้าร้านวนลูปตัวเดียวจบ ไม่ต้องเช็คว่ามีรูปที่สองไหม
 * และวันหลังถ้าเจ้าของร้านอยากได้รูปที่สาม เติมคอลัมน์กับบรรทัดเดียวในนี้ก็พอ
 *
 * ช่องที่ว่างหรือแปลงไม่ได้ ตกไปเลย ไม่เก็บช่องว่างไว้ในชุด
 * ไม่งั้นลูกค้าจะเลื่อนไปเจอรูปแตก ซึ่งดูแย่กว่ามีรูปเดียว
 * และถ้าใส่ลิงก์เดียวกันสองช่อง ตัดตัวซ้ำทิ้ง คนเผลอก๊อปวางซ้ำกันบ่อย
 */
function shopImgs_(p) {
  var out = [];
  [p && p.img, p && p.img2].forEach(function (v) {
    var u = shopImg_(v);
    if (u && out.indexOf(u) < 0) out.push(u);
  });
  return out;
}

function shopImg_(v) {
  var t = String(v == null ? '' : v).trim();
  if (!t) return '';
  if (t.indexOf('data:image/') === 0) return t;

  /* รหัสไฟล์ไดรฟ์ยาว 25 ตัวขึ้นไป เป็นตัวอักษร ตัวเลข ขีด และขีดล่าง
     เจอได้สามที่: /file/d/<id>/ · ?id=<id> · /d/<id> */
  var m = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{15,})/.exec(t)
       || /(?:drive|docs)\.google\.com\/\S*[?&]id=([A-Za-z0-9_-]{15,})/.exec(t)
       || /(?:drive|docs)\.google\.com\/\S*\/d\/([A-Za-z0-9_-]{15,})/.exec(t);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1000';

  /* googleusercontent เป็นที่อยู่รูปจริงอยู่แล้ว ปล่อยผ่าน */
  if (/^https:\/\//.test(t)) return t;
  return '';
}

/** ช่อง "ขายหน้าเว็บ" ปิดอยู่ไหม — ว่างคือขาย ต้องพิมพ์ปิดชัด ๆ เท่านั้นถึงจะซ่อน */
function shopHidden_(v) {
  var t = String(v == null ? '' : v).trim().toLowerCase();
  if (!t) return false;
  return t === 'ไม่' || t === 'ไม่ขาย' || t === 'ปิด' || t === 'ซ่อน' ||
         t === 'no' || t === 'n' || t === 'false' || t === '0';
}

/** หมวดสินค้าเรียงตามที่เจอในชีท — ชีทเรียงไว้ยังไง หน้าร้านเรียงตามนั้น */
function shopCats_(items) {
  var seen = {}, out = [];
  for (var i = 0; i < items.length; i++) {
    var g = String(items[i].group || '').trim();
    if (!g || seen[g]) continue;
    seen[g] = 1;
    out.push(g);
  }
  return out;
}

/**
 * ทุกอย่างที่หน้าร้านต้องใช้ในการเรียกครั้งเดียว
 *
 * เรียกทีเดียวจบเพราะ google.script.run แต่ละครั้งกินเวลาเป็นวินาที
 * ยิงสามครั้งแยกกันแปลว่าลูกค้ามองจอเปล่าสามวินาที
 */
function shopData() {
  var c = appCfg_();
  var items = shopItems_();
  return {
    ok: true,
    open: c.shopOpen !== false,
    shop: {
      name: c.head2 || c.sender.name || 'AST Chem-Tooling',
      full: c.head1 || '',
      line: c.line || '',
      tel: c.sender.tel || c.co.tel || '',
      addr: c.sender.addr || ''
    },
    ship: { fee: Number(c.shipFee) || 0, freeOver: Number(c.freeOver) || 0 },
    cats: shopCats_(items),
    items: items
  };
}

/**
 * หน้าร้านที่ลูกค้าเปิด — ?shop=1 ต่อท้ายลิงก์ตัวที่ deploy ให้คนนอกเข้าได้
 *
 * ไม่ใช้ template ที่แปะข้อมูลลงไปตั้งแต่ตอนสร้างหน้า เพราะสินค้ามีเป็นร้อยตัว
 * แปะไปกับหน้าแล้วหน้าจะหนักและแคชไม่ได้ ให้หน้าโหลดเสร็จแล้วค่อยขอ shopData()
 */
function shopPage_() {
  var out = HtmlService.createHtmlOutputFromFile('Shop')
    .setTitle('AST Chem-Tooling')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  try { out.setFaviconUrl(APP_ICON_URL); } catch (e) { Logger.log('ตั้งไอคอนไม่ได้: ' + e.message); }
  return out;
}

/* ===========================================================================
   ลูกค้ากดสั่งซื้อเอง
   ---------------------------------------------------------------------------
   เส้นทางเดียวกับที่พนักงานคีย์ทุกประการ — ใช้ planOrder_ / commitOrder_ /
   verifyOrder_ / rollback_ ตัวเดิม ออเดอร์จากเว็บจึงตัดล็อต FEFO คิดกำไร
   และตรวจยอดกับสูตรในชีทเหมือนกันหมด ไม่มีเส้นทางลัดที่ข้ามด่านพวกนั้น

   ต่างกันแค่สามข้อ และทั้งสามข้อคือเรื่องความปลอดภัย
     1. ราคาเอาจากชีทเสมอ ไม่เชื่อราคาที่ส่งมาจากเบราว์เซอร์แม้แต่ตัวเดียว
     2. ซื้อได้เฉพาะรหัสที่อยู่บนหน้าร้านจริง ๆ — ของที่ปิดขายหรือไม่มีในฐาน สั่งไม่ได้
        และห้ามใช้ช่องทาง "พิมพ์ชื่อสินค้าเอง" ของ planOrder_ เด็ดขาด
        ไม่งั้นคนนอกเพิ่มสินค้าเข้าฐานสินค้าของร้านได้จากเบราว์เซอร์ตัวเอง
     3. มีเพดานจำนวนบรรทัดและจำนวนชิ้น กันคนยิงรัวจนชีทเต็ม
   =========================================================================== */

var SHOP_MAX_LINES = 30;     // บรรทัดต่อออเดอร์
var SHOP_MAX_QTY = 999;      // ชิ้นต่อบรรทัด

/** ตัดช่องว่างหัวท้าย ตัดอักขระควบคุม และจำกัดความยาว */
function shopClean_(v, max) {
  var t = String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ');
  t = t.replace(/[ \t]+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) : t;
}

/** เบอร์ไทย 9-10 หลัก ขึ้นต้นศูนย์ — คนส่งของต้องโทรหาผู้รับได้จริง */
function shopTel_(v) {
  var d = String(v == null ? '' : v).replace(/\D/g, '');
  return /^0\d{8,9}$/.test(d) ? d : '';
}

/** ช่องทางขายของออเดอร์เว็บ — ใช้ของที่มีในชีทถ้าเจอ ไม่งั้นปล่อยให้ชีทเลือกตัวแรก */
function shopChannel_(list) {
  var want = ['เว็บไซต์', 'หน้าเว็บ', 'เว็บ', 'Website'];
  for (var w = 0; w < want.length; w++) {
    for (var i = 0; i < list.length; i++) if (list[i] === want[w]) return list[i];
  }
  return '';
}

/**
 * รับออเดอร์จากหน้าร้าน
 *
 * payload = { clientKey, cust, tel, addr, note, items:[{sku, qty}] }
 * คืน { ok, no, net, payUrl } — payUrl คือลิงก์หน้าจ่ายเงินของใบนั้น
 */
function shopOrder(payload) {
  var p = payload || {};

  if (!shopOpen_()) {
    throw new Error('ตอนนี้ร้านปิดรับออเดอร์ทางเว็บชั่วคราว — ทักไลน์ของร้านเพื่อสั่งซื้อได้เลย');
  }

  /* กันกดสองครั้งแล้วได้ออเดอร์สองใบ ลูกค้ากดซ้ำตอนเน็ตช้าเป็นเรื่องปกติมาก */
  var clientKey = shopClean_(p.clientKey, 64);
  if (!clientKey) throw new Error('คำขอไม่สมบูรณ์ ลองกดสั่งใหม่อีกครั้ง');

  var cust = shopClean_(p.cust, 120);
  if (cust.length < 2) throw new Error('กรุณาใส่ชื่อผู้รับ');

  var tel = shopTel_(p.tel);
  if (!tel) throw new Error('เบอร์โทรไม่ถูกต้อง — ใส่เบอร์มือถือ 10 หลัก เช่น 0812345678');

  var addr = shopClean_(p.addr, 400);
  if (addr.length < 10) throw new Error('กรุณาใส่ที่อยู่จัดส่งให้ครบ (บ้านเลขที่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์)');

  var note = shopClean_(p.note, 300);

  /* ------------------------------------------------ สินค้า: ยึดชีทเป็นหลัก */
  var onShelf = {};
  var shelf = shopItems_();
  for (var s = 0; s < shelf.length; s++) onShelf[shelf[s].sku] = shelf[s];

  var raw = p.items;
  if (!raw || !raw.length) throw new Error('ยังไม่ได้เลือกสินค้า');
  if (raw.length > SHOP_MAX_LINES) {
    throw new Error('สั่งได้ครั้งละไม่เกิน ' + SHOP_MAX_LINES + ' รายการ — ' +
      'ถ้าต้องการมากกว่านี้ ทักไลน์ของร้านได้เลย');
  }

  var merged = {}, order = [];
  for (var i = 0; i < raw.length; i++) {
    var sku = shopClean_(raw[i] && raw[i].sku, 40);
    var prod = onShelf[sku];
    if (!prod) throw new Error('สินค้าบางรายการไม่มีขายแล้ว กรุณารีเฟรชหน้าร้านแล้วเลือกใหม่');
    if (prod.out) throw new Error(prod.name + ' — สินค้าหมด กรุณาเอาออกจากตะกร้าก่อน');

    var qty = Number(raw[i].qty);
    if (!(qty > 0) || qty !== Math.floor(qty) || qty > SHOP_MAX_QTY) {
      throw new Error(prod.name + ' — จำนวนต้องเป็นจำนวนเต็ม 1 ถึง ' + SHOP_MAX_QTY);
    }

    /* สินค้าตัวเดียวกันมาสองบรรทัด รวมเป็นบรรทัดเดียว ใบจะได้อ่านง่าย */
    if (merged[sku] === undefined) { merged[sku] = order.length; order.push({ sku: sku, qty: 0 }); }
    order[merged[sku]].qty += qty;
    if (order[merged[sku]].qty > SHOP_MAX_QTY) {
      throw new Error(prod.name + ' — รวมแล้วเกิน ' + SHOP_MAX_QTY + ' ชิ้น');
    }
  }

  /* ราคาเอาจากชีท ไม่ใช่จากที่เบราว์เซอร์ส่งมา — นี่คือด่านสำคัญที่สุดของทั้งไฟล์
     ถ้าเชื่อราคาจากฝั่งลูกค้า ใครก็สั่งของ 890 บาทในราคา 1 บาทได้ */
  var items = [], sub = 0;
  for (var k = 0; k < order.length; k++) {
    var pr = onShelf[order[k].sku];
    items.push({ sku: pr.sku, qty: order[k].qty, price: pr.price });
    sub += pr.price * order[k].qty;
  }

  var cfg = appCfg_();
  var ship = (cfg.freeOver && sub >= Number(cfg.freeOver)) ? 0 : Number(cfg.shipFee) || 0;

  /* โหมด "เข้าคิวก่อน" — ยังไม่ใช่ออเดอร์ ไม่ออกเลข ไม่ตัดสต๊อก
     ลงไว้ในชีท คำขอสั่งซื้อ รอพนักงานตรวจแล้วกดรับ */
  if (cfg.shopMode !== 'direct') {
    return shopQueue_(clientKey, {
      cust: cust, tel: tel, addr: addr, note: note,
      items: items, est: sub + ship
    });
  }

  /* ------------------------------------------------ เขียนลงชีท */
  var props = PropertiesService.getScriptProperties();
  var done = props.getProperty('shop_' + clientKey);
  if (done) return shopSaved_(done);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('ระบบกำลังยุ่งอยู่ ลองกดสั่งอีกครั้งใน 2-3 วินาที');
  }

  var written = { head: 0, item: [], cut: [], prod: [], recv: [] };
  try {
    done = props.getProperty('shop_' + clientKey);
    if (done) return shopSaved_(done);

    var lists = cfgLists_();
    var plan = planOrder_({
      channel: shopChannel_(lists.channel),
      carrier: '',                       // พนักงานเลือกขนส่งตอนแพ็กของ
      status: 'รอชำระ',
      cust: cust, tel: tel, addr: addr,
      vat: false, discount: 0, ship: ship,
      staff: 'ลูกค้าสั่งเอง',
      note: (note ? note + ' · ' : '') + 'สั่งจากหน้าเว็บร้าน',
      items: items
    }, 'หน้าร้าน');

    var no = reserveOrderNo_();
    plan.no = no;

    written = commitOrder_(plan);
    SpreadsheetApp.flush();
    verifyOrder_(plan);

    /* เก็บยอดไว้คู่กับเลขใบด้วย เพราะตอนลูกค้ากดซ้ำ เราอ่านยอดจากชีทไม่ได้
       readOrders_ มีด่านพนักงานอยู่ข้างใน ซึ่งถูกแล้ว ลูกค้าไม่ควรอ่านออเดอร์ใครก็ได้ */
    props.setProperty('shop_' + clientKey, no + '|' + plan.net);
    writeLog_('หน้าร้าน', 'ลูกค้าสั่งเอง', SH.head.name, no,
      'ออเดอร์จากหน้าเว็บ', '', items.length + ' รายการ',
      'ลูกค้ากดสั่งเองจากหน้าร้าน ยอดสุทธิ ' + plan.net);

    return shopDone_(no, Number(plan.net) || 0, false);
  } catch (err) {
    rollback_(written);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/**
 * ข้อมูลที่ตอบกลับหลังสั่งสำเร็จ พร้อมลิงก์หน้าจ่ายเงินของใบนั้น
 *
 * สร้างแถวลิงก์ให้เลยตั้งแต่ตอนสั่ง ลูกค้าจะได้จ่ายต่อทันทีโดยไม่ต้องรอพนักงานกด
 * ถ้ายังไม่ได้กรอก "ลิงก์เว็บแอปสำหรับลูกค้า" ในชีท จะไม่มี url ให้ ต้องให้พนักงานติดต่อกลับ
 */
function shopSaved_(saved) {
  var bar = String(saved).indexOf('|');
  return bar < 0
    ? shopDone_(String(saved), 0, true)
    : shopDone_(String(saved).slice(0, bar), Number(String(saved).slice(bar + 1)) || 0, true);
}

function shopDone_(no, net, dup) {
  var link = linkInfo_(no);
  if (!link && sheetIfAny_('link')) {
    var row = nextRow_('link', SH.link.IN.no);
    if (row) {
      var key = linkNewKey_();
      writeRow_('link', row, { no: no, key: key, at: new Date(), by: 'หน้าร้าน', opened: 0 });
      link = linkInfo_(no);
    }
  }
  return {
    ok: true,
    no: no,
    duplicate: !!dup,
    net: Number(net) || 0,
    payUrl: (link && link.url) || '',
    why: link ? link.why : 'ยังไม่ได้เปิดระบบลิงก์ชำระเงิน'
  };
}

/* ===========================================================================
   โหมด "เข้าคิวก่อน" — คำขอสั่งซื้อ
   =========================================================================== */

/** เลขคำขอ REQ-ปปดดวว-nnn — คนละชุดกับเลขออเดอร์ จะได้ไม่มีใครสับสนว่าใบไหนจริง */
function reqNewNo_() {
  var d = new Date();
  var p = function (n) { return n < 10 ? '0' + n : '' + n };
  var day = String(d.getFullYear() + 543).slice(2) + p(d.getMonth() + 1) + p(d.getDate());
  var s = sheetIfAny_('req');
  var seq = 1;
  if (s) {
    var last = s.getLastRow();
    if (last >= DATA_ROW) {
      var v = s.getRange(DATA_ROW, SH.req.IN.no, last - DATA_ROW + 1, 1).getValues();
      for (var i = 0; i < v.length; i++) {
        var m = /^REQ-(\d{6})-(\d+)$/.exec(String(v[i][0] || '').trim());
        if (m && m[1] === day && Number(m[2]) >= seq) seq = Number(m[2]) + 1;
      }
    }
  }
  return 'REQ-' + day + '-' + (seq < 100 ? ('00' + seq).slice(-3) : seq);
}

/** เขียนคำขอลงคิว แล้วบอกลูกค้าว่าร้านจะติดต่อกลับ */
function shopQueue_(clientKey, r) {
  var props = PropertiesService.getScriptProperties();
  var done = props.getProperty('shopq_' + clientKey);
  if (done) return shopQueued_(done, r.est, true);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองกดสั่งอีกครั้งใน 2-3 วินาที');
  try {
    done = props.getProperty('shopq_' + clientKey);
    if (done) return shopQueued_(done, r.est, true);

    if (!sheetIfAny_('req')) {
      throw new Error('ระบบยังไม่พร้อมรับออเดอร์ทางเว็บ — ทักไลน์ของร้านเพื่อสั่งซื้อได้เลย');
    }
    var row = nextRow_('req', SH.req.IN.no);
    if (!row) throw new Error('ระบบรับคำขอไม่ได้ในตอนนี้ — ทักไลน์ของร้านได้เลย');

    var shelf = {};
    var list = shopItems_();
    for (var i = 0; i < list.length; i++) shelf[list[i].sku] = list[i];

    var lines = [], names = [];
    for (var k = 0; k < r.items.length; k++) {
      var it = r.items[k];
      lines.push(it.sku + '*' + it.qty);
      names.push((shelf[it.sku] ? shelf[it.sku].name : it.sku) + ' x' + it.qty);
    }

    var no = reqNewNo_();
    writeRow_('req', row, {
      no: no, at: new Date(), cust: r.cust, tel: r.tel, addr: r.addr, note: r.note,
      lines: lines.join(' · '), names: names.join(' · '), est: r.est,
      status: 'ใหม่', orderNo: '', by: '', why: ''
    });

    props.setProperty('shopq_' + clientKey, no);
    writeLog_('หน้าร้าน', 'คำขอสั่งซื้อ', SH.req.name, no,
      'ลูกค้ากรอกจากหน้าเว็บ', '', r.items.length + ' รายการ',
      'ยอดประเมิน ' + r.est + ' — รอพนักงานกดรับเป็นออเดอร์');

    return shopQueued_(no, r.est, false);
  } finally {
    lock.releaseLock();
  }
}

function shopQueued_(no, est, dup) {
  return { ok: true, queued: true, no: no, net: Number(est) || 0,
           duplicate: !!dup, payUrl: '', why: '' };
}

/* ===========================================================================
   ฝั่งพนักงาน — ดูคิวและกดรับเป็นออเดอร์
   =========================================================================== */

/** แกะช่อง lines กลับเป็นรายการสินค้า — รูปแบบ SKU*จำนวน คั่นด้วย · */
function reqLines_(text) {
  var out = [];
  String(text || '').split('·').forEach(function (chunk) {
    var m = /^\s*(.+?)\s*\*\s*(\d+)\s*$/.exec(chunk);
    if (m) out.push({ sku: m[1].trim(), qty: Number(m[2]) });
  });
  return out;
}

/** คำขอที่ยังไม่ได้จัดการ — ใหม่สุดขึ้นก่อน */
function getRequests(limit) {
  requireStaff_();
  var s = sheetIfAny_('req');
  if (!s) return [];
  var last = s.getLastRow();
  if (last < DATA_ROW) return [];
  var IN = SH.req.IN;
  var v = s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, 14).getValues();
  var out = [];
  for (var i = v.length - 1; i >= 0; i--) {
    var no = String(v[i][IN.no - 1] || '').trim();
    if (!no) continue;
    out.push(jsonSafe_({
      row: DATA_ROW + i,
      no: no,
      at: v[i][IN.at - 1] instanceof Date ? ymd_(v[i][IN.at - 1], true) : '',
      cust: String(v[i][IN.cust - 1] || ''),
      tel: tel_(v[i][IN.tel - 1]),
      addr: String(v[i][IN.addr - 1] || ''),
      note: String(v[i][IN.note - 1] || ''),
      names: String(v[i][IN.names - 1] || ''),
      items: reqLines_(v[i][IN.lines - 1]),
      est: Number(v[i][IN.est - 1] || 0),
      status: String(v[i][IN.status - 1] || 'ใหม่'),
      orderNo: String(v[i][IN.orderNo - 1] || '')
    }));
    if (limit && out.length >= limit) break;
  }
  return out;
}

/** หาแถวของคำขอจากเลขคำขอ */
function reqRow_(no) {
  var want = String(no || '').trim();
  if (!want) throw new Error('ไม่ได้บอกว่าเป็นคำขอใบไหน');
  var s = sheetIfAny_('req');
  if (!s) throw new Error('ยังไม่มีชีท ' + SH.req.name);
  var last = s.getLastRow();
  var v = last < DATA_ROW ? [] : s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, 14).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][SH.req.IN.no - 1] || '').trim() === want) {
      return { row: DATA_ROW + i, vals: v[i] };
    }
  }
  throw new Error('ไม่พบคำขอ ' + want);
}

/**
 * รับคำขอเป็นออเดอร์จริง
 *
 * ราคาคิดใหม่จากชีท ณ ตอนกดรับเสมอ ไม่ใช้ยอดประเมินที่บันทึกไว้ตอนลูกค้ากด
 * เพราะระหว่างนั้นราคาอาจเปลี่ยน และใบจริงต้องตรงกับราคาที่ร้านขายวันนี้
 *
 * p = { no, cust, tel, addr, carrier, status, ship, discount, vat } — แก้ได้ทุกช่อง
 * ช่องไหนไม่ส่งมา ใช้ของเดิมที่ลูกค้ากรอก
 */
function acceptRequest(p) {
  var email = requireStaff_();
  p = p || {};
  var hit = reqRow_(p.no);
  var IN = SH.req.IN;

  var already = String(hit.vals[IN.orderNo - 1] || '').trim();
  if (already) {
    throw new Error('คำขอ ' + p.no + ' รับเป็นออเดอร์ ' + already + ' ไปแล้ว — ' +
      'ถ้าต้องการใบใหม่ ให้คีย์ออเดอร์ตามปกติ');
  }

  var items = reqLines_(hit.vals[IN.lines - 1]);
  if (!items.length) throw new Error('คำขอ ' + p.no + ' ไม่มีรายการสินค้าที่อ่านออก');

  var prods = {}, list = readProducts_();
  for (var i = 0; i < list.length; i++) prods[list[i].sku] = list[i];

  var missing = [];
  var lines = items.map(function (it) {
    var pr = prods[it.sku];
    if (!pr) { missing.push(it.sku); return null; }
    return { sku: it.sku, qty: it.qty, price: pr.price };
  });
  if (missing.length) {
    throw new Error('รหัสสินค้าไม่มีในฐานสินค้าแล้ว: ' + missing.join(', ') +
      ' — แก้ในชีท ' + SH.req.name + ' หรือคีย์ออเดอร์เองแทน');
  }

  /* ค่าส่งคิดใหม่จากกติกาในชีท ณ ตอนกดรับ — ยอดที่บันทึกไว้ตอนลูกค้ากด
     เป็นราคาวันนั้น ซึ่งอาจคนละกติกากับวันนี้ พนักงานพิมพ์ทับได้ถ้าตกลงกันไว้อีกแบบ */
  var cfgA = appCfg_();
  var subA = 0;
  for (var q = 0; q < lines.length; q++) subA += lines[q].price * lines[q].qty;
  var shipA = (cfgA.freeOver && subA >= Number(cfgA.freeOver)) ? 0 : Number(cfgA.shipFee) || 0;

  var made = createOrder({
    clientKey: 'req-' + p.no,
    channel: p.channel || '',
    carrier: p.carrier || '',
    status: p.status || 'รอชำระ',
    cust: p.cust || String(hit.vals[IN.cust - 1] || ''),
    tel: p.tel || tel_(hit.vals[IN.tel - 1]),
    addr: p.addr || String(hit.vals[IN.addr - 1] || ''),
    vat: !!p.vat,
    discount: Number(p.discount) || 0,
    ship: (p.ship === undefined || p.ship === '') ? shipA : Number(p.ship) || 0,
    staff: p.staff || '',
    note: 'รับจากคำขอ ' + p.no + (hit.vals[IN.note - 1] ? ' · ' + hit.vals[IN.note - 1] : ''),
    items: lines
  });

  writeRow_('req', hit.row, { status: 'รับแล้ว', orderNo: made.no, by: email });
  writeLog_(email, 'รับคำขอเป็นออเดอร์', SH.req.name, p.no,
    'คำขอ → ออเดอร์', '', made.no, 'รับคำขอจากหน้าเว็บเป็นออเดอร์ ' + made.no);

  return { ok: true, no: made.no, req: p.no, net: made.net };
}

/** ไม่รับคำขอ — ต้องมีเหตุผล จะได้ตอบลูกค้าได้ว่าทำไม */
function rejectRequest(no, why) {
  var email = requireStaff_();
  var reason = String(why || '').trim();
  if (reason.length < 3) throw new Error('ใส่เหตุผลสั้น ๆ ด้วย จะได้ตอบลูกค้าได้ว่าทำไมไม่รับ');
  var hit = reqRow_(no);
  if (String(hit.vals[SH.req.IN.orderNo - 1] || '').trim()) {
    throw new Error('คำขอนี้รับเป็นออเดอร์ไปแล้ว ยกเลิกที่ออเดอร์แทน');
  }
  writeRow_('req', hit.row, { status: 'ไม่รับ', by: email, why: reason });
  writeLog_(email, 'ไม่รับคำขอ', SH.req.name, String(no), 'คำขอ', '', 'ไม่รับ', reason);
  return { ok: true, no: String(no) };
}
