import React, { useState, useEffect } from 'react'
import { Shield, AlertTriangle, Percent, Fingerprint, Monitor } from 'lucide-react'
import { fetchApi, buildQueryString } from '../hooks/useApi.js'

const CARD_STYLE = {
  backgroundColor: '#0a0550',
  border: '1px solid #1a0e7a',
  borderRadius: '12px',
  padding: '20px 24px',
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  flex: 1,
}

function getThreatColor(value, type) {
  if (type === 'rate') {
    if (value > 10) return '#EF4444'
    if (value > 5) return '#F97316'
    return '#22C55E'
  }
  if (type === 'malicious') {
    if (value > 1000) return '#EF4444'
    if (value > 100) return '#F97316'
    return '#22C55E'
  }
  return '#F8FAFC'
}

function KPICard({ icon: Icon, iconColor, value, label, valueColor, subValue }) {
  return (
    <div style={CARD_STYLE}>
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '10px',
          backgroundColor: `${iconColor}22`,
          border: `1px solid ${iconColor}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={22} color={iconColor} />
      </div>
      <div>
        <div
          style={{
            fontSize: '28px',
            fontWeight: 800,
            color: valueColor || '#F8FAFC',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px', fontWeight: 500 }}>
          {label}
        </div>
        {subValue && (
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
            {subValue}
          </div>
        )}
      </div>
    </div>
  )
}

export default function KPICards({ filters, refreshToken }) {
  const [data, setData] = useState(null)
  const [endpointData, setEndpointData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const showEndpointCard = true

  useEffect(() => {
    setLoading(true)
    setError(null)

    const kpiPromise = fetchApi('/api/kpis' + buildQueryString(filters))
    const endpointParams = { from_date: filters?.from_date, to_date: filters?.to_date }
    const endpointPromise = fetchApi('/api/endpoint-stats' + buildQueryString(endpointParams))

    Promise.all([kpiPromise, endpointPromise])
      .then(([kpiRes, epRes]) => {
        setData(kpiRes)
        setEndpointData(epRes)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filters, refreshToken])

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', gap: '16px' }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              ...CARD_STYLE,
              backgroundColor: '#0a0550',
              opacity: 0.5,
              minHeight: '88px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          backgroundColor: '#0a0550',
          border: '1px solid #EF4444',
          borderRadius: '12px',
          padding: '16px',
          color: '#EF4444',
          fontSize: '13px',
        }}
      >
        Erreur chargement KPIs: {error}
      </div>
    )
  }

  const total = data?.total_logs ?? 0
  const malicious = data?.malicious_logs ?? 0
  const rate = data?.threat_rate ?? 0
  const unique = data?.unique_ips ?? 0

  const epTotal = endpointData?.total ?? 0
  const epMalware = endpointData?.malware_detected ?? 0
  const epScans = endpointData?.scans_performed ?? 0

  const gridCols = 'repeat(5, 1fr)'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '16px' }}>
      <KPICard
        icon={Shield}
        iconColor="#7C00FF"
        value={total.toLocaleString()}
        label="Total logs"
      />
      <KPICard
        icon={AlertTriangle}
        iconColor="#EF4444"
        value={malicious.toLocaleString()}
        label="Logs malveillants"
        valueColor={getThreatColor(malicious, 'malicious')}
      />
      <KPICard
        icon={Percent}
        iconColor="#F97316"
        value={`${rate.toFixed(1)}%`}
        label="Taux de menace"
        valueColor={getThreatColor(rate, 'rate')}
      />
      <KPICard
        icon={Fingerprint}
        iconColor="#3B82F6"
        value={unique.toLocaleString()}
        label="IPs malveillantes uniques"
      />
      {showEndpointCard && (
        <KPICard
          icon={Monitor}
          iconColor="#3B82F6"
          value={epTotal.toLocaleString()}
          label="Endpoint Events"
          subValue={`${epMalware.toLocaleString()} malwares | ${epScans.toLocaleString()} scans`}
        />
      )}
    </div>
  )
}
