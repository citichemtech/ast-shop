#!/usr/bin/env python3
"""เผยแพร่หน้าพนักงานขึ้น GitHub Pages (index.html) จากไฟล์ต้นฉบับ admin.html

เจ้าของร้านสั่งให้เอาหน้าร้านลูกค้าออก เหลือแค่หน้าพนักงาน — ที่อยู่หลักของเว็บ
จึงกลายเป็นหน้าพนักงาน เปิด https://citichemtech.github.io/ast-shop/ ได้เลย
ไม่ต้องพิมพ์ /admin.html ต่อท้าย และติดตั้งเป็นแอปบนเครื่องได้เหมือนเดิม

  admin.html  = ตัวจริงที่ใช้แก้โค้ด
  index.html  = ตัวเดียวกันที่ถูกล้างข้อมูลแล้ว สำหรับวางบน Pages

ทั้งสองไฟล์ต้องไม่มีออเดอร์ ไม่มีล็อต ไม่มีรหัสผ่านฝังอยู่ — ข้อมูลจริงอยู่ในเครื่อง
ของพนักงาน (localStorage) และในไฟล์สำรอง .json เท่านั้น
สคริปต์นี้ล้างให้ทุกครั้ง และมีด่านตรวจเบอร์โทรกันข้อมูลลูกค้าหลุดขึ้น repo สาธารณะ

วิธีใช้:  python3 tools/build.py
"""
import json, re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "admin.html")
OUT = os.path.join(ROOT, "index.html")

DATA_RE = re.compile(r'(<script id="DATA" type="application/json">)(.*?)(</script>)', re.S)

# ช่องที่ห้ามฝังลงไฟล์ที่ commit ขึ้น repo สาธารณะ
SECRET_FIELDS = {
    "orders": [],   # ชื่อ เบอร์ ที่อยู่ สลิปโอนเงิน ข้อมูลผู้เสียภาษีของลูกค้า
    "pin": "",      # รหัสเข้าหลังร้าน — ตั้งเองในเครื่อง ไม่ฝังในไฟล์
    "lots": [],     # ล็อตและวันหมดอายุ = ข้อมูลสต๊อกภายใน
    "moves": [],    # ประวัติการเคลื่อนไหวสต๊อก
}

# กล่องที่โค้ดวาดใหม่ทุกครั้งตอนเปิดแอป — ถ้าไฟล์ถูกบันทึกมาจากหน้าจอที่เปิดค้างไว้
# (ปุ่ม "ดาวน์โหลดไฟล์แอป" คัดลอกหน้าจอตอนนั้นทั้งดุ้น) เนื้อในจะติดข้อมูลจริงมาด้วย
# เช่น #dash เคยติดชื่อและเบอร์ลูกค้า 18 รายขึ้น repo สาธารณะมาแล้ว
RENDERED_BOXES = ["dash", "list", "ad-prods", "ad-cats", "ad-banks", "ad-cars", "stock", "pins"]

# เบอร์โทรไทยที่หลุดมาในไฟล์ = มีข้อมูลลูกค้าค้างอยู่ ห้าม commit เด็ดขาด
TEL_RE = re.compile(r'0\d[\d\- ]{7,11}\d')
# รูปที่ฝังมาเป็น base64 มีสตริงตัวเลขยาว ๆ ที่หน้าตาเหมือนเบอร์โทร ต้องตัดทิ้งก่อนตรวจ
DATAURI_RE = re.compile(r'data:[a-zA-Z0-9/+.\-]+;base64,[A-Za-z0-9+/=]+')


def find_tels(txt, allow=()):
    """เบอร์โทรของ "คนอื่น" ที่ค้างอยู่ในไฟล์ — ตัดตัวลวงออกก่อน
       รูป base64 และตารางบาร์โค้ด (สตริง 0/1 ล้วน) หน้าตาเหมือนเบอร์แต่ไม่ใช่
       เบอร์ของร้านเอง (CFG.tel) ต้องอยู่ได้ เพราะลูกค้าต้องเห็นไว้ติดต่อ"""
    ok = {re.sub(r"\D", "", a) for a in allow if a}
    hits = set()
    for m in TEL_RE.finditer(DATAURI_RE.sub("", txt)):
        d = re.sub(r"\D", "", m.group(0))
        if len(d) < 9 or len(d) > 11:
            continue
        if len(set(d)) < 4:          # 0000100110 แบบตารางบาร์โค้ด
            continue
        if d in ok:
            continue
        hits.add(m.group(0))
    return sorted(hits)


