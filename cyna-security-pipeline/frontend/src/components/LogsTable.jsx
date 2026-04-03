import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, ChevronDown, Download } from 'lucide-react'
import { fetchApi, buildQueryString } from '../hooks/useApi.js'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const CARD_STYLE = {
  backgroundColor: '#0a0550',
  border: '1px solid #1a0e7a',
  borderRadius: '12px',
  padding: '20px 24px',
}

const SEVERITY_COLORS = {
  low: '#22C55E',
  medium: '#F97316',
  high: '#EF4444',
  critical: '#7C00FF',
  info: '#3B82F6',
}

const TYPE_COLORS = {
  ids: '#3B82F6',
  access: '#8B5CF6',
  endpoint: '#10B981',
}

const TABS = [
  { key: 'all', label: 'Tous' },
  { key: 'ids', label: 'IDS' },
  { key: 'access', label: 'Access' },
]

function getConfidenceColor(score) {
  if (score >= 6) return '#EF4444'
  if (score >= 3) return '#F97316'
  return '#EAB308'
}

function SeverityBadge({ severity }) {
  const s = (severity || '').toLowerCase()
  const color = SEVERITY_COLORS[s] || '#94A3B8'
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
        textTransform: 'capitalize',
      }}
    >
      {severity || 'N/A'}
    </span>
  )
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
  const color = getConfidenceColor(score)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '22px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 700,
        color,
        backgroundColor: `${color}22`,
        border: `1px solid ${color}55`,
      }}
    >
      {score ?? 'N/A'}
    </span>
  )
}

function formatTimestamp(ts) {
  if (!ts) return 'N/A'
  try {
    return new Date(ts).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ts
  }
}

const SELECT_STYLE = {
  backgroundColor: '#040130',
  border: '1px solid #1a0e7a',
  color: '#F8FAFC',
  borderRadius: '6px',
  padding: '4px 8px',
  fontSize: '12px',
  outline: 'none',
  cursor: 'pointer',
}

