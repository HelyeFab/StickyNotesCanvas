const { useState, useEffect, useRef, useMemo } = React;

/* ==================================================================== */
/* POKÉMON — theme bits, partner Pokémon, note stickers                  */
/* ==================================================================== */
/* Kept in its own file so the fork's Pokémon layer stays out of the way of
 * upstream merges. Sprites are Pokémon HOME renders served by main.js over
 * sticky-pokemon://<n>.png: fetched once from PokeAPI's sprite repo and then
 * cached under userData/pokemon-sprites/, so they work offline afterwards
 * and are never shipped in this repo. Names come from pokemon-names.js.
 *
 * The rest of the app talks to the partner through one DOM event:
 *   window.dispatchEvent(new CustomEvent('sticky:partner', {detail: 'create'}))
 * with detail 'create' | 'delete' | 'pin' | 'speak-start' | 'speak-end'.
 */

function pokemonReact(kind) {
  try { window.dispatchEvent(new CustomEvent('sticky:partner', { detail: kind })); } catch {}
}

function PokeBallIcon({ size = 16, filled = true, ink = '#222' }) {
  // Filled: the classic red/white ball. Outline: the same shape in ink, for
  // "not pinned".
  const line = filled ? '#1d1f24' : ink;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }} aria-hidden="true">
      {filled && <circle cx="16" cy="16" r="13.5" fill="#ffffff"/>}
      {filled && <path d="M2.5 16a13.5 13.5 0 0127 0z" fill="#e3350d"/>}
      <circle cx="16" cy="16" r="13.5" fill="none" stroke={line} strokeWidth="2.5"/>
      <path d="M2.5 16h9M20.5 16h9" stroke={line} strokeWidth="2.5"/>
      <circle cx="16" cy="16" r="4.5" fill={filled ? '#ffffff' : 'none'} stroke={line} strokeWidth="2.5"/>
    </svg>
  );
}

function PokemonSprite({ id, size = 64, style, alt }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [id]);
  if (!isPokemonId(id)) return null;
  const name = pokemonName(id);
  if (failed) {
    // Offline before this sprite was ever cached: a Poké Ball stands in.
    return (
      <div title={name.en} style={{ width: size, height: size, display: 'grid', placeItems: 'center', ...style }}>
        <PokeBallIcon size={Math.round(size * 0.45)}/>
      </div>
    );
  }
  return (
    <img src={pokemonSpriteUrl(id)} width={size} height={size} alt={alt ?? name.en}
      draggable={false} loading="lazy" onError={() => setFailed(true)}
      style={{ display: 'block', objectFit: 'contain', userSelect: 'none', ...style }}/>
  );
}

/* ---------- picker ---------- */
function PokemonPicker({ T, title = 'Choose a Pokémon', current, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchPokemon(query, 72), [query]);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const pick = (id) => { onPick(id); onClose(); };
  return ReactDOM.createPortal(
    <div data-pokemon-picker="1" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,20,.35)', zIndex: 100000, display: 'grid', placeItems: 'center' }}>
      <div style={{ background: T.panelBg, color: T.panelText, borderRadius: 14, border: `1px solid ${T.panelBorder}`,
        width: 'min(560px, calc(100vw - 32px))', maxHeight: 'min(620px, calc(100vh - 48px))', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,.3)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <PokeBallIcon size={18}/>
          <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{title}</div>
          <button onClick={() => pick(randomPokemonId())} {...hoverProps(T)}
            style={{ padding: '6px 10px', background: 'transparent', border: `1px solid ${T.panelBorder}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', color: T.panelText }}>
            Surprise me
          </button>
          <button onClick={onClose} aria-label="Close" {...hoverProps(T)}
            style={{ width: 28, height: 28, background: 'transparent', border: 'none', borderRadius: 6, fontSize: 18, cursor: 'pointer', color: T.muted }}>×</button>
        </div>
        <div style={{ padding: '10px 16px' }}>
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, ポケモン名, or number…"
            onKeyDown={(e) => { if (e.key === 'Enter' && results.length) pick(results[0]); }}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.panelBorder}`,
              background: T.folderBg, color: T.panelText, font: 'inherit', fontSize: 13, outline: 'none' }}/>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
          {results.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', color: T.muted, fontSize: 13 }}>No Pokémon matches “{query}”.</div>
          )}
          {results.map((id) => {
            const n = pokemonName(id);
            const on = id === current;
            return (
              <button key={id} data-pokemon-id={id} onClick={() => pick(id)} title={`#${id} ${n.en} · ${n.ja}`}
                {...hoverProps(T, on ? withA(T.accent, 0.12) : 'transparent')}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 4px', cursor: 'pointer',
                  background: on ? withA(T.accent, 0.12) : 'transparent', border: `1px solid ${on ? T.accent : 'transparent'}`, borderRadius: 10, color: T.panelText }}>
                <PokemonSprite id={id} size={64}/>
                <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, textAlign: 'center' }}>{n.en}</div>
                <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.2 }}>{n.ja} · #{id}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ---------- note sticker ---------- */
