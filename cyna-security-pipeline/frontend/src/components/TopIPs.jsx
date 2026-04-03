import React, { useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { fetchApi, buildQueryString } from '../hooks/useApi.js'

const CARD_STYLE = {
  backgroundColor: '#0a0550',
  border: '1px solid #1a0e7a',
  borderRadius: '12px',
  padding: '20px 24px',
}

function getConfidenceColor(score) {
  if (score >= 6) return '#EF4444'
  if (score >= 3) return '#F97316'
  return '#EAB308'
}

function getConfidenceLabel(score) {
  if (score >= 6) return 'Critique'
  if (score >= 3) return 'Modéré'
  return 'Faible'
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A'
  try {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0]?.payload
  if (!d) return null

  const color = getConfidenceColor(d.confidence)

  return (
    <div
      style={{
        backgroundColor: '#040130',
        border: '1px solid #1a0e7a',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '12px',
        color: '#F8FAFC',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        minWidth: '200px',
      }}
    >
      <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#7C00FF', fontSize: '13px' }}>
        {d.ip}
      </p>
      <p style={{ margin: '2px 0', color: '#94A3B8' }}>
        Hits: <strong style={{ color: '#F8FAFC' }}>{d.hits?.toLocaleString()}</strong>
      </p>
      <p style={{ margin: '2px 0', color: '#94A3B8' }}>
        Score confiance:{' '}
        <strong style={{ color }}>{d.confidence}/10 — {getConfidenceLabel(d.confidence)}</strong>
      </p>
      <p style={{ margin: '2px 0', color: '#94A3B8' }}>
        Premier vu: <strong style={{ color: '#F8FAFC' }}>{formatDate(d.first_seen)}</strong>
      </p>
      <p style={{ margin: '2px 0', color: '#94A3B8' }}>
        Dernier vu: <strong style={{ color: '#F8FAFC' }}>{formatDate(d.last_seen)}</strong>
      </p>
    </div>
  )
}

function ConfidenceBadge({ score }) {
  const color = getConfidenceColor(score)
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: '10px',
        fontSize: '10px',
        fontWeight: 700,
        color,
        backgroundColor: `${color}22`,
        border: `1px solid ${color}55`,
      }}
    >
      {score}
    </span>
  )
}

export default function TopIPs({ filters, refreshToken, darkMode }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchApi('/api/top-ips' + buildQueryString(filters))
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filters, refreshToken])

  // Reverse for horizontal bar chart (highest at top)
  const chartData = [...data].reverse()

  return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>
          Top 10 IPs malveillantes
        </h2>
        {loading && <span style={{ fontSize: '11px', color: '#94A3B8' }}>Chargement...</span>}
        {error && <span style={{ fontSize: '11px', color: '#EF4444' }}>{error}</span>}
      </div>

      {data.length === 0 && !loading ? (
        <div style={{ textAlign: 'center', color: '#94A3B8', padding: '40px 0', fontSize: '13px' }}>
          Aucune IP malveillante détectée
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 42)}>
          <BarChart
            data={chartData}
            layout="vertical"
            barSize={22}
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1a0e7a" strokeOpacity={0.5} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: darkMode ? '#94A3B8' : '#6B6B8A' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="ip"
              tick={{ fontSize: 10, fill: darkMode ? '#94A3B8' : '#6B6B8A', fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
              width={120}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1a0e7a55' }} />
            <Bar dataKey="hits" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={getConfidenceColor(entry.confidence)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', justifyContent: 'center' }}>
        {[
          { label: 'Score 6-8 (Critique)', color: '#EF4444' },
          { label: 'Score 3-5 (Modéré)', color: '#F97316' },
          { label: 'Score 1-2 (Faible)', color: '#EAB308' },
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: item.color }} />
            <span style={{ fontSize: '10px', color: '#94A3B8' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
