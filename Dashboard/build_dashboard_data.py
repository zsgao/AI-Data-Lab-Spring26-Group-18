#!/usr/bin/env python3
"""
Regenerate nursing_dashboard_v2.data.js from CSVs in ../Cleaned Data/

Usage (from this folder):
  python3 build_dashboard_data.py
  python3 build_dashboard_data.py "/path/to/Cleaned Data"
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

YEARS = [2022, 2023, 2024, 2025]

# Vizient education_clean (lowercase) -> NCLEX "Registered Nursing Program Name"
NCLEX_ALIASES = {
    "mercer university": "Georgia Baptist College of Nursing - Mercer University",
    "south college atlanta": "South College",
}


def parse_date(s: str):
    if not s or not str(s).strip():
        return None
    s = str(s).strip()
    for fmt in ("%m/%d/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def parse_float(s: str) -> float | None:
    if s is None or str(s).strip() == "":
        return None
    try:
        return float(str(s).strip())
    except ValueError:
        return None


def parse_pct_cell(s: str) -> float | None:
    if s is None or str(s).strip() == "":
        return None
    t = str(s).strip().rstrip("%")
    return parse_float(t)


def norm_school_key(name: str) -> str:
    return " ".join(str(name).strip().lower().split())


def mode_of(counter: Counter) -> str | None:
    if not counter:
        return None
    return counter.most_common(1)[0][0]


def main() -> None:
    base = Path(__file__).resolve().parent
    cleaned = Path(sys.argv[1]) if len(sys.argv) > 1 else base.parent / "Cleaned Data"
    viz_path = cleaned / "Vizient_CLEANED_FINAL.csv"
    nclex_path = cleaned / "Georgia RN NCLEX Pass Rates.csv"
    rot_path = cleaned / "Cleaned_rotation.csv"
    soft_skills_path = cleaned / "soft_skills_school_scores.csv"

    if not viz_path.is_file():
        sys.stderr.write(f"Missing {viz_path}\n")
        sys.exit(1)
    if not nclex_path.is_file():
        sys.stderr.write(f"Missing {nclex_path}\n")
        sys.exit(1)

    # --- NCLEX: index by program name (canonical) -> list of rows ---
    nclex_by_program: dict[str, list[dict]] = defaultdict(list)
    with open(nclex_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            name = row["Registered Nursing Program Name"].strip()
            nclex_by_program[name].append(row)

    program_names_lower = {norm_school_key(n): n for n in nclex_by_program}

    def resolve_nclex_program(viz_name: str) -> str | None:
        key = norm_school_key(viz_name)
        if key in NCLEX_ALIASES:
            return NCLEX_ALIASES[key]
        if key in program_names_lower:
            return program_names_lower[key]
        return None

    # --- Vizient rows ---
    viz_rows: list[dict] = []
    with open(viz_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            edu = row.get("education_clean") or ""
            if not str(edu).strip():
                continue
            viz_rows.append(row)

    by_school: dict[str, list[dict]] = defaultdict(list)
    for row in viz_rows:
        sk = norm_school_key(row["education_clean"])
        by_school[sk].append(row)

    # --- Rotation: student-hours total + mean "Total Hours per Person" per school ---
    rotation_hours: dict[str, float] = defaultdict(float)
    rot_hours_per_person_sum: dict[str, float] = defaultdict(float)
    rot_hours_per_person_n: dict[str, int] = defaultdict(int)
    if rot_path.is_file():
        with open(rot_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                status = (row.get("Cleaned Status") or "").strip().lower()
                if status and status != "completed":
                    continue
                sch = row.get("School_Cleaned") or row.get("Schools") or ""
                if not str(sch).strip():
                    continue
                sk = norm_school_key(sch)
                th = parse_float(row.get("Total Hours per Person") or "")
                sc = parse_float(row.get("Student Count") or "")
                if th is not None and sc is not None:
                    rotation_hours[sk] += th * sc
                if th is not None:
                    rot_hours_per_person_sum[sk] += th
                    rot_hours_per_person_n[sk] += 1

    # All schools in Cleaned_rotation (completed rows) with mean hours — for charts independent of Vizient
    rotation_school_avg_hours: list[dict] = []
    for sk in rot_hours_per_person_n:
        n = rot_hours_per_person_n[sk]
        if n <= 0:
            continue
        avg = rot_hours_per_person_sum[sk] / n
        rotation_school_avg_hours.append(
            {"school": sk, "rotationAvgHoursPerPerson": round(avg, 2)}
        )
    rotation_school_avg_hours.sort(
        key=lambda x: x["rotationAvgHoursPerPerson"], reverse=True
    )

    # --- Soft skills scores (z-score.py output: rotation hours + retention merge) ---
    soft_by_school: dict[str, dict[str, float | None]] = {}
    if soft_skills_path.is_file():
        with open(soft_skills_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                raw = (row.get("Schools_Cleaned") or "").strip()
                if not raw:
                    continue
                sk = norm_school_key(raw)
                soft_by_school[sk] = {
                    "softAvgHours": parse_float(row.get("Average hour per person") or ""),
                    "softRetention": parse_float(row.get("Retention rate") or ""),
                    "softHoursZ": parse_float(row.get("Average hour per person z-score") or ""),
                    "softRetentionZ": parse_float(row.get("Retention rate z-score") or ""),
                    "softFinalScore": parse_float(row.get("Final score") or ""),
                }
    else:
        sys.stderr.write(f"Note: optional {soft_skills_path} not found; soft-skills fields omitted\n")

    summary_list: list[dict] = []
    by_year_list: list[dict] = []

    for school_key, rows in sorted(by_school.items(), key=lambda x: -len(x[1])):
        n = len(rows)
        term = [r.get("termination", "").strip().lower() for r in rows]
        retained = sum(1 for t in term if t == "no")
        retention = retained / n if n else 0.0

        gpas = [parse_float(r.get("gpa_numeric")) for r in rows]
        gpas = [g for g in gpas if g is not None]
        gpa_mean = sum(gpas) / len(gpas) if gpas else None

        tenures = [parse_float(r.get("tenure")) for r in rows]
        tenures = [t for t in tenures if t is not None]
        tenure_mean = sum(tenures) / len(tenures) if tenures else None

        units = Counter(
            (r.get("type of unit") or "").strip()
            for r in rows
            if (r.get("type of unit") or "").strip()
        )
        unit = mode_of(units) or "Other"

        term_rows = [r for r in rows if (r.get("termination") or "").strip().lower() == "yes"]
        reasons = Counter(
            (r.get("termination reason") or "").strip()
            for r in term_rows
            if (r.get("termination reason") or "").strip()
        )
        term_reason = mode_of(reasons) if reasons else "N/A"

        nclex_prog = resolve_nclex_program(rows[0]["education_clean"])
        pass_rate = None
        delivered_4y = 0.0
        weighted_pr = 0.0

        if nclex_prog:
            for prow in nclex_by_program[nclex_prog]:
                tot = parse_float(prow.get("Total Delivered") or "")
                avg = parse_pct_cell(prow.get("4 Year Average") or "")
                if tot is not None and tot > 0 and avg is not None:
                    delivered_4y += tot
                    weighted_pr += avg * tot
            if delivered_4y > 0:
                pass_rate = round(weighted_pr / delivered_4y, 2)

        rh = rotation_hours.get(school_key)
        rotation_val = round(rh, 1) if rh and rh > 0 else None
        _n_hp = rot_hours_per_person_n.get(school_key, 0)
        _avg_hp = (
            rot_hours_per_person_sum[school_key] / _n_hp if _n_hp else None
        )
        rotation_avg_hpp = round(_avg_hp, 2) if _avg_hp is not None else None

        entry: dict = {
            "school": school_key,
            "nurses": n,
            "gpa": round(gpa_mean, 3) if gpa_mean is not None else None,
            "tenure": round(tenure_mean, 4) if tenure_mean is not None else None,
            "termReason": term_reason,
            "unit": unit,
            "retention": round(retention, 4),
            "passRate": pass_rate,
            "rotationHours": rotation_val,
            "rotationAvgHoursPerPerson": rotation_avg_hpp,
        }
        ss = soft_by_school.get(school_key)
        if ss:
            entry["softAvgHours"] = round(ss["softAvgHours"], 4) if ss["softAvgHours"] is not None else None
            entry["softRetention"] = round(ss["softRetention"], 4) if ss["softRetention"] is not None else None
            entry["softHoursZ"] = round(ss["softHoursZ"], 4) if ss["softHoursZ"] is not None else None
            entry["softRetentionZ"] = round(ss["softRetentionZ"], 4) if ss["softRetentionZ"] is not None else None
            entry["softFinalScore"] = round(ss["softFinalScore"], 4) if ss["softFinalScore"] is not None else None
        summary_list.append(entry)

        # By year: hires and cohort retention from Vizient
        for y in YEARS:
            cohort = []
            for r in rows:
                d = parse_date(r.get("employment start date") or "")
                if d and d.year == y:
                    cohort.append(r)
            if not cohort:
                continue
            c_n = len(cohort)
            c_ret = sum(1 for r in cohort if (r.get("termination") or "").strip().lower() == "no")
            ret_y = c_ret / c_n if c_n else 0.0

            delivered = 0.0
            w_pr = 0.0
            pass_y = None
            if nclex_prog:
                dcol = f"Total Delivered - {y}"
                pcol = f"Pass Rate - {y}"
                for prow in nclex_by_program[nclex_prog]:
                    d = parse_float(prow.get(dcol) or "")
                    p = parse_pct_cell(prow.get(pcol) or "")
                    if d is not None and d > 0 and p is not None:
                        delivered += d
                        w_pr += p * d
                if delivered > 0:
                    pass_y = round(w_pr / delivered, 2)

            by_year_list.append(
                {
                    "school": school_key,
                    "year": y,
                    "nurses": c_n,
                    "retention": round(ret_y, 4),
                    "passRate": pass_y,
                    "delivered": int(delivered) if delivered > 0 else 0,
                }
            )

    # Global termination reasons (all Vizient)
    all_reasons: Counter[str] = Counter()
    for r in viz_rows:
        if (r.get("termination") or "").strip().lower() != "yes":
            continue
        reason = (r.get("termination reason") or "").strip()
        if reason:
            all_reasons[reason] += 1

    term_reasons = [{"reason": reason, "count": count} for reason, count in all_reasons.most_common(20)]

    out_path = base / "nursing_dashboard_v2.data.js"
    max_nurses = max((s["nurses"] for s in summary_list), default=1)
    meta_obj = {
        "dataSource": str(cleaned),
        "maxNurses": max_nurses,
        "softSkillsRows": len(soft_by_school),
        "rotationSchoolsInFile": len(rotation_school_avg_hours),
    }

    lines = [
        "(function () {",
        "  window.NURSING_DASHBOARD_DATA = {",
        f"    summaryData: {json.dumps(summary_list, separators=(',', ':'))},",
        f"    byYearData: {json.dumps(by_year_list, separators=(',', ':'))},",
        f"    termReasons: {json.dumps(term_reasons, separators=(',', ':'))},",
        f"    rotationSchoolAvgHours: {json.dumps(rotation_school_avg_hours, separators=(',', ':'))},",
        f"    meta: {json.dumps(meta_obj, separators=(',', ':'))},",
        "  };",
        "})();",
        "",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path} ({len(summary_list)} schools, {len(by_year_list)} school-year rows)")


if __name__ == "__main__":
    main()
