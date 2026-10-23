import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays,
  Clock3, Eye, EyeOff, Instagram, LockKeyhole, LogOut, Mail, MapPin, Menu,
  QrCode, ShieldCheck, Ticket, Users, X,
} from 'lucide-react';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { auth, db, isAdminUser } from './firebase';
import { ADMIN_PATH, decorateEvent, isEventLive, randomCode, ticketPayload, ticketShortCode, toMs, useNow, usePoster } from './lib';

const AdminArea = lazy(() => import('./Admin.jsx'));

const sampleEvent = { id: 'sample', title: 'THE FIRST AT BASE', subtitle: 'Una notte. Una nuova base.', dateLabel: 'PROSSIMAMENTE', timeLabel: '23:00 — LATE', venue: 'BASE Basement · Cava de’ Tirreni', accent: 'coral', description: 'La prima notte è quella che non si dimentica. Ci vediamo sotto.' };

function resolveView() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === ADMIN_PATH) return 'admin';
  if (path === '/profilo') return 'profile';
  return 'home';
}

function useLocationView() {
  const [view, setView] = useState(resolveView);
  useEffect(() => {
    const sync = () => setView(resolveView());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const go = useCallback((next) => {
    const route = next === 'admin' ? ADMIN_PATH : next === 'profile' ? '/profilo' : '/';
    if (window.location.pathname !== route) window.history.pushState({}, '', route);
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  return [view, go];
}

export function Brand({ light = false, onClick }) {
  return <button className={`brand ${light ? 'brand-light' : ''}`} onClick={onClick} aria-label="BASE — home">
    <span className="brand-cube"><span>B</span></span><span className="brand-word">BASE<span className="brand-dot">.</span><small>BASEMENT CLUB</small></span>
  </button>;
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

const authMessages = {
  'auth/email-already-in-use': 'Questa email è già registrata. Accedi al tuo profilo.',
  'auth/invalid-credential': 'Email o password non corretti.',
  'auth/weak-password': 'La password deve contenere almeno 6 caratteri.',
  'auth/invalid-email': 'Inserisci un indirizzo email valido.',
  'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
  'auth/network-request-failed': 'Connessione assente. Controlla la rete e riprova.',
  'permission-denied': 'Account creato, ma il profilo non è stato salvato. Riprova tra poco.',
};

function AuthModal({ mode, setMode, onClose, onDone }) {
  const [values, setValues] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signup = mode === 'signup';
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (signup) {
        const firstName = values.firstName.trim();
        const lastName = values.lastName.trim();
        const credential = await createUserWithEmailAndPassword(auth, values.email.trim(), values.password);
        const fullName = `${firstName} ${lastName}`;
        await updateProfile(credential.user, { displayName: fullName });
        await setDoc(doc(db, 'profiles', credential.user.uid), {
          uid: credential.user.uid, firstName, lastName, fullName, email: credential.user.email, createdAt: serverTimestamp(),
        });
        onDone(credential.user);
      } else {
        const credential = await signInWithEmailAndPassword(auth, values.email.trim(), values.password);
        onDone(credential.user);
      }
    } catch (err) {
      setError(authMessages[err.code] || 'Non è stato possibile completare l’operazione.');
    } finally { setBusy(false); }
  };
  return <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="icon-button modal-close" onClick={onClose} aria-label="Chiudi"><X size={20} /></button>
      <div className="eyebrow"><span className="eyebrow-line" /> BASE MEMBERSHIP</div>
      <h2 id="auth-title">{signup ? <>La notte<br /><em>ti aspetta.</em></> : <>Bentornato<br /><em>sotto.</em></>}</h2>
      <p className="modal-intro">{signup ? 'Crea il tuo profilo. Il prossimo ingresso è già tuo.' : 'Accedi per ritrovare i tuoi eventi e i tuoi QR.'}</p>
      <form className="auth-form" onSubmit={submit}>
        {signup && <div className="name-row">
          <label>Nome<input required maxLength={60} autoComplete="given-name" value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} placeholder="Il tuo nome" /></label>
          <label>Cognome<input required maxLength={60} autoComplete="family-name" value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} placeholder="Il tuo cognome" /></label>
        </div>}
        <label>Email<span className="input-wrap"><Mail size={16} /><input type="email" required autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="nome@email.com" /></span></label>
        <label>Password<span className="input-wrap"><LockKeyhole size={16} /><input type={showPassword ? 'text' : 'password'} required minLength={6} autoComplete={signup ? 'new-password' : 'current-password'} value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} placeholder="Almeno 6 caratteri" /><button type="button" className="reveal-password" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
        {error && <p className="form-error">{error}</p>}
        <Button disabled={busy} className="auth-submit">{busy ? 'UN ATTIMO…' : signup ? 'DIVENTA MEMBRO' : 'ACCEDI'} <ArrowRight size={17} /></Button>
      </form>
      <p className="auth-switch">{signup ? 'Hai già un profilo?' : 'È la tua prima notte?'} <button onClick={() => { setError(''); setMode(signup ? 'login' : 'signup'); }}>{signup ? 'Accedi' : 'Diventa membro'}</button></p>
      <div className="modal-foot"><ShieldCheck size={14} /> I tuoi dati restano al sicuro.</div>
    </section>
  </div>;
}

