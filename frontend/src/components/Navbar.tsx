import React, { useState } from 'react';
import {
  Share2,
  Radio,
  Settings,
  Database,
  KeyRound,
  BookOpen,
  ExternalLink,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { YouTubeIcon } from './YouTubeIcon';
import { getApiBaseUrl, getApiToken } from '../lib/api';
import type { DailyQuota } from '../lib/api';

interface NavbarProps {
  sseConnected: boolean;
  systemReady: boolean;
  quota: DailyQuota | null;
  onRefreshAll: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  sseConnected,
  systemReady,
  quota,
  onRefreshAll,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showStatusPopup, setShowStatusPopup] = useState(false);
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [apiToken, setApiToken] = useState(getApiToken());

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('smu_api_url', apiUrl.trim());
    localStorage.setItem('smu_api_token', apiToken.trim());
    setShowSettings(false);
    onRefreshAll();
  };

  return (
    <>
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(9, 13, 22, 0.85)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'var(--gradient-brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px -3px var(--primary-glow)',
              }}
            >
              <Share2 size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: '800',
                    letterSpacing: '-0.02em',
                    background: 'linear-gradient(to right, #ffffff, #cbd5e1)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  SocialPro
                </span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: '700',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    color: '#818cf8',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    letterSpacing: '0.05em',
                  }}
                >
                  UPLOADER
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
                Multi-Platform Social Video Publishing
              </p>
            </div>
          </div>

          {/* Status Badges & Quota Widget */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Unified System Status Button with Popup */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowStatusPopup(!showStatusPopup)}
                className="btn btn-secondary"
                style={{
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  gap: '7px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: systemReady && sseConnected ? 'var(--color-success)' : 'var(--color-warning)',
                    boxShadow: systemReady && sseConnected ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
                  }}
                />
                <span style={{ fontWeight: 600 }}>Status Sistem</span>
                {quota && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      borderLeft: '1px solid var(--border-subtle)',
                      paddingLeft: '6px',
                    }}
                  >
                    {quota.remainingVideos}/6 Quota
                  </span>
                )}
                <ChevronDown size={13} color="var(--text-dim)" />
              </button>

              {/* Status Popover Dropdown */}
              {showStatusPopup && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 45 }}
                    onClick={() => setShowStatusPopup(false)}
                  />
                  <div
                    className="glass-panel"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      width: '280px',
                      padding: '16px',
                      zIndex: 50,
                      boxShadow: 'var(--shadow-card)',
                      fontSize: '0.8rem',
                      background: 'rgba(14, 20, 34, 0.98)',
                      border: '1px solid var(--border-hover)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#f8fafc',
                        marginBottom: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>Detail Status Sistem</span>
                      <button
                        type="button"
                        onClick={() => {
                          onRefreshAll();
                        }}
                        className="btn btn-ghost"
                        style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                        title="Perbarui Status"
                      >
                        <RotateCcw size={11} /> Refresh
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* 1. Database & Storage */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Database size={14} color={systemReady ? 'var(--color-success)' : 'var(--color-error)'} />
                          <span style={{ color: 'var(--text-muted)' }}>Database & S3</span>
                        </div>
                        <span
                          className={`badge ${systemReady ? 'badge-success' : 'badge-error'}`}
                          style={{ fontSize: '0.68rem', padding: '1px 6px' }}
                        >
                          {systemReady ? 'DB & S3 Siap' : 'Offline'}
                        </span>
                      </div>

                      {/* 2. SSE Live Connection */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Radio size={14} color={sseConnected ? 'var(--primary)' : 'var(--text-dim)'} />
                          <span style={{ color: 'var(--text-muted)' }}>SSE Live Stream</span>
                        </div>
                        <span
                          className={`badge ${sseConnected ? 'badge-success' : 'badge-warning'}`}
                          style={{ fontSize: '0.68rem', padding: '1px 6px' }}
                        >
                          {sseConnected ? 'SSE Live' : 'Reconnecting'}
                        </span>
                      </div>

                      {/* 3. YouTube Quota */}
                      {quota && (
                        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', marginTop: '4px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '6px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <YouTubeIcon size={14} />
                              <span style={{ color: 'var(--text-muted)' }}>YouTube Quota</span>
                            </div>
                            <strong style={{ color: '#ff4d4d', fontSize: '0.75rem' }}>
                              {quota.remainingVideos} / 6 Video
                            </strong>
                          </div>

                          <div
                            style={{
                              width: '100%',
                              height: '5px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              borderRadius: '3px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${(quota.quotaUsed / quota.quotaLimit) * 100}%`,
                                background: '#ff0033',
                              }}
                            />
                          </div>

                          <span
                            style={{
                              fontSize: '0.68rem',
                              color: 'var(--text-dim)',
                              display: 'block',
                              marginTop: '5px',
                            }}
                          >
                            {quota.quotaUsed} / {quota.quotaLimit} unit terpakai ({quota.remainingUnits} tersisa)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* API Docs Link */}
            <a
              href={`${apiUrl}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                gap: '5px',
                textDecoration: 'none',
              }}
              title="Buka Dokumentasi API Interaktif (Scalar/OpenAPI)"
            >
              <BookOpen size={14} color="var(--primary)" />
              <span>API Docs</span>
              <ExternalLink size={11} color="var(--text-dim)" />
            </a>

            {/* Settings Trigger */}
            <button
              onClick={() => setShowSettings(true)}
              className="btn btn-ghost"
              style={{ padding: '8px', borderRadius: 'var(--radius-sm)' }}
              title="Pengaturan Koneksi API"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal Dialog */}
      {showSettings && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              boxShadow: 'var(--shadow-card)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <KeyRound size={20} color="var(--primary)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Konfigurasi API Backend</h3>
            </div>

            <form onSubmit={handleSaveSettings}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Backend API URL
                </label>
                <input
                  type="text"
                  className="input"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="http://localhost:4000"
                  required
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  API Secret Token (Bearer)
                </label>
                <input
                  type="text"
                  className="input"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="smu_secret_token_dev_12345"
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowSettings(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan Konfigurasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
