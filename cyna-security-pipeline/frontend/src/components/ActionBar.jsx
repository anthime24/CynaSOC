import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Play, Download, CheckCircle, XCircle, Clock, Trash2, AlertTriangle } from 'lucide-react'
import { fetchApi } from '../hooks/useApi.js'

function ConfirmDialog({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      backgroundColor: 'rgba(4,1,48,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        backgroundColor: '#0a0550', border: '1px solid #EF4444',
        borderRadius: '14px', padding: '28px 32px', maxWidth: '400px', width: '90%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <AlertTriangle size={20} color="#EF4444" />
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#F8FAFC' }}>Réinitialiser les données</span>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94A3B8', lineHeight: 1.6 }}>
          Cette action supprimera <strong style={{ color: '#F8FAFC' }}>tous les logs et enrichissements</strong> de la base de données (<code style={{ color: '#EF4444' }}>TRUNCATE</code>), puis relancera le pipeline automatiquement. Impossible d'annuler.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            backgroundColor: 'transparent', border: '1px solid #1a0e7a', color: '#94A3B8', cursor: 'pointer',
          }}>
            Annuler
          </button>
          <button onClick={onConfirm} style={{
            padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            backgroundColor: '#EF4444', border: 'none', color: '#fff', cursor: 'pointer',
          }}>
            Oui, tout supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  const colors = {
    success: { bg: '#14532d', border: '#22C55E', text: '#22C55E' },
    error:   { bg: '#450a0a', border: '#EF4444', text: '#EF4444' },
    info:    { bg: '#1e1060', border: '#7C00FF', text: '#a78bfa' },
  }
  const c = colors[type] || colors.info

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      padding: '10px 16px', borderRadius: '10px',
      backgroundColor: c.bg, border: `1px solid ${c.border}`,
      color: c.text, fontSize: '13px', fontWeight: 600,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      animation: 'slideIn 0.2s ease',
    }}>
      {message}
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  )
}

function StatusBadge({ status, lastRun }) {
  let color = '#94A3B8'
  let Icon = Clock
  let label = 'Jamais exécuté'

  if (status === 'ok' || status === 'completed') {
    color = '#22C55E'; Icon = CheckCircle; label = 'OK'
  } else if (status === 'error') {
    color = '#EF4444'; Icon = XCircle; label = 'Erreur'
  } else if (status === 'running') {
    color = '#F97316'; Icon = RefreshCw; label = 'En cours...'
  }

  const formattedTime = lastRun
    ? (() => { try { return new Date(lastRun).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return lastRun } })()
    : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px', borderRadius: '8px',
      backgroundColor: `${color}15`, border: `1px solid ${color}44`,
    }}>
      <Icon size={13} color={color} style={status === 'running' ? { animation: 'spin 1s linear infinite' } : {}} />
      <span style={{ fontSize: '11px', color, fontWeight: 600 }}>{label}</span>
      {formattedTime && <span style={{ fontSize: '10px', color: '#94A3B8' }}>· {formattedTime}</span>}
      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </div>
  )
}

const BTN = {
  display: 'flex', alignItems: 'center', gap: '6px',
  padding: '6px 12px', borderRadius: '8px',
  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  border: 'none', transition: 'opacity 0.15s', whiteSpace: 'nowrap',
}

