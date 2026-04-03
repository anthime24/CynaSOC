import React, { useState, useEffect } from 'react'
import { fetchApi } from '../hooks/useApi.js'

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A'
  try {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function FeedStats() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchApi('/api/feed-stats')
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div
      style={{
        backgroundColor: '#0a0550',
        border: '1px solid #1a0e7a',
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
      }}
    >
      {/* Main count */}
      <div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: '#F8FAFC', lineHeight: 1.1 }}>
          {loading ? '…' : error ? '—' : (data?.total_ips ?? 0).toLocaleString()}
        </div>
        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', fontWeight: 500 }}>
          IPs en blacklist
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '36px', backgroundColor: '#1a0e7a', flexShrink: 0 }} />

      {/* Confidence badges */}
      {!loading && !error && data && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#EF4444',
              backgroundColor: '#EF444422',
              border: '1px solid #EF444444',
              whiteSpace: 'nowrap',
            }}
          >
            Score ≥6 : {data.high_confidence.toLocaleString()}
          </span>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#F97316',
              backgroundColor: '#F9731622',
              border: '1px solid #F9731644',
              whiteSpace: 'nowrap',
            }}
          >
            Score 3-5 : {data.medium_confidence.toLocaleString()}
          </span>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#EAB308',
              backgroundColor: '#EAB30822',
              border: '1px solid #EAB30844',
              whiteSpace: 'nowrap',
            }}
          >
            Score 1-2 : {data.low_confidence.toLocaleString()}
          </span>
        </div>
      )}

      {error && (
        <span style={{ fontSize: '12px', color: '#EF4444' }}>{error}</span>
      )}

      {/* Last updated */}
      {!loading && !error && data?.last_updated && (
        <>
          <div style={{ width: '1px', height: '36px', backgroundColor: '#1a0e7a', flexShrink: 0 }} />
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>
            Dernière MAJ : <span style={{ color: '#F8FAFC', fontWeight: 500 }}>{formatDateTime(data.last_updated)}</span>
          </div>
        </>
      )}
    </div>
  )
}
