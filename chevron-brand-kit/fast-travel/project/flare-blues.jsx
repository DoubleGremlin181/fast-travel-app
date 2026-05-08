// Fast Travel — Flare blue study
// Focus: cool/blue options, with the current app primary (#2563EB) shown as reference.

const NIGHT = '#0E1020';
const INK   = '#1A1D2E';
const PAPER = '#F5F2EC';
const BONE  = '#ECE7DC';

const OPTIONS = [
  { group: 'Current app',   name: 'App Primary',       hex: '#2563EB', note: "from your codebase — Android primary + extension --primary. Saturated, assertive." },

  { group: 'Deep + serious',name: 'Cobalt',            hex: '#1F4FD1', note: 'slightly deeper than app primary — more grounded, less neon' },
  { group: 'Deep + serious',name: 'Ink Blue',          hex: '#1E3A8A', note: 'navy — formal, institutional, quiet' },
  { group: 'Deep + serious',name: 'Oxford',            hex: '#16306E', note: 'deepest — nearly Night-adjacent, subtle on night bg' },
  { group: 'Deep + serious',name: 'Persian',           hex: '#1B4B8F', note: 'classical navy, holds well on paper and night' },

  { group: 'Electric',      name: 'Electric Indigo',   hex: '#4E5BD6', note: 'more violet than blue — tech, modern' },
  { group: 'Electric',      name: 'Azure',             hex: '#2E7DE8', note: 'cleaner, brighter sibling of app primary' },
  { group: 'Electric',      name: 'Sky',               hex: '#3AA8F0', note: 'lighter + airier — signals speed more than weight' },

  { group: 'Muted',         name: 'Slate Blue',        hex: '#4A6FA5', note: 'desaturated, calm, premium-understated' },
  { group: 'Muted',         name: 'Denim',             hex: '#3E6098', note: 'softer blue, workwear feel' },
  { group: 'Muted',         name: 'Steel',             hex: '#536B84', note: 'near-neutral, almost a slate — very quiet' },

  { group: 'Teal side',     name: 'Cyan Ink',          hex: '#1F8A9E', note: 'teal-leaning — terminal / command-line energy' },
  { group: 'Teal side',     name: 'Slate Teal',        hex: '#2E6B7A', note: 'darker teal, refined' },
  { group: 'Teal side',     name: 'Peacock',           hex: '#155E75', note: 'deep teal-blue, serious + distinct' },
];

// ─────────────────────────────────────────────────────────────
// Chevron mark
// ─────────────────────────────────────────────────────────────
function Chevron({ fg, accent = null, size = 200, strokeWidth = 22, padding = 52, gap = 6 }) {
  const V = 200;
  const cx = V / 2;
  const halfWidth = (V - padding * 2) / 2;
  const chevW = halfWidth - gap / 2;
  const chevH = 80;
  const c1x1 = padding, c1x2 = padding + chevW;
  const c2x1 = cx + gap / 2, c2x2 = c2x1 + chevW;
  const yTop = V / 2 - chevH / 2;
  const yMid = V / 2;
  const yBot = V / 2 + chevH / 2;
  const lead = accent || fg;
  return (
    <svg viewBox={`0 0 ${V} ${V}`} width={size} height={size} style={{ display: 'block' }}>
      <g fill="none" strokeLinecap="square" strokeLinejoin="miter" strokeWidth={strokeWidth}>
        <polyline stroke={fg}   points={`${c1x1},${yTop} ${c1x2},${yMid} ${c1x1},${yBot}`} />
        <polyline stroke={lead} points={`${c2x1},${yTop} ${c2x2},${yMid} ${c2x1},${yBot}`} />
      </g>
    </svg>
  );
}

function IOSIcon({ bg, fg, accent, size = 120 }) {
  const r = size * 0.2237;
  return (
    <div style={{
      width: size, height: size, background: bg, borderRadius: r,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 10px 24px rgba(14,16,32,0.18)',
    }}>
      <Chevron fg={fg} accent={accent} size={size * 0.58} strokeWidth={24} padding={48} />
    </div>
  );
}

