import { useState } from 'react';
import { X, Loader2 } from './icons.jsx';

// Generic modal: heading + name field (+ optional subtitle field).
// onSave({ name, subtitle }) may be async.
export default function NameModal({
  heading,
  nameLabel = 'Ad',
  namePlaceholder = '',
  subtitleLabel = 'İkinci ad (qısa)',
  subtitlePlaceholder = '',
  withSubtitle = false,
  name0 = '',
  subtitle0 = '',
  saveLabel = 'Saxla',
  onClose,
  onSave
}) {
  const [name, setName] = useState(name0);
  const [subtitle, setSubtitle] = useState(subtitle0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Ad daxil edin'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), subtitle: subtitle.trim() });
    } catch (err) {
      setError(err.message || 'Xəta');
      setSaving(false);
    }
  }

  return (
    <div className="pdf-modal-backdrop" onClick={onClose}>
      <form className="pdf-modal-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="pdf-modal-head nospace">
          <h3>{heading}</h3>
          <button type="button" className="pdf-modal-close" onClick={onClose} aria-label="Bağla">
            <X size={18} />
          </button>
        </div>

        <div className="pdf-modal-body">
          <div className="pdf-field">
            <label>{nameLabel}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={namePlaceholder}
              autoFocus
            />
          </div>

          {withSubtitle && (
            <div className="pdf-field">
              <label>{subtitleLabel}</label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder={subtitlePlaceholder}
              />
            </div>
          )}

          {error && <div className="pdf-modal-error">{error}</div>}
        </div>

        <div className="pdf-modal-foot">
          <button type="button" className="pdf-modal-btn" onClick={onClose} disabled={saving}>
            Ləğv et
          </button>
          <button type="submit" className="pdf-modal-btn pdf-modal-btn-primary" disabled={saving}>
            {saving && <Loader2 size={14} className="spin" />}
            <span>{saving ? 'Saxlanılır...' : saveLabel}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