export function Poster({ event, className = '', index = 1, total = 1 }) {
  const posterSrc = usePoster(event);
  return <article className={`poster poster-${event?.accent || 'rust'} ${posterSrc ? 'poster-has-photo' : ''} ${className}`}>
    {posterSrc && <img className="poster-photo" src={posterSrc} alt={`Locandina ${event?.title || ''}`} />}
    <div className="poster-grain" />
    <div className="poster-top"><span>BASE<span className="poster-dot">.</span></span><span className="mono">{event?.dateLabel || 'PROSSIMAMENTE'}</span></div>
    {!posterSrc && <div className="poster-orbit"><span>BS</span><i /><i /><i /></div>}
    <div className="poster-content"><span className="poster-kicker">{event?.subtitle || 'WHAT IS BASE?'}</span><h3>{event?.title || 'LA NOTTE PRENDE FORMA'}</h3><span className="poster-bottom">{event?.venue || 'CAVA DE’ TIRRENI'} <b>→</b></span></div>
    <div className="poster-number">{String(index).padStart(2, '0')} / {String(total).padStart(2, '0')}</div>
  </article>;
}

function Landing({ onJoin, onLogin, events }) {
  const event = events[0] || sampleEvent;
  const others = events.slice(1);
  const [menuOpen, setMenuOpen] = useState(false);
  return <main className="landing">
    <header className="site-nav">
      <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      <nav className={menuOpen ? 'nav-links nav-open' : 'nav-links'}>
        <a href="#manifesto" onClick={() => setMenuOpen(false)}>IL MANIFESTO</a>
        <a href="#eventi" onClick={() => setMenuOpen(false)}>EVENTI</a>
        <button onClick={() => { setMenuOpen(false); onLogin(); }}>AREA MEMBRI <ArrowUpRight size={13} /></button>
      </nav>
      <Button variant="small" onClick={onJoin}>ENTRA NEL CLUB <ArrowRight size={15} /></Button>
      <button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Apri il menu">{menuOpen ? <X /> : <Menu />}</button>
    </header>
    <section className="hero">
      <div className="hero-grid" />
      <div className="hero-copy">
        <div className="eyebrow hero-eyebrow"><span className="live-pulse" /> CAVA DE’ TIRRENI · DAL SOTTOSUOLO</div>
        <h1>LA NOTTE<br />HA UNA <span className="outline-word">BASE</span><span className="hero-period">.</span></h1>
        <div className="hero-lower"><p>Non è solo un posto.<br />È il punto da cui <em>tutto parte.</em></p><Button onClick={onJoin}>DIVENTA MEMBRO <ArrowRight size={18} /></Button></div>
        <a className="scroll-cue" href="#manifesto"><span>SCENDI</span><ArrowDown size={15} /></a>
      </div>
      <div className="hero-art" aria-label="Locandina del prossimo evento">
        <div className="hero-ambient" />
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <div className="hero-stamp">BUILT<br />BELOW<br /><span>THE NOISE</span></div>
        <Poster event={event} className="hero-poster" total={Math.max(events.length, 1)} />
        <a className="event-float-card" href="#eventi"><span className="live-pulse" /><div><small>PROSSIMO EVENTO</small><strong>{event.title}</strong></div><ArrowUpRight size={16} /></a>
        <div className="hero-index mono">40°42' N<br />14°42' E</div>
      </div>
      <div className="hero-bottomline"><span>INDIPENDENTE. ISTINTIVO. BASE.</span><span>SCORRI PER ESPLORARE <ArrowDown size={13} /></span><span>01 — 03</span></div>
    </section>
    <section className="manifesto section-pad" id="manifesto">
      <div className="section-meta"><span className="eyebrow"><span className="eyebrow-line" /> IL MANIFESTO</span><span className="mono">( 01 — 03 )</span></div>
      <div className="manifesto-main"><h2>UN LUOGO<br />DA <em>SENTIRE.</em></h2><div className="manifesto-right"><div className="manifesto-mark">B<span>.</span></div><p>Metallo, bassi e persone vere. BASE nasce dove finisce il rumore di fondo: uno spazio da abitare, una community da riconoscere, notti da portarsi dietro.</p><a className="text-link" href="#eventi">SCOPRI IL PROSSIMO EVENTO <ArrowRight size={16} /></a></div></div>
      <div className="manifesto-image"><div className="manifesto-arch"><span>BASE<br /><small>BY EVENING</small></span></div><span className="image-caption mono">UNSPOKEN. UNFILTERED. UNMISTAKABLE.</span><span className="image-crosshair">+</span></div>
    </section>
    <section className="events-section section-pad" id="eventi">
      <div className="section-meta"><span className="eyebrow"><span className="eyebrow-line" /> CI VEDIAMO SOTTO</span><span className="mono">( 02 — 03 )</span></div>
      <div className="events-heading"><h2>LA PROSSIMA<br /><em>NOTTE.</em></h2><p>Il tuo posto ti aspetta.<br />Il QR lo trovi nel profilo.</p></div>
      <div className="event-feature"><Poster event={event} className="event-poster" total={Math.max(events.length, 1)} /><div className="event-details"><span className="eyebrow">{event.dateLabel}</span><h3>{event.title}</h3><p>{event.description || 'Una notte. Una nuova base. Il tuo posto ti aspetta.'}</p><div className="event-meta"><span><CalendarDays size={16} /> {event.dateLabel}</span><span><Clock3 size={16} /> {event.timeLabel}</span><span><MapPin size={16} /> {event.venue || 'Cava de’ Tirreni'}</span></div><Button onClick={onJoin}>PRENDI IL TUO POSTO <ArrowRight size={17} /></Button><span className="event-availability"><span className="live-pulse" /> ACCESSO RISERVATO AI MEMBRI</span></div></div>
      {others.length > 0 && <div className="more-events">
        <div className="more-events-head"><span className="eyebrow"><span className="eyebrow-line" /> IN ARRIVO</span><span className="mono">{String(others.length).padStart(2, '0')} NOTTI</span></div>
        <div className="more-events-grid">{others.map((item, i) => <article className="more-event" key={item.id}><Poster event={item} className="more-event-poster" index={i + 2} total={events.length} /><div><span className="mono">{item.dateLabel} · {item.timeLabel}</span><h4>{item.title}</h4><p>{item.venue}</p></div></article>)}</div>
      </div>}
    </section>
    <section className="join-strip"><div className="join-strip-inner"><span className="eyebrow">LA COMMUNITY TI ASPETTA</span><h2>FATTI TROVARE<br /><em>DENTRO.</em></h2><Button variant="light" onClick={onJoin}>DIVENTA MEMBRO <ArrowRight size={17} /></Button><span className="strip-star">✳</span></div></section>
    <footer className="site-footer"><Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} /><span>UN POSTO PER SENTIRSI ALTROVE.</span><a href="https://instagram.com/base.basement/" target="_blank" rel="noreferrer"><Instagram size={17} /> @BASE.BASEMENT</a><small>© BASE BASEMENT 2026</small></footer>
  </main>;
}