export default function ActionBar({ onRefresh }) {
  const [pipelineStatus, setPipelineStatus] = useState({ status: 'never_run', last_run: null })
  const [loading, setLoading] = useState(null) // 'refresh' | 'pipeline' | 'feed' | 'reset'
  const [toast, setToast] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const showToast = (message, type = 'info') => setToast({ message, type })

  const fetchStatus = useCallback(() => {
    fetchApi('/api/pipeline/status').then(setPipelineStatus).catch(() => {})
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 15000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = async () => {
    setShowConfirm(false)
    setLoading('reset')
    try {
      await fetchApi('/api/reset', { method: 'POST' })
      showToast('Base de données réinitialisée — lancement du pipeline...', 'info')
      // Relance automatique du pipeline
      await fetchApi('/api/pipeline/run', { method: 'POST' })
      setPipelineStatus({ status: 'running', last_run: new Date().toISOString() })
      let attempts = 0
      const poll = setInterval(() => {
        attempts++
        fetchApi('/api/pipeline/status').then((s) => {
          setPipelineStatus(s)
          if (s.status !== 'running' || attempts >= 120) {
            clearInterval(poll)
            if (s.status === 'completed') { showToast('Reset terminé — données régénérées', 'success'); onRefresh?.() }
            else if (s.status === 'error') showToast(`Erreur pipeline : ${s.detail || 'voir les logs'}`, 'error')
          }
        }).catch(() => { if (attempts >= 120) clearInterval(poll) })
      }, 5000)
    } catch (e) {
      showToast(`Erreur reset : ${e.message}`, 'error')
    } finally {
      setLoading(null)
    }
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setLoading('refresh')
    try {
      await fetchApi('/api/refresh')
      onRefresh?.()
      showToast('Données rafraîchies', 'success')
    } catch {
      showToast('Erreur lors du rafraîchissement', 'error')
    } finally {
      setLoading(null)
    }
  }

  // ── Run Pipeline ───────────────────────────────────────────────────────────
  const handleRunPipeline = async () => {
    if (loading) return
    setLoading('pipeline')
    try {
      await fetchApi('/api/pipeline/run', { method: 'POST' })
      setPipelineStatus({ status: 'running', last_run: new Date().toISOString() })
      showToast('Pipeline démarré — polling toutes les 5s', 'info')

      let attempts = 0
      const poll = setInterval(() => {
        attempts++
        fetchApi('/api/pipeline/status').then((s) => {
          setPipelineStatus(s)
          if (s.status !== 'running' || attempts >= 120) {
            clearInterval(poll)
            if (s.status === 'completed') {
              showToast('Pipeline terminé avec succès', 'success')
              onRefresh?.()
            } else if (s.status === 'error') {
              showToast(`Erreur pipeline : ${s.detail || 'voir les logs'}`, 'error')
            }
          }
        }).catch(() => { if (attempts >= 120) clearInterval(poll) })
      }, 5000)
    } catch (e) {
      showToast(`Impossible de lancer le pipeline : ${e.message}`, 'error')
    } finally {
      setLoading(null)
    }
  }

  // ── Update Feed ────────────────────────────────────────────────────────────
  const handleUpdateFeed = async () => {
    if (loading) return
    setLoading('feed')
    try {
      await fetchApi('/api/pipeline/update-feed', { method: 'POST' })
      showToast('Mise à jour du feed démarrée...', 'info')

      let attempts = 0
      const poll = setInterval(() => {
        attempts++
        fetchApi('/api/pipeline/feed-status').then((s) => {
          if (s.status !== 'running' || attempts >= 120) {
            clearInterval(poll)
            if (s.status === 'completed') showToast('Feed ipsum mis à jour', 'success')
            else if (s.status === 'error') showToast(`Erreur feed : ${s.detail || 'voir les logs'}`, 'error')
          }
        }).catch(() => { if (attempts >= 120) clearInterval(poll) })
      }, 5000)
    } catch (e) {
      showToast(`Impossible de mettre à jour le feed : ${e.message}`, 'error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {showConfirm && <ConfirmDialog onConfirm={handleReset} onCancel={() => setShowConfirm(false)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <StatusBadge status={pipelineStatus.status} lastRun={pipelineStatus.last_run} />
        <div style={{ width: '1px', height: '28px', backgroundColor: '#1a0e7a' }} />

        <button onClick={() => setShowConfirm(true)} disabled={!!loading} title="Supprimer toutes les données et relancer le pipeline"
          style={{ ...BTN, backgroundColor: '#450a0a', color: '#FCA5A5', border: '1px solid #EF444466', opacity: loading ? 0.5 : 1 }}>
          <Trash2 size={13} />
          {loading === 'reset' ? 'Reset...' : 'Reset'}
        </button>

        <div style={{ width: '1px', height: '28px', backgroundColor: '#1a0e7a' }} />

        <button onClick={handleRefresh} disabled={loading === 'refresh'} title="Rafraîchir les données"
          style={{ ...BTN, backgroundColor: '#1a0e7a', color: '#F8FAFC', opacity: loading === 'refresh' ? 0.5 : 1 }}>
          <RefreshCw size={13} style={loading === 'refresh' ? { animation: 'spin 0.7s linear infinite' } : {}} />
          Refresh
        </button>

        <button onClick={handleRunPipeline} disabled={!!loading} title="Lancer le pipeline complet"
          style={{ ...BTN, backgroundColor: '#7C00FF', color: '#F8FAFC', opacity: loading ? 0.5 : 1 }}>
          <Play size={13} style={loading === 'pipeline' ? { animation: 'spin 1s linear infinite' } : {}} />
          {loading === 'pipeline' ? 'Démarrage...' : 'Run Pipeline'}
        </button>

        <button onClick={handleUpdateFeed} disabled={!!loading} title="Mettre à jour le feed ipsum"
          style={{ ...BTN, backgroundColor: '#302082', color: '#F8FAFC', border: '1px solid #7C00FF44', opacity: loading ? 0.5 : 1 }}>
          <Download size={13} style={loading === 'feed' ? { animation: 'spin 1s linear infinite' } : {}} />
          {loading === 'feed' ? 'Mise à jour...' : 'Update Feed'}
        </button>
      </div>
    </>
  )
}
