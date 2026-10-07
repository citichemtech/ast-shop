#!/usr/bin/env python3
"""ประกอบหน้าร้าน (Shop.html) ให้เปิดในเบราว์เซอร์ธรรมดาได้

    python3 tools/make_shop_preview.py           -> out/shop.html

หน้าจริงถูกเสิร์ฟโดย Apps Script แล้วขอข้อมูลด้วย google.script.run.shopData()
ตัวนี้ยัด google.script.run ปลอมให้ เพื่อจะได้ดูหน้าตาและกดทดสอบได้โดยไม่ต้อง deploy

ข้อมูลปลอมในไฟล์นี้ต้องไม่ใช่ของลูกค้าจริง — โค้ดชุดนี้เปิดดูได้จากข้างนอก
"""
import json, sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent

def pic(txt, bg):
    """รูปปลอมเป็น SVG ฝังมาเลย จะได้ทดสอบได้โดยไม่ต้องต่อเน็ต"""
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">'
           '<rect width="600" height="600" fill="' + bg + '"/>'
           '<text x="300" y="320" font-size="64" text-anchor="middle" fill="#fff">'
           + txt + '</text></svg>')
    return "data:image/svg+xml;utf8," + quote(svg)


DATA = {
    "ok": True,
    "open": True,
    "shop": {
        "name": "AST CHEM-TOOLING SHOP",
        "full": "บริษัท เคมีคอล อินโนเวชั่น เทคโนโลยี แอนด์ อินสตรูเมนท์ จำกัด",
        "line": "https://line.me/R/ti/p/@example",
        "tel": "02-000-0000",
        "addr": "ที่อยู่ตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10000",
    },
    "ship": {"fee": 50, "freeOver": 1000},
    "cod": {"max": 2000},
    "logo": "",
    "cover": "",
    "map": {"url": "https://www.google.com/maps/search/?api=1&query=test",
            "label": "2/1 ซ.ตัวอย่าง", "addr": "ที่อยู่ตัวอย่าง"},
    "banners": {
        "ติดต่อเรา": [{"img": pic("LINE", "#00B900"), "title": "แอดไลน์",
                      "btn": "แอดไลน์ร้าน", "go": {"kind": "url", "v": "https://example.com/line"}}],
        "โปรโมชั่นเด่น": [
            {"img": pic("PROMO 1", "#1668D6"), "title": "โปร 1", "btn": "Buy Now",
             "go": {"kind": "cat", "v": "เคมีภัณฑ์"}},
            {"img": pic("PROMO 2", "#BE4B48"), "title": "โปร 2", "btn": "",
             "go": None}],
        "โปรโมชั่นประจำเดือน": [{"img": pic("MONTH", "#2C6FD1"), "title": "โปรเดือนนี้",
                                 "btn": "", "go": None}],
    },
    "best": ["SKU-148", "SKU-Chem-102"],
    "cats": ["ดอกกัดคาร์ไบด์", "ดอกเจาะ", "เคมีภัณฑ์"],
    "catCards": [
        {"group": "ดอกกัดคาร์ไบด์", "label": "ดอกกัดคาร์ไบด์", "icon": pic("EM", "#3D8BFF"),
         "cover": pic("END MILL", "#1668D6"), "n": 3},
        {"group": "ดอกเจาะ", "label": "ดอกเจาะ", "icon": "", "cover": "", "n": 1},
        {"group": "เคมีภัณฑ์", "label": "Chemical", "icon": pic("CH", "#BE4B48"),
         "cover": pic("CHEMICAL", "#96302D"), "n": 2},
    ],
    "items": [
        {"sku": "SKU-141", "name": "Single Flute Endmill 1F / 1.0*5.0*3.175*38L (1pcs)",
         "group": "ดอกกัดคาร์ไบด์", "unit": "ชิ้น", "perPack": 1, "price": 89, "out": False,
         "img": pic("A1", "#3D8BFF"), "imgs": [pic("A1", "#3D8BFF"), pic("A2", "#1668D6")],
         "tags": ["แนะนำ", "ใหม่"]},
        {"sku": "SKU-148", "name": "Straight Endmill 2F 2.0-17", "group": "ดอกกัดคาร์ไบด์",
         "unit": "ชิ้น", "perPack": 1, "price": 96, "out": False,
         "img": pic("B1", "#BE4B48"), "imgs": [pic("B1", "#BE4B48")], "tags": []},
        {"sku": "SKU-181", "name": "Square Endmill 4F 2.5-7.5", "group": "ดอกกัดคาร์ไบด์",
         "unit": "ชิ้น", "perPack": 1, "price": 225, "img": "", "imgs": [], "out": True, "tags": []},
        {"sku": "SKU-210", "name": "ดอกเจาะคาร์ไบด์ 3.0 มม.", "group": "ดอกเจาะ",
         "unit": "ชิ้น", "perPack": 1, "price": 145, "img": "", "imgs": [], "out": False, "tags": []},
        {"sku": "SKU-Chem-102", "name": "Acetone 1000 ml", "group": "เคมีภัณฑ์",
         "unit": "ขวด", "perPack": 12, "price": 120, "img": "", "imgs": [], "out": False, "tags": []},
        {"sku": "SKU-Chem-111", "name": "น้ำยาล้าง PCB 1000 ml", "group": "เคมีภัณฑ์",
         "unit": "ขวด", "perPack": 12, "price": 160, "img": "", "imgs": [], "out": False, "tags": []},
    ],
}

