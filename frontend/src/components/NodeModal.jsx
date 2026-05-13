import { FileText, AlertTriangle, X } from './icons.jsx';

export default function NodeModal({ node, onClose }) {
  if (!node) return null;

  const info = node.info || {
    general: [
      `Bu mərhələdə "${node.text}" əməliyyatı həyata keçirilir. Mərkəzin aidiyyəti şöbəsi tərəfindən prosesin müvafiq qaydada və vaxtında icrası təmin edilir.`,
      'Bu addımın düzgün yerinə yetirilməsi sonrakı mərhələlərin uğurlu icrası üçün vacib şərtdir.'
    ],
    risks: [
      'Əməliyyatın gec icra edilməsi prosesin ümumi axınında ləngiməyə səbəb ola bilər.',
      'Sistemdə qeydiyyatın səhv aparılması ilə bağlı uyğunsuzluqların yaranması.'
    ]
  };

  const general = Array.isArray(info.general) ? info.general : (info.general ? [info.general] : []);
  const risks = info.risks || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Bağla">
          <X size={18} />
        </button>

        <div className="modal-section">
          <h3><FileText size={18} /><span>Ümumi məlumat:</span></h3>
          {general.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        {risks.length > 0 && (
          <div className="modal-section risks">
            <h3><AlertTriangle size={18} /><span>Mümkün risklər:</span></h3>
            <ul>
              {risks.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
