// Fast Travel — logo mark explorations
// Original marks. Themes: speed, commands, jumps, teleportation, keyboard, cursors.

const INK = '#111111';
const PAPER = '#ffffff';
const ACCENT = '#ff3b1f'; // hot vermillion — speed signal
const ACCENT2 = '#2a5cff'; // electric blue — alt

// Sizing: all marks render inside a 200×200 viewBox and sit on a 280×280 tile.
const TILE = 280;
const VB = 200;

// ─────────────────────────────────────────────────────────────
// Mark 01 — Chevron stack ("»")
// Double-chevron as a pure speed glyph, weighted and tight-kerned.
// ─────────────────────────────────────────────────────────────
function MarkChevrons({ fg = INK, bg = PAPER }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      <g fill="none" stroke={fg} strokeWidth="22" strokeLinecap="square" strokeLinejoin="miter">
        <polyline points="52,60 102,100 52,140" />
        <polyline points="108,60 158,100 108,140" />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 02 — Command key reimagined
// Four looped corners that read as a keycap glyph + a jump ring.
// ─────────────────────────────────────────────────────────────
function MarkCommand({ fg = INK, bg = PAPER }) {
  const r = 18, w = 16;
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      <g fill="none" stroke={fg} strokeWidth={w} strokeLinecap="round">
        {/* center square */}
        <rect x="72" y="72" width="56" height="56" />
        {/* four corner loops */}
        <circle cx="62" cy="62" r={r} />
        <circle cx="138" cy="62" r={r} />
        <circle cx="62" cy="138" r={r} />
        <circle cx="138" cy="138" r={r} />
        {/* connectors */}
        <line x1="72" y1="72" x2="68" y2="68" />
        <line x1="128" y1="72" x2="132" y2="68" />
        <line x1="72" y1="128" x2="68" y2="132" />
        <line x1="128" y1="128" x2="132" y2="132" />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 03 — Bracket cursor "[>"
// Command-line prompt read as a running figure.
// ─────────────────────────────────────────────────────────────
function MarkPrompt({ fg = INK, bg = PAPER, accent = ACCENT }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      <g fill="none" stroke={fg} strokeWidth="20" strokeLinecap="square" strokeLinejoin="miter">
        <polyline points="70,50 44,50 44,150 70,150" />
      </g>
      <polygon points="82,64 152,100 82,136" fill={accent} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 04 — Jump arc
// Arrow leaving the ground, long trailing arc — "teleport".
// ─────────────────────────────────────────────────────────────
function MarkJump({ fg = INK, bg = PAPER }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      <g fill="none" stroke={fg} strokeWidth="16" strokeLinecap="round">
        <line x1="32" y1="158" x2="168" y2="158" />
        <path d="M 48 158 Q 100 30 152 110" />
      </g>
      <polygon points="152,110 128,98 156,82" fill={fg} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 05 — Wormhole
// Concentric ellipses receding into a dot — "fast travel" sci-fi.
// ─────────────────────────────────────────────────────────────
function MarkWormhole({ fg = INK, bg = PAPER }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      <g fill="none" stroke={fg} strokeWidth="8">
        <ellipse cx="100" cy="100" rx="78" ry="52" />
        <ellipse cx="100" cy="100" rx="58" ry="38" />
        <ellipse cx="100" cy="100" rx="38" ry="24" />
        <ellipse cx="100" cy="100" rx="18" ry="11" />
      </g>
      <circle cx="100" cy="100" r="5" fill={fg} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 06 — FT monogram (stacked)
// Slab monogram, F and T locked into a single block.
// ─────────────────────────────────────────────────────────────
function MarkMonogram({ fg = INK, bg = PAPER }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      <g fill={fg}>
        {/* F */}
        <rect x="40" y="40" width="64" height="22" />
        <rect x="40" y="40" width="22" height="120" />
        <rect x="40" y="86" width="48" height="20" />
        {/* T */}
        <rect x="110" y="40" width="60" height="22" />
        <rect x="130" y="40" width="20" height="120" />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 07 — Slash arrow "/>"
// XML-like tag arrow; ties to developer tooling.
// ─────────────────────────────────────────────────────────────
function MarkSlashArrow({ fg = INK, bg = PAPER, accent = ACCENT }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      <g fill="none" stroke={fg} strokeWidth="20" strokeLinecap="square">
        <line x1="50" y1="150" x2="100" y2="50" />
      </g>
      <g fill="none" stroke={accent} strokeWidth="20" strokeLinecap="square" strokeLinejoin="miter">
        <polyline points="110,60 160,100 110,140" />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 08 — Keycap "F"
// Isometric keycap with a bold F — tactile, keyboard-first.
// ─────────────────────────────────────────────────────────────
function MarkKeycap({ fg = INK, bg = PAPER }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      {/* side */}
      <polygon points="40,70 40,155 100,180 160,155 160,70 100,95" fill={fg} opacity="0.18" />
      {/* top */}
      <polygon points="40,70 100,45 160,70 100,95" fill="none" stroke={fg} strokeWidth="8" strokeLinejoin="round" />
      <polygon points="100,95 160,70 160,155 100,180" fill="none" stroke={fg} strokeWidth="8" strokeLinejoin="round" />
      <polygon points="100,95 40,70 40,155 100,180" fill="none" stroke={fg} strokeWidth="8" strokeLinejoin="round" />
      {/* F on top face */}
      <g fill={fg}>
        <rect x="78" y="62" width="34" height="8" transform="skewX(-22) translate(28 0)" />
        <rect x="78" y="62" width="8" height="30" transform="skewX(-22) translate(28 0)" />
        <rect x="78" y="76" width="22" height="7" transform="skewX(-22) translate(28 0)" />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 09 — Pin jump
// Map pin lifting off its shadow — travel + motion.
// ─────────────────────────────────────────────────────────────
function MarkPin({ fg = INK, bg = PAPER, accent = ACCENT }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      {/* shadow */}
      <ellipse cx="100" cy="170" rx="36" ry="7" fill={fg} opacity="0.2" />
      {/* pin */}
      <path d="M100 40 C 70 40, 52 64, 52 90 C 52 120, 82 140, 100 150 C 118 140, 148 120, 148 90 C 148 64, 130 40, 100 40 Z"
        fill={accent} />
      <circle cx="100" cy="88" r="16" fill={bg} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 10 — Lightning prompt
// Cursor block + bolt — fast input.
// ─────────────────────────────────────────────────────────────
function MarkBolt({ fg = INK, bg = PAPER }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      <rect x="40" y="50" width="18" height="100" fill={fg} />
      <polygon points="80,50 140,50 110,100 150,100 90,160 110,110 80,110" fill={fg} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 11 — Orbit dot
// Small dot on a fast orbit — minimal, geometric, iconic.
// ─────────────────────────────────────────────────────────────
function MarkOrbit({ fg = INK, bg = PAPER, accent = ACCENT }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      <circle cx="100" cy="100" r="70" fill="none" stroke={fg} strokeWidth="6" />
      <circle cx="100" cy="100" r="14" fill={fg} />
      <circle cx="170" cy="100" r="14" fill={accent} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark 12 — Portal rings
// Two offset circles = a door and its destination.
// ─────────────────────────────────────────────────────────────
function MarkPortal({ fg = INK, bg = PAPER, accent = ACCENT }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: '100%', background: bg }}>
      <circle cx="74" cy="100" r="52" fill="none" stroke={fg} strokeWidth="12" />
      <circle cx="134" cy="100" r="36" fill={accent} />
      <circle cx="134" cy="100" r="20" fill={bg} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Tile — shared artboard
// ─────────────────────────────────────────────────────────────
function Tile({ label, children, bg = PAPER }) {
  return (
    <DCArtboard
      label={label}
      width={TILE}
      height={TILE}
      style={{ background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: 200, height: 200 }}>{children}</div>
    </DCArtboard>
  );
}

// Wordmark lockup row (mark + "Fast Travel")
function Lockup({ label, mark }) {
  return (
    <DCArtboard label={label} width={560} height={140} style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '0 28px', background: PAPER }}>
      <div style={{ width: 88, height: 88, flexShrink: 0 }}>{mark}</div>
      <div style={{
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        fontWeight: 700, fontSize: 38, letterSpacing: -1.2, color: INK,
      }}>Fast Travel</div>
    </DCArtboard>
  );
}

// Small-size sanity row (favicon scale)
function FaviconRow({ label, mark }) {
  return (
    <DCArtboard label={label} width={280} height={140} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', background: PAPER, padding: '0 20px' }}>
      {[64, 40, 24, 16].map(size => (
        <div key={size} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: size, height: size }}>{mark}</div>
          <div style={{ fontSize: 9, color: 'rgba(0,0,0,0.4)', fontFamily: 'monospace' }}>{size}px</div>
        </div>
      ))}
    </DCArtboard>
  );
}

// ─────────────────────────────────────────────────────────────
// Canvas
// ─────────────────────────────────────────────────────────────
const MARKS = [
  { id: '01', name: 'Chevrons',  sub: 'double chevron · pure speed',                 C: MarkChevrons },
  { id: '02', name: 'Command',   sub: 'command-key reimagined',                      C: MarkCommand },
  { id: '03', name: 'Prompt',    sub: 'bracket + cursor = "[>"',                     C: MarkPrompt },
  { id: '04', name: 'Jump',      sub: 'arrow leaving the baseline',                   C: MarkJump },
  { id: '05', name: 'Wormhole',  sub: 'concentric ellipses receding',                 C: MarkWormhole },
  { id: '06', name: 'FT Monogram', sub: 'slab monogram',                              C: MarkMonogram },
  { id: '07', name: 'Slash →',   sub: 'dev-flavored slash + chevron',                 C: MarkSlashArrow },
  { id: '08', name: 'Keycap',    sub: 'isometric F key',                              C: MarkKeycap },
  { id: '09', name: 'Pin',       sub: 'map pin lifting off',                          C: MarkPin },
  { id: '10', name: 'Bolt',      sub: 'cursor + lightning',                           C: MarkBolt },
  { id: '11', name: 'Orbit',     sub: 'dot on a fast orbit',                          C: MarkOrbit },
  { id: '12', name: 'Portal',    sub: 'two rings · here & there',                     C: MarkPortal },
];

function App() {
  return (
    <DesignCanvas>
      {/* Header */}
      <div style={{ padding: '8px 60px 40px' }}>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.8, color: '#1a1410' }}>Fast Travel — Logo Exploration</div>
        <div style={{ fontSize: 14, color: 'rgba(60,50,40,0.7)', maxWidth: 760, marginTop: 6, lineHeight: 1.5 }}>
          12 original marks across 4 themes: speed glyphs, command / keyboard, teleport, and monogram.
          Each shown at display size, inverted, in a wordmark lockup, and at favicon scale. Pick the ones
          you want to push further and we'll do color & motion explorations next.
        </div>
      </div>

      <DCSection title="A · The marks" subtitle="200×200 display size on paper">
        {MARKS.slice(0, 6).map(m => (
          <Tile key={m.id} label={`${m.id} · ${m.name} — ${m.sub}`}>
            <m.C />
          </Tile>
        ))}
      </DCSection>

      <DCSection title="" subtitle="">
        {MARKS.slice(6, 12).map(m => (
          <Tile key={m.id} label={`${m.id} · ${m.name} — ${m.sub}`}>
            <m.C />
          </Tile>
        ))}
      </DCSection>

      <DCSection title="B · Inverted" subtitle="same marks on ink — contrast check">
        {MARKS.map(m => (
          <DCArtboard key={m.id} label={`${m.id} · ${m.name}`} width={200} height={200}
            style={{ background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 160, height: 160 }}>
              <m.C fg={PAPER} bg={INK} accent={ACCENT} />
            </div>
          </DCArtboard>
        ))}
      </DCSection>

      <DCSection title="C · Wordmark lockups" subtitle="mark + Helvetica Neue Bold, tight tracking">
        {MARKS.slice(0, 4).map(m => (
          <Lockup key={m.id} label={`${m.id} · ${m.name}`} mark={<m.C />} />
        ))}
      </DCSection>
      <DCSection title="" subtitle="">
        {MARKS.slice(4, 8).map(m => (
          <Lockup key={m.id} label={`${m.id} · ${m.name}`} mark={<m.C />} />
        ))}
      </DCSection>
      <DCSection title="" subtitle="">
        {MARKS.slice(8, 12).map(m => (
          <Lockup key={m.id} label={`${m.id} · ${m.name}`} mark={<m.C />} />
        ))}
      </DCSection>

      <DCSection title="D · Favicon scale" subtitle="64 / 40 / 24 / 16 px — do they survive?">
        {MARKS.slice(0, 6).map(m => (
          <FaviconRow key={m.id} label={`${m.id} · ${m.name}`} mark={<m.C />} />
        ))}
      </DCSection>
      <DCSection title="" subtitle="">
        {MARKS.slice(6, 12).map(m => (
          <FaviconRow key={m.id} label={`${m.id} · ${m.name}`} mark={<m.C />} />
        ))}
      </DCSection>

      <DCPostIt top={200} left={60} rotate={-3} width={220}>
        Originals only — nothing references an existing product's mark. Pan with two fingers,
        pinch to zoom. Tell me which 2–3 you want to push further.
      </DCPostIt>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
