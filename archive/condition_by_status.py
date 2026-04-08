from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns


OUT_DEFAULT = Path("output/archived_status_by_school_percent.png")


def make_stacked_bar(agg: pd.DataFrame, top_n: Optional[int] = None, outpath: Path = OUT_DEFAULT):

    # determine schools to include 
    totals = agg.groupby("Schools")["Student Count"].sum().sort_values(ascending=False)
    if top_n is not None:
        top_schools = totals.head(top_n).index.tolist()
    else:
        top_schools = totals.index.tolist()

    #pivot to wide format (counts)
    pivot = (
        agg[agg["Schools"].isin(top_schools)]
        .pivot_table(index="Schools", columns="StatusClean", values="Student Count", fill_value=0)
    )

    # keep school order consistent
    pivot = pivot.loc[top_schools]

    # convert counts to percentages per school
    row_sums = pivot.sum(axis=1).replace(0, 1)  # avoid division by zero
    pivot_perc = pivot.div(row_sums, axis=0) * 100

    # desired status order (common statuses first)
    status_order = ["Completed", "Denied", "Withdrawn", "Accepted"]
    existing = [s for s in status_order if s in pivot_perc.columns]
    extras = [s for s in pivot_perc.columns if s not in status_order]
    pivot_perc = pivot_perc[existing + extras]

    # plotting 
    sns.set(style="whitegrid")
    # set figure size (height reverted to 10 inches)
    fig_width = max(10, len(pivot_perc) * 0.4)
    fig_height = 10
    fig, ax = plt.subplots(figsize=(fig_width, fig_height))

    bottom = pd.Series([0.0] * len(pivot_perc), index=pivot_perc.index)
    colors = sns.color_palette("tab10", n_colors=len(pivot_perc.columns))

    for i, status in enumerate(pivot_perc.columns):
        vals = pivot_perc[status]
        ax.bar(pivot_perc.index, vals, bottom=bottom, label=status, color=colors[i])

        # place percentage labels centered in each stacked segment
        mid_points = bottom + vals / 2
        for x, y, v in zip(pivot_perc.index, mid_points, vals):
            if v <= 0.5:
                # skip labeling very small segments to avoid clutter
                continue
            # choose white or black text depending on segment color luminance
            r, g, b = colors[i]
            luminance = 0.299 * r + 0.587 * g + 0.114 * b
            text_color = "black" if luminance > 0.6 else "white"
            ax.text(
                x,
                y,
                f"{v:.1f}%",
                ha="center",
                va="center",
                color=text_color,
                fontsize=8,
                rotation=90,
            )

        bottom += vals

    ax.set_ylabel("Percentage of Students (%)")
    ax.set_xlabel("School")
    ax.set_title("Status Proportion by School")
    ax.set_ylim(0, 100)

    ax.tick_params(axis="x", rotation=45)
    plt.setp(ax.get_xticklabels(), ha="right")

    ax.legend(title="Status", bbox_to_anchor=(1.02, 1), loc="upper left")

    plt.tight_layout()

    outpath.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(outpath, dpi=300)
    print(f"Saved plot to: {outpath}")


def prepare_aggregation(df: pd.DataFrame) -> pd.DataFrame:
    # Normalize column names
    df = df.copy()
    if "Status" not in df.columns:
        raise KeyError("Expected a 'Status' column in the CSV")

    # Filter rows where Status contains 'Archived'
    archived_mask = df["Status"].astype(str).str.contains("Archived", case=False, na=False)
    archived = df[archived_mask].copy()

    # Extract status inside parentheses, e.g., 'Archived (Completed)' -> 'Completed'
    archived["StatusClean"] = archived["Status"].astype(str).str.extract(r"Archived\s*\(([^)]+)\)")[0]
    archived["StatusClean"] = archived["StatusClean"].fillna("Unknown").str.strip()

    # Ensure numeric student counts; coerce non-numeric to 0
    if "Student Count" in archived.columns:
        archived["Student Count"] = pd.to_numeric(archived["Student Count"], errors="coerce").fillna(0).astype(int)
    else:
        archived["Student Count"] = 0

    # Aggregate
    agg = (
        archived.groupby(["Schools", "StatusClean"]) ["Student Count"].sum().reset_index()
    )
    return agg


def read_csv_autodetect(path: Path) -> pd.DataFrame:
    path = Path(path)
    if path.exists():
        return pd.read_csv(path)

    # try globbing in data dir
    data_dir = Path("data")
    matches = list(data_dir.glob("rotation_schedule_data*Deidentified*.csv"))
    if not matches:
        # fallback: any csv in data
        matches = list(data_dir.glob("*.csv"))
    if not matches:
        raise FileNotFoundError("Could not find the rotation schedule CSV in the data/ folder")
    return pd.read_csv(matches[0])


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Plot archived students status proportion by school")
    parser.add_argument("--csv", type=Path, default=Path("data/rotation_schedule_data_2023-2024 _Deidentified_v2.csv"), help="Path to rotation schedule CSV")
    parser.add_argument("--out", type=Path, default=OUT_DEFAULT, help="Base output image path (suffixes added for tiers)")
    parser.add_argument("--top", type=int, default=None, help="Top N schools to plot (default: all)")
    parser.add_argument("--partnership", type=Path, default=Path("Partnership data.csv"), help="CSV file listing Tier1/Tier2 partners")
    parser.add_argument("--min", type=int, default=10, help="Minimum total student count per school to include")
    parser.add_argument("--drop", nargs="*", default=["Emory University"], help="List of schools to exclude (case-insensitive substring)")
    args = parser.parse_args()

    df = read_csv_autodetect(args.csv)
    agg = prepare_aggregation(df)

    # apply filters
    def filter_agg(agg_df: pd.DataFrame) -> pd.DataFrame:
        tot = agg_df.groupby("Schools")["Student Count"].sum()
        keep = tot[tot >= args.min].index
        filtered = agg_df[agg_df["Schools"].isin(keep)]
        for term in args.drop:
            filtered = filtered[~filtered["Schools"].str.contains(term, case=False, na=False)]
        return filtered

    agg = filter_agg(agg)

    # read partnership tiers
    def read_partnership(path: Path) -> pd.DataFrame:
        dfp = pd.read_csv(path, header=None, names=["Tier1", "Tier2"])
        dfp = dfp.applymap(lambda v: v.strip() if isinstance(v, str) else v)
        records: list[tuple[str, str]] = []
        for tier, col in zip(["Tier1", "Tier2"], dfp.columns):
            for val in dfp[col].dropna():
                records.append((tier, val))
        return pd.DataFrame(records, columns=["tier", "school"])

    try:
        partnership_df = read_partnership(args.partnership)
    except Exception:
        partnership_df = pd.DataFrame(columns=["tier", "school"])

    # optional merging
    if not partnership_df.empty:
        merged = agg.merge(partnership_df, left_on="Schools", right_on="school", how="left")
    else:
        merged = agg.copy()

    # iterate tiers
    for tier in ["Tier1", "Tier2"]:
        if not partnership_df.empty:
            subset = merged[merged["tier"] == tier].drop(columns=["tier", "school"])
        else:
            subset = merged.copy()
        if subset.empty:
            continue
        outpath = args.out.with_name(f"{args.out.stem}_{tier.lower()}{args.out.suffix}")
        make_stacked_bar(subset, top_n=args.top, outpath=outpath)

