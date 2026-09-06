/**
 * ช่องเชื่อม Shopee Open API — เตรียมไว้ ยังไม่เปิดใช้
 *
 * ตอนนี้ระบบทำงานด้วยไฟล์ที่ export จาก Seller Centre ซึ่งทำงานได้จริงวันนี้เลย
 * ไฟล์นี้มีไว้ให้วันที่ร้านสมัคร Shopee Open Platform เสร็จ แล้วอยากให้ระบบ
 * ดึงออเดอร์เองโดยไม่ต้องดาวน์โหลดไฟล์ — เปลี่ยนแค่ที่นี่ที่เดียว
 *
 * ทำไมแยกไฟล์และคืนรูปเดียวกับตัวอ่านไฟล์:
 * ตัวตรวจก่อนตัด (previewShopee) กับตัวตัดจริง (commitShopee) รับ "ออเดอร์รูปมาตรฐาน"
 * เท่านั้น ไม่รู้จักว่าออเดอร์มาจากไฟล์หรือจาก API เลย วันเปลี่ยนมาใช้ API
 * จึงไม่ต้องแตะตรรกะการตัดสต๊อกซึ่งเป็นส่วนที่พังแล้วเจ็บที่สุด
 *
 * ต้องทำอะไรบ้างวันที่จะเปิดใช้จริง
 *   1. ใส่ค่า 4 ตัวที่ การตั้งค่าโปรเจกต์ › คุณสมบัติของสคริปต์
 *        SHOPEE_PARTNER_ID · SHOPEE_PARTNER_KEY · SHOPEE_SHOP_ID · SHOPEE_ACCESS_TOKEN
 *   2. เพิ่ม scope "https://www.googleapis.com/auth/script.external_request"
 *      ลงใน appsscript.json (ตอนนี้ยังไม่ใส่ไว้ เพราะจะทำให้พนักงานทุกคน
 *      ต้องกดอนุญาตสิทธิ์ใหม่ทั้งที่ยังไม่ได้ใช้ฟีเจอร์นี้)
 *   3. เติมเนื้อใน shopeeApiCall_() ตามเอกสาร Shopee v2 แล้วรัน shopeeApiSelfTest()
 *
 * โค้ดในนี้ยังไม่เคยยิงกับ Shopee ของจริง ห้ามเชื่อว่าใช้ได้จนกว่าจะทดสอบกับร้านจริง
 */

var SHOPEE_API_HOST = 'https://partner.shopeemobile.com';
var SHOPEE_API_KEYS = ['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY', 'SHOPEE_SHOP_ID', 'SHOPEE_ACCESS_TOKEN'];

function shopeeApiCfg_() {
  var props = PropertiesService.getScriptProperties();
  var out = {};
  for (var i = 0; i < SHOPEE_API_KEYS.length; i++) {
    out[SHOPEE_API_KEYS[i]] = String(props.getProperty(SHOPEE_API_KEYS[i]) || '').trim();
  }
  return out;
}

/**
 * สถานะช่องเชื่อม — หน้าจอเรียกดูได้ตลอด ไม่ต้องมีสิทธิ์อะไรพิเศษ
 * บอกตรง ๆ ว่ายังขาดค่าอะไร ดีกว่าโชว์ปุ่มที่กดแล้วขึ้น error ลึก ๆ
 */
function shopeeApiStatus() {
  requireStaff_();
  var cfg = shopeeApiCfg_();
  var missing = [];
  for (var i = 0; i < SHOPEE_API_KEYS.length; i++) {
    if (!cfg[SHOPEE_API_KEYS[i]]) missing.push(SHOPEE_API_KEYS[i]);
  }
  return {
    ready: missing.length === 0,
    missing: missing,
    host: SHOPEE_API_HOST,
    shopId: cfg.SHOPEE_SHOP_ID,
    /* เตือนไว้ตรงนี้ด้วย เพราะคนที่ใส่ค่าครบแล้วจะงงมากว่าทำไมยังยิงไม่ออก */
    needScope: 'https://www.googleapis.com/auth/script.external_request'
  };
}

/**
 * ลายเซ็นของคำขอตามสเปก Shopee v2
 *   base = partner_id + path + timestamp + access_token + shop_id
 *   sign = HMAC-SHA256(base, partner_key) แล้วแปลงเป็น hex ตัวพิมพ์เล็ก
 *
 * แยกออกมาเป็นฟังก์ชันของตัวเองเพราะเป็นจุดที่ผิดแล้วเงียบที่สุด —
 * เซ็นผิดจะได้แค่ error รหัสเดียวจาก Shopee ที่ไม่บอกว่าผิดตรงไหน
 */
function shopeeSignBase_(partnerId, path, ts, token, shopId) {
  return String(partnerId) + String(path) + String(ts) + String(token || '') + String(shopId || '');
}

function shopeeHex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    s += (b < 16 ? '0' : '') + b.toString(16);
  }
  return s;
}

function shopeeSign_(base, partnerKey) {
  var raw = Utilities.computeHmacSha256Signature(base, partnerKey);
  return shopeeHex_(raw);
}

/**
 * ยิงคำขอหนึ่งครั้ง — จุดเดียวในระบบที่คุยกับ Shopee โดยตรง
 * ยังไม่ถูกเรียกใช้จริงที่ไหน จนกว่าจะใส่ค่าครบและเพิ่ม scope
 */
