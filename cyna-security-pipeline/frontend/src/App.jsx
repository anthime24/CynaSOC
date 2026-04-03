import React, { useState, useEffect, useCallback } from 'react'
import { Sun, Moon } from 'lucide-react'
import KPICards from './components/KPICards.jsx'
import Timeline from './components/Timeline.jsx'
import TopIPs from './components/TopIPs.jsx'
import TypeSeverityCharts from './components/TypeSeverityCharts.jsx'
import LogsTable from './components/LogsTable.jsx'
import ActionBar from './components/ActionBar.jsx'
import CriticalAlerts from './components/CriticalAlerts.jsx'

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') !== 'false')
  const [filters, setFilters] = useState({
    from_date: '',
    to_date: '',
    types: ['ids', 'access'],
    min_confidence: 1,
  })

  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    document.body.style.backgroundColor = darkMode ? '#040130' : '#F0EFED'
    localStorage.setItem('darkMode', darkMode)
  }, [darkMode])

  const triggerRefresh = useCallback(() => {
    setRefreshToken((t) => t + 1)
  }, [])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(triggerRefresh, 30000)
    return () => clearInterval(id)
  }, [triggerRefresh])

  const handleTypeToggle = (type) => {
    setFilters((prev) => {
      const current = prev.types
      if (current.includes(type)) {
        return { ...prev, types: current.filter((t) => t !== type) }
      } else {
        return { ...prev, types: [...current, type] }
      }
    })
  }

  // Convert types array to CSV string for API
  const apiFilters = {
    from_date: filters.from_date || undefined,
    to_date: filters.to_date || undefined,
    types: filters.types.length > 0 ? filters.types.join(',') : undefined,
    min_confidence: filters.min_confidence > 1 ? filters.min_confidence : undefined,
  }

  const typeColors = {
    ids: '#3B82F6',
    access: '#8B5CF6',
    endpoint: '#10B981',
  }

  const DM = darkMode
  const textPrimary = DM ? '#F8FAFC' : '#1e1b4b'
  const textSecondary = '#94A3B8'
  const inputStyle = {
    backgroundColor: DM ? '#040130' : '#FFFFFF',
    border: `1px solid ${DM ? '#1a0e7a' : '#CBD5E1'}`,
    color: DM ? '#F8FAFC' : '#1e1b4b',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    outline: 'none',
  }

  return (
    <div style={{ backgroundColor: DM ? '#040130' : '#F0EFED', minHeight: '100vh', color: textPrimary }}>
      {/* Header — always dark for branding */}
      <header
        style={{
          background: 'linear-gradient(135deg, #040130 0%, #0a0550 100%)',
          borderBottom: '1px solid #1a0e7a',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img
            src="/logo-cyna.svg"
            alt="Cyna"
            style={{ height: '32px', width: 'auto' }}
          />
          <div style={{ width: '1px', height: '28px', backgroundColor: '#1a0e7a' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#F8FAFC', letterSpacing: '0.05em' }}>
              SOC Dashboard
            </h1>
            <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8' }}>
              Security Operations Center
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setDarkMode((d) => !d)}
            title={DM ? 'Passer en mode clair' : 'Passer en mode sombre'}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #1a0e7a',
              borderRadius: '8px',
              padding: '6px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: '#94A3B8',
            }}
          >
            {DM ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <ActionBar onRefresh={triggerRefresh} />
        </div>
      </header>

      {/* Filters Bar */}
      <div
        style={{
          backgroundColor: DM ? '#0a0550' : '#F8FAFC',
          borderBottom: `1px solid ${DM ? '#1a0e7a' : '#E2E8F0'}`,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        {/* Date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: textSecondary, whiteSpace: 'nowrap' }}>De</label>
          <input
            type="datetime-local"
            value={filters.from_date}
            onChange={(e) => setFilters((prev) => ({ ...prev, from_date: e.target.value }))}
            style={inputStyle}
          />
          <label style={{ fontSize: '12px', color: textSecondary, whiteSpace: 'nowrap' }}>À</label>
          <input
            type="datetime-local"
            value={filters.to_date}
            onChange={(e) => setFilters((prev) => ({ ...prev, to_date: e.target.value }))}
            style={inputStyle}
          />
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '28px', backgroundColor: DM ? '#1a0e7a' : '#CBD5E1' }} />

        {/* Log type checkboxes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: textSecondary, marginRight: '8px' }}>Types</span>
          {['ids', 'access'].map((type) => (
            <label
              key={type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: '16px',
                border: `1px solid ${filters.types.includes(type) ? typeColors[type] : (DM ? '#1a0e7a' : '#CBD5E1')}`,
                backgroundColor: filters.types.includes(type) ? `${typeColors[type]}22` : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <input
                type="checkbox"
                checked={filters.types.includes(type)}
                onChange={() => handleTypeToggle(type)}
                style={{ accentColor: typeColors[type], cursor: 'pointer' }}
              />
              <span style={{ fontSize: '12px', color: filters.types.includes(type) ? typeColors[type] : '#94A3B8', fontWeight: 500 }}>
                {type.toUpperCase()}
              </span>
            </label>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '28px', backgroundColor: DM ? '#1a0e7a' : '#CBD5E1' }} />

        {/* Confidence slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: textSecondary, whiteSpace: 'nowrap' }}>
            Score min
          </span>
          <input
            type="range"
            min={1}
            max={8}
            value={filters.min_confidence}
            onChange={(e) => setFilters((prev) => ({ ...prev, min_confidence: Number(e.target.value) }))}
            style={{ accentColor: '#7C00FF', width: '100px', cursor: 'pointer' }}
          />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#7C00FF',
              minWidth: '16px',
              textAlign: 'center',
            }}
          >
            {filters.min_confidence}
          </span>
        </div>

        {/* Reset filters */}
        <button
          onClick={() =>
            setFilters({ from_date: '', to_date: '', types: ['ids', 'access'], min_confidence: 1 })
          }
          style={{
            marginLeft: 'auto',
            backgroundColor: 'transparent',
            border: `1px solid ${DM ? '#1a0e7a' : '#CBD5E1'}`,
            color: textSecondary,
            borderRadius: '6px',
            padding: '4px 12px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Réinitialiser
        </button>
      </div>

      {/* Main content */}
      <main style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
        {/* Row 1: KPI cards */}
        <KPICards filters={apiFilters} refreshToken={refreshToken} darkMode={DM} />

        {/* Alertes critiques live */}
        <div style={{ marginTop: '20px' }}>
          <CriticalAlerts filters={apiFilters} refreshToken={refreshToken} darkMode={DM} />
        </div>

        {/* Row 2: Timeline */}
        <div style={{ marginTop: '24px' }}>
          <Timeline filters={apiFilters} refreshToken={refreshToken} darkMode={DM} />
        </div>

        {/* Row 3: TopIPs + TypeSeverity */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '5fr 7fr',
            gap: '24px',
            marginTop: '24px',
          }}
        >
          <TopIPs filters={apiFilters} refreshToken={refreshToken} darkMode={DM} />
          <TypeSeverityCharts filters={apiFilters} refreshToken={refreshToken} darkMode={DM} />
        </div>

        {/* Row 4: Logs Table */}
        <div style={{ marginTop: '24px' }}>
          <LogsTable filters={apiFilters} refreshToken={refreshToken} darkMode={DM} />
        </div>
      </main>
    </div>
  )
}
