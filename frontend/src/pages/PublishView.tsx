import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  FileVideo,
  X,
} from 'lucide-react';
import { YouTubeIcon } from '../components/YouTubeIcon';
import { TikTokIcon } from '../components/TikTokIcon';
import { api } from '../lib/api';
import type { SocialAccount, MediaAsset } from '../lib/api';

interface PublishViewProps {
  socialAccounts: SocialAccount[];
  onPublicationCreated: () => void;
  onNavigateToAccounts: () => void;
}

export const PublishView: React.FC<PublishViewProps> = ({
  socialAccounts,
  onPublicationCreated,
  onNavigateToAccounts,
}) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<MediaAsset | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccessMessage, setPublishSuccessMessage] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);

  // Otomatis pilih akun pertama jika hanya ada 1 akun
  useEffect(() => {
    if (socialAccounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds([socialAccounts[0].id]);
    }
  }, [socialAccounts]);

  const handleVideoSelect = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      setUploadError('File harus berupa video (MP4, MOV, WEBM).');
      return;
    }

    setVideoFile(file);
    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);

    // Default title dari filename
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    if (!title) {
      setTitle(nameWithoutExt);
    }

    try {
      const session = await api.createUploadSession(file.name, file.type, file.size);
      await api.uploadToPresignedUrl(
        session.upload.url,
        file.type,
        file,
        (percent) => setUploadProgress(percent)
      );
      const completeRes = await api.completeUpload(session.media.id);
      setUploadedVideo(completeRes.media);
      setVideoPreviewUrl(URL.createObjectURL(file));
      setUploadProgress(null);
    } catch (err: any) {
      console.error('Upload video gagal:', err);
      setUploadError(err.message || 'Gagal mengunggah video ke storage.');
      setUploadProgress(null);
    } finally {
      setIsUploading(false);
    }
  };

  const toggleAccountSelection = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((accId) => accId !== id) : [...prev, id]
    );
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadedVideo) {
      alert('Silakan pilih dan unggah video terlebih dahulu.');
      return;
    }

    if (selectedAccountIds.length === 0) {
      alert('Pilih minimal satu channel YouTube atau akun TikTok tujuan.');
      return;
    }

    setIsPublishing(true);
    setPublishSuccessMessage(null);

    try {
      const targets = selectedAccountIds.map((accId) => ({
        socialAccountId: accId,
        title: title.trim(),
        caption: caption.trim() || undefined,
        visibility,
      }));

      const scheduleAtISO =
        isScheduled && scheduledDate ? new Date(scheduledDate).toISOString() : null;

      await api.createPublication({
        mediaId: uploadedVideo.id,
        targets,
        scheduleAt: scheduleAtISO,
      });

      setPublishSuccessMessage(
        isScheduled
          ? `Video berhasil dijadwalkan untuk ${new Date(scheduledDate).toLocaleString('id-ID')}!`
          : 'Video berhasil diantrekan! Buka tab "Live Monitoring" untuk memantau progres.'
      );

      // Reset form
      setUploadedVideo(null);
      setVideoPreviewUrl(null);
      setVideoFile(null);
      setTitle('');
      setCaption('');
      setIsScheduled(false);
      setScheduledDate('');
      onPublicationCreated();
    } catch (err: any) {
      alert(`Gagal membuat publikasi: ${err.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header Sederhana */}
      <div style={{ marginBottom: '22px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Buat Publikasi Video</h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Unggah video dan kirimkan ke channel YouTube Anda dalam hitungan detik
        </p>
      </div>

      {/* Success Alert Banner */}
      {publishSuccessMessage && (
        <div
          className="glass-panel"
          style={{
            background: 'var(--color-success-bg)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 color="var(--color-success)" size={20} />
            <span style={{ color: '#34d399', fontWeight: 600, fontSize: '0.86rem' }}>
              {publishSuccessMessage}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '4px', color: '#34d399' }}
            onClick={() => setPublishSuccessMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <form onSubmit={handlePublish}>
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. Upload Video Dropzone */}
          <div>
            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '8px' }}>
              File Video *
            </label>

            {!uploadedVideo && !isUploading ? (
              <div
                style={{
                  border: '2px dashed var(--border-hover)',
                  borderRadius: 'var(--radius-md)',
                  padding: '32px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'rgba(255, 255, 255, 0.015)',
                  transition: 'border-color 0.15s ease',
                }}
                onClick={() => videoInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files[0]) handleVideoSelect(e.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files?.[0] && handleVideoSelect(e.target.files[0])}
                />
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}
                >
                  <UploadCloud size={24} />
                </div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '4px' }}>
                  Pilih atau Tarik File Video ke Sini
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  Mendukung format MP4, QuickTime (MOV), WebM hingga 1 GB
                </p>
              </div>
            ) : null}

            {/* Uploading Progress */}
            {isUploading && (
              <div
                style={{
                  padding: '24px 18px',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <FileVideo size={20} color="var(--primary)" />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{videoFile?.name}</span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    marginBottom: '8px',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${uploadProgress || 0}%`,
                      background: 'var(--primary)',
                      transition: 'width 0.15s ease',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Mengunggah ke private storage: {uploadProgress ?? 0}%
                </span>
              </div>
            )}

            {/* Upload Error */}
            {uploadError && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '10px 14px',
                  background: 'var(--color-error-bg)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#f87171',
                  fontSize: '0.8rem',
                }}
              >
                <AlertCircle size={16} />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Uploaded Video Preview Box */}
            {uploadedVideo && videoPreviewUrl && (
              <div
                style={{
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    background: '#000',
                    maxHeight: '260px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <video
                    src={videoPreviewUrl}
                    controls
                    style={{ width: '100%', maxHeight: '260px', outline: 'none' }}
                  />
                </div>
                <div
                  style={{
                    marginTop: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={15} color="var(--color-success)" />
                    <span style={{ color: '#34d399', fontWeight: 600 }}>Video Siap</span>
                    <span style={{ color: 'var(--text-dim)' }}>
                      • {(uploadedVideo.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                    onClick={() => {
                      setUploadedVideo(null);
                      setVideoPreviewUrl(null);
                      setVideoFile(null);
                    }}
                  >
                    Ganti Video
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Judul & Deskripsi */}
          <div>
            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '6px' }}>
              Judul Video *
            </label>
            <input
              type="text"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Masukkan judul video..."
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '6px' }}>
              Deskripsi / Caption
            </label>
            <textarea
              className="textarea"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Tulis deskripsi, tag, atau hashtag..."
              rows={3}
            />
          </div>

          {/* 3. Visibilitas & Target Channel dalam 2 Kolom Rapi */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {/* Visibilitas */}
            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '6px' }}>
                Visibilitas & Privasi
              </label>
              <select
                className="select"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
              >
                <option value="public">Publik (Semua orang dapat menonton)</option>
                <option value="unlisted">Unlisted / Teman (Hanya tautan / Teman)</option>
                <option value="private">Privat (Hanya Anda)</option>
              </select>
            </div>

            {/* Target Channel */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.84rem', fontWeight: 700 }}>
                  Channel / Akun Tujuan *
                </label>
                {socialAccounts.length > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    {selectedAccountIds.length} dipilih
                  </span>
                )}
              </div>

              {socialAccounts.length === 0 ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Belum ada akun</span>
                  <button
                    type="button"
                    onClick={onNavigateToAccounts}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                  >
                    + Hubungkan
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {socialAccounts.map((acc) => {
                    const isSelected = selectedAccountIds.includes(acc.id);
                    const isTikTok = acc.platform === 'tiktok';
                    return (
                      <div
                        key={acc.id}
                        onClick={() => toggleAccountSelection(acc.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          background: isSelected
                            ? 'rgba(62, 207, 142, 0.1)'
                            : 'rgba(255, 255, 255, 0.02)',
                          border: `1px solid ${
                            isSelected ? 'rgba(62, 207, 142, 0.4)' : 'var(--border-subtle)'
                          }`,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isTikTok ? (
                            <TikTokIcon size={16} color="#25F4EE" />
                          ) : (
                            <YouTubeIcon size={16} />
                          )}
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc' }}>
                            {acc.displayName}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                            ({isTikTok ? 'TikTok' : 'YouTube'})
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 4. Jadwalkan (Opsional) */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="var(--text-muted)" />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Jadwalkan untuk Waktu Tertentu</span>
              </div>
              <input
                type="checkbox"
                checked={isScheduled}
                onChange={(e) => setIsScheduled(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            </div>

            {isScheduled && (
              <div style={{ marginTop: '10px' }}>
                <input
                  type="datetime-local"
                  className="input"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required={isScheduled}
                  style={{ maxWidth: '300px' }}
                />
              </div>
            )}
          </div>

          {/* 5. Submit Button */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!uploadedVideo || selectedAccountIds.length === 0 || isPublishing}
            style={{
              padding: '12px',
              fontSize: '0.92rem',
              fontWeight: 700,
              marginTop: '4px',
            }}
          >
            {isPublishing ? (
              'Memproses Publikasi...'
            ) : (
              <>
                <Send size={16} />
                {isScheduled ? 'Jadwalkan Video' : 'Publikasikan Video Sekarang'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
