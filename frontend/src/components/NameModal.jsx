import { useState, useRef } from 'react';
import { X, Loader2 } from './icons.jsx';
import { FileSpreadsheet, Download, FileJson } from 'lucide-react';

// Generic modal: heading + name field (+ optional subtitle + optional group select).
// onSave({ name, subtitle, groupId }) may be async.
// Optional Excel import: pass withImport + onImport(file, { groupId }) (async) and
// optionally onTemplate() to offer a template download.
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
  withImport = false,
  onImport,
  onImportJson,
  onTemplate,
  onClose,
  onSave
}) {
  const [name, setName] = useState(name0);
  const [subtitle, setSubtitle] = useState(subtitle0);
  const [groupId, setGroupId] = useState(groupId0 ?? (groups[0]?.id ?? null));
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const jsonRef = useRef(null);

  async function pickFile(e) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (withGroup && !groupId) { setError('Əvvəlcə qrup seçin'); return; }
    setImporting(true);
    setError('');
    try {
      await onImport(file, { groupId: withGroup ? Number(groupId) : undefined });
    } catch (err) {
      setError(err.message || 'Excel oxuna bilmədi');
      setImporting(false);
    }
  }

  async function pickJson(e) {
    const file = e.target.files?.[0];
    if (jsonRef.current) jsonRef.current.value = '';
    if (!file) return;
    if (withGroup && !groupId) { setError('Əvvəlcə qrup seçin'); return; }
    setImporting(true);
    setError('');
    try {
      await onImportJson(file, { groupId: withGroup ? Number(groupId) : undefined });
    } catch (err) {
      setError(err.message || 'JSON oxuna bilmədi');
      setImporting(false);
    }
  }

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

          {withImport && (
            <div className="nm-import">
              <div className="nm-import-div"><span>və ya</span></div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={pickFile}
              />
              <button
                type="button"
                className="nm-import-btn"
                onClick={() => fileRef.current?.click()}
                disabled={importing || saving}
              >
                {importing
                  ? <Loader2 size={16} className="spin" />
                  : <FileSpreadsheet size={16} />}
                <span>{importing ? 'Oxunur...' : 'Excel-dən idxal et'}</span>
              </button>
              {onImportJson && (
                <>
                  <input
                    ref={jsonRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={pickJson}
                  />
                  <button
                    type="button"
                    className="nm-import-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => jsonRef.current?.click()}
                    disabled={importing || saving}
                  >
                    {importing
                      ? <Loader2 size={16} className="spin" />
                      : <FileJson size={16} />}
                    <span>{importing ? 'Oxunur...' : 'JSON-dan idxal et'}</span>
                  </button>
                </>
              )}
              {onTemplate && (
                <button
                  type="button"
                  className="nm-import-tpl"
                  onClick={onTemplate}
                  disabled={importing || saving}
                >
                  <Download size={13} />
                  <span>Nümunə Excel şablonu yüklə</span>
                </button>
              )}
              <p className="nm-import-hint">
                Excel və ya JSON faylı bütün panelləri, node-ları və oxları avtomatik yeni diaqrama çevirir.
              </p>
            </div>
          )}

          {error && <div className="pdf-modal-error">{error}</div>}
        </div>

        <div className="pdf-modal-foot">
          <button type="button" className="pdf-modal-btn" onClick={onClose} disabled={saving || importing}>
            Ləğv et
          </button>
          <button type="submit" className="pdf-modal-btn pdf-modal-btn-primary" disabled={saving || importing}>
            {saving && <Loader2 size={14} className="spin" />}
            <span>{saving ? 'Saxlanılır...' : saveLabel}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
