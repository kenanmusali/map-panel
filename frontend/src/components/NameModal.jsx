import { useState } from 'react';
import { X, Loader2 } from './icons.jsx';

// Generic modal: heading + name field (+ optional subtitle + optional group select).
// onSave({ name, subtitle, groupId }) may be async.
export default function NameModal({
  heading,
  nameLabel = 'Ad',
  namePlaceholder = '',
  subtitleLabel = 'İkinci ad (qısa)',
  subtitlePlaceholder = '',
  withSubtitle = false,
  withGroup = false,
  groups = [],
  groupId0 = null,
  name0 = '',
  subtitle0 = '',
  saveLabel = 'Saxla',
  onClose,
  onSave
}) {
  const [name, setName] = useState(name0);
  const [subtitle, setSubtitle] = useState(subtitle0);
  const [groupId, setGroupId] = useState(groupId0 ?? (groups[0]?.id ?? null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Ad daxil edin'); return; }
    if (withGroup && !groupId) { setError('Qrup seçin'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        subtitle: subtitle.trim(),
        groupId: withGroup ? Number(groupId) : undefined
      });
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

          {withGroup && (
            <div className="pdf-field">
              <label>Qrup</label>
              <select value={groupId || ''} onChange={(e) => setGroupId(e.target.value)}>
                {groups.length === 0 && <option value="">Qrup yoxdur</option>}
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
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
