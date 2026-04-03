import React, { useState, useEffect } from 'react'
import { fetchApi, buildQueryString } from '../hooks/useApi.js'

const TYPE_COLORS = {
  ids: '#3B82F6',
  access: '#8B5CF6',
  endpoint: '#10B981',
}

function formatRelativeTime(ts) {
  if (!ts) return 'N/A'
  try {
    const diffMs = Date.now() - new Date(ts).getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return `il y a ${diffSec}s`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `il y a ${diffMin} min`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `il y a ${diffH}h`
    const diffD = Math.floor(diffH / 24)
    return `il y a ${diffD}j`
  } catch {
    return ts
  }
}

function TypeBadge({ logType }) {
  const t = (logType || '').toLowerCase()
  const color = TYPE_COLORS[t] || '#94A3B8'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 600,
        color,
        backgroundColor: `${color}22`,
        border: `1px solid ${color}44`,
        textTransform: 'uppercase',
      }}
    >
      {logType || 'N/A'}
    </span>
  )
}

function ConfidenceBadge({ score }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 700,
        color: '#EF4444',
        backgroundColor: '#EF444422',
        border: '1px solid #EF444455',
      }}
    >
      Score {score ?? 'N/A'}
    </span>
  )
}

export default function CriticalAlerts({ filters, refreshToken, darkMode }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchApi('/api/critical-alerts' + buildQueryString(filters))
      .then(setAlerts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filters, refreshToken])

  return (
    <div
      style={{
        backgroundColor: darkMode ? '#0a0550' : '#FFFFFF',
        border: `1px solid ${darkMode ? '#1a0e7a' : '#E2E8F0'}`,
        borderLeft: '4px solid #EF4444',
        borderRadius: '12px',
        padding: '20px 24px',
      }}
    >
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '15px' }}>⚠️</span>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: darkMode ? '#F8FAFC' : '#1e1b4b' }}>
          Alertes critiques
        </h2>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '22px',
            height: '22px',
            borderRadius: '11px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#FFF',
            backgroundColor: alerts.length > 0 ? '#EF4444' : '#22C55E',
            padding: '0 6px',
          }}
        >
          {loading ? '…' : alerts.length}
        </span>
        {loading && (
          <span style={{ fontSize: '11px', color: '#991B1B', marginLeft: 'auto' }}>Chargement...</span>
        )}
        {error && (
          <span style={{ fontSize: '11px', color: '#EF4444', marginLeft: 'auto' }}>{error}</span>
        )}
      </div>

      {/* No alerts */}
      {!loading && alerts.length === 0 && (
        <div
          style={{
            color: '#22C55E',
            fontSize: '13px',
            fontWeight: 500,
            padding: '8px 0',
          }}
        >
          Aucune alerte critique — système sain ✓
        </div>
      )}

      {/* Alert rows */}
      {alerts.map((alert, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 0',
            borderBottom: i < alerts.length - 1 ? '1px solid #1a0e7a' : 'none',
            flexWrap: 'wrap',
          }}
        >
          {/* Pulsing red dot */}
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#EF4444',
              flexShrink: 0,
              animation: 'pulse-dot 1.5s ease-in-out infinite',
            }}
          />

          {/* Relative timestamp */}
          <span style={{ fontSize: '11px', color: '#94A3B8', whiteSpace: 'nowrap', minWidth: '80px' }}>
            {formatRelativeTime(alert.timestamp)}
          </span>

          {/* Matched IP */}
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              fontWeight: 600,
              color: '#EF4444',
              whiteSpace: 'nowrap',
            }}
          >
            {alert.matched_ip || alert.source_ip || 'N/A'}
          </span>

          {/* Type badge */}
          <TypeBadge logType={alert.log_type} />

          {/* Confidence badge */}
          <ConfidenceBadge score={alert.confidence_level} />

          {/* Event type */}
          {alert.event_type && (
            <span style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
              {alert.event_type}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