def empty_rendered(html):
    """ล้างเนื้อในกล่องที่โค้ดวาดใหม่อยู่แล้ว ไม่ให้ snapshot ของจริงติดไปกับไฟล์"""
    cleared = []
    for cid in RENDERED_BOXES:
        m = re.search(r'(<div[^>]*id="%s"[^>]*>)' % re.escape(cid), html)
        if not m:
            continue
        i = m.end()
        depth, j = 1, i
        while depth and j < len(html) - 6:
            if html.startswith("<div", j):
                depth += 1
            elif html.startswith("</div>", j):
                depth -= 1
                if not depth:
                    break
            j += 1
        if depth:
            sys.exit("หา </div> ปิดของ #%s ไม่เจอ — โครงไฟล์เปลี่ยนไป ไม่เดา" % cid)
        if j > i:
            cleared.append("#%s (%d ตัวอักษร)" % (cid, j - i))
            html = html[:i] + html[j:]
    if cleared:
        print("  ล้างหน้าจอที่ติดมากับไฟล์: " + ", ".join(cleared))
    return html


def scrub(html, label):
    """ล้างข้อมูลที่ห้ามขึ้น repo ออกจาก #DATA"""
    m = DATA_RE.search(html)
    if not m:
        sys.exit("ไม่เจอบล็อก #DATA ใน " + label)
    cfg = json.loads(m.group(2))
    hits = []
    for k, empty in SECRET_FIELDS.items():
        cur = cfg.get(k)
        if cur:
            hits.append("%s (%s)" % (k, len(cur) if isinstance(cur, (list, str)) else cur))
        cfg[k] = empty
    body = json.dumps(cfg, ensure_ascii=False, indent=1)
    out = html[:m.start(2)] + body + html[m.end(2):]
    if hits:
        print("  ล้างออกจาก %s: %s" % (label, ", ".join(hits)))
    return out


def main():
    src = open(SRC, encoding="utf-8").read()

    # 1) ไฟล์หลังร้าน: ล้างข้อมูลลับและหน้าจอที่ติดมา แล้วเขียนทับตัวเอง
    cleaned = empty_rendered(scrub(src, "admin.html"))
    if cleaned != src:
        open(SRC, "w", encoding="utf-8").write(cleaned)
    src = cleaned

    # 2) ไฟล์ที่วางบน Pages: หน้าพนักงานตัวเดียวกัน ไม่มีหน้าร้านลูกค้าแล้ว
    open(OUT, "w", encoding="utf-8").write(src)
    assert 'id="gear"' in src, "ไม่เจอปุ่มเข้าหลังร้าน — พนักงานจะเข้าไม่ได้"

    # 3) ตรวจซ้ำว่าไม่มีข้อมูลลับหลงอยู่ในไฟล์ไหน — ล้มทันทีถ้าเจอ ไม่ปล่อยผ่าน
    for path, label in ((SRC, "admin.html"), (OUT, "index.html")):
        txt = open(path, encoding="utf-8").read()
        cfg = json.loads(DATA_RE.search(txt).group(2))
        for k, empty in SECRET_FIELDS.items():
            assert cfg.get(k) == empty, "%s ยังมี %s ค้างอยู่" % (label, k)
        # ด่านสุดท้าย: ทั้งไฟล์ต้องไม่มีเบอร์โทรไทยหลงเหลือแม้แต่เบอร์เดียว
        tels = find_tels(txt, allow=[cfg.get("tel", ""), (cfg.get("sender") or {}).get("tel", "")])
        assert not tels, "%s ยังมีเบอร์โทรค้างอยู่ %d เบอร์: %s" % (label, len(tels), tels[:5])
        print("  ok: %-11s สินค้า %d · หมวด %d · ออเดอร์ %d · รหัส %r · เบอร์โทร 0"
              % (label, len(cfg.get("products", [])), len(cfg.get("cats", [])),
                 len(cfg.get("orders", [])), cfg.get("pin")))

    print("เผยแพร่แล้ว: index.html %d KB · admin.html %d KB"
          % (os.path.getsize(OUT) // 1024, os.path.getsize(SRC) // 1024))


if __name__ == "__main__":
    main()
