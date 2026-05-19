import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from collections import Counter
import re

st.set_page_config(
    page_title="Restaurant Data Explorer",
    page_icon="🍽️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── styles ────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
    .metric-card {
        background: #1e1e2e;
        border: 1px solid #313244;
        border-radius: 10px;
        padding: 16px 20px;
        text-align: center;
    }
    .metric-card h2 { margin: 0; font-size: 2rem; color: #cba6f7; }
    .metric-card p  { margin: 4px 0 0; font-size: 0.85rem; color: #a6adc8; }
    .section-header { font-size: 1.1rem; font-weight: 600; color: #cdd6f4; margin-bottom: 8px; }
    div[data-testid="stDataFrame"] { border-radius: 8px; }
</style>
""", unsafe_allow_html=True)

import os
import glob as _glob

def _available_csvs():
    paths = sorted(_glob.glob("Database/*.csv"))
    return paths if paths else ["Database/Combined_Restaurants.csv"]

# ── data loading ──────────────────────────────────────────────────────────────
@st.cache_data(show_spinner="Loading dataset…")
def load_data(csv_path: str):
    df = pd.read_csv(csv_path, encoding="utf-8-sig", low_memory=False)

    # normalise country / source
    df["country"] = df["country"].replace({"United States": "US", "United Kingdom": "UK"})
    # numeric coercion
    for col in ["rating", "ratings", "latitude", "longitude", "position"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # clean price_range to broad buckets
    def bucket_price(p):
        if pd.isna(p) or str(p).strip() == "":
            return "Unknown"
        p = str(p).strip()
        if re.match(r"^\${1,6}$", p):
            return p
        # USD range → bucket
        nums = re.findall(r"\d+", p)
        if nums:
            avg = (int(nums[0]) + int(nums[-1])) / 2
            if avg < 12:   return "$"
            if avg < 25:   return "$$"
            if avg < 50:   return "$$$"
            return "$$$$"
        return "Unknown"

    df["price_bucket"] = df["price_range"].apply(bucket_price)

    # explode categories into a list column for filtering
    df["cat_list"] = df["category"].fillna("").apply(
        lambda x: [c.strip() for c in x.split(",") if c.strip()] if x else []
    )

    # format phone for display: 1XXXXXXXXXX → +1 (XXX) XXX-XXXX
    def fmt_phone(p):
        if pd.isna(p):
            return p
        digits = str(p).strip()
        if len(digits) == 11 and digits.startswith("1"):
            return f"+1 ({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
        return digits  # non-US / unusual length — show as-is

    df["phone"] = df["phone"].apply(fmt_phone)

    return df


# ── sidebar filters ───────────────────────────────────────────────────────────
st.sidebar.image("https://img.icons8.com/fluency/96/restaurant.png", width=56)
st.sidebar.title("Filters")

available_csvs = _available_csvs()
csv_labels = [os.path.basename(p) for p in available_csvs]
default_idx = next(
    (i for i, p in enumerate(available_csvs) if "Combined_Restaurants.csv" in p), 0
)
sel_csv_label = st.sidebar.selectbox(
    "Database", csv_labels, index=default_idx, key="sel_csv"
)
sel_csv_path = available_csvs[csv_labels.index(sel_csv_label)]

if st.sidebar.button("🔄 Refresh Data", use_container_width=True):
    load_data.clear()
    st.rerun()

df = load_data(sel_csv_path)

mask = pd.Series([True] * len(df), index=df.index)

provinces_in = sorted(df.loc[mask, "province"].dropna().unique().tolist())
sel_province = st.sidebar.selectbox("State / Province", ["All"] + provinces_in)
if sel_province != "All":
    mask &= df["province"] == sel_province

cities_in = sorted(df.loc[mask, "city"].dropna().unique().tolist())
sel_city = st.sidebar.selectbox("City", ["All"] + cities_in)
if sel_city != "All":
    mask &= df["city"] == sel_city

# category multi-select (top 60 by frequency)
all_cat_counts = Counter(
    c for cats in df["cat_list"] for c in cats
)
top_cats = [c for c, _ in all_cat_counts.most_common(60)]
sel_cats = st.sidebar.multiselect("Category (any match)", top_cats)
if sel_cats:
    sel_set = set(sel_cats)
    mask &= df["cat_list"].apply(lambda lst: bool(set(lst) & sel_set))

score_min_data = float(df["rating"].dropna().min())
score_max_data = float(df["rating"].dropna().max())
sel_score = st.sidebar.slider(
    "Score range", score_min_data, score_max_data,
    (score_min_data, score_max_data), step=0.1
)
has_score = df["rating"].notna()
mask &= ~has_score | (
    (df["rating"] >= sel_score[0]) & (df["rating"] <= sel_score[1])
)

# min review count
sel_min_reviews = st.sidebar.number_input("Min review count", min_value=0, value=0, step=10)
if sel_min_reviews > 0:
    mask &= df["ratings"].fillna(0) >= sel_min_reviews

# price bucket
price_opts = ["All", "$", "$$", "$$$", "$$$$", "Unknown"]
sel_price = st.sidebar.selectbox("Price range", price_opts)
if sel_price != "All":
    mask &= df["price_bucket"] == sel_price

filtered = df[mask].copy()
total_shown = len(filtered)

# ── header ────────────────────────────────────────────────────────────────────
st.title("🍽️ Restaurant Data Explorer")
st.caption(f"**{total_shown:,}** restaurants match your filters  ·  {len(df):,} total in dataset")

# ── session state ─────────────────────────────────────────────────────────────
if "map_selection" not in st.session_state:
    st.session_state.map_selection = pd.DataFrame()

# ── tabs ──────────────────────────────────────────────────────────────────────
sel_count = len(st.session_state.map_selection)
sel_label = f"📍 Selected ({sel_count})" if sel_count else "📍 Selected"
tab_overview, tab_map, tab_cats, tab_col, tab_table, tab_selected = st.tabs([
    "📊 Overview", "🗺️ Map", "🏷️ Categories", "🔬 Column Explorer", "📋 Data Table", sel_label
])

# ═══════════════════════════════════════════════════════════════════════
# TAB 1 – Overview
# ═══════════════════════════════════════════════════════════════════════
with tab_overview:
    c1, c2, c3, c4, c5 = st.columns(5)
    def metric(col, value, label):
        col.markdown(
            f'<div class="metric-card"><h2>{value}</h2><p>{label}</p></div>',
            unsafe_allow_html=True,
        )

    metric(c1, f"{total_shown:,}", "Restaurants")
    metric(c2, filtered["province"].nunique(), "States")
    metric(c3, filtered["city"].nunique(), "Cities")
    avg_score = filtered["rating"].mean()
    metric(c4, f"{avg_score:.2f}" if pd.notna(avg_score) else "—", "Avg Score")
    metric(c5, f"{int(filtered['ratings'].sum()):,}" if filtered["ratings"].notna().any() else "—", "Total Reviews")

    st.markdown("---")
    row1_l, row1_r = st.columns(2)

    # Score distribution
    with row1_l:
        st.markdown('<p class="section-header">Score Distribution</p>', unsafe_allow_html=True)
        score_data = filtered["rating"].dropna()
        if len(score_data):
            fig = px.histogram(
                score_data, nbins=40, labels={"value": "Score", "count": "Count"},
                color_discrete_sequence=["#cba6f7"],
            )
            fig.update_layout(
                margin=dict(l=0, r=0, t=0, b=0),
                paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                showlegend=False, height=280,
                font_color="#cdd6f4",
                xaxis=dict(gridcolor="#313244"), yaxis=dict(gridcolor="#313244"),
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No score data for current filters.")

    # Reviews distribution (log scale)
    with row1_r:
        st.markdown('<p class="section-header">Review Count Distribution</p>', unsafe_allow_html=True)
        rev_data = filtered["ratings"].dropna()
        if len(rev_data):
            fig = px.histogram(
                rev_data, nbins=40, log_y=True,
                labels={"value": "Review Count", "count": "# Restaurants"},
                color_discrete_sequence=["#89dceb"],
            )
            fig.update_layout(
                margin=dict(l=0, r=0, t=0, b=0),
                paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                showlegend=False, height=280, font_color="#cdd6f4",
                xaxis=dict(gridcolor="#313244"), yaxis=dict(gridcolor="#313244"),
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No review data for current filters.")

    row2_l, row2_r = st.columns(2)

    # Top cities
    with row2_l:
        st.markdown('<p class="section-header">Top Cities</p>', unsafe_allow_html=True)
        top_c = filtered["city"].value_counts().head(15).reset_index()
        top_c.columns = ["City", "Count"]
        fig = px.bar(
            top_c, x="Count", y="City", orientation="h",
            color="Count", color_continuous_scale="Purples",
        )
        fig.update_layout(
            margin=dict(l=0, r=0, t=0, b=0),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            yaxis=dict(autorange="reversed", gridcolor="#313244"),
            xaxis=dict(gridcolor="#313244"),
            height=360, showlegend=False, coloraxis_showscale=False,
            font_color="#cdd6f4",
        )
        st.plotly_chart(fig, use_container_width=True)

    # Price range donut
    with row2_r:
        st.markdown('<p class="section-header">Price Range Breakdown</p>', unsafe_allow_html=True)
        price_counts = filtered["price_bucket"].value_counts().reset_index()
        price_counts.columns = ["Price", "Count"]
        price_counts = price_counts[price_counts["Price"] != "Unknown"]
        if len(price_counts):
            fig = px.pie(
                price_counts, names="Price", values="Count", hole=0.5,
                color_discrete_sequence=px.colors.sequential.Purp,
            )
            fig.update_layout(
                margin=dict(l=0, r=0, t=0, b=0),
                paper_bgcolor="rgba(0,0,0,0)", height=360, font_color="#cdd6f4",
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No price data for current filters.")

    # Top states
    st.markdown('<p class="section-header">Top States / Provinces</p>', unsafe_allow_html=True)
    top_prov = filtered["province"].value_counts().head(20).reset_index()
    top_prov.columns = ["Province", "Count"]
    fig = px.bar(
        top_prov, x="Province", y="Count",
        color="Count", color_continuous_scale="Teal",
    )
    fig.update_layout(
        margin=dict(l=0, r=0, t=10, b=0),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        xaxis=dict(gridcolor="#313244"), yaxis=dict(gridcolor="#313244"),
        height=300, showlegend=False, coloraxis_showscale=False, font_color="#cdd6f4",
    )
    st.plotly_chart(fig, use_container_width=True)


# ═══════════════════════════════════════════════════════════════════════
# TAB 2 – Map
# ═══════════════════════════════════════════════════════════════════════
with tab_map:
    map_df = filtered.dropna(subset=["latitude", "longitude"]).copy()
    map_df = map_df[
        map_df["latitude"].between(-90, 90) &
        map_df["longitude"].between(-180, 180)
    ].reset_index(drop=True)

    map_ctrl_l, map_ctrl_r = st.columns([1, 2])
    with map_ctrl_l:
        color_by = st.selectbox("Color points by", ["rating", "price_bucket", "country", "province"], key="map_color")
    with map_ctrl_r:
        FILTERABLE_FIELDS = ["rating", "ratings", "price_range", "website", "phone", "category", "address"]
        hide_missing = st.multiselect(
            "Hide points missing field(s)",
            FILTERABLE_FIELDS,
            key="map_hide_missing",
        )
    if hide_missing:
        map_df = map_df.dropna(subset=hide_missing)
        map_df = map_df[~map_df[hide_missing].apply(
            lambda col: col.astype(str).str.strip() == ""
        ).any(axis=1)].reset_index(drop=True)

    sel_info_col, clear_col = st.columns([4, 1])
    with sel_info_col:
        if sel_count:
            st.caption(f"**{sel_count}** restaurants selected — switch to the **📍 Selected** tab to view details.")
        else:
            st.caption("To select restaurants, click the **Box Select** or **Lasso Select** tool in the map toolbar, then drag over the map.")
    with clear_col:
        if sel_count and st.button("Clear selection", use_container_width=True):
            st.session_state.map_selection = pd.DataFrame()
            st.rerun()

    if len(map_df):
        fig = px.scatter_mapbox(
            map_df,
            lat="latitude", lon="longitude",
            color=color_by,
            hover_name="name",
            hover_data={"city": True, "rating": True, "ratings": True, "price_bucket": True, "latitude": False, "longitude": False},
            color_continuous_scale="Plasma" if color_by == "rating" else None,
            zoom=3, height=600,
            opacity=0.6,
        )
        fig.update_layout(
            mapbox_style="carto-darkmatter",
            margin=dict(l=0, r=0, t=0, b=0),
            paper_bgcolor="rgba(0,0,0,0)",
            font_color="#cdd6f4",
            legend=dict(bgcolor="rgba(30,30,46,0.8)"),
            dragmode="pan",
        )
        event = st.plotly_chart(
            fig,
            use_container_width=True,
            config={
                "scrollZoom": True,
                "modeBarButtonsToAdd": ["select2d", "lasso2d"],
            },
            on_select="rerun",
            selection_mode=["box", "lasso"],
            key="map_chart",
        )
        # Persist selection into session state
        if event and event.selection and event.selection.points:
            point_indices = [p["point_index"] for p in event.selection.points]
            st.session_state.map_selection = map_df.iloc[point_indices].copy()

        # Spacebar-to-pan: inject JS that temporarily forces dragmode=pan while
        # space is held, restoring the previous mode on key-up. Runs client-side
        # so it never triggers a Streamlit rerun or viewport reset.
        st.components.v1.html("""
<script>
(function() {
    function getPlotEl() {
        // The Plotly div lives in the parent frame; walk up from this iframe.
        const plots = window.parent.document.querySelectorAll('.js-plotly-plot');
        for (const p of plots) {
            if (p._fullLayout && p._fullLayout.mapbox) return p;
        }
        return null;
    }

    let previousDragmode = null;

    window.parent.document.addEventListener('keydown', function(e) {
        if (e.code !== 'Space' || e.repeat) return;
        // Don't hijack focus inside text inputs
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

        const el = getPlotEl();
        if (!el) return;
        const current = el._fullLayout.dragmode;
        if (current === 'pan') return; // already panning
        previousDragmode = current;
        window.parent.Plotly.relayout(el, {dragmode: 'pan'});
    }, true);

    window.parent.document.addEventListener('keyup', function(e) {
        if (e.code !== 'Space') return;
        if (previousDragmode === null) return;
        const el = getPlotEl();
        if (!el) return;
        window.parent.Plotly.relayout(el, {dragmode: previousDragmode});
        previousDragmode = null;
    }, true);
})();
</script>
""", height=0)
    else:
        st.warning("No restaurants with valid coordinates for current filters.")


# ═══════════════════════════════════════════════════════════════════════
# TAB 3 – Categories
# ═══════════════════════════════════════════════════════════════════════
with tab_cats:
    n_cats = st.slider("Show top N categories", 10, 60, 25, key="ncat")

    all_cats_filtered = Counter(c for cats in filtered["cat_list"] for c in cats)
    top_df = pd.DataFrame(all_cats_filtered.most_common(n_cats), columns=["Category", "Count"])

    fig = px.bar(
        top_df, x="Count", y="Category", orientation="h",
        color="Count", color_continuous_scale="Purples",
    )
    fig.update_layout(
        margin=dict(l=0, r=0, t=10, b=0),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        yaxis=dict(autorange="reversed", gridcolor="#313244"),
        xaxis=dict(gridcolor="#313244"),
        height=max(400, n_cats * 22),
        showlegend=False, coloraxis_showscale=False, font_color="#cdd6f4",
    )
    st.plotly_chart(fig, use_container_width=True)

    st.markdown("---")
    st.markdown('<p class="section-header">Average Score by Category (min 50 restaurants)</p>', unsafe_allow_html=True)

    rows_cat = []
    for cat, cnt in all_cats_filtered.most_common(200):
        sub = filtered[filtered["cat_list"].apply(lambda lst: cat in lst)]
        avg = sub["rating"].mean()
        rows_cat.append({"Category": cat, "Count": cnt, "Avg Score": avg})

    cat_score_df = pd.DataFrame(rows_cat).dropna(subset=["Avg Score"])
    cat_score_df = cat_score_df[cat_score_df["Count"] >= 50].sort_values("Avg Score", ascending=False).head(30)

    if len(cat_score_df):
        fig2 = px.bar(
            cat_score_df, x="Avg Score", y="Category", orientation="h",
            color="Avg Score", color_continuous_scale="RdYlGn",
            range_color=[3.5, 5.0],
            hover_data={"Count": True},
        )
        fig2.update_layout(
            margin=dict(l=0, r=0, t=10, b=0),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            yaxis=dict(autorange="reversed", gridcolor="#313244"),
            xaxis=dict(gridcolor="#313244", range=[3.5, 5.0]),
            height=600, showlegend=False, coloraxis_showscale=False, font_color="#cdd6f4",
        )
        st.plotly_chart(fig2, use_container_width=True)


# ═══════════════════════════════════════════════════════════════════════
# TAB 4 – Column Explorer
# ═══════════════════════════════════════════════════════════════════════
with tab_col:
    display_cols = [
        "name", "address", "city", "province", "postal_code", "category",
        "rating", "ratings", "price_range", "price_bucket",
        "website", "phone", "source", "link", "location_name",
    ]
    sel_col = st.selectbox("Select a column to explore", display_cols)

    col_data = filtered[sel_col].dropna()
    total_vals = len(filtered)
    missing = total_vals - len(col_data)

    m1, m2, m3 = st.columns(3)
    m1.metric("Total values", f"{total_vals:,}")
    m2.metric("Non-null", f"{len(col_data):,}")
    m3.metric("Missing", f"{missing:,} ({missing/total_vals*100:.1f}%)" if total_vals else "—")

    if sel_col in ("rating", "ratings", "position"):
        num = pd.to_numeric(col_data, errors="coerce").dropna()
        if len(num):
            st.markdown("**Numeric statistics**")
            stats = num.describe()
            st.dataframe(stats.to_frame().T.style.format("{:.2f}"), use_container_width=True)

            fig = px.histogram(num, nbins=50, color_discrete_sequence=["#cba6f7"])
            fig.update_layout(
                margin=dict(l=0, r=0, t=10, b=0),
                paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                xaxis=dict(gridcolor="#313244"), yaxis=dict(gridcolor="#313244"),
                height=300, showlegend=False, font_color="#cdd6f4",
            )
            st.plotly_chart(fig, use_container_width=True)
    else:
        vc = col_data.astype(str).value_counts()
        n_unique = len(vc)
        st.metric("Unique values", f"{n_unique:,}")

        top_n = st.slider("Show top N values", 5, 50, 20, key="col_top")
        top_vc = vc.head(top_n).reset_index()
        top_vc.columns = [sel_col, "Count"]
        top_vc["% of non-null"] = (top_vc["Count"] / len(col_data) * 100).round(2)

        fig = px.bar(
            top_vc, x="Count", y=sel_col, orientation="h",
            color="Count", color_continuous_scale="Purples",
        )
        fig.update_layout(
            margin=dict(l=0, r=0, t=10, b=0),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            yaxis=dict(autorange="reversed", gridcolor="#313244"),
            xaxis=dict(gridcolor="#313244"),
            height=max(300, top_n * 24),
            showlegend=False, coloraxis_showscale=False, font_color="#cdd6f4",
        )
        st.plotly_chart(fig, use_container_width=True)
        st.dataframe(top_vc, use_container_width=True, hide_index=True)


# ═══════════════════════════════════════════════════════════════════════
# TAB 5 – Data Table
# ═══════════════════════════════════════════════════════════════════════
with tab_table:
    search = st.text_input("Search by name", placeholder="e.g. McDonald's")

    show_cols = ["name", "address", "city", "province", "category",
                 "rating", "ratings", "price_bucket", "website", "phone"]

    table_df = filtered[show_cols].copy()
    if search.strip():
        table_df = table_df[table_df["name"].astype(str).str.contains(search.strip(), case=False, na=False, regex=False)]

    sort_col = st.selectbox("Sort by", ["rating", "ratings", "name"], key="sort")
    sort_asc = st.checkbox("Ascending", value=False, key="sort_asc")
    table_df = table_df.sort_values(sort_col, ascending=sort_asc, na_position="last")

    st.caption(f"{len(table_df):,} rows")

    PAGE = 200
    total_pages = max(1, (len(table_df) - 1) // PAGE + 1)
    page = st.number_input("Page", min_value=1, max_value=total_pages, value=1, step=1)
    start = (page - 1) * PAGE
    st.dataframe(
        table_df.iloc[start: start + PAGE].reset_index(drop=True),
        use_container_width=True,
        height=500,
    )

    csv_bytes = table_df.to_csv(index=False).encode("utf-8")
    st.download_button(
        "Download filtered data as CSV",
        data=csv_bytes,
        file_name="filtered_restaurants.csv",
        mime="text/csv",
    )


# ═══════════════════════════════════════════════════════════════════════
# TAB 6 – Selected (map selection)
# ═══════════════════════════════════════════════════════════════════════
with tab_selected:
    sel_df = st.session_state.map_selection

    if sel_df.empty:
        st.info(
            "No restaurants selected yet. Switch to the **🗺️ Map** tab, turn on "
            "**Selection mode**, then click and drag over the map to select restaurants."
        )
    else:
        hdr_l, hdr_r = st.columns([3, 1])
        with hdr_l:
            st.markdown(f"### {len(sel_df)} restaurants selected")
        with hdr_r:
            if st.button("Clear selection", key="clear_sel_tab", use_container_width=True):
                st.session_state.map_selection = pd.DataFrame()
                st.rerun()

        # Summary metrics
        m1, m2, m3, m4 = st.columns(4)
        avg_r = sel_df["rating"].mean()
        total_rev = sel_df["ratings"].sum()
        m1.metric("Restaurants", f"{len(sel_df):,}")
        m2.metric("Avg Rating", f"{avg_r:.2f}" if pd.notna(avg_r) else "—")
        m3.metric("Cities", sel_df["city"].nunique())
        m4.metric("Total Reviews", f"{int(total_rev):,}" if pd.notna(total_rev) else "—")

        st.markdown("---")

        # Mini charts side-by-side
        ch_l, ch_r = st.columns(2)
        with ch_l:
            score_data = sel_df["rating"].dropna()
            if len(score_data):
                st.markdown('<p class="section-header">Score Distribution</p>', unsafe_allow_html=True)
                fig = px.histogram(score_data, nbins=20, color_discrete_sequence=["#cba6f7"])
                fig.update_layout(
                    margin=dict(l=0, r=0, t=0, b=0),
                    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                    showlegend=False, height=220, font_color="#cdd6f4",
                    xaxis=dict(gridcolor="#313244"), yaxis=dict(gridcolor="#313244"),
                )
                st.plotly_chart(fig, use_container_width=True)

        with ch_r:
            price_data = sel_df["price_bucket"].value_counts().reset_index()
            price_data.columns = ["Price", "Count"]
            price_data = price_data[price_data["Price"] != "Unknown"]
            if len(price_data):
                st.markdown('<p class="section-header">Price Range</p>', unsafe_allow_html=True)
                fig2 = px.pie(price_data, names="Price", values="Count", hole=0.5,
                              color_discrete_sequence=px.colors.sequential.Purp)
                fig2.update_layout(
                    margin=dict(l=0, r=0, t=0, b=0),
                    paper_bgcolor="rgba(0,0,0,0)", height=220, font_color="#cdd6f4",
                )
                st.plotly_chart(fig2, use_container_width=True)

        st.markdown("---")
        st.markdown('<p class="section-header">Details</p>', unsafe_allow_html=True)

        detail_cols = ["name", "address", "city", "province", "category",
                       "rating", "ratings", "price_bucket", "website", "phone"]
        show_detail = sel_df[[c for c in detail_cols if c in sel_df.columns]].reset_index(drop=True)
        st.dataframe(show_detail, use_container_width=True, height=400)

        sel_csv = show_detail.to_csv(index=False).encode("utf-8")
        st.download_button(
            "Download selection as CSV",
            data=sel_csv,
            file_name="selected_restaurants.csv",
            mime="text/csv",
        )
