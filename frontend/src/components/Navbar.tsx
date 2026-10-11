import React, { useState } from 'react';
import {
  Share2,
  Radio,
  Settings,
  Database,
  KeyRound,
  BookOpen,
  ExternalLink,
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
            {/* System Readiness */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                background: systemReady
                  ? 'rgba(16, 185, 129, 0.08)'
                  : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${
                  systemReady ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                }`,
                fontSize: '0.78rem',
              }}
            >
              <Database
                size={14}
                color={systemReady ? 'var(--color-success)' : 'var(--color-error)'}
              />
              <span style={{ color: systemReady ? '#34d399' : '#f87171', fontWeight: 500 }}>
                {systemReady ? 'DB & S3 Siap' : 'Sistem Offline'}
              </span>
            </div>

            {/* SSE Live Status */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                background: sseConnected
                  ? 'rgba(99, 102, 241, 0.1)'
                  : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.78rem',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: sseConnected ? 'var(--color-success)' : 'var(--text-dim)',
                  boxShadow: sseConnected ? '0 0 10px #10b981' : 'none',
                }}
              />
              <Radio size={13} color={sseConnected ? '#818cf8' : 'var(--text-dim)'} />
              <span style={{ color: sseConnected ? '#cbd5e1' : 'var(--text-dim)' }}>
                {sseConnected ? 'SSE Live' : 'Connecting SSE...'}
              </span>
            </div>

            {/* YouTube Quota Tracker (6 video/hari limit) */}
            {quota && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255, 0, 51, 0.08)',
                  border: '1px solid rgba(255, 0, 51, 0.2)',
                  fontSize: '0.78rem',
                }}
                title={`Pemakaian kuota: ${quota.quotaUsed} / ${quota.quotaLimit} unit (1 video = 1.600 unit)`}
              >
                <YouTubeIcon size={15} />
                <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                  {quota.remainingVideos}{' '}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ 6 video YouTube hari ini</span>
                </span>
              </div>
            )}

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
