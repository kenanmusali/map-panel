export function LogoMark({ size = 44 }) {
  return (
    <div className="logo-mark" style={{ width: size, height: size }} aria-hidden />
  );
}

export function LogoFull({ size = 'normal' }) {
  const cls = size === 'large' ? 'logo-text large' : 'logo-text';
  return (
    <div className="logo-row">
      <LogoMark size={size === 'large' ? 68 : 44} />
      <div className={cls}>
        <span className="a">ABŞERON</span>
        <span className="b">LOGİSTİKA MƏRKƏZİ</span>
        <span className="c">ONE SOURCE • MULTIPLE SERVICE</span>
      </div>
    </div>
  );
}
