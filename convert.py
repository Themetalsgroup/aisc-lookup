"""Convert AISC Shapes Database xlsx to compact JSON for the web app.

Run after replacing the xlsx with a newer AISC release:
    python convert.py
"""
import json
import sys
from pathlib import Path

import openpyxl

SRC = Path(__file__).parent / "aisc-shapes-database-v160-2.xlsx"
OUT = Path(__file__).parent / "data.json"
SHEET = "Database v16.0"


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        if s in ("", "–", "-", "�"):
            return None
        return s
    return v


def main():
    if not SRC.exists():
        sys.exit(f"Source not found: {SRC}")

    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb[SHEET]

    rows_iter = ws.iter_rows(values_only=True)
    headers = [clean(h) for h in next(rows_iter)]
    rows = []
    for r in rows_iter:
        if not r or all(c is None for c in r):
            continue
        rows.append([clean(c) for c in r])

    data = {"headers": headers, "rows": rows}
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB, {len(rows)} shapes)")


if __name__ == "__main__":
    main()