function TicketCard({ event, ticket, index, total }) {
  const used = ticket?.status === 'used';
  return <div className="ticket-layout">
    <div className="ticket-poster-wrap"><Poster event={event} className="member-poster" index={index} total={total} /><div className="ticket-tag"><Ticket size={14} /> INGRESSO PERSONALE</div></div>
    <div className="ticket-card">
      <div className="ticket-card-top"><span className={`ticket-status ${used ? 'used' : ''}`}><i /> {used ? 'UTILIZZATO' : ticket ? 'VALIDO' : 'IN PREPARAZIONE'}</span><span className="mono">{ticket ? `NO. ${ticketShortCode(ticket)}` : '—'}</span></div>
      <h2>{event.title}</h2>
      <p className="ticket-location"><MapPin size={15} /> {event.venue || 'BASE Basement'} · {event.dateLabel} · {event.timeLabel}</p>
      <div className="ticket-divider"><i /><span /></div>
      <div className="ticket-qr-wrap">
        <div className={`ticket-qr ${used ? 'ticket-qr-used' : ''}`}>{ticket ? <QRCodeSVG value={ticketPayload(ticket)} size={168} bgColor="#f5f3ed" fgColor="#11110f" level="M" includeMargin /> : <div className="ticket-qr-pending"><QrCode size={34} /></div>}</div>
        <div className="ticket-qr-copy"><strong>{used ? 'INGRESSO GIÀ REGISTRATO' : ticket ? 'MOSTRA QUESTO QR ALL’INGRESSO' : 'STIAMO GENERANDO IL TUO QR…'}</strong><span>{used ? 'Questo QR è già stato convalidato.' : 'Un QR. Un ingresso. Il tuo.'}</span><span className="mono">SCADE A FINE EVENTO</span></div>
      </div>
      <div className="ticket-perforation"><span>BASE MEMBER PASS</span><span>NON TRASFERIBILE</span></div>
    </div>
  </div>;
}

