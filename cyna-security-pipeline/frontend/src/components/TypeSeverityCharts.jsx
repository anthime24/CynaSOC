import React, { useState, useEffect, useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as PieTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as BarTooltip,
  Legend,
} from 'recharts'
import { fetchApi, buildQueryString } from '../hooks/useApi.js'

const CARD_STYLE = {
  backgroundColor: '#0a0550',
  border: '1px solid #1a0e7a',
  borderRadius: '12px',
  padding: '20px 24px',
}

const TYPE_COLORS = {
  ids: '#3B82F6',
  access: '#8B5CF6',
  endpoint: '#10B981',
}

const SEVERITY_COLORS = {
  low: '#22C55E',
  medium: '#F97316',
  high: '#EF4444',
  critical: '#7C00FF',
  info: '#3B82F6',
}

const RADIAN = Math.PI / 180

function CustomPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) {
  if (percent < 0.05) return null
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#F8FAFC" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

function PieTooltipContent({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div
      style={{
        backgroundColor: '#040130',
        border: '1px solid #1a0e7a',
        borderRadius: '8px',
        padding: '8px 12px',
        fontSize: '12px',
        color: '#F8FAFC',
      }}
    >
      <strong style={{ color: d.payload.color || '#7C00FF' }}>{d.name?.toUpperCase()}</strong>
      <p style={{ margin: '2px 0 0', color: '#94A3B8' }}>
        {d.value?.toLocaleString()} logs
      </p>
    </div>
  )
}

function CenterLabel({ cx, cy, total }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#F8FAFC">
      <tspan x={cx} dy="-8" fontSize={20} fontWeight={800}>
        {total?.toLocaleString()}
      </tspan>
      <tspan x={cx} dy="20" fontSize={10} fill="#94A3B8">
        total
      </tspan>
    </text>
  )
}

export default function TypeSeverityCharts({ filters, refreshToken, darkMode }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchApi('/api/type-severity' + buildQueryString(filters))
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filters, refreshToken])

  // Aggregate by type for pie chart
  const pieData = useMemo(() => {
    const map = {}
    for (const row of data) {
      const t = row.log_type || 'unknown'
      map[t] = (map[t] || 0) + Number(row.count)
    }
    return Object.entries(map).map(([name, value]) => ({
      name,
      value,
      color: TYPE_COLORS[name] || '#94A3B8',
    }))
  }, [data])

  const pieTotal = pieData.reduce((s, d) => s + d.value, 0)

  // Aggregate by type+severity for stacked bar chart — exclure access (pas de sévérité pertinente)
  const barData = useMemo(() => {
    const typeMap = {}
    const severities = new Set()
    for (const row of data) {
      const t = row.log_type || 'unknown'
      if (t === 'access') continue
      const sev = (row.severity || 'unknown').toLowerCase()
      severities.add(sev)
      if (!typeMap[t]) typeMap[t] = { name: t }
      typeMap[t][sev] = (typeMap[t][sev] || 0) + Number(row.count)
    }
    return { rows: Object.values(typeMap), severities: Array.from(severities) }
  }, [data])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Pie chart */}
      <div style={CARD_STYLE}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>
            Répartition par type
          </h2>
          {loading && <span style={{ fontSize: '11px', color: '#94A3B8' }}>Chargement...</span>}
          {error && <span style={{ fontSize: '11px', color: '#EF4444' }}>{error}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                labelLine={false}
                label={<CustomPieLabel />}
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <PieTooltip content={<PieTooltipContent />} />
              {pieData.length > 0 && (
                <text x={100} y={100} textAnchor="middle" dominantBaseline="middle" fill="#F8FAFC">
                  <tspan x={100} dy="-8" fontSize={20} fontWeight={800}>{pieTotal.toLocaleString()}</tspan>
                  <tspan x={100} dy="20" fontSize={10} fill="#94A3B8">total</tspan>
                </text>
              )}
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pieData.map((item) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    backgroundColor: item.color,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>
                    {item.name.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                    {item.value.toLocaleString()} logs
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stacked bar chart */}
      <div style={CARD_STYLE}>
        <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>
          Sévérité par type
        </h2>

        {barData.rows.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', color: '#94A3B8', padding: '24px 0', fontSize: '13px' }}>
            Aucune donnée disponible
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData.rows} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a0e7a" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: darkMode ? '#94A3B8' : '#6B6B8A' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v.toUpperCase()}
              />
              <YAxis
                tick={{ fontSize: 10, fill: darkMode ? '#94A3B8' : '#6B6B8A' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <BarTooltip
                contentStyle={{
                  backgroundColor: darkMode ? '#1e293b' : '#F5F4F1',
                  border: '1px solid #1a0e7a',
                  borderRadius: '8px',
                  color: darkMode ? '#F8FAFC' : '#1e1b4b',
                  fontSize: '12px',
                }}
                cursor={{ fill: '#1a0e7a55' }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', color: darkMode ? '#94A3B8' : '#6B6B8A', paddingTop: '8px' }}
                formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
              />
              {barData.severities.map((sev) => (
                <Bar key={sev} dataKey={sev} stackId="a" fill={SEVERITY_COLORS[sev] || '#94A3B8'} radius={sev === barData.severities[barData.severities.length - 1] ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
