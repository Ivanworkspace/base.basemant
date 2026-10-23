import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays,
  Check, CheckCircle2, ChevronDown, Clock3, DoorOpen, Eye, EyeOff, Instagram,
  LockKeyhole, LogOut, Mail, MapPin, Menu, QrCode, ScanLine, ShieldCheck,
  Sparkles, Ticket, Users, X,
} from 'lucide-react';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { QRCodeSVG } from 'qrcode.react';
import { auth, db, storage, functions } from './firebase';

const sampleEvents = [
  { id: 'first-at-base', title: 'THE FIRST AT BASE', subtitle: 'Una notte. Una nuova base.', dateLabel: '24 OTT 2026', timeLabel: '23:00 — LATE', venue: 'BASE Basement · Cava de’ Tirreni', accent: 'coral', description: 'La prima notte è quella che non si dimentica. Ci vediamo sotto.' },
];

function useLocationView() {
  const resolveView = () => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/admin' || path === '/admin/') return 'admin';
    if (path === '/profile' || path === '/profile/') return 'profile';
    return window.location.hash.replace('#', '') || 'home';
  };
  const [view, setView] = useState(resolveView);
  useEffect(() => {
    const sync = () => setView(resolveView());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, []);
  const go = useCallback((next) => {
    const route = next === 'admin' ? '/admin' : next === 'profile' ? '/profile' : next === 'home' ? '/' : `/#${next}`;
    if (`${window.location.pathname}${window.location.hash}` !== route) window.history.pushState({}, '', route);
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  return [view, go];
}

function Brand({ light = false, onClick }) {
  return <button className={`brand ${light ? 'brand-light' : ''}`} onClick={onClick} aria-label="BASE — home">
    <span className="brand-cube"><span>B</span></span><span className="brand-word">BASE<span className="brand-dot">.</span><small>BASEMENT CLUB</small></span>
  </button>;
}

function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

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
        const credential = await createUserWithEmailAndPassword(auth, values.email.trim(), values.password);
        const fullName = `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
        await updateProfile(credential.user, { displayName: fullName });
        await setDoc(doc(db, 'profiles', credential.user.uid), {
          uid: credential.user.uid, firstName: values.firstName.trim(), lastName: values.lastName.trim(),
          fullName, email: credential.user.email || values.email.trim(), role: 'member', createdAt: serverTimestamp(),
        });
        onDone(credential.user);
      } else {
        const credential = await signInWithEmailAndPassword(auth, values.email.trim(), values.password);
        onDone(credential.user);
      }
    } catch (err) {
      const messages = {
        'auth/email-already-in-use': 'Questa email è già registrata. Accedi al tuo profilo.',
        'auth/invalid-credential': 'Email o password non corretti.',
        'auth/weak-password': 'La password deve contenere almeno 6 caratteri.',
        'auth/invalid-email': 'Inserisci un indirizzo email valido.',
        'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
        'permission-denied': 'Account creato, ma il profilo non è stato salvato. Verifica le regole Firestore.',
      };
      setError(messages[err.code] || err.message || 'Non è stato possibile completare l’operazione.');
    } finally { setBusy(false); }
  };
  return <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="icon-button modal-close" onClick={onClose} aria-label="Chiudi"><X size={20} /></button>
      <div className="eyebrow"><span className="eyebrow-line" /> BASE MEMBERSHIP</div>
      <h2 id="auth-title">{signup ? <>La notte<br /><em>ti aspetta.</em></> : <>Bentornato<br /><em>sotto.</em></>}</h2>
      <p className="modal-intro">{signup ? 'Crea il tuo profilo. Il prossimo ingresso è già tuo.' : 'Accedi per ritrovare i tuoi eventi e i tuoi ticket.'}</p>
      <form className="auth-form" onSubmit={submit}>
        {signup && <div className="name-row">
          <label>Nome<input required autoComplete="given-name" value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} placeholder="Il tuo nome" /></label>
          <label>Cognome<input required autoComplete="family-name" value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} placeholder="Il tuo cognome" /></label>
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

function Poster({ event, className = '', onClick }) {
  const isCustom = Boolean(event?.posterUrl);
  return <article className={`poster poster-${event?.accent || 'rust'} ${className}`} onClick={onClick}>
    {isCustom && <img className="poster-photo" src={event.posterUrl} alt="" />}
    <div className="poster-grain" />
    <div className="poster-top"><span>BASE<span className="poster-dot">.</span></span><span className="mono">{event?.dateLabel || 'PROSSIMAMENTE'}</span></div>
    <div className="poster-orbit"><span>BS</span><i /><i /><i /></div>
    <div className="poster-content"><span className="poster-kicker">{event?.subtitle || 'WHAT IS BASE?'}</span><h3>{event?.title || 'LA NOTTE\nPRENDE FORMA'}</h3><span className="poster-bottom">{event?.venue || 'CAVA DE’ TIRRENI'} <b>→</b></span></div>
    <div className="poster-number">01 / 01</div>
  </article>;
}

function Landing({ onJoin, onLogin, events }) {
  const event = events[0] || sampleEvents[0];
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
        <Poster event={event} className="hero-poster" />
        <div className="event-float-card"><span className="live-pulse" /><div><small>PROSSIMO EVENTO</small><strong>{event?.title || 'THE FIRST AT BASE'}</strong></div><ArrowUpRight size={16} /></div>
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
      <div className="event-feature"><Poster event={event} className="event-poster" /><div className="event-details"><span className="eyebrow">{event?.dateLabel || 'PRESTO'}</span><h3>{event?.title || 'THE FIRST AT BASE'}</h3><p>{event?.description || 'Una notte. Una nuova base. Il tuo posto ti aspetta.'}</p><div className="event-meta"><span><CalendarDays size={16} /> {event?.dateLabel || 'PROSSIMAMENTE'}</span><span><Clock3 size={16} /> {event?.timeLabel || '23:00 — LATE'}</span><span><MapPin size={16} /> {event?.venue || 'Cava de’ Tirreni'}</span></div><Button onClick={onJoin}>PRENDI IL TUO POSTO <ArrowRight size={17} /></Button><span className="event-availability"><span className="live-pulse" /> ACCESSO RISERVATO AI MEMBRI</span></div></div>
    </section>
    <section className="join-strip"><div className="join-strip-inner"><span className="eyebrow">LA COMMUNITY TI ASPETTA</span><h2>FATTI TROVARE<br /><em>DENTRO.</em></h2><Button variant="light" onClick={onJoin}>DIVENTA MEMBRO <ArrowRight size={17} /></Button><span className="strip-star">✳</span></div></section>
    <footer className="site-footer"><Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} /><span>UN POSTO PER SENTIRSI ALTROVE.</span><a href="https://instagram.com/base.basement/" target="_blank" rel="noreferrer"><Instagram size={17} /> @BASE.BASEMENT</a><small>© BASE BASEMENT 2026</small></footer>
  </main>;
}

function MemberArea({ user, profile, tickets, go, onLogout }) {
  const [selected, setSelected] = useState(0);
  const ticket = tickets[selected];
  const name = profile?.firstName || user?.displayName?.split(' ')[0] || 'Membro';
  return <main className="dashboard-shell">
    <header className="dash-header"><Brand onClick={() => go('home')} /><span className="dash-section-label">MEMBER AREA <span>/</span> PROFILO</span><button className="dash-user" onClick={onLogout}><span className="user-avatar">{name.slice(0, 1).toUpperCase()}</span><span className="dash-user-name">{name}</span><LogOut size={16} /></button></header>
    <div className="member-layout"><aside className="dash-sidebar"><div className="sidebar-eyebrow">IL TUO SPAZIO</div><button className="sidebar-link active"><Users size={17} /> Il mio profilo <span>01</span></button><button className="sidebar-link" onClick={() => go('home')}><ArrowLeft size={17} /> Torna al club</button><div className="sidebar-bottom"><span className="live-pulse" /> MEMBRO BASE<br /><small>DAL {new Date(profile?.createdAt?.seconds ? profile.createdAt.seconds * 1000 : Date.now()).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }).toUpperCase()}</small></div></aside>
      <section className="member-main"><div className="member-greeting"><div><span className="eyebrow"><span className="eyebrow-line" /> AREA PERSONALE</span><h1>BENVENUTO<br /><em>{name.toUpperCase()}.</em></h1><p>Il prossimo ingresso? È già nel tuo profilo.</p></div><div className="member-id"><span>MEMBER ID</span><strong>{user.uid.slice(0, 8).toUpperCase()}</strong><BadgeCheck size={19} /></div></div>
        <div className="ticket-heading"><span>LA TUA PROSSIMA NOTTE</span><span className="mono">{tickets.length ? `${String(selected + 1).padStart(2, '0')} / ${String(tickets.length).padStart(2, '0')}` : '00 / 00'}</span></div>
        {ticket ? <div className="ticket-layout"><div className="ticket-poster-wrap"><Poster event={ticket.event || { title: 'THE FIRST AT BASE', dateLabel: 'BASE MEMBERS', venue: 'CAVA DE’ TIRRENI' }} className="member-poster" /><div className="ticket-tag"><Ticket size={14} /> INGRESSO PERSONALE</div></div><div className="ticket-card"><div className="ticket-card-top"><span className={`ticket-status ${ticket.status === 'used' ? 'used' : ''}`}><i /> {ticket.status === 'used' ? 'UTILIZZATO' : 'VALIDO'}</span><span className="mono">NO. {ticket.id.slice(-6).toUpperCase()}</span></div><h2>{ticket.event?.title || 'EVENTO BASE'}</h2><p className="ticket-location"><MapPin size={15} /> {ticket.event?.venue || 'BASE Basement'}</p><div className="ticket-divider"><i /><span /></div><div className="ticket-qr-wrap"><div className={`ticket-qr ${ticket.status === 'used' ? 'ticket-qr-used' : ''}`}><QRCodeSVG value={ticket.code || ticket.id} size={140} bgColor="#f5f3ed" fgColor="#11110f" level="H" includeMargin /></div><div className="ticket-qr-copy"><strong>{ticket.status === 'used' ? 'INGRESSO GIÀ REGISTRATO' : 'MOSTRA QUESTO QR ALL’INGRESSO'}</strong><span>{ticket.status === 'used' ? 'Questo ticket è già stato convalidato.' : 'Un ticket. Un ingresso. Il tuo.'}</span><span className="mono">{ticket.event?.dateLabel || 'DATA EVENTO'}</span></div></div><div className="ticket-perforation"><span>BASE MEMBER PASS</span><span>NON TRASFERIBILE</span></div></div></div> : <div className="empty-ticket"><div className="empty-qr"><QrCode size={34} /></div><div><span className="eyebrow">NESSUN TICKET ANCORA</span><h2>Il prossimo evento<br /><em>sarà il tuo.</em></h2><p>Quando BASE pubblica una nuova notte, il tuo QR personale apparirà qui in automatico.</p><Button onClick={() => go('home')}>SCOPRI IL CLUB <ArrowRight size={17} /></Button></div><div className="empty-orbit" /></div>}
        <div className="member-note"><ShieldCheck size={17} /><span>Il tuo QR è personale e può essere utilizzato una sola volta. <strong>Non condividerlo.</strong></span></div>
      </section></div>
    </main>;
}

function AdminArea({ user, profiles, events, go, onLogout, onRefresh }) {
  const [tab, setTab] = useState('overview');
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [formError, setFormError] = useState('');
  const scannerHost = useRef(null);
  const scannerRef = useRef(null);
  const [scannerVersion, setScannerVersion] = useState(0);
  const [eventForm, setEventForm] = useState({ title: '', subtitle: '', date: '', time: '23:00', venue: '', description: '' });
  const [posterFile, setPosterFile] = useState(null);
  const [scanCode, setScanCode] = useState('');
  const validateCode = useCallback(async (value) => {
    const code = value.trim(); if (!code) return;
    setScanError(''); setScanResult(null);
    try {
      const redeem = httpsCallable(functions, 'redeemTicket');
      const response = await redeem({ code });
      setScanResult(response.data);
    } catch (err) {
      setScanError(err.code === 'functions/failed-precondition' ? 'Questo biglietto risulta già utilizzato.' : err.code === 'functions/not-found' ? 'QR non riconosciuto. Controlla che il biglietto sia di BASE.' : err.message || 'Non è stato possibile verificare il biglietto.');
    }
    setScanCode('');
    setScannerVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (tab !== 'scanner' || !scannerHost.current) return;
    let disposed = false;
    let scanner;
    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (disposed || !scannerHost.current) return;
      scanner = new Html5QrcodeScanner('base-scanner', { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 }, false);
      scannerRef.current = scanner;
      scanner.render((decodedText) => {
        if (disposed) return;
        scanner.clear().catch(() => {});
        validateCode(decodedText);
      }, () => {});
    }).catch(() => setScanError('Non riesco a caricare lo scanner. Ricarica la pagina e riprova.'));
    return () => { disposed = true; scanner?.clear().catch(() => {}); scannerRef.current = null; };
  }, [tab, scannerVersion, validateCode]);

  const submitEvent = async (event) => {
    event.preventDefault(); setPublishing(true); setFormError('');
    try {
      let posterUrl = '';
      if (posterFile) {
        const fileRef = ref(storage, `event-posters/${Date.now()}-${posterFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
        await uploadBytes(fileRef, posterFile, { contentType: posterFile.type });
        posterUrl = await getDownloadURL(fileRef);
      }
      const publish = httpsCallable(functions, 'publishEvent');
      await publish({ ...eventForm, posterUrl });
      setEventForm({ title: '', subtitle: '', date: '', time: '23:00', venue: '', description: '' }); setPosterFile(null);
      onRefresh(); setTab('overview');
    } catch (err) {
      setFormError(err.code === 'functions/permission-denied' ? 'Il tuo account non ha i permessi di amministratore.' : err.message || 'Evento non pubblicato. Verifica Firebase e riprova.');
    } finally { setPublishing(false); }
  };

  const tabs = [{ id: 'overview', label: 'Panoramica', icon: Sparkles }, { id: 'members', label: 'Membri', icon: Users }, { id: 'create', label: 'Nuovo evento', icon: CalendarDays }, { id: 'scanner', label: 'Scanner ingressi', icon: ScanLine }];
  return <main className="admin-shell">
    <aside className="admin-sidebar"><Brand onClick={() => go('home')} /><div className="admin-side-label">CONTROL ROOM</div>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={`admin-nav-item ${tab === id ? 'selected' : ''}`} onClick={() => { setTab(id); setScanResult(null); setScanError(''); }}><Icon size={18} />{label}{id === 'members' && <span>{profiles.length}</span>}</button>)}<div className="admin-sidebar-bottom"><span className="admin-avatar">B</span><div><strong>{user.email}</strong><small>AMMINISTRATORE</small></div><button title="Esci" onClick={onLogout}><LogOut size={16} /></button></div></aside>
    <section className="admin-content"><header className="admin-topbar"><div><span className="eyebrow"><span className="live-pulse" /> BASE / ADMIN</span><h1>{tabs.find((t) => t.id === tab)?.label}</h1></div><button className="admin-date" onClick={() => go('home')}>VISUALIZZA SITO <ArrowUpRight size={14} /></button></header>
      {tab === 'overview' && <div className="admin-overview"><div className="admin-stats"><div className="stat-card"><span>MEMBRI TOTALI</span><strong>{profiles.length.toString().padStart(2, '0')}</strong><Users size={19} /><small>Profili registrati</small></div><div className="stat-card"><span>EVENTI PUBBLICATI</span><strong>{events.length.toString().padStart(2, '0')}</strong><CalendarDays size={19} /><small>Le notti di BASE</small></div><div className="stat-card"><span>TICKET CREATI</span><strong>{events.reduce((n, e) => n + (e.ticketCount || 0), 0).toString().padStart(2, '0')}</strong><Ticket size={19} /><small>Ingressi personali</small></div></div><div className="admin-welcome"><div><span className="eyebrow"><span className="eyebrow-line" /> TUTTO SOTTO CONTROLLO</span><h2>La notte<br />parte da <em>qui.</em></h2><p>Gestisci la community, pubblica il prossimo evento e verifica i biglietti all’ingresso.</p><Button onClick={() => setTab('create')}>PUBBLICA UN EVENTO <ArrowRight size={16} /></Button></div><div className="admin-welcome-art"><div className="admin-3d-cube"><span>B</span></div><span className="mono">BUILT BELOW THE NOISE</span></div></div><div className="admin-list-head"><h3>ULTIMI EVENTI</h3><button onClick={() => setTab('create')}>NUOVO EVENTO <ArrowRight size={15} /></button></div><div className="admin-events-list">{events.length ? events.slice(0, 4).map((event) => <div className="admin-event-row" key={event.id}><span className="event-row-date">{event.dateLabel || '—'}</span><strong>{event.title}</strong><span>{event.venue || 'BASE Basement'}</span><span className="event-row-state"><i /> PUBBLICATO</span></div>) : <p className="admin-empty-line">Nessun evento pubblicato. Crea il primo per generare i ticket dei membri.</p>}</div></div>}
      {tab === 'members' && <div className="members-view"><div className="members-intro"><span className="eyebrow"><span className="eyebrow-line" /> COMMUNITY BASE</span><p>Ogni persona qui è già parte della prossima notte.</p></div><div className="members-table"><div className="members-table-head"><span>MEMBRO</span><span>EMAIL</span><span>DATA ISCRIZIONE</span><span>STATO</span></div>{profiles.length ? profiles.map((person) => <div className="members-table-row" key={person.uid}><div className="member-name-cell"><span>{(person.firstName || person.fullName || '?').slice(0, 1).toUpperCase()}</span><strong>{person.fullName || `${person.firstName || ''} ${person.lastName || ''}`}</strong></div><span>{person.email}</span><span>{person.createdAt?.seconds ? new Date(person.createdAt.seconds * 1000).toLocaleDateString('it-IT') : '—'}</span><span className="member-active"><i /> MEMBRO</span></div>) : <div className="admin-empty-line">Ancora nessun membro registrato.</div>}</div><div className="member-count">{profiles.length} MEMBRI IN TOTALE <span>·</span> <button onClick={onRefresh}>AGGIORNA <ChevronDown size={14} /></button></div></div>}
      {tab === 'create' && <div className="create-event-view"><div className="create-intro"><span className="eyebrow"><span className="eyebrow-line" /> NUOVA NOTTE</span><p>Pubblica un evento: ogni membro riceverà automaticamente il suo QR personale.</p></div><form className="event-form" onSubmit={submitEvent}><div className="event-form-main"><label>TITOLO EVENTO<input required maxLength={72} value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} placeholder="es. THE FIRST AT BASE" /></label><label>SOTTOTITOLO<input value={eventForm.subtitle} onChange={(e) => setEventForm({ ...eventForm, subtitle: e.target.value })} placeholder="Una notte. Una nuova base." /></label><label>DESCRIZIONE<textarea rows="4" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} placeholder="Racconta la notte…" /></label><div className="form-two"><label>DATA<input required type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} /></label><label>ORARIO<input required value={eventForm.time} onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })} placeholder="23:00 — LATE" /></label></div><label>LUOGO<input required value={eventForm.venue} onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })} placeholder="BASE Basement · Cava de’ Tirreni" /></label></div><div className="event-form-side"><label className="upload-poster"><input type="file" accept="image/*" onChange={(e) => setPosterFile(e.target.files?.[0] || null)} /><span className="upload-icon"><ArrowUpRight size={18} /></span><strong>{posterFile ? posterFile.name : 'CARICA LA LOCANDINA'}</strong><small>JPG o PNG · max 10 MB</small><span className="upload-preview">{posterFile ? 'LOCANDINA PRONTA' : 'TRASCINA O CLICCA PER SCEGLIERE'}</span></label><div className="event-publish-note"><QrCode size={18} /><span>Al momento della pubblicazione creeremo un ticket personale per ogni membro.</span></div>{formError && <p className="form-error">{formError}</p>}<Button disabled={publishing} className="publish-button">{publishing ? 'PUBBLICAZIONE…' : 'PUBBLICA EVENTO'} <ArrowRight size={17} /></Button><small className="form-footnote">Questa azione invia automaticamente i ticket a tutta la community.</small></div></form></div>}
      {tab === 'scanner' && <div className="scanner-view"><div className="scanner-intro"><span className="eyebrow"><span className="live-pulse" /> CONTROLLO ACCESSI</span><p>Inquadra il QR sullo schermo del membro. Ogni ticket è valido per un solo ingresso.</p></div><div className="scanner-layout"><div className="scanner-box"><div className="scanner-topline"><span><ScanLine size={16} /> SCANNER BASE</span><span className="scanner-live"><i /> LIVE</span></div><div id="base-scanner" ref={scannerHost} className="qr-scanner" /><div className="scanner-manual"><span>OPPURE INSERISCI IL CODICE</span><form onSubmit={(e) => { e.preventDefault(); validateCode(scanCode); }}><input value={scanCode} onChange={(e) => setScanCode(e.target.value)} placeholder="Codice del biglietto" /><button aria-label="Verifica codice"><ArrowRight size={17} /></button></form></div></div><div className={`scan-result ${scanResult ? 'scan-result-success' : ''} ${scanError ? 'scan-result-error' : ''}`}><div className="scan-result-icon">{scanResult ? <CheckCircle2 size={27} /> : scanError ? <X size={25} /> : <DoorOpen size={25} />}</div><span className="eyebrow">ESITO VERIFICA</span>{scanResult ? <><h3>INGRESSO<br /><em>CONVALIDATO.</em></h3><p>{scanResult.eventTitle || 'Ticket accettato'}{scanResult.memberName ? ` · ${scanResult.memberName}` : ''}</p><span className="scan-result-time"><Check size={14} /> {new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span></> : scanError ? <><h3>ACCESSO<br /><em>NEGATO.</em></h3><p>{scanError}</p></> : <><h3>IN ATTESA<br /><em>DEL QR.</em></h3><p>Quando un biglietto valido viene letto, qui compare l’esito in tempo reale.</p></>}<div className="scan-result-bottom"><ShieldCheck size={14} /> VERIFICA AUTOMATICA · ANTI DUPLICATO</div></div></div><p className="scanner-permission"><LockKeyhole size={14} /> Consenti l’accesso alla fotocamera quando richiesto. Lo scanner funziona su HTTPS.</p></div>}
    </section>
  </main>;
}

