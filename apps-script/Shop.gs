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
      img: String(p.img || ''),
      /* บอกแค่ "มี" หรือ "หมด" ไม่บอกว่าเหลือกี่ชิ้น
         จำนวนคงเหลือคือข้อมูลภายใน คู่แข่งอ่านได้ว่าเดือนหนึ่งขายไปเท่าไร */
      out: p.remain !== null && Number(p.remain) <= 0
    });
  }
  return out;
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
