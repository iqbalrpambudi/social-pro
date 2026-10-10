import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  Radio,
  FileVideo,
} from 'lucide-react';
import { YouTubeIcon } from '../components/YouTubeIcon';
import { api } from '../lib/api';
import type { Publication } from '../lib/api';
import type { SSEEventData } from '../hooks/useSSE';

interface MonitoringViewProps {
  publications: Publication[];
  latestEvent: SSEEventData | null;
  onRefresh: () => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = ({
  publications,
  latestEvent,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'succeeded' | 'failed'>('all');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleRetry = async (pubId: string) => {
    setRetryingId(pubId);
    try {
      const res = await api.retryPublication(pubId);
      alert(res.message);
      onRefresh();
    } catch (err: any) {
      alert(`Gagal retry: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  const filteredPublications = publications.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'succeeded') return p.status === 'succeeded';
    if (filter === 'failed') return p.status === 'failed' || p.status === 'partially_succeeded';
    if (filter === 'active') return p.status === 'queued' || p.status === 'processing';
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'published':
        return <span className="badge badge-success"><CheckCircle2 size={13} /> Selesai</span>;
      case 'uploading':
      case 'processing':
      case 'preparing':
        return (
          <span className="badge badge-info">
            <span className="pulse-dot" /> {status}
          </span>
        );
      case 'queued':
      case 'scheduled':
        return <span className="badge badge-warning"><Clock size={13} /> {status}</span>;
      case 'failed':
      case 'reauthorization_required':
        return <span className="badge badge-error"><AlertCircle size={13} /> {status}</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Live SSE Ticker Banner */}
      {latestEvent && (
        <div
          style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 18px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '0.85rem',
          }}
        >
          <Radio size={16} color="var(--primary)" />
          <span style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: '#fff' }}>Event Terkini:</strong>{' '}
            Target [{latestEvent.platform || 'Job'}]: {latestEvent.message || latestEvent.status}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            {new Date(latestEvent.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Header & Filters */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Riwayat & Pemantauan Publikasi</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Lacak status pengiriman dan URL postingan per platform secara langsung
          </p>
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(['all', 'active', 'succeeded', 'failed'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`btn ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 14px', fontSize: '0.8rem', textTransform: 'capitalize' }}
            >
              {key === 'all' ? 'Semua' : key}
            </button>
          ))}
          <button
            onClick={onRefresh}
            className="btn btn-ghost"
            style={{ padding: '8px', fontSize: '0.8rem' }}
            title="Muat Ulang Data"
          >
            <RotateCcw size={16} />
          </button>
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
          <Activity size={40} color="var(--text-dim)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>
            Belum ada publikasi pada kategori ini
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Unggah video dan kirim publikasi melalui tab "Buat Publikasi".
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredPublications.map((pub) => {
            const hasFailedTargets = pub.targets.some((t) => t.status === 'failed');

            return (
              <div
                key={pub.id}
                className="glass-panel"
                style={{
                  padding: '20px',
                  transition: 'border-color 0.2s ease',
                }}
              >
                {/* Publication Card Header */}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FileVideo size={20} color="var(--primary)" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                        {pub.mediaFilename || 'Video Publikasi'}
                      </h3>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        ID: {pub.id.substring(0, 8)}... •{' '}
                        {new Date(pub.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {getStatusBadge(pub.status)}

                    {hasFailedTargets && (
                      <button
                        onClick={() => handleRetry(pub.id)}
                        disabled={retryingId === pub.id}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      >
                        <RotateCcw size={13} />
                        {retryingId === pub.id ? 'Mengantrekan...' : 'Retry Gagal'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Targets Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '12px',
                  }}
                >
                  {pub.targets.map((target) => (
                    <div
                      key={target.id}
                      style={{
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <YouTubeIcon size={16} />
                          <span
                            style={{
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                            }}
                          >
                            {target.platform}
                          </span>
                        </div>
                        {getStatusBadge(target.status)}
                      </div>

                      {target.title && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <strong>Judul:</strong> {target.title}
                        </p>
                      )}

                      {/* External post link if published */}
                      {target.externalPostUrl && (
                        <a
                          href={target.externalPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{
                            fontSize: '0.75rem',
                            padding: '6px 10px',
                            justifyContent: 'center',
                            marginTop: '4px',
                            color: '#818cf8',
                            borderColor: 'rgba(99, 102, 241, 0.3)',
                          }}
                        >
                          <ExternalLink size={13} />
                          Buka Video di {target.platform}
                        </a>
                      )}

                      {/* Error details if failed */}
                      {target.error?.message && (
                        <div
                          style={{
                            padding: '8px 10px',
                            background: 'var(--color-error-bg)',
                            borderRadius: 'var(--radius-sm)',
                            color: '#f87171',
                            fontSize: '0.72rem',
                          }}
                        >
                          <strong>Error:</strong> {target.error.message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
