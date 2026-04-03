import React, { useState, useEffect } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { fetchApi, buildQueryString } from '../hooks/useApi.js'

const CARD_STYLE = {
  backgroundColor: '#0a0550',
  border: '1px solid #1a0e7a',
  borderRadius: '12px',
  padding: '20px 24px',
}

function formatHour(hourStr) {
  if (!hourStr) return ''
  try {
    const d = new Date(hourStr)
    return d.toLocaleString('fr-FR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return hourStr
  }
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null

  const total = payload.find((p) => p.dataKey === 'total')?.value ?? 0
  const malicious = payload.find((p) => p.dataKey === 'malicious')?.value ?? 0
  const rate = total > 0 ? ((malicious / total) * 100).toFixed(1) : '0.0'

  return (
    <div
      style={{
        backgroundColor: '#040130',
        border: '1px solid #1a0e7a',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '13px',
        color: '#F8FAFC',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      <p style={{ margin: '0 0 6px', color: '#94A3B8', fontSize: '11px' }}>
        {formatHour(label)}
      </p>
      <p style={{ margin: '2px 0', color: '#94A3B8' }}>
        Total: <strong style={{ color: '#F8FAFC' }}>{total.toLocaleString()}</strong>
      </p>
      <p style={{ margin: '2px 0', color: '#EF4444' }}>
        Malveillants: <strong>{malicious.toLocaleString()}</strong>
      </p>
      <p style={{ margin: '2px 0', color: '#F97316' }}>
        Taux: <strong>{rate}%</strong>
      </p>
    </div>
  )
}

export default function Timeline({ filters, refreshToken, darkMode }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchApi('/api/timeline' + buildQueryString(filters))
      .then((rows) => {
        setData(
          rows.map((r) => ({
            hour: r.hour,
            total: Number(r.total),
            malicious: Number(r.malicious),
          }))
        )
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filters, refreshToken])

  return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>
          Activité dans le temps
        </h2>
        {loading && (
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>Chargement...</span>
        )}
        {error && (
          <span style={{ fontSize: '11px', color: '#EF4444' }}>{error}</span>
        )}
      </div>

      {data.length === 0 && !loading ? (
        <div style={{ textAlign: 'center', color: '#94A3B8', padding: '40px 0', fontSize: '13px' }}>
          Aucune donnée disponible pour cette période
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#374151" stopOpacity={0.6} />
                <stop offset="95%" stopColor="#374151" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="maliciousGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a0e7a" strokeOpacity={0.5} />
            <XAxis
              dataKey="hour"
              tickFormatter={formatHour}
              tick={{ fontSize: 10, fill: darkMode ? '#94A3B8' : '#6B6B8A' }}
              axisLine={{ stroke: '#1a0e7a' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: darkMode ? '#94A3B8' : '#6B6B8A' }}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '12px', color: darkMode ? '#94A3B8' : '#6B6B8A', paddingTop: '8px' }}
              formatter={(value) => (value === 'total' ? 'Total événements' : 'Événements malveillants')}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#6B7280"
              strokeWidth={1.5}
              fill="url(#totalGrad)"
              dot={false}
              activeDot={{ r: 4, fill: '#6B7280' }}
            />
            <Area
              type="monotone"
              dataKey="malicious"
              stroke="#EF4444"
              strokeWidth={2}
              fill="url(#maliciousGrad)"
              dot={false}
              activeDot={{ r: 4, fill: '#EF4444' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