// Sits in the note's bottom-right corner above the footer. pointer-events
// none so it never steals a click, drag, or text selection from the note.
function PokemonSticker({ id, size = 64 }) {
  if (!isPokemonId(id)) return null;
  return (
    <div data-pokemon-sticker={id} style={{ position: 'absolute', right: 8, bottom: 26, pointerEvents: 'none', zIndex: 2,
      filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' }}>
      <PokemonSprite id={id} size={size}/>
    </div>
  );
}

/* ---------- partner ---------- */
const PARTNER_SIZE = 88;
const PARTNER_WANDER = 260;   // px it strolls along the bottom of the desk

function PartnerPokemon({ T, tweaks, update }) {
  const id = isPokemonId(tweaks.partner) ? tweaks.partner : 25;
  const [mood, setMood] = useState('idle');      // idle | hop | shake | talk | spin
  const [x, setX] = useState(0);
  const [facingLeft, setFacingLeft] = useState(false);
  const [bubble, setBubble] = useState(null);
  const [menu, setMenu] = useState(null);
  const [picking, setPicking] = useState(false);
  const moodTimer = useRef(null);
  const bubbleTimer = useRef(null);
  const [, setSpeechState] = useState('idle');

  const act = (next, ms = 700) => {
    clearTimeout(moodTimer.current);
    setMood(next);
    if (ms) moodTimer.current = setTimeout(() => setMood('idle'), ms);
  };
  const say = (text, ms = 2600) => {
    clearTimeout(bubbleTimer.current);
    setBubble(text);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  };

  // Reactions to what happens on the desk.
  useEffect(() => {
    const onEvent = (e) => {
      switch (e.detail) {
        case 'create': act('hop'); say('!', 900); break;
        case 'delete': act('shake', 600); say('…', 1200); break;
        case 'pin': act('spin', 800); break;
        case 'speak-start': act('talk', 0); break;
        case 'speak-end': setMood((m) => (m === 'talk' ? 'idle' : m)); break;
      }
    };
    window.addEventListener('sticky:partner', onEvent);
    return () => window.removeEventListener('sticky:partner', onEvent);
  }, []);

  // A gentle stroll now and then, facing the way it walks.
  useEffect(() => {
    let t;
    const wander = () => {
      t = setTimeout(() => {
        setX((cur) => {
          const next = Math.round(Math.random() * PARTNER_WANDER);
          if (next !== cur) setFacingLeft(next < cur);
          return next;
        });
        wander();
      }, 7000 + Math.random() * 9000);
    };
    wander();
    return () => { clearTimeout(t); clearTimeout(moodTimer.current); clearTimeout(bubbleTimer.current); };
  }, []);

  useEffect(() => { say(`${pokemonName(id).ja}!`, 1800); }, [id]);

  const onClick = () => {
    const n = pokemonName(id);
    act('hop');
    say(`${n.ja} · ${n.en}`);
    // Hear its Japanese name in your own TTS voice, when that is set up.
    if (window.stickyAPI?.ttsConfigured && typeof playSpeech === 'function') {
      playSpeech(n.ja, setSpeechState).catch?.(() => {});
    }
  };

  const anim = mood === 'hop' ? 'poke-hop .6s ease-out'
    : mood === 'shake' ? 'poke-shake .5s ease-in-out'
    : mood === 'spin' ? 'poke-spin .8s ease-in-out'
    : mood === 'talk' ? 'poke-talk .35s ease-in-out infinite'
    : 'poke-idle 2.4s ease-in-out infinite';

  return (
    <>
      <div data-partner={id} data-partner-mood={mood}
        style={{ position: 'fixed', left: 184, bottom: 30, zIndex: 17000, width: PARTNER_SIZE + PARTNER_WANDER, height: PARTNER_SIZE + 40, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', bottom: 0, left: x, width: PARTNER_SIZE, transition: 'left 2.2s ease-in-out' }}>
          {bubble && (
            <div style={{ position: 'absolute', bottom: PARTNER_SIZE - 4, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap',
              background: T.panelBg, color: T.panelText, border: `1.5px solid ${T.panelText}`, borderRadius: 10, padding: '3px 8px',
              fontSize: 12, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,.15)' }}>{bubble}</div>
          )}
          <div onClick={onClick}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
            title={`${pokemonName(id).en} · click to say hi, right-click for options`}
            style={{ pointerEvents: 'auto', cursor: 'pointer', animation: anim, transformOrigin: '50% 100%' }}>
            <div style={{ transform: facingLeft ? 'scaleX(-1)' : 'none', transition: 'transform .2s' }}>
              <PokemonSprite id={id} size={PARTNER_SIZE} style={{ filter: 'drop-shadow(0 4px 4px rgba(0,0,0,.25))' }}/>
            </div>
          </div>
          <div style={{ margin: '-6px auto 0', width: PARTNER_SIZE * 0.55, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,.14)' }}/>
        </div>
      </div>
      {menu && (
        <ContextMenu T={T} x={menu.x} y={menu.y} fixed onClose={() => setMenu(null)} items={[
          { label: 'Choose partner…', onClick: () => setPicking(true) },
          { label: 'Random partner', onClick: () => update({ partner: randomPokemonId() }) },
          { divider: true },
          { label: 'Hide partner', onClick: () => update({ showPartner: false }) },
        ]}/>
      )}
      {picking && (
        <PokemonPicker T={T} title="Choose your partner" current={id}
          onPick={(pid) => update({ partner: pid, showPartner: true })} onClose={() => setPicking(false)}/>
      )}
    </>
  );
}

const pokemonStyle = document.createElement('style');
pokemonStyle.textContent = `
  @keyframes poke-idle  { 0%,100% { transform: translateY(0) scaleY(1); } 50% { transform: translateY(-3px) scaleY(1.02); } }
  @keyframes poke-hop   { 0% { transform: translateY(0); } 35% { transform: translateY(-26px); } 60% { transform: translateY(0) scaleY(.92); } 80% { transform: translateY(-6px); } 100% { transform: translateY(0); } }
  @keyframes poke-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px) rotate(-4deg); } 40% { transform: translateX(6px) rotate(4deg); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
  @keyframes poke-spin  { 0% { transform: rotateY(0); } 100% { transform: rotateY(360deg); } }
  @keyframes poke-talk  { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-4px) scale(1.04); } }
`;
document.head.appendChild(pokemonStyle);

Object.assign(window, { PokeBallIcon, PokemonPicker, PokemonSprite, PokemonSticker, PartnerPokemon, pokemonReact });