STUB = """
<script>
/* google.script.run ปลอม — ตอบกลับช้าหน่อยให้เห็นหน้าจอตอนกำลังโหลดด้วย */
var SHOP_DATA = %s;
window.google = { script: { run: (function () {
  var ok = null, bad = null;
  window.SENT_ORDERS = window.SENT_ORDERS || [];
  var api = {
    withSuccessHandler: function (f) { ok = f; return api },
    withFailureHandler: function (f) { bad = f; return api },
    shopData: function () { setTimeout(function () { ok(SHOP_DATA) }, 350) },
    /* จำลองฝั่งเซิร์ฟเวอร์: คิดยอดจากราคาในข้อมูลปลอม ไม่เชื่อราคาที่ส่งมา */
    shopOrder: function (p) {
      setTimeout(function () {
        if (window.SHOP_FAIL) { bad(new Error(window.SHOP_FAIL)); return }
        var sub = 0;
        (p.items || []).forEach(function (it) {
          var f = SHOP_DATA.items.filter(function (x) { return x.sku === it.sku })[0];
          if (f) sub += f.price * it.qty;
        });
        var ship = (SHOP_DATA.ship.freeOver && sub >= SHOP_DATA.ship.freeOver)
          ? 0 : SHOP_DATA.ship.fee;
        window.SHOP_SENT = p;
        window.SENT_ORDERS.push(p);
        /* ของจริง: ใบปลายทางไม่มีลิงก์โอนเงินกลับมาเลย ตัวปลอมต้องทำเหมือนกัน
           ไม่งั้นข้อสอบจะผ่านทั้งที่หน้าจริงยังยื่นปุ่มโอนเงินให้ใบปลายทาง */
        var isCod = !!p.cod && (SHOP_DATA.cod.max > 0 && sub + ship <= SHOP_DATA.cod.max);
        ok({ ok: true, no: 'AST-26-0042', duplicate: false, net: sub + ship, cod: isCod,
             payUrl: isCod ? '' : 'https://example.invalid/pay?p=demo', why: '' });
      }, 250);
    }
  };
  return api;
})() } };
</script>
"""


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "shop.html"
    src = (ROOT / "apps-script" / "Shop.html").read_text(encoding="utf-8")
    stub = STUB % json.dumps(DATA, ensure_ascii=False)
    # ยัด stub ไว้ก่อน <script> ของหน้าจริง เพื่อให้ google มีตัวตนก่อนโค้ดหน้าทำงาน
    i = src.rindex("<script>")
    src = src[:i] + stub + src[i:]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(src, encoding="utf-8")
    print("เขียนแล้ว:", out)


if __name__ == "__main__":
    main()