function MemberArea({ user, profile, profileState, liveEvents, tickets, go, onLogout }) {
  const name = profile?.firstName || user?.displayName?.split(' ')[0] || 'Membro';
  const ticketsByEvent = useMemo(() => new Map(tickets.map((t) => [t.eventId, t])), [tickets]);
  const blocked = profile?.blocked === true;
  let body;
  if (profileState === 'missing') {
    body = <div className="empty-ticket"><div className="empty-qr"><X size={34} /></div><div><span className="eyebrow">PROFILO NON TROVATO</span><h2>Il tuo profilo<br /><em>non è attivo.</em></h2><p>Questo account non risulta più iscritto a BASE. Contatta lo staff se pensi sia un errore.</p><Button onClick={onLogout}>ESCI <LogOut size={17} /></Button></div><div className="empty-orbit" /></div>;
  } else if (blocked) {
    body = <div className="empty-ticket"><div className="empty-qr"><LockKeyhole size={34} /></div><div><span className="eyebrow">ACCOUNT SOSPESO</span><h2>Il tuo accesso<br /><em>è sospeso.</em></h2><p>Al momento non puoi ricevere QR per gli eventi. Contatta lo staff di BASE.</p></div><div className="empty-orbit" /></div>;
  } else if (liveEvents.length) {
    body = <div className="ticket-list">{liveEvents.map((event, i) => <TicketCard key={event.id} event={event} ticket={ticketsByEvent.get(event.id)} index={i + 1} total={liveEvents.length} />)}</div>;
  } else {
    body = <div className="empty-ticket"><div className="empty-qr"><QrCode size={34} /></div><div><span className="eyebrow">NESSUN EVENTO IN PROGRAMMA</span><h2>Il prossimo evento<br /><em>sarà il tuo.</em></h2><p>Quando BASE pubblica una nuova notte, il tuo QR personale apparirà qui in automatico.</p><Button onClick={() => go('home')}>SCOPRI IL CLUB <ArrowRight size={17} /></Button></div><div className="empty-orbit" /></div>;
  }
  const since = toMs(profile?.createdAt) || Date.now();
  return <main className="dashboard-shell">
    <header className="dash-header"><Brand onClick={() => go('home')} /><span className="dash-section-label">MEMBER AREA <span>/</span> PROFILO</span><button className="dash-user" onClick={onLogout}><span className="user-avatar">{name.slice(0, 1).toUpperCase()}</span><span className="dash-user-name">{name}</span><LogOut size={16} /></button></header>
    <div className="member-layout"><aside className="dash-sidebar"><div className="sidebar-eyebrow">IL TUO SPAZIO</div><button className="sidebar-link active"><Users size={17} /> Il mio profilo <span>01</span></button><button className="sidebar-link" onClick={() => go('home')}><ArrowLeft size={17} /> Torna al club</button><button className="sidebar-link" onClick={onLogout}><LogOut size={17} /> Esci</button><div className="sidebar-bottom"><span className="live-pulse" /> MEMBRO BASE<br /><small>DAL {new Date(since).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }).toUpperCase()}</small></div></aside>
      <section className="member-main"><div className="member-greeting"><div><span className="eyebrow"><span className="eyebrow-line" /> AREA PERSONALE</span><h1>BENVENUTO<br /><em>{name.toUpperCase()}.</em></h1><p>{profile?.fullName || user.displayName} · {user.email}</p></div><div className="member-id"><span>MEMBER ID</span><strong>{user.uid.slice(0, 8).toUpperCase()}</strong><BadgeCheck size={19} /></div></div>
        <div className="ticket-heading"><span>I TUOI INGRESSI</span><span className="mono">{String(liveEvents.length).padStart(2, '0')} {liveEvents.length === 1 ? 'EVENTO' : 'EVENTI'}</span></div>
        {profileState === 'loading' ? <div className="empty-ticket"><div className="loading-cube">B</div></div> : body}
        <div className="member-note"><ShieldCheck size={17} /><span>Ogni QR è personale, vale per un solo ingresso e scade a fine evento. <strong>Non condividerlo.</strong></span></div>
      </section></div>
  </main>;
}

