// Fast Travel — Chevron asset system
// Picked: B01 (chevron mark on ink) + C01 (chevron wordmark lockup).
// This file defines the mark, the palette, the lockup, and every deliverable.

// ─────────────────────────────────────────────────────────────
// Palette — warm-cool neutral stack + a single signal accent.
// Brand color is INDIGO-NIGHT; FLARE is the speed signal.
// ─────────────────────────────────────────────────────────────
const CH = {
  // brand
  night:   '#0E1020', // deep indigo-black — primary brand color
  ink:     '#1A1D2E',
  paper:   '#F5F2EC', // warm paper
  bone:    '#ECE7DC', // warmer paper tint for chrome
  // accent
  flare:   '#3E6098', // Denim — muted blue, workwear feel
  flareSoft: '#D9E0EC',
  // neutrals
  fog:     '#C8C3BA',
  slate:   '#4A4E63',
};

// ─────────────────────────────────────────────────────────────
// The mark — tuned chevron pair
// Weight, optical balance, and stroke geometry refined from B01.
// Single parametric component — every asset builds on it.
// ─────────────────────────────────────────────────────────────
function Chevron({
  fg = CH.paper,
  accent = null,        // if set, the leading chevron uses this color
  strokeWidth = 22,
  padding = 52,         // inset from viewbox edge
  cap = 'square',       // 'square' | 'round'
  join = 'miter',       // 'miter' | 'round'
  gap = 6,              // gap between the two chevrons
  size = 200,
}) {
  const V = 200;
  const cx = V / 2;
  const halfWidth = (V - padding * 2) / 2; // total horizontal run for both
  // Each chevron spans halfWidth - gap/2
  const chevW = halfWidth - gap / 2;
  const chevH = 80;
  // Chevron 1 (back): starts at `padding`
  const c1x1 = padding;
  const c1x2 = padding + chevW;
  // Chevron 2 (front)
  const c2x1 = cx + gap / 2;
  const c2x2 = c2x1 + chevW;
  const yTop = V / 2 - chevH / 2;
  const yMid = V / 2;
  const yBot = V / 2 + chevH / 2;

  const lead = accent || fg;

  return (
    <svg viewBox={`0 0 ${V} ${V}`} width={size} height={size}
      style={{ display: 'block' }}>
      <g fill="none" strokeLinecap={cap} strokeLinejoin={join} strokeWidth={strokeWidth}>
        <polyline stroke={fg}   points={`${c1x1},${yTop} ${c1x2},${yMid} ${c1x1},${yBot}`} />
        <polyline stroke={lead} points={`${c2x1},${yTop} ${c2x2},${yMid} ${c2x1},${yBot}`} />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// The wordmark lockup
// ─────────────────────────────────────────────────────────────
function Lockup({
  fg = CH.night,
  accent = null,
  size = 56,       // mark size in px
  type = 'Fast Travel',
  weight = 700,
  gap = 16,
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <Chevron fg={fg} accent={accent} size={size} strokeWidth={22} padding={52} />
      <div style={{
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        fontWeight: weight,
        fontSize: size * 0.68,
        letterSpacing: -size * 0.022,
        color: fg,
        lineHeight: 1,
      }}>{type}</div>
    </div>
  );
}

// Stacked lockup variant
function LockupStacked({ fg = CH.night, accent = null, size = 96 }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.18 }}>
      <Chevron fg={fg} accent={accent} size={size} />
      <div style={{
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        fontWeight: 700,
        fontSize: size * 0.32,
        letterSpacing: -size * 0.008,
        textTransform: 'uppercase',
        color: fg,
      }}>Fast Travel</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sheet helpers
// ─────────────────────────────────────────────────────────────
const SHEET_W = 1400;
const SHEET_PAD = 56;

function Sheet({ title, subtitle, children, bg = CH.paper, height }) {
  return (
    <DCArtboard label={title + (subtitle ? ' — ' + subtitle : '')}
      width={SHEET_W} height={height}
      style={{
        background: bg,
        padding: SHEET_PAD,
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        color: bg === CH.paper || bg === CH.bone ? CH.ink : CH.paper,
        overflow: 'hidden',
      }}>
      {children}
    </DCArtboard>
  );
}

function SheetHeader({ num, title, note, dark }) {
  const fg = dark ? CH.paper : CH.ink;
  const dim = dark ? 'rgba(245,242,236,0.55)' : 'rgba(26,29,46,0.5)';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 36, borderBottom: `1px solid ${dim}`, paddingBottom: 18 }}>
      <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: dim, letterSpacing: 1 }}>{num}</div>
      <div style={{ fontWeight: 600, fontSize: 22, color: fg, letterSpacing: -0.4 }}>{title}</div>
      <div style={{ fontSize: 13, color: dim, marginLeft: 'auto' }}>{note}</div>
    </div>
  );
}