function shopeeApiCall_(path, params) {
  var cfg = shopeeApiCfg_();
  var ts = Math.floor(Date.now() / 1000);
  var q = {
    partner_id: cfg.SHOPEE_PARTNER_ID,
    timestamp: ts,
    access_token: cfg.SHOPEE_ACCESS_TOKEN,
    shop_id: cfg.SHOPEE_SHOP_ID,
    sign: shopeeSign_(
      shopeeSignBase_(cfg.SHOPEE_PARTNER_ID, path, ts, cfg.SHOPEE_ACCESS_TOKEN, cfg.SHOPEE_SHOP_ID),
      cfg.SHOPEE_PARTNER_KEY)
  };
  for (var k in (params || {})) q[k] = params[k];

  var qs = Object.keys(q).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]);
  }).join('&');

  var res = UrlFetchApp.fetch(SHOPEE_API_HOST + path + '?' + qs, {
    method: 'get', muteHttpExceptions: true
  });
  var body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); }
  catch (e) { throw new Error('Shopee ตอบกลับมาไม่ใช่ JSON: ' + res.getContentText().slice(0, 200)); }
  if (body.error) {
    throw new Error('Shopee ปฏิเสธคำขอ: ' + body.error + ' ' + (body.message || ''));
  }
  return body;
}

/**
 * แปลงออเดอร์จาก API ให้เป็นรูปเดียวกับที่ shopeeParse() คืนออกมา
 *
 * ต้องคืนรูปเดียวกันเป๊ะ ไม่ใช่ "ใกล้เคียง" — previewShopee กับ commitShopee
 * อ่านฟิลด์พวกนี้ตรง ๆ ถ้าขาดไปสักตัว มันจะไปโผล่เป็นออเดอร์ที่ตัดสต๊อกผิดจำนวน
 */
function shopeeFromApi_(list) {
  var out = [];
  for (var i = 0; i < (list || []).length; i++) {
    var o = list[i] || {};
    var items = [];
    var lines = o.item_list || [];
    for (var j = 0; j < lines.length; j++) {
      var it = lines[j] || {};
      var qty = Number(it.model_quantity_purchased || it.quantity_purchased || 0);
      var price = Number(it.model_discounted_price || it.discounted_price || 0);
      items.push({
        code: String(it.model_sku || it.item_sku || ''),
        name: String(it.item_name || ''),
        variant: String(it.model_name || ''),
        qty: qty, price: price, amount: round2_(qty * price)
      });
    }
    var recip = o.recipient_address || {};
    var when = o.create_time ? new Date(Number(o.create_time) * 1000) : null;
    var order = {
      sn: String(o.order_sn || ''),
      date: when ? isoDate_(when) : '',
      status: String(o.order_status || ''),
      buyer: String(o.buyer_username || ''),
      recip: String(recip.name || ''),
      tel: String(recip.phone || ''),
      addr: String(recip.full_address || ''),
      carrier: String(o.shipping_carrier || ''),
      track: '',
      fee: 0, ship: Number(o.actual_shipping_fee || 0), paid: Number(o.total_amount || 0),
      items: items, rows: items.length
    };
    order.kind = shopeeStatusKind(order.status);
    out.push(order);
  }
  return out;
}

/**
 * ดึงออเดอร์ตามช่วงวัน แล้วคืนรูปมาตรฐานให้ previewShopee ใช้ต่อได้ทันที
 * from/to เป็น 'YYYY-MM-DD'
 */
function shopeeFetchOrders(from, to) {
  requireStaff_();
  var st = shopeeApiStatus();
  if (!st.ready) {
    throw new Error('ยังไม่ได้เชื่อม Shopee API — ขาดค่า ' + st.missing.join(', ') +
      ' ที่ การตั้งค่าโปรเจกต์ › คุณสมบัติของสคริปต์ ' +
      '(และต้องเพิ่ม scope ' + st.needScope + ' ใน appsscript.json ด้วย) ' +
      '· ระหว่างนี้ใช้วิธีนำเข้าจากไฟล์ที่ export จาก Seller Centre ได้ตามปกติ');
  }
  var a = parseDate_(from), b = parseDate_(to);
  if (!(a && b) || a > b) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
  /* Shopee จำกัดช่วงละ 15 วันต่อคำขอ ถ้าขอเกินจะได้ error ที่อ่านไม่รู้เรื่อง */
  if ((b - a) / 86400000 > 15) throw new Error('ขอได้ครั้งละไม่เกิน 15 วันตามข้อจำกัดของ Shopee');

  var list = shopeeApiCall_('/api/v2/order/get_order_list', {
    time_range_field: 'create_time',
    time_from: Math.floor(a.getTime() / 1000),
    time_to: Math.floor(b.getTime() / 1000) + 86399,
    page_size: 100,
    response_optional_fields: 'order_status'
  });
  var sns = ((list.response || {}).order_list || []).map(function (x) { return x.order_sn; });
  if (!sns.length) return [];

  var orders = [];
  for (var i = 0; i < sns.length; i += 50) {
    var chunk = sns.slice(i, i + 50);
    var detail = shopeeApiCall_('/api/v2/order/get_order_detail', {
      order_sn_list: chunk.join(','),
      response_optional_fields: 'item_list,recipient_address,total_amount,actual_shipping_fee,buyer_username'
    });
    orders = orders.concat(((detail.response || {}).order_list || []));
  }
  return shopeeFromApi_(orders);
}

/** ตรวจว่าลายเซ็นคำนวณได้ตรงกับที่ Shopee คาดไว้ — รันจากตัวแก้ไข Apps Script ได้เลย */
function shopeeApiSelfTest() {
  var base = shopeeSignBase_('1000', '/api/v2/order/get_order_list', 1600000000, 'tok', '2000');
  Logger.log('base = ' + base);
  Logger.log('sign = ' + shopeeSign_(base, 'testkey'));
  Logger.log(JSON.stringify(shopeeApiStatus()));
}
