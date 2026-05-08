// Fast Travel — Flare color options, shown in context.
// Each row: swatch · mark on paper · mark on night · iOS icon night · iOS icon paper · ext-active

const NIGHT = '#0E1020';
const INK   = '#1A1D2E';
const PAPER = '#F5F2EC';
const BONE  = '#ECE7DC';

const OPTIONS = [
  // Warm family
  { group: 'Warm',  name: 'Terracotta',       hex: '#C4502E', note: 'current — earthy, vintage travel-poster' },
  { group: 'Warm',  name: 'Clay',             hex: '#B8644A', note: 'dustier, handmade, least urgent' },
  { group: 'Warm',  name: 'Ember',            hex: '#D86A3F', note: 'brighter but still muted' },
  { group: 'Warm',  name: 'Rust',             hex: '#A8431C', note: 'deeper, oxidized, serious' },
  // Gold / ochre
  { group: 'Gold',  name: 'Saffron',          hex: '#D19A3B', note: 'warm, premium, curated feel' },
  { group: 'Gold',  name: 'Amber',            hex: '#C8892A', note: 'darker gold, strong on Night' },
  // Cool family
  { group: 'Cool',  name: 'Electric Indigo',  hex: '#4E5BD6', note: 'quiet but sharp · sibling to Night' },
  { group: 'Cool',  name: 'Cobalt',           hex: '#2E5AC4', note: 'precise, trustworthy, keyboard-native' },
  { group: 'Cool',  name: 'Cyan Ink',         hex: '#1F8A9E', note: 'teal · terminal / command-line' },
  // Green
  { group: 'Green', name: 'Moss',             hex: '#5A7A3B', note: 'organic, calm, navigator' },
  { group: 'Green', name: 'Pine',             hex: '#2E5A3F', note: 'deep forest, serious' },
  // Neutral
  { group: 'None',  name: 'No accent',        hex: NIGHT,      note: 'both chevrons Night — cleanest, no motion read' },
];

// ─────────────────────────────────────────────────────────────
// Parametric chevron (same geometry as the kit)
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

function Row({ opt }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '220px 160px 160px 160px 160px 160px',
      gap: 12, alignItems: 'center',
    }}>
      <div style={{ paddingRight: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: INK, letterSpacing: -0.2 }}>{opt.name}</div>
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
      gridTemplateColumns: '220px 160px 160px 160px 160px 160px',
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
  const groups = ['Warm', 'Gold', 'Cool', 'Green', 'None'];
  return (
    <DesignCanvas>
      <div style={{ padding: '8px 60px 36px', maxWidth: 1100 }}>
        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: 'rgba(60,50,40,0.55)', letterSpacing: 1.5 }}>
          FAST TRAVEL · FLARE STUDY
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.9, color: '#1a1410', marginTop: 8 }}>
          Flare — 12 options, in context
        </div>
        <div style={{ fontSize: 14, color: 'rgba(60,50,40,0.7)', maxWidth: 760, marginTop: 8, lineHeight: 1.55 }}>
          Every option shown against the same five surfaces: swatch, mark on paper, mark on night,
          iOS icon, extension-active toolbar tile. Structure (Night + Paper) stays constant so the
          accent does all the talking.
        </div>
      </div>

      <DCSection title="" subtitle="" gap={0}>
        <DCArtboard label="flare options" width={1360} height={null}
          style={{ background: PAPER, padding: 40 }}>
          <HeaderRow />
          {groups.map(g => (
            <React.Fragment key={g}>
              <GroupLabel name={g === 'None' ? 'Neutral' : g} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {OPTIONS.filter(o => o.group === g).map(o => (
                  <Row key={o.name} opt={o} />
                ))}
              </div>
            </React.Fragment>
          ))}
        </DCArtboard>
      </DCSection>

      <DCPostIt top={180} left={60} rotate={-3} width={220}>
        My picks for this product: Cobalt, Saffron, or Ember. Tell me which to swap into the full kit.
      </DCPostIt>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