export default function LogsTable({ filters, refreshToken }) {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortField, setSortField] = useState('timestamp')
  const [sortDir, setSortDir] = useState('desc')
  const [filterType, setFilterType] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [tabCounts, setTabCounts] = useState({ all: 0, ids: 0, access: 0, endpoint: 0 })
  const [exporting, setExporting] = useState(false)

  const limit = 20
  const totalPages = Math.ceil(total / limit)

  // Reset to page 1 when filters or tab change
  useEffect(() => {
    setPage(1)
  }, [filters, filterType, filterSeverity, refreshToken, activeTab])

  // Build effective types param: tab overrides global types filter if tab !== 'all'
  const effectiveTypes = activeTab !== 'all' ? activeTab : filters?.types

  useEffect(() => {
    setLoading(true)
    setError(null)
    const params = {
      ...filters,
      types: effectiveTypes,
      page,
      limit,
      sort_field: sortField,
      sort_dir: sortDir,
      filter_type: filterType || undefined,
      filter_severity: filterSeverity || undefined,
    }
    fetchApi('/api/logs' + buildQueryString(params))
      .then((res) => {
        setData(res.data || [])
        setTotal(res.total || 0)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filters, effectiveTypes, page, sortField, sortDir, filterType, filterSeverity, refreshToken])

  // Fetch tab counts using /api/type-severity
  useEffect(() => {
    fetchApi('/api/type-severity' + buildQueryString({ from_date: filters?.from_date, to_date: filters?.to_date }))
      .then((rows) => {
        const counts = { all: 0, ids: 0, access: 0, endpoint: 0 }
        for (const row of rows) {
          const t = row.log_type || ''
          const n = Number(row.count)
          counts.all += n
          if (t in counts) counts[t] += n
        }
        setTabCounts(counts)
      })
      .catch(() => {})
  }, [filters, refreshToken])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const exportParams = new URLSearchParams()
      const paramObj = {
        ...filters,
        types: effectiveTypes,
        filter_type: filterType || undefined,
        filter_severity: filterSeverity || undefined,
      }
      for (const [k, v] of Object.entries(paramObj)) {
        if (v !== null && v !== undefined && v !== '') {
          exportParams.set(k, String(v))
        }
      }
      const url = `${BASE}/api/logs/export?${exportParams.toString()}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `security_logs_${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronUp size={12} style={{ opacity: 0.3 }} />
    return sortDir === 'asc' ? (
      <ChevronUp size={12} style={{ color: '#7C00FF' }} />
    ) : (
      <ChevronDown size={12} style={{ color: '#7C00FF' }} />
    )
  }

  const thStyle = (field) => ({
    padding: '10px 12px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#94A3B8',
    textAlign: 'left',
    borderBottom: '1px solid #1a0e7a',
    backgroundColor: '#040130',
    cursor: field ? 'pointer' : 'default',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  })

  const tdStyle = {
    padding: '10px 12px',
    fontSize: '12px',
    color: '#F8FAFC',
    borderBottom: '1px solid #1a0e7a33',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={CARD_STYLE}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>
          Logs malveillants{' '}
          <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 400 }}>
            ({total.toLocaleString()} résultats)
          </span>
        </h2>

        {/* Export CSV button */}
        <button
          onClick={handleExport}
          disabled={exporting}
          title="Exporter en CSV"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: exporting ? 'not-allowed' : 'pointer',
            backgroundColor: '#1a0e7a',
            border: '1px solid #7C00FF44',
            color: '#F8FAFC',
            opacity: exporting ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          <Download size={13} style={exporting ? { animation: 'spin 1s linear infinite' } : {}} />
          {exporting ? 'Export...' : 'Export CSV'}
          <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
        </button>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '5px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: isActive ? 'none' : '1px solid #1a0e7a',
                backgroundColor: isActive ? '#7C00FF' : 'transparent',
                color: isActive ? '#F8FAFC' : '#94A3B8',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span
                  style={{
                    marginLeft: '6px',
                    fontSize: '10px',
                    color: isActive ? '#F8FAFCaa' : '#6B7280',
                  }}
                >
                  ({tabCounts[tab.key].toLocaleString()})
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Filters row */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Type filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={SELECT_STYLE}
        >
          <option value="">Tous types</option>
          <option value="ids">IDS</option>
          <option value="access">Access</option>
          <option value="endpoint">Endpoint</option>
        </select>

        {/* Severity filter */}
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          style={SELECT_STYLE}
        >
          <option value="">Toutes sévérités</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>

        {loading && (
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>Chargement...</span>
        )}
        {error && (
          <span style={{ fontSize: '11px', color: '#EF4444' }}>{error}</span>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={thStyle('timestamp')} onClick={() => handleSort('timestamp')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Timestamp <SortIcon field="timestamp" />
                </span>
              </th>
              <th style={thStyle('matched_ip')} onClick={() => handleSort('matched_ip')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  IP malveillante <SortIcon field="matched_ip" />
                </span>
              </th>
              <th style={thStyle('log_type')} onClick={() => handleSort('log_type')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Type <SortIcon field="log_type" />
                </span>
              </th>
              <th style={thStyle('severity')} onClick={() => handleSort('severity')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Sévérité <SortIcon field="severity" />
                </span>
              </th>
              <th style={thStyle('confidence_level')} onClick={() => handleSort('confidence_level')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Score <SortIcon field="confidence_level" />
                </span>
              </th>
              <th style={thStyle(null)}>Événement</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8', padding: '32px' }}>
                  Aucun log malveillant trouvé
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    backgroundColor: i % 2 === 0 ? 'transparent' : '#04013022',
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1a0e7a22')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'transparent' : '#04013022')}
                >
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8' }}>
                    {formatTimestamp(row.timestamp)}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#7C00FF', fontWeight: 500 }}>
                    {row.matched_ip || 'N/A'}
                  </td>
                  <td style={tdStyle}>
                    <TypeBadge logType={row.log_type} />
                  </td>
                  <td style={tdStyle}>
                    <SeverityBadge severity={row.severity} />
                  </td>
                  <td style={tdStyle}>
                    <ConfidenceBadge score={row.confidence_level} />
                  </td>
                  <td style={{ ...tdStyle, color: '#94A3B8', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.event_type || 'N/A'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '16px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '12px', color: '#94A3B8' }}>
            Page {page} / {totalPages} ({total.toLocaleString()} résultats)
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { icon: ChevronsLeft, action: () => setPage(1), disabled: page === 1, title: 'Première page' },
              { icon: ChevronLeft, action: () => setPage((p) => Math.max(1, p - 1)), disabled: page === 1, title: 'Page précédente' },
              { icon: ChevronRight, action: () => setPage((p) => Math.min(totalPages, p + 1)), disabled: page === totalPages, title: 'Page suivante' },
              { icon: ChevronsRight, action: () => setPage(totalPages), disabled: page === totalPages, title: 'Dernière page' },
            ].map(({ icon: Icon, action, disabled, title }) => (
              <button
                key={title}
                onClick={action}
                disabled={disabled}
                title={title}
                style={{
                  backgroundColor: disabled ? 'transparent' : '#040130',
                  border: '1px solid #1a0e7a',
                  color: disabled ? '#1a0e7a' : '#94A3B8',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
