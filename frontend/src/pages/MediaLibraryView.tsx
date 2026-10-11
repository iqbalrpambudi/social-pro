import React, { useState } from 'react';
import {
  Film,
  Image,
  CheckCircle2,
  RotateCcw,
  Play,
  X,
  Copy,
  Check,
} from 'lucide-react';
import type { MediaAsset } from '../lib/api';

interface MediaLibraryViewProps {
  mediaList: MediaAsset[];
  onRefresh: () => void;
  onNavigateToPublish?: () => void;
}

export const MediaLibraryView: React.FC<MediaLibraryViewProps> = ({
  mediaList,
  onRefresh,
}) => {
  const [activeVideo, setActiveVideo] = useState<MediaAsset | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Media Asset Library (S3 Storage)</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Daftar file video yang tersimpan di private storage dan siap diputar atau dipublikasikan
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="btn btn-secondary"
          style={{ padding: '8px 14px', fontSize: '0.8rem' }}
        >
          <RotateCcw size={15} /> Muat Ulang
        </button>
      </div>

      {mediaList.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '60px 20px',
            textAlign: 'center',
          }}
        >
          <Film size={40} color="var(--text-dim)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>
            Belum ada media tersimpan
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Video yang Anda unggah dari menu Publikasi akan otomatis tersimpan di sini.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '18px',
          }}
        >
          {mediaList.map((m) => {
            const isVideo = m.mediaType === 'video' || m.contentType.startsWith('video/');
            const sizeMB = (m.sizeBytes / (1024 * 1024)).toFixed(1);

            return (
              <div
                key={m.id}
                className="glass-panel"
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                }}
              >
                {/* Media Preview / Player Box */}
                <div
                  onClick={() => isVideo && m.previewUrl && setActiveVideo(m)}
                  style={{
                    height: '180px',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    background: '#040711',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: isVideo && m.previewUrl ? 'pointer' : 'default',
                  }}
                  title={isVideo ? 'Klik untuk memutar video' : m.fileName}
                >
                  {m.previewUrl ? (
                    isVideo ? (
                      <>
                        <video
                          src={m.previewUrl}
                          preload="metadata"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            background: '#000',
                          }}
                        />
                        {/* Play Overlay Button */}
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0, 0, 0, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s ease',
                          }}
                        >
                          <div
                            style={{
                              width: '46px',
                              height: '46px',
                              borderRadius: '50%',
                              background: 'rgba(62, 207, 142, 0.95)',
                              color: '#0c111d',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)',
                            }}
                          >
                            <Play size={20} fill="#0c111d" style={{ marginLeft: '3px' }} />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img
                        src={m.previewUrl}
                        alt={m.fileName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                      {isVideo ? <Film size={32} /> : <Image size={32} />}
                      <p style={{ fontSize: '0.72rem', marginTop: '6px' }}>Memuat media...</p>
                    </div>
                  )}

                  {/* Badge Tipe di Sudut Kiri Atas */}
                  <span
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      background: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(4px)',
                      color: isVideo ? 'var(--primary)' : '#fbbf24',
                      textTransform: 'uppercase',
                    }}
                  >
                    {isVideo ? 'Video' : 'Gambar'}
                  </span>
                </div>

                {/* File Details */}
                <div>
                  <h4
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      color: '#f8fafc',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginBottom: '4px',
                    }}
                    title={m.fileName}
                  >
                    {m.fileName}
                  </h4>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.74rem',
                      color: 'var(--text-dim)',
                    }}
                  >
                    <span>{sizeMB} MB • {m.contentType}</span>
                    <span className="badge badge-success" style={{ fontSize: '0.66rem', padding: '1px 6px' }}>
                      <CheckCircle2 size={11} /> {m.status}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: '10px',
                    marginTop: 'auto',
                  }}
                >
                  {isVideo && m.previewUrl && (
                    <button
                      type="button"
                      onClick={() => setActiveVideo(m)}
                      className="btn btn-primary"
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.76rem',
                        flex: 1,
                      }}
                    >
                      <Play size={13} fill="currentColor" /> Putar Video
                    </button>
                  )}

                  {m.previewUrl && (
                    <button
                      type="button"
                      onClick={() => copyUrl(m.previewUrl!, m.id)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.74rem' }}
                      title="Salin Link Streaming"
                    >
                      {copiedId === m.id ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                      {copiedId === m.id ? 'Tersalin' : 'Link'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Simple Video Player Modal */}
      {activeVideo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setActiveVideo(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '820px',
              padding: '20px',
              background: '#090e1a',
              border: '1px solid var(--border-hover)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Player Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '10px',
              }}
            >
              <div style={{ minWidth: 0, paddingRight: '12px' }}>
                <h3
                  style={{
                    fontSize: '0.98rem',
                    fontWeight: 700,
                    color: '#f8fafc',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={activeVideo.fileName}
                >
                  {activeVideo.fileName}
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  {(activeVideo.sizeBytes / (1024 * 1024)).toFixed(1)} MB • {activeVideo.contentType}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setActiveVideo(null)}
                style={{ padding: '6px', borderRadius: '6px' }}
                title="Tutup Player (Esc)"
              >
                <X size={20} />
              </button>
            </div>

            {/* Video Player Box */}
            <div
              style={{
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: '#000',
                maxHeight: '480px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <video
                src={activeVideo.previewUrl || ''}
                controls
                autoPlay
                style={{
                  width: '100%',
                  maxHeight: '480px',
                  display: 'block',
                  outline: 'none',
                }}
              />
            </div>

            {/* Player Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '14px',
                fontSize: '0.75rem',
                color: 'var(--text-dim)',
              }}
            >
              <span>Playback langsung dari private S3 streaming engine</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveVideo(null)}
                style={{ padding: '6px 14px', fontSize: '0.78rem' }}
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