export default function App() {
  const [view, go] = useLocationView();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileState, setProfileState] = useState('loading');
  const [tickets, setTickets] = useState([]);
  const [ticketsReady, setTicketsReady] = useState(false);
  const [events, setEvents] = useState([]);
  const [authMode, setAuthMode] = useState('signup');
  const [authOpen, setAuthOpen] = useState(false);
  const [firebaseIssue, setFirebaseIssue] = useState('');
  const requested = useRef(new Set());
  const now = useNow();
  const admin = isAdminUser(user);

  useEffect(() => onAuthStateChanged(auth, (current) => {
    setUser(current); setAuthReady(true); requested.current = new Set();
  }), []);

  // Eventi pubblicati: alimentano landing e profilo, in tempo reale.
  useEffect(() => onSnapshot(query(collection(db, 'events'), where('status', '==', 'published')),
    (snapshot) => { setEvents(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))); setFirebaseIssue(''); },
    (error) => setFirebaseIssue(error.message)), []);

  useEffect(() => {
    setProfile(null); setProfileState('loading');
    if (!user || admin) return undefined;
    // Subito dopo la registrazione il profilo può non esistere ancora: diamo qualche secondo prima di dichiararlo mancante.
    let timer = 0;
    const unsub = onSnapshot(doc(db, 'profiles', user.uid), (snap) => {
      window.clearTimeout(timer);
      if (snap.exists()) { setProfile(snap.data()); setProfileState('ready'); }
      else timer = window.setTimeout(() => setProfileState('missing'), 5000);
    }, (error) => setFirebaseIssue(error.message));
    return () => { unsub(); window.clearTimeout(timer); };
  }, [user, admin]);

  useEffect(() => {
    setTickets([]); setTicketsReady(false);
    if (!user || admin) return undefined;
    return onSnapshot(query(collection(db, 'tickets'), where('uid', '==', user.uid)),
      (snapshot) => { setTickets(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))); setTicketsReady(true); },
      (error) => setFirebaseIssue(error.message));
  }, [user, admin]);

  const liveEvents = useMemo(() => events.filter((e) => isEventLive(e, now)).sort((a, b) => toMs(a.startAt) - toMs(b.startAt)).map(decorateEvent), [events, now]);

  // Ogni membro attivo riceve un QR unico per ogni evento in programma.
  useEffect(() => {
    if (!user || admin || !ticketsReady || profileState !== 'ready' || profile?.blocked) return;
    const owned = new Set(tickets.map((t) => t.eventId));
    liveEvents.filter((e) => !owned.has(e.id) && !requested.current.has(e.id)).forEach((event) => {
      requested.current.add(event.id);
      setDoc(doc(db, 'tickets', `${event.id}_${user.uid}`), {
        uid: user.uid, eventId: event.id, code: randomCode(), status: 'issued', createdAt: serverTimestamp(),
      }).catch(() => { window.setTimeout(() => requested.current.delete(event.id), 15_000); });
    });
  }, [user, admin, profile, profileState, liveEvents, tickets, ticketsReady]);

  useEffect(() => {
    if (!authReady) return;
    if (view === 'admin' && user && !admin) go('profile');
    if ((view === 'profile' || view === 'admin') && !user) { setAuthMode('login'); setAuthOpen(true); }
  }, [view, user, admin, authReady, go]);

  const logout = async () => { await signOut(auth); go('home'); };
  const openAuth = (mode) => {
    if (user) { go(admin ? 'admin' : 'profile'); return; }
    setAuthMode(mode); setAuthOpen(true);
  };
  const onAuthDone = (current) => { setAuthOpen(false); go(isAdminUser(current) ? 'admin' : 'profile'); };

  const showProfile = view === 'profile' && user && !admin;
  const showAdmin = view === 'admin' && user && admin;
  const loadingScreen = <div className="loading-screen"><div className="loading-cube">B</div><span>ENTRIAMO SOTTO.</span></div>;

  return <>
    {!authReady && view !== 'home' ? loadingScreen : null}
    {authReady && showProfile ? <MemberArea user={user} profile={profile} profileState={profileState} liveEvents={liveEvents} tickets={tickets} go={go} onLogout={logout} /> : null}
    {authReady && showAdmin ? <Suspense fallback={loadingScreen}><AdminArea user={user} go={go} onLogout={logout} /></Suspense> : null}
    {(view === 'home' || (authReady && !showProfile && !showAdmin)) && <Landing events={liveEvents} onJoin={() => openAuth('signup')} onLogin={() => openAuth('login')} />}
    {firebaseIssue && !authOpen && <div className="firebase-status" role="status"><span className="live-pulse" /> CONNESSIONE AL DATABASE NON RIUSCITA <button onClick={() => setFirebaseIssue('')} aria-label="Chiudi"><X size={13} /></button></div>}
    {authOpen && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => { setAuthOpen(false); if (view !== 'home' && !user) go('home'); }} onDone={onAuthDone} />}
  </>;
}
