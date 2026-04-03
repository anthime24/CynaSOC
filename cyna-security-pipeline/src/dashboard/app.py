"""
Dashboard Streamlit — Cyna Security Pipeline
Visualisation des logs de sécurité enrichis pour un analyste SOC.
"""

import os

import pandas as pd
import plotly.express as px
import psycopg2
import streamlit as st

DB_URL = os.getenv("DATABASE_URL", "postgresql://cyna:cyna_password@localhost:5433/cyna")

st.set_page_config(
    page_title="Cyna SOC Dashboard",
    page_icon="🛡️",
    layout="wide",
)

# ---------------------------------------------------------------------------
# Chargement des données
# ---------------------------------------------------------------------------

@st.cache_data(ttl=60)
def load_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Charge security_logs et enriched_logs depuis PostgreSQL."""
    conn = psycopg2.connect(DB_URL)
    try:
        logs = pd.read_sql("""
            SELECT
                sl.id,
                sl.timestamp,
                sl.log_type,
                sl.source_ip::text   AS source_ip,
                sl.dest_ip::text     AS dest_ip,
                sl.severity,
                sl.event_type
            FROM security_logs sl
            ORDER BY sl.timestamp
        """, conn)

        enriched = pd.read_sql("""
            SELECT
                el.log_id,
                el.matched_ip::text  AS matched_ip,
                el.confidence_level,
                el.is_malicious,
                sl.timestamp,
                sl.log_type,
                sl.source_ip::text   AS source_ip,
                sl.dest_ip::text     AS dest_ip,
                sl.severity
            FROM enriched_logs el
            JOIN security_logs sl ON el.log_id = sl.id
            WHERE el.is_malicious = TRUE
            ORDER BY sl.timestamp
        """, conn)
    finally:
        conn.close()

    logs["timestamp"] = pd.to_datetime(logs["timestamp"], utc=True)
    enriched["timestamp"] = pd.to_datetime(enriched["timestamp"], utc=True)
    return logs, enriched


# ---------------------------------------------------------------------------
# Sidebar — Filtres
# ---------------------------------------------------------------------------

st.sidebar.title("Filtres")

logs_raw, enriched_raw = load_data()

min_date = logs_raw["timestamp"].min().date()
max_date = logs_raw["timestamp"].max().date()

date_range = st.sidebar.date_input(
    "Plage de dates",
    value=(min_date, max_date),
    min_value=min_date,
    max_value=max_date,
)

log_types = st.sidebar.multiselect(
    "Type de log",
    options=["ids", "access", "endpoint"],
    default=["ids", "access", "endpoint"],
)

min_confidence = st.sidebar.slider(
    "Score de confiance minimum (ipsum)",
    min_value=1, max_value=8, value=1,
)

# Appliquer les filtres
if len(date_range) == 2:
    start, end = pd.Timestamp(date_range[0], tz="UTC"), pd.Timestamp(date_range[1], tz="UTC")
else:
    start, end = logs_raw["timestamp"].min(), logs_raw["timestamp"].max()

logs = logs_raw[
    (logs_raw["timestamp"] >= start) &
    (logs_raw["timestamp"] <= end) &
    (logs_raw["log_type"].isin(log_types))
]

enriched = enriched_raw[
    (enriched_raw["timestamp"] >= start) &
    (enriched_raw["timestamp"] <= end) &
    (enriched_raw["log_type"].isin(log_types)) &
    (enriched_raw["confidence_level"] >= min_confidence)
]

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

st.title("Cyna SOC Dashboard")
st.caption("Pipeline de cybersécurité — Logs simulés enrichis par threat intelligence ipsum")

# ---------------------------------------------------------------------------
# Panel 1 — KPIs
# ---------------------------------------------------------------------------

st.subheader("Vue d'ensemble")

total_logs       = len(logs)
total_malicious  = enriched["log_id"].nunique()
taux             = round(total_malicious / total_logs * 100, 2) if total_logs > 0 else 0
unique_ips       = enriched["matched_ip"].nunique()

col1, col2, col3, col4 = st.columns(4)
col1.metric("Total logs", f"{total_logs:,}")
col2.metric("Logs malveillants", f"{total_malicious:,}")
col3.metric("Taux de détection", f"{taux}%")
col4.metric("IPs malveillantes uniques", f"{unique_ips:,}")

st.divider()

# ---------------------------------------------------------------------------
# Panel 2 — Timeline
# ---------------------------------------------------------------------------

st.subheader("Timeline des événements")

logs_hour = (
    logs.set_index("timestamp")
    .resample("h")
    .size()
    .reset_index(name="total")
)

enriched_hour = (
    enriched.set_index("timestamp")
    .resample("h")
    .size()
    .reset_index(name="malveillants")
)

timeline = logs_hour.merge(enriched_hour, on="timestamp", how="left").fillna(0)
timeline_melted = timeline.melt(
    id_vars="timestamp",
    value_vars=["total", "malveillants"],
    var_name="Catégorie",
    value_name="Événements",
)

fig_timeline = px.line(
    timeline_melted,
    x="timestamp", y="Événements", color="Catégorie",
    color_discrete_map={"total": "#4C9BE8", "malveillants": "#E8534C"},
    labels={"timestamp": "Heure"},
)
st.plotly_chart(fig_timeline, use_container_width=True)

st.divider()

# ---------------------------------------------------------------------------
# Panel 3 — Top IPs malveillantes
# ---------------------------------------------------------------------------

st.subheader("Top 10 IPs malveillantes")

top_ips = (
    enriched.groupby("matched_ip")
    .agg(hits=("log_id", "count"), confidence=("confidence_level", "max"))
    .sort_values("hits", ascending=False)
    .head(10)
    .reset_index()
    .rename(columns={"matched_ip": "IP malveillante", "hits": "Occurrences", "confidence": "Score ipsum"})
)

st.dataframe(top_ips, use_container_width=True, hide_index=True)

st.divider()

# ---------------------------------------------------------------------------
# Panel 4 — Répartition par type et sévérité
# ---------------------------------------------------------------------------

st.subheader("Répartition par type de log et sévérité")

col_left, col_right = st.columns(2)

with col_left:
    type_counts = logs["log_type"].value_counts().reset_index()
    type_counts.columns = ["Type", "Nombre"]
    fig_type = px.bar(
        type_counts, x="Type", y="Nombre",
        color="Type",
        color_discrete_sequence=px.colors.qualitative.Set2,
        title="Logs par type",
    )
    st.plotly_chart(fig_type, use_container_width=True)

with col_right:
    sev_data = logs[logs["severity"].notna()]
    if not sev_data.empty:
        sev_counts = sev_data.groupby(["log_type", "severity"]).size().reset_index(name="count")
        fig_sev = px.bar(
            sev_counts, x="log_type", y="count", color="severity",
            barmode="group",
            color_discrete_map={"low": "#4CAF50", "medium": "#FF9800", "high": "#F44336"},
            labels={"log_type": "Type", "count": "Nombre", "severity": "Sévérité"},
            title="Sévérité par type de log",
        )
        st.plotly_chart(fig_sev, use_container_width=True)
    else:
        st.info("Pas de données de sévérité disponibles.")

st.divider()

# ---------------------------------------------------------------------------
# Panel 5 — Distribution des scores de confiance ipsum
# ---------------------------------------------------------------------------

st.subheader("Distribution des scores de confiance ipsum")

if not enriched.empty:
    fig_conf = px.histogram(
        enriched,
        x="confidence_level",
        nbins=8,
        color_discrete_sequence=["#9C27B0"],
        labels={"confidence_level": "Score ipsum (1-8)", "count": "Nombre de logs"},
        title="Niveau de certitude des IPs malveillantes détectées",
    )
    fig_conf.update_layout(bargap=0.1)
    st.plotly_chart(fig_conf, use_container_width=True)
else:
    st.info("Aucune correspondance malveillante dans la plage sélectionnée.")