export default function App() {
  const [view, go] = useLocationView();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [events, setEvents] = useState(sampleEvents);
  const [authMode, setAuthMode] = useState('signup');
  const [authOpen, setAuthOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [firebaseIssue, setFirebaseIssue] = useState('');
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => onAuthStateChanged(auth, async (current) => {
    setUser(current); setLoading(true); setProfile(null); setTickets([]); setProfiles([]); setIsAdmin(false);
    if (!current) { setLoading(false); return; }
    try {
      const [tokenResult, profileSnap] = await Promise.all([current.getIdTokenResult(true), getDoc(doc(db, 'profiles', current.uid))]);
      const admin = tokenResult.claims.admin === true || current.email?.toLowerCase() === 'base@admin.com';
      setIsAdmin(admin); setProfile(profileSnap.exists() ? profileSnap.data() : null);
      if (admin) go('admin'); else go('profile');
    } catch (err) { setFirebaseIssue(err.message); }
    finally { setLoading(false); }
  }), [go]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'events'), where('status', '==', 'published')),
      (snapshot) => { const live = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date || '').localeCompare(b.date || '')); setEvents(live.length ? live : sampleEvents); setFirebaseIssue(''); },
      (error) => { setFirebaseIssue(error.message); setEvents(sampleEvents); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, 'tickets'), where('uid', '==', user.uid)), async (snapshot) => {
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const withEvents = await Promise.all(docs.map(async (ticket) => {
        try { const eventSnap = await getDoc(doc(db, 'events', ticket.eventId)); return { ...ticket, event: eventSnap.exists() ? { id: eventSnap.id, ...eventSnap.data() } : null }; }
        catch { return ticket; }
      }));
      setTickets(withEvents.filter((ticket) => ticket.event?.status === 'published').sort((a, b) => (a.event?.date || '').localeCompare(b.event?.date || '')));
    }, (error) => setFirebaseIssue(error.message));
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(collection(db, 'profiles'), (snapshot) => setProfiles(snapshot.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))), (error) => setFirebaseIssue(error.message));
    return () => unsub();
  }, [isAdmin]);

  useEffect(() => {
    if (view === 'admin' && user && !isAdmin && !loading) go('profile');
    if (view === 'profile' && !user && !loading) { setAuthMode('login'); setAuthOpen(true); go('home'); }
    if (view === 'admin' && !user && !loading) { setAuthMode('login'); setAuthOpen(true); go('home'); }
  }, [view, user, isAdmin, loading, go]);

  const refreshAdmin = useCallback(async () => { if (user) await user.getIdToken(true); }, [user]);
  const logout = async () => { await signOut(auth); go('home'); };
  const openAuth = (mode = 'signup') => { setAuthMode(mode); setAuthOpen(true); };
  const onAuthDone = async (current) => {
    setAuthOpen(false);
    const token = await current.getIdTokenResult(true);
    const admin = token.claims.admin === true || current.email?.toLowerCase() === 'base@admin.com';
    go(admin ? 'admin' : 'profile');
  };
  const sortedEvents = useMemo(() => events.length ? events : eventsRef.current, [events]);

  return <>
    {view === 'profile' && user && !loading ? <MemberArea user={user} profile={profile} tickets={tickets} go={go} onLogout={logout} /> : null}
    {view === 'admin' && user && isAdmin && !loading ? <AdminArea user={user} profiles={profiles} events={sortedEvents} go={go} onLogout={logout} onRefresh={refreshAdmin} /> : null}
    {(!user || view === 'home' || loading) && <Landing events={sortedEvents} onJoin={() => openAuth('signup')} onLogin={() => openAuth('login')} />}
    {loading && user && <div className="loading-screen"><div className="loading-cube">B</div><span>ENTRIAMO SOTTO.</span></div>}
    {firebaseIssue && !authOpen && <div className="firebase-status" role="status"><span className="live-pulse" /> COLLEGAMENTO FIREBASE DA COMPLETARE <button onClick={() => setFirebaseIssue('')} aria-label="Chiudi"><X size={13} /></button></div>}
    {authOpen && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setAuthOpen(false)} onDone={onAuthDone} />}
  </>;
}