// Tiny caption
function Cap({ children, dark }) {
  const c = dark ? 'rgba(245,242,236,0.55)' : 'rgba(26,29,46,0.5)';
  return (
    <div style={{
      fontFamily: 'ui-monospace, Menlo, monospace',
      fontSize: 11, color: c, letterSpacing: 0.5, marginTop: 10,
    }}>{children}</div>
  );
}

// Tile
function AssetTile({ w = 220, h = 220, bg, children, caption, dark }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        width: w, height: h, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 2,
        boxShadow: bg === CH.paper || bg === CH.bone ? 'inset 0 0 0 1px rgba(0,0,0,0.06)' : 'none',
      }}>
        {children}
      </div>
      {caption && <Cap dark={dark}>{caption}</Cap>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SHEET 01 — The mark, light + dark
// ─────────────────────────────────────────────────────────────
function Sheet01() {
  return (
    <Sheet title="01 · The mark" subtitle="Fast Travel — primary logo · light + dark" height={640}>
      <SheetHeader num="01 / 08" title="The Mark" note="chevron pair · single accent" />
      <div style={{ display: 'flex', gap: 32 }}>
        <AssetTile w={420} h={420} bg={CH.paper}
          caption="primary · mark on paper"
          children={<Chevron fg={CH.night} accent={CH.flare} size={300} />} />
        <AssetTile w={420} h={420} bg={CH.night}
          caption="inverse · mark on night" dark
          children={<Chevron fg={CH.paper} accent={CH.flare} size={300} />} />
        <div style={{ flex: 1, paddingLeft: 16 }}>
          <div style={{ fontSize: 13, color: 'rgba(26,29,46,0.6)', lineHeight: 1.6, marginBottom: 20 }}>
            Two forward chevrons — command-prompt kinship, pure speed read. The leading chevron
            carries the Flare accent to signal motion and direction. Back chevron holds structure;
            front chevron does the work.
          </div>
          <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: CH.slate, lineHeight: 1.9 }}>
            <div>stroke · 22 / 200</div>
            <div>cap · square</div>
            <div>join · miter</div>
            <div>gap  · 6 / 200</div>
            <div>pad  · 52 / 200</div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// SHEET 02 — Color system
// ─────────────────────────────────────────────────────────────
function Swatch({ name, hex, fg = CH.ink, big }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        width: big ? 320 : 180, height: big ? 240 : 180,
        background: hex, borderRadius: 2,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 16,
      }}>
        <div style={{ color: fg, fontWeight: 700, fontSize: 15 }}>{name}</div>
        <div style={{ color: fg, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, opacity: 0.8 }}>{hex}</div>
      </div>
    </div>
  );
}

