import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  Radio,
  FileVideo,
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
  ArrowRight,
  ShieldAlert,
  Send,
  Info,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { YouTubeIcon } from '../components/YouTubeIcon';
import { api } from '../lib/api';
import type { Publication, PublicationTarget } from '../lib/api';
import type { SSEEventData } from '../hooks/useSSE';

interface MonitoringViewProps {
  publications: Publication[];
  latestEvent: SSEEventData | null;
  sseConnected: boolean;
  onRefresh: () => void;
  onNavigateToAccounts?: () => void;
  onNavigateToPublish?: () => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = ({
  publications,
  latestEvent,
  sseConnected,
  onRefresh,
  onNavigateToAccounts,
  onNavigateToPublish,
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'succeeded' | 'failed'>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [eventHistory, setEventHistory] = useState<Array<SSEEventData & { id: string }>>([]);
  const [expandedPubIds, setExpandedPubIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Rekam riwayat SSE event
  useEffect(() => {
    if (latestEvent) {
      setEventHistory((prev) => [
        { ...latestEvent, id: `${Date.now()}_${Math.random().toString(36).substring(7)}` },
        ...prev.slice(0, 19),
      ]);
    }
  }, [latestEvent]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const copyToClipboard = (text: string, id: string, label: string = 'Tersalin!') => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast(label);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
      showToast('Data berhasil diperbarui');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleRetry = async (pubId: string) => {
    setRetryingId(pubId);
    try {
      const res = await api.retryPublication(pubId);
      showToast(res.message);
      await onRefresh();
    } catch (err: any) {
      showToast(`Gagal retry: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  const toggleExpand = (pubId: string) => {
    setExpandedPubIds((prev) => ({ ...prev, [pubId]: !prev[pubId] }));
  };

  // Metrik Statistik Cepat
  const totalCount = publications.length;
  const activeCount = publications.filter(
    (p) => p.status === 'queued' || p.status === 'processing' || p.status === 'preparing'
  ).length;
  const succeededCount = publications.filter((p) => p.status === 'succeeded').length;
  const failedCount = publications.filter(
    (p) => p.status === 'failed' || p.status === 'partially_succeeded'
  ).length;

  // Filter Data
  const filteredPublications = publications.filter((p) => {
    // Status Filter
    if (filter === 'succeeded' && p.status !== 'succeeded') return false;
    if (filter === 'failed' && p.status !== 'failed' && p.status !== 'partially_succeeded') return false;
    if (
      filter === 'active' &&
      p.status !== 'queued' &&
      p.status !== 'processing' &&
      p.status !== 'preparing'
    )
      return false;

    // Platform Filter
    if (platformFilter !== 'all') {
      const hasPlatform = p.targets.some((t) => t.platform === platformFilter);
      if (!hasPlatform) return false;
    }

    // Search Query (Filename, Target Title, Publication ID)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchFile = p.mediaFilename?.toLowerCase().includes(q);
      const matchId = p.id.toLowerCase().includes(q);
      const matchTargetTitle = p.targets.some((t) => t.title?.toLowerCase().includes(q));
      if (!matchFile && !matchId && !matchTargetTitle) return false;
    }

    return true;
  });

  // Badge Status Keseluruhan
  const getOverallStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
        return (
          <span className="badge badge-success" style={{ gap: '6px', padding: '4px 12px' }}>
            <CheckCircle2 size={14} /> Berhasil Terbit
          </span>
        );
      case 'partially_succeeded':
        return (
          <span className="badge badge-warning" style={{ gap: '6px', padding: '4px 12px' }}>
            <AlertCircle size={14} /> Sebagian Berhasil
          </span>
        );
      case 'processing':
      case 'uploading':
      case 'preparing':
        return (
          <span className="badge badge-info" style={{ gap: '6px', padding: '4px 12px' }}>
            <span className="pulse-dot-info" /> Sedang Diproses
          </span>
        );
      case 'queued':
      case 'scheduled':
        return (
          <span className="badge badge-warning" style={{ gap: '6px', padding: '4px 12px' }}>
            <Clock size={14} /> Dalam Antrean
          </span>
        );
      case 'failed':
        return (
          <span className="badge badge-error" style={{ gap: '6px', padding: '4px 12px' }}>
            <AlertCircle size={14} /> Gagal
          </span>
        );
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  // Pipeline Stepper Progress (4 tahapan: Queued -> Preparing -> Uploading -> Published/Failed)
  const renderPipelineStepper = (target: PublicationTarget) => {
    const isFailed = target.status === 'failed' || target.status === 'reauthorization_required';
    const isPublished = target.status === 'published';
    const isUploading = target.status === 'uploading';
    const isPreparing = target.status === 'preparing';
    const isQueued = target.status === 'queued' || target.status === 'scheduled';

    const steps = [
      {
        id: 'queued',
        label: 'Antrean',
        desc: 'Menunggu worker',
        done: isPreparing || isUploading || isPublished || isFailed,
        active: isQueued && !isFailed,
        error: false,
      },
      {
        id: 'preparing',
        label: 'Persiapan',
        desc: 'Validasi token & media',
        done: isUploading || isPublished,
        active: isPreparing && !isFailed,
        error: isFailed && (target.lastErrorCode === 'MOCK_ACCOUNT_USED' || target.lastErrorCode === 'DEPENDENCY_MISSING'),
      },
      {
        id: 'uploading',
        label: 'Pengiriman',
        desc: 'Resumable upload',
        done: isPublished,
        active: isUploading && !isFailed,
        error: isFailed && target.lastErrorCode === 'REAUTHORIZATION_REQUIRED',
      },
      {
        id: 'published',
        label: isFailed ? 'Gagal' : 'Terbit',
        desc: isFailed ? (target.lastErrorCode || 'Error') : 'Live di YouTube',
        done: isPublished,
        active: isPublished,
        error: isFailed,
      },
    ];

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          margin: '8px 0',
          flexWrap: 'wrap',
        }}
      >
        {steps.map((step, idx) => {
          let chipBg = 'rgba(255, 255, 255, 0.03)';
          let chipBorder = 'rgba(255, 255, 255, 0.06)';
          let chipColor = 'var(--text-dim)';

          if (step.error) {
            chipBg = 'var(--color-error-bg)';
            chipBorder = 'rgba(239, 68, 68, 0.3)';
            chipColor = '#f87171';
          } else if (step.done) {
            chipBg = 'var(--color-success-bg)';
            chipBorder = 'rgba(16, 185, 129, 0.25)';
            chipColor = '#34d399';
          } else if (step.active) {
            chipBg = 'rgba(99, 102, 241, 0.15)';
            chipBorder = 'rgba(99, 102, 241, 0.4)';
            chipColor = '#818cf8';
          }

          return (
            <React.Fragment key={step.id}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  background: chipBg,
                  border: `1px solid ${chipBorder}`,
                  color: chipColor,
                  lineHeight: 1.2,
                }}
              >
                {step.error ? (
                  <XCircle size={12} color="#f87171" />
                ) : step.done ? (
                  <CheckCircle size={12} color="#34d399" />
                ) : step.active ? (
                  <span className="pulse-dot-info" style={{ width: '6px', height: '6px' }} />
                ) : (
                  <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>{idx + 1}</span>
                )}
                <span>{step.label}</span>
              </div>
              {idx < steps.length - 1 && (
                <span style={{ color: 'rgba(255, 255, 255, 0.2)', fontSize: '0.7rem' }}>→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1160px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            background: 'rgba(22, 30, 51, 0.95)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px -3px var(--primary-glow)',
            backdropFilter: 'blur(16px)',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.85rem',
            fontWeight: 600,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <Info size={16} color="var(--primary)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Connection Ribbon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Live Monitoring & Riwayat Publikasi</h1>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 600,
                background: sseConnected ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                border: `1px solid ${sseConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                color: sseConnected ? '#34d399' : '#f87171',
              }}
            >
              <span className={sseConnected ? 'pulse-dot' : 'pulse-dot-error'} />
              {sseConnected ? 'SSE Live Stream Aktif' : 'SSE Terputus (Reconnecting)'}
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Pantau status pipeline video, log eksekusi adapter, dan tautan publikasi secara real-time
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowConsole(!showConsole)}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.8rem' }}
          >
            <Terminal size={15} color="var(--primary)" />
            {showConsole ? 'Sembunyikan Terminal' : `Log Streaming (${eventHistory.length})`}
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.8rem' }}
            title="Muat Ulang Data"
          >
            <RotateCcw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            Muat Ulang
          </button>
        </div>
      </div>

      {/* Live SSE Console Drawer */}
      {showConsole && (
        <div className="live-console" style={{ marginBottom: '24px' }}>
          <div className="live-console-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={14} color="var(--primary)" />
              <span style={{ fontWeight: 700, color: '#e2e8f0' }}>Server-Sent Events (SSE) Activity Stream</span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              Menampilkan {eventHistory.length} event terakhir
            </span>
          </div>
          <div className="live-console-body">
            {eventHistory.length === 0 ? (
              <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                Menunggu event masuk dari server...
              </span>
            ) : (
              eventHistory.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '3px 0',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    style={{
                      background: 'rgba(99, 102, 241, 0.2)',
                      color: '#818cf8',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                    }}
                  >
                    {ev.platform?.toUpperCase() || 'SYSTEM'}
                  </span>
                  <span
                    style={{
                      color:
                        ev.status === 'published'
                          ? '#34d399'
                          : ev.status === 'failed'
                          ? '#f87171'
                          : '#fbbf24',
                      fontWeight: 600,
                    }}
                  >
                    [{ev.status}]
                  </span>
                  <span style={{ color: '#cbd5e1' }}>
                    {ev.message || `Status diubah menjadi ${ev.status}`}
                  </span>
                  {ev.details?.url && (
                    <a
                      href={ev.details.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#60a5fa', marginLeft: 'auto', textDecoration: 'underline' }}
                    >
                      Buka URL
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Interactive Metrik Overview Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '24px',
        }}
      >
        {/* Total Card */}
        <div
          onClick={() => setFilter('all')}
          className={`stat-card ${filter === 'all' ? 'active' : ''}`}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileVideo size={22} color="var(--primary)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>
              TOTAL PUBLIKASI
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{totalCount}</div>
          </div>
        </div>

        {/* Active Card */}
        <div
          onClick={() => setFilter('active')}
          className={`stat-card ${filter === 'active' ? 'active' : ''}`}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={22} color="var(--color-warning)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>
              DALAM PROSES
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-warning)' }}>
              {activeCount}
            </div>
          </div>
        </div>

        {/* Succeeded Card */}
        <div
          onClick={() => setFilter('succeeded')}
          className={`stat-card ${filter === 'succeeded' ? 'active' : ''}`}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle2 size={22} color="var(--color-success)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>
              BERHASIL TERBIT
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-success)' }}>
              {succeededCount}
            </div>
          </div>
        </div>

        {/* Failed Card */}
        <div
          onClick={() => setFilter('failed')}
          className={`stat-card ${filter === 'failed' ? 'active' : ''}`}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertCircle size={22} color="var(--color-error)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>
              GAGAL / PERLU AKSI
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-error)' }}>
              {failedCount}
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div
        className="glass-panel"
        style={{
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Search Bar */}
        <div
          style={{
            position: 'relative',
            flex: '1 1 260px',
            maxWidth: '380px',
          }}
        >
          <Search
            size={16}
            color="var(--text-dim)"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            placeholder="Cari nama file, judul, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            style={{ paddingLeft: '36px', fontSize: '0.82rem', height: '38px' }}
          />
        </div>

        {/* Filter Pills & Selects */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Status Tab Pills */}
          {(
            [
              { id: 'all', label: 'Semua', count: totalCount },
              { id: 'active', label: 'Dalam Proses', count: activeCount },
              { id: 'succeeded', label: 'Berhasil', count: succeededCount },
              { id: 'failed', label: 'Gagal', count: failedCount },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`btn ${filter === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: '0.78rem' }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '0 6px',
                  borderRadius: '9999px',
                  background: filter === tab.id ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}

          {/* Platform selector */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="select"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem', height: '34px' }}
          >
            <option value="all">Semua Platform</option>
            <option value="youtube">YouTube</option>
            <option value="mock">Mock Simulator</option>
          </select>
        </div>
      </div>

      {/* Publications List */}
      {filteredPublications.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '60px 20px',
            textAlign: 'center',
          }}
        >
          <Activity size={44} color="var(--text-dim)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>
            {publications.length === 0
              ? 'Belum Ada Publikasi Video'
              : 'Tidak ada publikasi yang cocok dengan filter'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            {publications.length === 0
              ? 'Mulai unggah video dan distribusikan ke channel media sosial Anda.'
              : 'Coba ubah kata kunci pencarian atau reset filter untuk melihat data lainnya.'}
          </p>

          {publications.length === 0 ? (
            onNavigateToPublish && (
              <button onClick={onNavigateToPublish} className="btn btn-primary">
                <Send size={15} /> Buat Publikasi Sekarang
              </button>
            )
          ) : (
            <button
              onClick={() => {
                setFilter('all');
                setPlatformFilter('all');
                setSearchQuery('');
              }}
              className="btn btn-secondary"
            >
              Reset Filter
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredPublications.map((pub) => {
            const isExpanded = !!expandedPubIds[pub.id];
            const hasFailedTargets = pub.targets.some((t) => t.status === 'failed');

            return (
              <div
                key={pub.id}
                className="glass-panel"
                style={{
                  padding: '20px',
                  border:
                    pub.status === 'failed'
                      ? '1px solid rgba(239, 68, 68, 0.25)'
                      : pub.status === 'succeeded'
                      ? '1px solid rgba(16, 185, 129, 0.2)'
                      : '1px solid var(--border-subtle)',
                  transition: 'border-color 0.2s ease',
                }}
              >
                {/* Header Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    paddingBottom: '14px',
                    marginBottom: '14px',
                  }}
                >
                  {/* Left: Media File Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background:
                          pub.status === 'succeeded'
                            ? 'rgba(16, 185, 129, 0.12)'
                            : pub.status === 'failed'
                            ? 'rgba(239, 68, 68, 0.12)'
                            : 'rgba(99, 102, 241, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      <FileVideo
                        size={22}
                        color={
                          pub.status === 'succeeded'
                            ? 'var(--color-success)'
                            : pub.status === 'failed'
                            ? 'var(--color-error)'
                            : 'var(--primary)'
                        }
                      />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '2px' }}>
                        {pub.mediaFilename || 'Video Publikasi'}
                      </h3>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '0.74rem',
                          color: 'var(--text-dim)',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                          onClick={() => copyToClipboard(pub.id, pub.id, 'ID Publikasi disalin!')}
                          title="Klik untuk salin ID Publikasi"
                        >
                          ID: {pub.id.substring(0, 8)}...
                          {copiedId === pub.id ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        </span>
                        <span>•</span>
                        <span>{new Date(pub.createdAt).toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Status Badge & Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {getOverallStatusBadge(pub.status)}

                    {hasFailedTargets && (
                      <button
                        onClick={() => handleRetry(pub.id)}
                        disabled={retryingId === pub.id}
                        className="btn btn-secondary"
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          background: 'rgba(239, 68, 68, 0.1)',
                          borderColor: 'rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                        }}
                      >
                        <RotateCcw size={13} className={retryingId === pub.id ? 'animate-spin' : ''} />
                        {retryingId === pub.id ? 'Mengantrekan...' : 'Coba Lagi'}
                      </button>
                    )}

                    <button
                      onClick={() => toggleExpand(pub.id)}
                      className="btn btn-ghost"
                      style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                      title="Lihat Detail Teknis"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      <span style={{ fontSize: '0.75rem' }}>{isExpanded ? 'Tutup' : 'Detail'}</span>
                    </button>
                  </div>
                </div>

                {/* Targets List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {pub.targets.map((target) => {
                    const isFailed =
                      target.status === 'failed' || target.status === 'reauthorization_required';
                    const isPublished = target.status === 'published';
                    const errorMessage =
                      target.error?.message || target.lastErrorMessage || 'Publikasi gagal diproses.';
                    const errorCode = target.error?.code || target.lastErrorCode || 'PUBLISH_FAILED';
                    const isAuthError =
                      errorCode === 'REAUTHORIZATION_REQUIRED' || errorCode === 'MOCK_ACCOUNT_USED';

                    return (
                      <div
                        key={target.id}
                        style={{
                          borderRadius: 'var(--radius-md)',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          padding: '12px 14px',
                        }}
                      >
                        {/* Target Platform & Status Header */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '8px',
                                background: target.platform === 'youtube' ? 'rgba(255, 0, 51, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {target.platform === 'youtube' ? (
                                <YouTubeIcon size={16} />
                              ) : (
                                <Activity size={16} color="var(--primary)" />
                              )}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'capitalize' }}>
                                  {target.platform}
                                </span>
                                {target.visibility && (
                                  <span
                                    style={{
                                      fontSize: '0.68rem',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      background: 'rgba(255, 255, 255, 0.06)',
                                      color: 'var(--text-dim)',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    {target.visibility}
                                  </span>
                                )}
                              </div>
                              {target.title && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  <strong>Judul:</strong> {target.title}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Quick Target Status */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {target.status === 'published' ? (
                              <span className="badge badge-success" style={{ gap: '4px' }}>
                                <CheckCircle2 size={13} /> Selesai
                              </span>
                            ) : isFailed ? (
                              <span className="badge badge-error" style={{ gap: '4px' }}>
                                <AlertCircle size={13} /> Gagal ({errorCode})
                              </span>
                            ) : target.status === 'uploading' ? (
                              <span className="badge badge-info" style={{ gap: '4px' }}>
                                <span className="pulse-dot-info" /> Mengunggah...
                              </span>
                            ) : target.status === 'preparing' ? (
                              <span className="badge badge-info" style={{ gap: '4px' }}>
                                <span className="pulse-dot-info" /> Mempersiapkan...
                              </span>
                            ) : (
                              <span className="badge badge-warning" style={{ gap: '4px' }}>
                                <Clock size={13} /> Dalam Antrean
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Interactive Visual Pipeline Stepper */}
                        {renderPipelineStepper(target)}

                        {/* Actionable Outcomes */}
                        {/* 1. If Published: Show YouTube Link Button */}
                        {isPublished && target.externalPostUrl && (
                          <div
                            style={{
                              marginTop: '10px',
                              padding: '12px 14px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(16, 185, 129, 0.08)',
                              border: '1px solid rgba(16, 185, 129, 0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '10px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <CheckCircle2 size={16} color="var(--color-success)" />
                              <span style={{ fontSize: '0.82rem', color: '#e2e8f0' }}>
                                Video telah tayang secara publik di platform
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                onClick={() =>
                                  copyToClipboard(target.externalPostUrl!, target.id, 'Tautan video disalin!')
                                }
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                              >
                                {copiedId === target.id ? <Check size={13} /> : <Copy size={13} />}
                                Salin URL
                              </button>

                              <a
                                href={target.externalPostUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary"
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '6px 14px',
                                  background: 'linear-gradient(135deg, #ff0033 0%, #cc0000 100%)',
                                }}
                              >
                                <ExternalLink size={13} />
                                Buka di YouTube
                              </a>
                            </div>
                          </div>
                        )}

                        {/* 2. If Failed: Clear Contextual Guidance & Direct Solution */}
                        {isFailed && (
                          <div
                            style={{
                              marginTop: '10px',
                              padding: '14px 16px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <ShieldAlert size={18} color="#f87171" style={{ flexShrink: 0, marginTop: '2px' }} />
                              <div>
                                <div
                                  style={{
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    color: '#f87171',
                                    marginBottom: '2px',
                                  }}
                                >
                                  Error: {errorCode}
                                </div>
                                <p style={{ fontSize: '0.78rem', color: '#fca5a5', lineHeight: '1.4' }}>
                                  {errorMessage}
                                </p>
                              </div>
                            </div>

                            {/* Direct Action Buttons for Error Resolution */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginTop: '4px',
                                flexWrap: 'wrap',
                              }}
                            >
                              {isAuthError && onNavigateToAccounts && (
                                <button
                                  onClick={onNavigateToAccounts}
                                  className="btn btn-primary"
                                  style={{
                                    fontSize: '0.75rem',
                                    padding: '6px 12px',
                                    background: 'linear-gradient(135deg, #ff0033 0%, #e11d48 100%)',
                                  }}
                                >
                                  <ArrowRight size={13} />
                                  Hubungkan Akun YouTube Asli
                                </button>
                              )}

                              <button
                                onClick={() => handleRetry(pub.id)}
                                disabled={retryingId === pub.id}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                              >
                                <RotateCcw size={13} className={retryingId === pub.id ? 'animate-spin' : ''} />
                                Coba Antrekan Ulang (Retry)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Expandable Technical Diagnostic Drawer */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-dim)' }}>Publication UUID:</span>
                      <span style={{ color: '#fff' }}>{pub.id}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-dim)' }}>Media Asset ID:</span>
                      <span style={{ color: '#fff' }}>{pub.mediaId}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-dim)' }}>Created At:</span>
                      <span>{new Date(pub.createdAt).toISOString()}</span>
                    </div>
                    {pub.targets.map((t, idx) => (
                      <div key={t.id} style={{ padding: '4px 0', borderTop: idx > 0 ? '1px dashed rgba(255,255,255,0.05)' : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-dim)' }}>Target [{t.platform}] ID:</span>
                          <span style={{ color: '#818cf8' }}>{t.id}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-dim)' }}>Attempt Count:</span>
                          <span>{t.attemptCount ?? 0}</span>
                        </div>
                        {t.updatedAt && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-dim)' }}>Last Updated:</span>
                            <span>{new Date(t.updatedAt).toISOString()}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
