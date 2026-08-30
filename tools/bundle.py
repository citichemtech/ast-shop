#!/usr/bin/env python3
"""รวมไฟล์ Apps Script ให้เหลือน้อยที่สุด สำหรับคนที่ต้องก๊อปวางเอง

    python3 tools/bundle.py [โฟลเดอร์ผลลัพธ์]

Apps Script อัปโหลดไฟล์ไม่ได้ ต้องคัดลอกไปวางทีละไฟล์ ซึ่งบนมือถือแทบเป็นไปไม่ได้
ถ้าต้องทำ 10 ไฟล์ สคริปต์นี้จึงรวมให้เหลือ 2 ไฟล์

    Code.gs     = โค้ดฝั่งเซิร์ฟเวอร์ทั้งหมดต่อกัน
    Index.html  = หน้าจอทั้งหมด แทนที่ include_() ด้วยเนื้อไฟล์จริง

ผลลัพธ์ทำงานเหมือนเดิมทุกอย่าง ต่างแค่จำนวนไฟล์
ไฟล์ต้นฉบับใน apps-script/ ยังเป็นตัวจริงที่ใช้แก้ — รันสคริปต์นี้ใหม่ทุกครั้งที่แก้โค้ด
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GS = ROOT / "apps-script"

# เรียงตามลำดับที่อ่านแล้วเข้าใจง่าย — Apps Script ไม่สนลำดับ ฟังก์ชันถูก hoist หมด
SERVER = ["Sheets.gs", "Fefo.gs", "Doc.gs", "Setup.gs", "Api.gs", "Import.gs"]


def main():
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "bundle"
    out.mkdir(parents=True, exist_ok=True)

    # ---- Code.gs ----
    parts = ["""/* ============================================================================
 * AST — ระบบคีย์ออเดอร์และตัดสต๊อก (โค้ดฝั่งเซิร์ฟเวอร์ทั้งหมดรวมไว้ไฟล์เดียว)
 *
 * ไฟล์นี้ถูกสร้างจาก apps-script/ ด้วย tools/bundle.py — อย่าแก้ที่นี่
 * ถ้าจะแก้ ให้แก้ไฟล์ต้นฉบับแล้วสั่ง bundle ใหม่ ไม่งั้นแก้แล้วหายตอน bundle รอบหน้า
 * ============================================================================ */
"""]
    for name in SERVER:
        body = (GS / name).read_text(encoding="utf-8").rstrip()
        parts.append("\n\n/* ==================== %s ==================== */\n\n%s\n" % (name, body))
    code = "".join(parts)
    (out / "Code.gs").write_text(code, encoding="utf-8")

    # ---- Index.html ----
    index = (GS / "Index.html").read_text(encoding="utf-8")

    def sub(m):
        name = m.group(1)
        return ("\n<!-- ==================== %s ==================== -->\n%s"
                % (name, (GS / (name + ".html")).read_text(encoding="utf-8")))

    page, n = re.subn(r"<\?!=\s*include_\('(\w+)'\);?\s*\?>", sub, index)
    if n == 0:
        sys.exit("ไม่เจอ include_() ใน Index.html — โครงไฟล์เปลี่ยนไป")
    # หมายเหตุต้องอยู่ "หลัง" <!DOCTYPE html> — อะไรก็ตามที่มาก่อนหัวเอกสาร
    # ทำให้เบราว์เซอร์เก่าตกไปโหมด quirks แล้วหน้าจอเพี้ยน
    note = ("\n<!-- สร้างจาก apps-script/ ด้วย tools/bundle.py — อย่าแก้ที่นี่\n"
            "     แก้ที่ไฟล์ต้นฉบับแล้วสั่ง bundle ใหม่ -->")
    page, k = re.subn(r"<!DOCTYPE html>", lambda m: m.group(0) + note, page, count=1)
    if not k:
        sys.exit("ไม่เจอ <!DOCTYPE html> ใน Index.html — หัวเอกสารหายไป")
    (out / "Index.html").write_text(page, encoding="utf-8")

    # ---- appsscript.json ----
    (out / "appsscript.json").write_text(
        (GS / "appsscript.json").read_text(encoding="utf-8"), encoding="utf-8")

    def kb(p):
        return len(p.read_text(encoding="utf-8").encode("utf-8")) / 1024

    print("รวมไฟล์เสร็จ → %s" % out)
    print("  Code.gs          %7.0f KB  (รวม %d ไฟล์: %s)" % (kb(out / "Code.gs"), len(SERVER), ", ".join(SERVER)))
    print("  Index.html       %7.0f KB  (รวมหน้าจอ %d ส่วน)" % (kb(out / "Index.html"), n))
    print("  appsscript.json  %7.1f KB" % kb(out / "appsscript.json"))


if __name__ == "__main__":
    main()