function Sheet02() {
  return (
    <Sheet title="02 · Color" subtitle="palette" height={520}>
      <SheetHeader num="02 / 08" title="Color" note="one accent, disciplined" />
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
        <Swatch name="Night" hex={CH.night} fg={CH.paper} big />
        <Swatch name="Paper" hex={CH.paper} />
        <Swatch name="Flare" hex={CH.flare} fg={CH.paper} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Swatch name="Ink" hex={CH.ink} fg={CH.paper} />
          <Swatch name="Bone" hex={CH.bone} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Swatch name="Slate" hex={CH.slate} fg={CH.paper} />
          <Swatch name="Fog" hex={CH.fog} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Swatch name="Flare Soft" hex={CH.flareSoft} />
        </div>
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// SHEET 03 — Wordmark lockups
// ─────────────────────────────────────────────────────────────
function Sheet03() {
  return (
    <Sheet title="03 · Lockups" subtitle="horizontal + stacked · light + dark" height={740}>
      <SheetHeader num="03 / 08" title="Wordmark Lockups" note="Helvetica Neue Bold · −2.2% tracking" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <AssetTile w="100%" h={220} bg={CH.paper} caption="horizontal · primary"
          children={<Lockup fg={CH.night} accent={CH.flare} size={80} />} />
        <AssetTile w="100%" h={220} bg={CH.night} caption="horizontal · inverse" dark
          children={<Lockup fg={CH.paper} accent={CH.flare} size={80} />} />
        <AssetTile w="100%" h={220} bg={CH.bone} caption="stacked · primary"
          children={<LockupStacked fg={CH.night} accent={CH.flare} size={120} />} />
        <AssetTile w="100%" h={220} bg={CH.ink} caption="stacked · inverse" dark
          children={<LockupStacked fg={CH.paper} accent={CH.flare} size={120} />} />
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// SHEET 04 — Favicons & browser scale
// ─────────────────────────────────────────────────────────────
function FaviconTile({ size, bg, fg, accent, label, dark }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: size, height: size, background: bg, borderRadius: size <= 32 ? 2 : 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: bg === CH.paper ? 'inset 0 0 0 1px rgba(0,0,0,0.08)' : 'none',
      }}>
        <Chevron fg={fg} accent={accent} size={size * 0.82} strokeWidth={28} padding={42} />
      </div>
      <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10, color: dark ? 'rgba(245,242,236,0.55)' : 'rgba(26,29,46,0.5)' }}>
        {label}
      </div>
    </div>
  );
}