function ExtActive({ accent, size = 64 }) {
  return (
    <div style={{
      width: size, height: size, background: accent, borderRadius: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Chevron fg={PAPER} accent={PAPER} size={size * 0.72} strokeWidth={24} padding={46} />
    </div>
  );
}

function Cell({ bg, border, children }) {
  return (
    <div style={{
      background: bg, width: 160, height: 160,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: border ? 'inset 0 0 0 1px rgba(0,0,0,0.06)' : 'none',
      borderRadius: 2,
    }}>{children}</div>
  );
}

function Swatch({ hex, name }) {
  return (
    <div style={{
      width: 160, height: 160, background: hex, borderRadius: 2,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 14,
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
    }}>
      <div style={{ color: PAPER, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, opacity: 0.9, mixBlendMode: 'difference' }}>
        {hex}
      </div>
      <div style={{ color: PAPER, fontWeight: 700, fontSize: 17, mixBlendMode: 'difference' }}>
        {name}
      </div>
    </div>
  );
}

function Row({ opt, highlight }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '240px 160px 160px 160px 160px 160px',
      gap: 12, alignItems: 'center',
      padding: highlight ? '10px' : 0,
      background: highlight ? 'rgba(37,99,235,0.06)' : 'transparent',
      borderRadius: 4,
      boxShadow: highlight ? 'inset 0 0 0 1px rgba(37,99,235,0.25)' : 'none',
    }}>
      <div style={{ paddingRight: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: INK, letterSpacing: -0.2 }}>{opt.name}</div>
          {highlight && (
            <div style={{
              fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 9, letterSpacing: 1,
              color: PAPER, background: opt.hex, padding: '3px 6px', borderRadius: 2,
            }}>CURRENT</div>
          )}
        </div>
        <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, color: 'rgba(26,29,46,0.55)', marginTop: 2 }}>
          {opt.hex} · {opt.group}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(26,29,46,0.7)', marginTop: 8, lineHeight: 1.4 }}>{opt.note}</div>
      </div>
      <Swatch hex={opt.hex} name={opt.name} />
      <Cell bg={PAPER} border>
        <Chevron fg={NIGHT} accent={opt.hex} size={120} />
      </Cell>
      <Cell bg={NIGHT}>
        <Chevron fg={PAPER} accent={opt.hex} size={120} />
      </Cell>
      <Cell bg={BONE} border>
        <IOSIcon bg={NIGHT} fg={PAPER} accent={opt.hex} size={120} />
      </Cell>
      <Cell bg={BONE} border>
        <ExtActive accent={opt.hex} size={72} />
      </Cell>
    </div>
  );
}

function HeaderRow() {
  const head = (t) => (
    <div style={{
      fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10,
      color: 'rgba(26,29,46,0.5)', letterSpacing: 1.5, textTransform: 'uppercase',
      paddingBottom: 10, borderBottom: '1px solid rgba(26,29,46,0.15)',
    }}>{t}</div>
  );
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '240px 160px 160px 160px 160px 160px',
      gap: 12, marginBottom: 14,
    }}>
      {head('Option')}
      {head('Swatch')}
      {head('Mark · paper')}
      {head('Mark · night')}
      {head('iOS icon')}
      {head('Ext · active')}
    </div>
  );
}

function GroupLabel({ name }) {
  return (
    <div style={{
      marginTop: 28, marginBottom: 10,
      fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11,
      color: 'rgba(26,29,46,0.4)', letterSpacing: 2, textTransform: 'uppercase',
    }}>— {name} —</div>
  );
}

function App() {
  const groups = ['Current app', 'Deep + serious', 'Electric', 'Muted', 'Teal side'];
  return (
    <DesignCanvas>
      <div style={{ padding: '8px 60px 36px', maxWidth: 1100 }}>
        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: 'rgba(60,50,40,0.55)', letterSpacing: 1.5 }}>
          FAST TRAVEL · FLARE STUDY · BLUES
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.9, color: '#1a1410', marginTop: 8 }}>
          Flare — 14 blues, with the current app color highlighted
        </div>
        <div style={{ fontSize: 14, color: 'rgba(60,50,40,0.7)', maxWidth: 780, marginTop: 8, lineHeight: 1.55 }}>
          The first row is <b>#2563EB</b> — the blue your Android app and extension already use
          (<code style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12 }}>--primary</code>,
          Android <code style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12 }}>widget_bg · gradient blue</code>).
          Every other option is grouped by feel: deeper &amp; more serious, electric, muted, and teal-leaning.
          Same five surfaces per row so only the accent changes.
        </div>
      </div>

      <DCSection title="" subtitle="" gap={0}>
        <DCArtboard label="flare — blue candidates" width={1380} height={null}
          style={{ background: PAPER, padding: 40 }}>
          <HeaderRow />
          {groups.map(g => (
            <React.Fragment key={g}>
              <GroupLabel name={g} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {OPTIONS.filter(o => o.group === g).map(o => (
                  <Row key={o.name} opt={o} highlight={o.group === 'Current app'} />
                ))}
              </div>
            </React.Fragment>
          ))}
        </DCArtboard>
      </DCSection>

      <DCPostIt top={160} left={60} rotate={-3} width={240}>
        Recommendation: if you want brand continuity with the existing app, use App Primary (#2563EB)
        or Cobalt. If you want the brand to feel slightly more premium, go Ink Blue or Slate Blue.
      </DCPostIt>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
