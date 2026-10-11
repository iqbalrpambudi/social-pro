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
import { TikTokIcon } from '../components/TikTokIcon';
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset page saat filter/search berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, platformFilter, searchQuery]);

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

  // Metrik Statistik untuk Tab di Toolbar
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

  // Perhitungan Pagination
  const totalItems = filteredPublications.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const displayedPublications = filteredPublications.slice(startIndex, endIndex);

  // Badge Status Keseluruhan
  const getOverallStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
        return (
          <span className="badge badge-success" style={{ gap: '5px', padding: '3px 10px', fontSize: '0.74rem' }}>
            <CheckCircle2 size={13} /> Selesai
          </span>
        );
      case 'partially_succeeded':
        return (
          <span className="badge badge-warning" style={{ gap: '5px', padding: '3px 10px', fontSize: '0.74rem' }}>
            <AlertCircle size={13} /> Parsial
          </span>
        );
      case 'processing':
      case 'uploading':
      case 'preparing':
        return (
          <span className="badge badge-info" style={{ gap: '5px', padding: '3px 10px', fontSize: '0.74rem' }}>
            <span className="pulse-dot-info" style={{ width: '6px', height: '6px' }} /> Proses
          </span>
        );
      case 'queued':
      case 'scheduled':
        return (
          <span className="badge badge-warning" style={{ gap: '5px', padding: '3px 10px', fontSize: '0.74rem' }}>
            <Clock size={13} /> Antrean
          </span>
        );
      case 'failed':
        return (
          <span className="badge badge-error" style={{ gap: '5px', padding: '3px 10px', fontSize: '0.74rem' }}>
            <AlertCircle size={13} /> Gagal
          </span>
        );
      default:
        return <span className="badge badge-neutral" style={{ fontSize: '0.74rem' }}>{status}</span>;
    }
  };

  // Status Terakhir Pipeline untuk Kolom Tabel (Hanya menampilkan status terakhir, tidak multi-step)
  const renderLatestStage = (target?: PublicationTarget) => {
    if (!target) return <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>-</span>;

    const isFailed = target.status === 'failed' || target.status === 'reauthorization_required';
    const isPublished = target.status === 'published';
    const isUploading = target.status === 'uploading';
    const isPreparing = target.status === 'preparing';

    if (isPublished) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '5px',
            fontSize: '0.72rem',
            fontWeight: 600,
            background: 'var(--color-success-bg)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: '#34d399',
            whiteSpace: 'nowrap',
          }}
        >
          <CheckCircle size={12} color="#34d399" />
          Terbit di Platform
        </span>
      );
    }

    if (isFailed) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '5px',
            fontSize: '0.72rem',
            fontWeight: 600,
            background: 'var(--color-error-bg)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            whiteSpace: 'nowrap',
          }}
        >
          <XCircle size={12} color="#f87171" />
          {target.lastErrorCode ? `Gagal: ${target.lastErrorCode}` : 'Gagal Eksekusi'}
        </span>
      );
    }

    if (isUploading) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '5px',
            fontSize: '0.72rem',
            fontWeight: 600,
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            color: '#818cf8',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="pulse-dot-info" style={{ width: '6px', height: '6px' }} />
          Pengiriman (Uploading)
        </span>
      );
    }

    if (isPreparing) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '5px',
            fontSize: '0.72rem',
            fontWeight: 600,
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            color: '#818cf8',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="pulse-dot-info" style={{ width: '6px', height: '6px' }} />
          Persiapan Media & Token
        </span>
      );
    }

    // Queued / Scheduled
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '3px 8px',
          borderRadius: '5px',
          fontSize: '0.72rem',
          fontWeight: 600,
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          color: '#fbbf24',
          whiteSpace: 'nowrap',
        }}
      >
        <Clock size={12} color="#fbbf24" />
        Dalam Antrean Worker
      </span>
    );
  };

  // Full Pipeline Stepper untuk Drawer Accordion Detail
  const renderDetailStepper = (target: PublicationTarget) => {
    const isFailed = target.status === 'failed' || target.status === 'reauthorization_required';
    const isPublished = target.status === 'published';
    const isUploading = target.status === 'uploading';
    const isPreparing = target.status === 'preparing';
    const isQueued = target.status === 'queued' || target.status === 'scheduled';

    const steps = [
      {
        id: 'queued',
        label: 'Antrean',
        done: isPreparing || isUploading || isPublished || isFailed,
        active: isQueued && !isFailed,
        error: false,
      },
      {
        id: 'preparing',
        label: 'Persiapan',
        done: isUploading || isPublished,
        active: isPreparing && !isFailed,
        error: isFailed && (target.lastErrorCode === 'MOCK_ACCOUNT_USED' || target.lastErrorCode === 'DEPENDENCY_MISSING'),
      },
      {
        id: 'uploading',
        label: 'Pengiriman',
        done: isPublished,
        active: isUploading && !isFailed,
        error: isFailed && target.lastErrorCode === 'REAUTHORIZATION_REQUIRED',
      },
      {
        id: 'published',
        label: isFailed ? 'Gagal' : 'Terbit',
        done: isPublished,
        active: isPublished,
        error: isFailed,
      },
    ];

    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        {steps.map((step, idx) => {
          let bg = 'rgba(255, 255, 255, 0.04)';
          let border = 'rgba(255, 255, 255, 0.07)';
          let color = 'var(--text-dim)';

          if (step.error) {
            bg = 'var(--color-error-bg)';
            border = 'rgba(239, 68, 68, 0.3)';
            color = '#f87171';
          } else if (step.done) {
            bg = 'var(--color-success-bg)';
            border = 'rgba(16, 185, 129, 0.25)';
            color = '#34d399';
          } else if (step.active) {
            bg = 'rgba(99, 102, 241, 0.15)';
            border = 'rgba(99, 102, 241, 0.4)';
            color = '#818cf8';
          }

          return (
            <React.Fragment key={step.id}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  background: bg,
                  border: `1px solid ${border}`,
                  color: color,
                  lineHeight: 1.2,
                }}
              >
                {step.error ? (
                  <XCircle size={11} color="#f87171" />
                ) : step.done ? (
                  <CheckCircle size={11} color="#34d399" />
                ) : step.active ? (
                  <span className="pulse-dot-info" style={{ width: '5px', height: '5px' }} />
                ) : null}
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <span style={{ color: 'rgba(255, 255, 255, 0.2)', fontSize: '0.65rem' }}>›</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 16px' }}>
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
        <div className="live-console" style={{ marginBottom: '20px' }}>
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

      {/* Filter & Search Toolbar */}
      <div
        className="glass-panel"
        style={{
          padding: '14px 18px',
          marginBottom: '16px',
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
            flex: '1 1 240px',
            maxWidth: '340px',
          }}
        >
          <Search
            size={16}
            color="var(--text-dim)"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            placeholder="Cari file, judul, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            style={{ paddingLeft: '36px', fontSize: '0.82rem', height: '36px' }}
          />
        </div>

        {/* Status Tab Pills & Platform Selector */}
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
                  padding: '1px 6px',
                  borderRadius: '9999px',
                  background: filter === tab.id ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                  fontWeight: 700,
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
            <option value="tiktok">TikTok</option>
            <option value="mock">Mock Simulator</option>
          </select>
        </div>
      </div>

      {/* Publications Table */}
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
        <div
          className="glass-panel"
          style={{
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.82rem',
                minWidth: '960px',
              }}
            >
              <thead>
                <tr
                  style={{
                    background: 'rgba(255, 255, 255, 0.025)',
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-dim)',
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  <th style={{ padding: '12px 14px', width: '36px' }}></th>
                  <th style={{ padding: '12px 14px', fontWeight: 600 }}>Media & ID</th>
                  <th style={{ padding: '12px 14px', fontWeight: 600 }}>Target Platform & Judul</th>
                  <th style={{ padding: '12px 14px', fontWeight: 600 }}>Tahapan</th>
                  <th style={{ padding: '12px 14px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 14px', fontWeight: 600 }}>Waktu Dibuat</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {displayedPublications.map((pub) => {
                  const isExpanded = !!expandedPubIds[pub.id];
                  const primaryTarget = pub.targets[0];
                  const hasFailedTargets = pub.targets.some((t) => t.status === 'failed');
                  const isPublished = pub.status === 'succeeded' || pub.targets.some((t) => t.status === 'published');
                  const publishedUrl = pub.targets.find((t) => t.externalPostUrl)?.externalPostUrl;

                  return (
                    <React.Fragment key={pub.id}>
                      {/* Main Table Row (Click anywhere on row to expand/collapse) */}
                      <tr
                        onClick={() => toggleExpand(pub.id)}
                        style={{
                          cursor: 'pointer',
                          borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)',
                          background: isExpanded
                            ? 'rgba(255, 255, 255, 0.03)'
                            : pub.status === 'failed'
                            ? 'rgba(239, 68, 68, 0.03)'
                            : pub.status === 'succeeded'
                            ? 'rgba(16, 185, 129, 0.015)'
                            : 'transparent',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {/* Expand Chevron Column */}
                        <td style={{ padding: '14px 10px 14px 14px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(pub.id);
                            }}
                            className="btn btn-ghost"
                            style={{ padding: '4px', borderRadius: '4px' }}
                            title={isExpanded ? 'Tutup Detail' : 'Buka Detail (Klik baris)'}
                          >
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                        </td>

                        {/* Media & ID Column */}
                        <td style={{ padding: '14px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background:
                                  pub.status === 'succeeded'
                                    ? 'rgba(16, 185, 129, 0.12)'
                                    : pub.status === 'failed'
                                    ? 'rgba(239, 68, 68, 0.12)'
                                    : 'rgba(99, 102, 241, 0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <FileVideo
                                size={16}
                                color={
                                  pub.status === 'succeeded'
                                    ? 'var(--color-success)'
                                    : pub.status === 'failed'
                                    ? 'var(--color-error)'
                                    : 'var(--primary)'
                                }
                              />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 700,
                                  color: '#f8fafc',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '220px',
                                }}
                                title={pub.mediaFilename || 'Video Publikasi'}
                              >
                                {pub.mediaFilename || 'Video Publikasi'}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                <span
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '0.72rem',
                                    color: 'var(--text-dim)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(pub.id, pub.id, 'ID Publikasi disalin!');
                                  }}
                                  title="Klik untuk salin ID"
                                >
                                  ID: {pub.id.substring(0, 8)}...
                                  {copiedId === pub.id ? <Check size={10} color="#34d399" /> : <Copy size={10} />}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Target Platform & Judul Column */}
                        <td style={{ padding: '14px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {primaryTarget?.platform === 'youtube' ? (
                                <YouTubeIcon size={14} />
                              ) : primaryTarget?.platform === 'tiktok' ? (
                                <TikTokIcon size={14} color="#25F4EE" />
                              ) : (
                                <Activity size={14} color="var(--primary)" />
                              )}
                              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                                {primaryTarget?.platform || 'Unknown'}
                              </span>
                              {primaryTarget?.visibility && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    color: 'var(--text-dim)',
                                    textTransform: 'uppercase',
                                    fontWeight: 600,
                                  }}
                                >
                                  {primaryTarget.visibility}
                                </span>
                              )}
                              {pub.targets.length > 1 && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    background: 'rgba(99, 102, 241, 0.15)',
                                    color: '#818cf8',
                                    fontWeight: 700,
                                  }}
                                >
                                  +{pub.targets.length - 1} target
                                </span>
                              )}
                            </div>
                            {primaryTarget?.title && (
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '240px',
                                }}
                                title={primaryTarget.title}
                              >
                                {primaryTarget.title}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Tahapan Terakhir Column (Hanya status terakhir saja) */}
                        <td style={{ padding: '14px 14px' }}>
                          {renderLatestStage(primaryTarget)}
                        </td>

                        {/* Status Column */}
                        <td style={{ padding: '14px 14px' }}>
                          {getOverallStatusBadge(pub.status)}
                        </td>

                        {/* Waktu Dibuat Column */}
                        <td style={{ padding: '14px 14px', color: 'var(--text-dim)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {new Date(pub.createdAt).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>

                        {/* Aksi Column (Action detail dihilangkan karena click baris sudah expand) */}
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '6px',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isPublished && publishedUrl ? (
                              <a
                                href={publishedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary"
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '5px 10px',
                                  color: '#ff4d4d',
                                  borderColor: 'rgba(255, 0, 51, 0.25)',
                                  background: 'rgba(255, 0, 51, 0.08)',
                                }}
                                title="Buka video di platform"
                              >
                                <ExternalLink size={12} />
                                Buka
                              </a>
                            ) : hasFailedTargets ? (
                              <button
                                onClick={() => handleRetry(pub.id)}
                                disabled={retryingId === pub.id}
                                className="btn btn-secondary"
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '5px 10px',
                                  color: '#f87171',
                                  borderColor: 'rgba(239, 68, 68, 0.3)',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                }}
                                title="Coba lagi kirim ke target"
                              >
                                <RotateCcw size={12} className={retryingId === pub.id ? 'animate-spin' : ''} />
                                Retry
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>-</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Accordion Row for Deep Diagnostics & Resolution */}
                      {isExpanded && (
                        <tr style={{ background: 'rgba(0, 0, 0, 0.25)', borderBottom: '1px solid var(--border-subtle)' }}>
                          <td colSpan={7} style={{ padding: '16px 20px 20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              {/* Target Details Breakdown */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1' }}>
                                  Detail Target Distribusi ({pub.targets.length}):
                                </div>
                                {pub.targets.map((target) => {
                                  const isTargetFailed =
                                    target.status === 'failed' || target.status === 'reauthorization_required';
                                  const isTargetPublished = target.status === 'published';
                                  const errorMessage =
                                    target.error?.message || target.lastErrorMessage || 'Publikasi gagal diproses.';
                                  const errorCode = target.error?.code || target.lastErrorCode || 'PUBLISH_FAILED';
                                  const isAuthError =
                                    errorCode === 'REAUTHORIZATION_REQUIRED' || errorCode === 'MOCK_ACCOUNT_USED';

                                  return (
                                    <div
                                      key={target.id}
                                      style={{
                                        borderRadius: 'var(--radius-sm)',
                                        background: 'rgba(255, 255, 255, 0.02)',
                                        border: '1px solid rgba(255, 255, 255, 0.06)',
                                        padding: '12px 14px',
                                      }}
                                    >
                                      {/* Target header */}
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          flexWrap: 'wrap',
                                          gap: '8px',
                                          marginBottom: '8px',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          {target.platform === 'youtube' ? (
                                            <YouTubeIcon size={16} />
                                          ) : target.platform === 'tiktok' ? (
                                            <TikTokIcon size={16} color="#25F4EE" />
                                          ) : (
                                            <Activity size={16} color="var(--primary)" />
                                          )}
                                          <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>
                                            {target.platform}
                                          </span>
                                          {target.title && (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                              - "{target.title}"
                                            </span>
                                          )}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                            Percobaan: {target.attemptCount ?? 0}
                                          </span>
                                          {isTargetPublished ? (
                                            <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                              <CheckCircle2 size={12} /> Selesai
                                            </span>
                                          ) : isTargetFailed ? (
                                            <span className="badge badge-error" style={{ fontSize: '0.7rem' }}>
                                              <AlertCircle size={12} /> Gagal ({errorCode})
                                            </span>
                                          ) : (
                                            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                                              {target.status}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Full Pipeline Stepper di dalam Drawer */}
                                      <div style={{ marginBottom: '10px' }}>
                                        {renderDetailStepper(target)}
                                      </div>

                                      {/* Published Action Banner */}
                                      {isTargetPublished && target.externalPostUrl && (
                                        <div
                                          style={{
                                            padding: '10px 14px',
                                            borderRadius: '6px',
                                            background: 'rgba(16, 185, 129, 0.08)',
                                            border: '1px solid rgba(16, 185, 129, 0.2)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            flexWrap: 'wrap',
                                            gap: '8px',
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <CheckCircle2 size={15} color="var(--color-success)" />
                                            <span style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>
                                              Video telah tayang secara publik di platform
                                            </span>
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                              onClick={() =>
                                                copyToClipboard(target.externalPostUrl!, target.id, 'Tautan disalin!')
                                              }
                                              className="btn btn-secondary"
                                              style={{ padding: '5px 10px', fontSize: '0.72rem' }}
                                            >
                                              {copiedId === target.id ? <Check size={12} /> : <Copy size={12} />}
                                              Salin URL
                                            </button>
                                            <a
                                              href={target.externalPostUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="btn btn-primary"
                                              style={{
                                                fontSize: '0.72rem',
                                                padding: '5px 12px',
                                                background: '#ff0033',
                                                border: '1px solid #cc0000',
                                                color: '#fff',
                                              }}
                                            >
                                              <ExternalLink size={12} />
                                              Buka di YouTube
                                            </a>
                                          </div>
                                        </div>
                                      )}

                                      {/* Error Resolution Banner */}
                                      {isTargetFailed && (
                                        <div
                                          style={{
                                            padding: '12px 14px',
                                            borderRadius: '6px',
                                            background: 'rgba(239, 68, 68, 0.08)',
                                            border: '1px solid rgba(239, 68, 68, 0.25)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px',
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                            <ShieldAlert size={16} color="#f87171" style={{ flexShrink: 0, marginTop: '2px' }} />
                                            <div>
                                              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f87171' }}>
                                                Error: {errorCode}
                                              </div>
                                              <p style={{ fontSize: '0.76rem', color: '#fca5a5', lineHeight: '1.4' }}>
                                                {errorMessage}
                                              </p>
                                            </div>
                                          </div>

                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            {isAuthError && onNavigateToAccounts && (
                                              <button
                                                onClick={onNavigateToAccounts}
                                                className="btn btn-primary"
                                                style={{
                                                  fontSize: '0.72rem',
                                                  padding: '5px 10px',
                                                  background: '#ff0033',
                                                  border: '1px solid #cc0000',
                                                  color: '#fff',
                                                }}
                                              >
                                                <ArrowRight size={12} />
                                                Hubungkan Akun YouTube Asli
                                              </button>
                                            )}
                                            <button
                                              onClick={() => handleRetry(pub.id)}
                                              disabled={retryingId === pub.id}
                                              className="btn btn-secondary"
                                              style={{ padding: '5px 10px', fontSize: '0.72rem' }}
                                            >
                                              <RotateCcw size={12} className={retryingId === pub.id ? 'animate-spin' : ''} />
                                              Coba Antrekan Ulang (Retry)
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Technical Metadata & UUIDs */}
                              <div
                                style={{
                                  padding: '12px 14px',
                                  borderRadius: '6px',
                                  background: 'rgba(0, 0, 0, 0.4)',
                                  border: '1px solid rgba(255, 255, 255, 0.05)',
                                  fontSize: '0.72rem',
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--text-muted)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--text-dim)' }}>Publication UUID:</span>
                                  <span style={{ color: '#fff' }}>{pub.id}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--text-dim)' }}>Media Asset ID:</span>
                                  <span style={{ color: '#fff' }}>{pub.mediaId}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--text-dim)' }}>Created At:</span>
                                  <span>{new Date(pub.createdAt).toISOString()}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Bar */}
          {totalItems > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'rgba(255, 255, 255, 0.015)',
                flexWrap: 'wrap',
                gap: '12px',
                fontSize: '0.8rem',
              }}
            >
              {/* Left: Info data count & page size select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  Menampilkan <strong style={{ color: '#f8fafc' }}>{startIndex + 1}</strong> - <strong style={{ color: '#f8fafc' }}>{endIndex}</strong> dari <strong style={{ color: '#f8fafc' }}>{totalItems}</strong> data
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.74rem' }}>Tampilkan:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="select"
                    style={{
                      height: '28px',
                      padding: '2px 8px',
                      fontSize: '0.74rem',
                      width: 'auto',
                    }}
                  >
                    <option value={5}>5 / hal</option>
                    <option value={10}>10 / hal</option>
                    <option value={20}>20 / hal</option>
                    <option value={50}>50 / hal</option>
                  </select>
                </div>
              </div>

              {/* Right: Page navigation buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="btn btn-secondary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    opacity: safeCurrentPage <= 1 ? 0.4 : 1,
                    cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  ‹ Sebelumnya
                </button>

                {/* Page Number Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 1)
                    .map((page, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev && page - prev > 1;

                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && (
                            <span style={{ color: 'var(--text-dim)', padding: '0 2px', fontSize: '0.75rem' }}>...</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            className={`btn ${safeCurrentPage === page ? 'btn-primary' : 'btn-ghost'}`}
                            style={{
                              padding: '2px 8px',
                              minWidth: '28px',
                              height: '28px',
                              fontSize: '0.75rem',
                              fontWeight: safeCurrentPage === page ? 700 : 500,
                            }}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="btn btn-secondary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    opacity: safeCurrentPage >= totalPages ? 0.4 : 1,
                    cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Berikutnya ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