function Sheet04() {
  return (
    <Sheet title="04 · Favicon + browser" subtitle="legibility at every small size" height={560}>
      <SheetHeader num="04 / 08" title="Favicon & Browser" note="stroke thickened below 32px" />
      <div style={{ marginBottom: 36 }}>
        <Cap>light</Cap>
        <div style={{ display: 'flex', gap: 40, alignItems: 'center', marginTop: 14 }}>
          {[{s:180,l:'180 · apple-touch'},{s:192,l:'192 · android'},{s:64,l:'64'},{s:48,l:'48'},{s:32,l:'32'},{s:16,l:'16'}].map(({s,l}) => (
            <FaviconTile key={l} size={s} bg={CH.paper} fg={CH.night} accent={CH.flare} label={l} />
          ))}
        </div>
      </div>
      <div>
        <Cap>dark</Cap>
        <div style={{ display: 'flex', gap: 40, alignItems: 'center', marginTop: 14 }}>
          {[{s:180,l:'180 · apple-touch'},{s:192,l:'192 · android'},{s:64,l:'64'},{s:48,l:'48'},{s:32,l:'32'},{s:16,l:'16'}].map(({s,l}) => (
            <FaviconTile key={l} size={s} bg={CH.night} fg={CH.paper} accent={CH.flare} label={l} dark />
          ))}
        </div>
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// SHEET 05 — iOS + Android app icons
// ─────────────────────────────────────────────────────────────
function IOSIcon({ bg, fg, accent, size = 180 }) {
  const r = size * 0.2237; // iOS squircle approximation
  return (
    <div style={{
      width: size, height: size, background: bg, borderRadius: r,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 14px 40px rgba(14,16,32,0.18)',
    }}>
      <Chevron fg={fg} accent={accent} size={size * 0.58} strokeWidth={24} padding={48} />
    </div>
  );
}

function AndroidIcon({ bg, fg, accent, size = 180, round }) {
  return (
    <div style={{
      width: size, height: size, background: bg,
      borderRadius: round ? size / 2 : size * 0.18,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 14px 40px rgba(14,16,32,0.18)',
      overflow: 'hidden',
    }}>
      <Chevron fg={fg} accent={accent} size={size * 0.56} strokeWidth={24} padding={48} />
    </div>
  );
}

function Sheet05() {
  return (
    <Sheet title="05 · App icons" subtitle="iOS + Android" height={580}>
      <SheetHeader num="05 / 08" title="App Icons" note="solid fills · no gradients" />
      <div style={{ display: 'flex', gap: 56, alignItems: 'flex-start' }}>
        <div>
          <Cap>ios · night</Cap>
          <div style={{ marginTop: 12, display: 'flex', gap: 20, alignItems: 'flex-end' }}>
            <IOSIcon bg={CH.night} fg={CH.paper} accent={CH.flare} size={220} />
            <IOSIcon bg={CH.night} fg={CH.paper} accent={CH.flare} size={120} />
            <IOSIcon bg={CH.night} fg={CH.paper} accent={CH.flare} size={72} />
          </div>
        </div>
        <div>
          <Cap>ios · paper</Cap>
          <div style={{ marginTop: 12, display: 'flex', gap: 20, alignItems: 'flex-end' }}>
            <IOSIcon bg={CH.paper} fg={CH.night} accent={CH.flare} size={220} />
            <IOSIcon bg={CH.paper} fg={CH.night} accent={CH.flare} size={120} />
            <IOSIcon bg={CH.paper} fg={CH.night} accent={CH.flare} size={72} />
          </div>
        </div>
        <div>
          <Cap>android · adaptive</Cap>
          <div style={{ marginTop: 12, display: 'flex', gap: 20, alignItems: 'flex-end' }}>
            <AndroidIcon bg={CH.night} fg={CH.paper} accent={CH.flare} size={180} />
            <AndroidIcon bg={CH.night} fg={CH.paper} accent={CH.flare} size={180} round />
            <AndroidIcon bg={CH.flare} fg={CH.paper} accent={CH.paper} size={180} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// SHEET 06 — Extension toolbar icons + states
// ─────────────────────────────────────────────────────────────
function ToolbarIcon({ state = 'idle', dark }) {
  const size = 128;
  let bg = 'transparent';
  let fg = dark ? CH.paper : CH.ink;
  let accent = CH.flare;
  let stroke = 24;

  if (state === 'active')  { bg = CH.flare; fg = CH.paper; accent = CH.paper; }
  if (state === 'disabled'){ fg = dark ? 'rgba(245,242,236,0.35)' : 'rgba(26,29,46,0.3)'; accent = fg; }
  if (state === 'badge')   { /* default with red dot */ }

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{
        width: size, height: size, background: bg, borderRadius: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Chevron fg={fg} accent={accent} size={size * 0.72} strokeWidth={stroke} padding={46} />
      </div>
      {state === 'badge' && (
        <div style={{
          position: 'absolute', top: 6, right: 6, width: 28, height: 28,
          borderRadius: 14, background: CH.flare, color: CH.paper,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700,
          boxShadow: `0 0 0 3px ${dark ? CH.night : CH.paper}`,
        }}>3</div>
      )}
    </div>
  );
}

function BrowserChrome({ dark }) {
  const bg = dark ? '#23263a' : '#F7F5EF';
  const tab = dark ? '#0E1020' : CH.paper;
  const fg = dark ? CH.paper : CH.ink;
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  return (
    <div style={{ width: 520, borderRadius: 10, overflow: 'hidden', boxShadow: '0 10px 30px rgba(14,16,32,0.12)', background: bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderBottom: `1px solid ${border}` }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#FF5F57','#FEBC2E','#28C840'].map(c => <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
        </div>
        <div style={{ flex: 1, height: 26, background: tab, borderRadius: 6, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, border: `1px solid ${border}` }}>
          <Chevron fg={fg} accent={CH.flare} size={14} strokeWidth={32} padding={36} />
          <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: fg, opacity: 0.7 }}>gh anthropics/claude</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: CH.flare }}>
            <Chevron fg={CH.paper} accent={CH.paper} size={18} strokeWidth={32} padding={40} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Sheet06() {
  return (
    <Sheet title="06 · Extension" subtitle="toolbar icon · states + in-chrome" height={580}>
      <SheetHeader num="06 / 08" title="Browser Extension" note="32×32 toolbar · 128×128 source" />
      <div style={{ display: 'flex', gap: 64, alignItems: 'flex-start' }}>
        <div>
          <Cap>states · light browser</Cap>
          <div style={{ marginTop: 14, display: 'flex', gap: 18 }}>
            <div><ToolbarIcon state="idle" /><Cap>idle</Cap></div>
            <div><ToolbarIcon state="active" /><Cap>active</Cap></div>
            <div><ToolbarIcon state="badge" /><Cap>badge</Cap></div>
            <div><ToolbarIcon state="disabled" /><Cap>disabled</Cap></div>
          </div>
        </div>
        <div>
          <Cap>states · dark browser</Cap>
          <div style={{ marginTop: 14, display: 'flex', gap: 18, padding: 14, background: CH.night, borderRadius: 6 }}>
            <div><ToolbarIcon state="idle" dark /><Cap dark>idle</Cap></div>
            <div><ToolbarIcon state="active" dark /><Cap dark>active</Cap></div>
            <div><ToolbarIcon state="badge" dark /><Cap dark>badge</Cap></div>
            <div><ToolbarIcon state="disabled" dark /><Cap dark>disabled</Cap></div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 36, display: 'flex', gap: 24 }}>
        <BrowserChrome />
        <BrowserChrome dark />
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// SHEET 07 — Social card, splash, loading
// ─────────────────────────────────────────────────────────────
function SocialCard({ dark }) {
  const bg = dark ? CH.night : CH.paper;
  const fg = dark ? CH.paper : CH.ink;
  const dim = dark ? 'rgba(245,242,236,0.6)' : 'rgba(26,29,46,0.6)';
  return (
    <div style={{
      width: 600, height: 315, background: bg, padding: 48, borderRadius: 4,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', right: -80, top: -80, opacity: dark ? 0.06 : 0.05,
      }}>
        <Chevron fg={fg} accent={fg} size={460} strokeWidth={22} padding={52} />
      </div>
      <Lockup fg={fg} accent={CH.flare} size={48} />
      <div>
        <div style={{
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          fontSize: 44, fontWeight: 700, letterSpacing: -1.2, color: fg, lineHeight: 1, maxWidth: 440,
        }}>Skip the search.<br/>Go straight there.</div>
        <div style={{ marginTop: 14, fontSize: 14, color: dim, fontFamily: 'ui-monospace, Menlo, monospace' }}>
          fasttravel.app
        </div>
      </div>
    </div>
  );
}

function Splash({ dark }) {
  const bg = dark ? CH.night : CH.paper;
  const fg = dark ? CH.paper : CH.ink;
  return (
    <div style={{
      width: 320, height: 560, background: bg, borderRadius: 38,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 20px 60px rgba(14,16,32,0.25)',
      position: 'relative', overflow: 'hidden',
    }}>
      <LockupStacked fg={fg} accent={CH.flare} size={120} />
      <div style={{
        position: 'absolute', bottom: 38, fontSize: 11, color: fg, opacity: 0.4,
        fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: 2,
      }}>LOADING</div>
    </div>
  );
}

function Sheet07() {
  return (
    <Sheet title="07 · Social + splash" subtitle="OG card · app splash" height={560}>
      <SheetHeader num="07 / 08" title="Social & Splash" note="1200×630 source · tuned for paper + night" />
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div><SocialCard /><Cap>og · light</Cap></div>
        <div><SocialCard dark /><Cap dark>og · dark</Cap></div>
        <div><Splash /><Cap>splash · light</Cap></div>
        <div><Splash dark /><Cap dark>splash · dark</Cap></div>
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// SHEET 08 — Clear space + misuse
// ─────────────────────────────────────────────────────────────
function ClearSpaceDemo() {
  // Clear space = height of a chevron stroke × 2 on all sides
  const markSize = 180;
  const pad = markSize * 0.22;
  return (
    <div style={{ padding: pad, background: 'rgba(62,96,152,0.08)', position: 'relative', display: 'inline-block' }}>
      {/* dashed guides */}
      <div style={{
        position: 'absolute', inset: pad, border: `1px dashed ${CH.flare}`, opacity: 0.6,
      }} />
      <Chevron fg={CH.night} accent={CH.flare} size={markSize} />
    </div>
  );
}

function Misuse({ children, caption }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 180, height: 180, background: CH.paper, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
      }}>
        {children}
        <div style={{
          position: 'absolute', inset: 0,
          background: `repeating-linear-gradient(-45deg, transparent 0, transparent 18px, rgba(62,96,152,0.12) 18px, rgba(62,96,152,0.12) 19px)`,
        }} />
        <div style={{
          position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 13,
          background: CH.flare, color: CH.paper, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700,
        }}>✕</div>
      </div>
      <Cap>{caption}</Cap>
    </div>
  );
}

function Sheet08() {
  return (
    <Sheet title="08 · Guardrails" subtitle="clear space · misuse" height={560}>
      <SheetHeader num="08 / 08" title="Guardrails" note="one rule: keep it sharp" />
      <div style={{ display: 'flex', gap: 56 }}>
        <div>
          <Cap>clear space · 22% of mark height</Cap>
          <div style={{ marginTop: 14 }}><ClearSpaceDemo /></div>
        </div>
        <div>
          <Cap>don't</Cap>
          <div style={{ marginTop: 14, display: 'flex', gap: 18, flexWrap: 'wrap', maxWidth: 780 }}>
            <Misuse caption="no rotate">
              <div style={{ transform: 'rotate(14deg)' }}><Chevron fg={CH.night} accent={CH.flare} size={120} /></div>
            </Misuse>
            <Misuse caption="no stretch">
              <div style={{ transform: 'scaleX(0.6)' }}><Chevron fg={CH.night} accent={CH.flare} size={120} /></div>
            </Misuse>
            <Misuse caption="no off-brand hues">
              <Chevron fg="#1A8A3F" accent="#9CBF2E" size={120} />
            </Misuse>
            <Misuse caption="no soft strokes">
              <Chevron fg={CH.night} accent={CH.flare} size={120} cap="round" join="round" strokeWidth={34} />
            </Misuse>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────
function App() {
  return (
    <DesignCanvas>
      <div style={{ padding: '8px 60px 44px', maxWidth: 900 }}>
        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: 'rgba(60,50,40,0.55)', letterSpacing: 1.5 }}>
          FAST TRAVEL · BRAND KIT · v1
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1, color: '#1a1410', marginTop: 8 }}>
          Chevron — complete asset system
        </div>
        <div style={{ fontSize: 14, color: 'rgba(60,50,40,0.7)', maxWidth: 720, marginTop: 10, lineHeight: 1.55 }}>
          Built on B01 + C01. Two-color palette: <b style={{color: CH.night}}>Night</b> for weight and{' '}
          <b style={{color: CH.flare}}>Flare</b> for speed, laid on warm <b>Paper</b>. Every tile below is a
          real asset — mark, lockups, favicons, app icons, extension states, OG cards, splash, and guardrails.
          Light and dark treatments for every surface that needs one.
        </div>
      </div>

      <DCSection title="" subtitle="" gap={40}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <Sheet01 />
          <Sheet02 />
          <Sheet03 />
          <Sheet04 />
          <Sheet05 />
          <Sheet06 />
          <Sheet07 />
          <Sheet08 />
        </div>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
