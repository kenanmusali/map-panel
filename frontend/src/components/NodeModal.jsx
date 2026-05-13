// NodeModal.jsx - Fixed to show actual user popup (not admin preview)
import { FileText, AlertTriangle, X } from './icons.jsx';

export default function NodeModal({ node, onClose, anchorRect }) {
  if (!node) return null;

  const info = node.info || { general: [], risks: [] };
  const general = Array.isArray(info.general) ? info.general.filter(p => p && p.trim()) : [];
  const risks = Array.isArray(info.risks) ? info.risks.filter(r => r && r.trim()) : [];

  const cardStyle = computeCardStyle(anchorRect);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={cardStyle} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Bağla">
          <X size={18} />
        </button>

        <div className="modal-section">
          <h3><FileText size={18} /><span>Ümumi məlumat:</span></h3>
          {general.length > 0 ? (
            general.map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <p className="popup-preview-empty">Bu addım üçün məlumat əlavə edilməyib.</p>
          )}
        </div>

        <div className="modal-section risks">
          <h3><AlertTriangle size={18} /><span>Mümkün risklər:</span></h3>
          {risks.length > 0 ? (
            <ul>{risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
          ) : (
            <p className="popup-preview-empty">Bu addım üçün risk məlumatı əlavə edilməyib.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const CARD_W = 560;
const MARGIN = 16;

function computeCardStyle(anchorRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxH = Math.round(vh * 0.82);

  if (!anchorRect) {
    return {
      position: 'fixed',
      left: Math.max(MARGIN, (vw - CARD_W) / 2),
      top: Math.max(MARGIN, (vh - 480) / 2),
      transform: 'none',
      margin: 0,
      maxHeight: maxH,
      width: Math.min(CARD_W, vw - 2 * MARGIN),
    };
  }

  let left;
  const rightRoom = vw - anchorRect.right - MARGIN;
  const leftRoom = anchorRect.left - MARGIN;

  if (rightRoom >= CARD_W) {
    left = anchorRect.right + MARGIN;
  } else if (leftRoom >= CARD_W) {
    left = anchorRect.left - CARD_W - MARGIN;
  } else {
    left = Math.max(MARGIN, (vw - CARD_W) / 2);
  }

  let top = anchorRect.top;
  top = Math.max(MARGIN, Math.min(top, vh - maxH - MARGIN));

  return {
    position: 'fixed',
    left,
    top,
    transform: 'none',
    margin: 0,
    maxHeight: maxH,
    width: Math.min(CARD_W, vw - 2 * MARGIN),
  };
}