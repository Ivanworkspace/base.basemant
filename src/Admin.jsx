import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Check, CheckCircle2,
  Download, DoorOpen, Image as ImageIcon, LockKeyhole, LogOut, Pencil, Plus, QrCode,
  RotateCcw, ScanLine, Search, ShieldCheck, Ticket, Trash2, Unlock, Users, X,
} from 'lucide-react';
import {
  collection, deleteField, doc, onSnapshot, runTransaction, serverTimestamp, Timestamp, writeBatch,
} from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { auth, db } from './firebase';
import {
  compressPoster, decorateEvent, eventState, formatDateTime, isEventLive, nextCalendarDay, parseScan,
  setCachedPoster, ticketPayload, ticketShortCode, toInputParts, toMs, useNow, usePoster,
} from './lib';
import { Brand, Button, Poster } from './App.jsx';

const pad2 = (n) => String(n).padStart(2, '0');
const percent = (part, total) => (total ? Math.round((part / total) * 100) : 0);

// Firestore accetta al massimo 500 operazioni per batch.
async function commitInChunks(refs, apply) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((ref) => apply(batch, ref));
    await batch.commit();
  }
}

function useCollection(name) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => onSnapshot(collection(db, name),
    (snap) => { setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setError(''); },
    (err) => setError(err.code === 'permission-denied' ? 'Permessi mancanti: pubblica le regole Firestore del progetto.' : err.message)), [name]);
  return [items, error];
}

function StateChip({ event, now }) {
  const state = eventState(event, now);
  return <span className={`adm-chip adm-chip-${state.tone}`}><i /> {state.label}</span>;
}

/* ───────────────────────── REPORT ───────────────────────── */

function Reports({ profiles, events, tickets, now, onNewEvent }) {
  const used = tickets.filter((t) => t.status === 'used');
  const liveEvents = events.filter((e) => isEventLive(e, now));
  const newMembers30 = profiles.filter((p) => toMs(p.createdAt) > now - 30 * 864e5).length;
  const blocked = profiles.filter((p) => p.blocked).length;

  const perEvent = useMemo(() => events.filter((e) => e.status !== 'draft').map((event) => {
    const list = tickets.filter((t) => t.eventId === event.id);
    const entries = list.filter((t) => t.status === 'used').length;
    return { event: decorateEvent(event), issued: list.length, entries };
  }).sort((a, b) => toMs(b.event.startAt) - toMs(a.event.startAt)), [events, tickets]);

  const pastWithTickets = perEvent.filter((r) => r.issued > 0 && toMs(r.event.endAt) <= now);
  const avgAttendance = pastWithTickets.length ? Math.round(pastWithTickets.reduce((n, r) => n + percent(r.entries, r.issued), 0) / pastWithTickets.length) : 0;

  const months = useMemo(() => {
    const out = [];
    const base = new Date(now);
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      out.push({ label: d.toLocaleDateString('it-IT', { month: 'short' }).toUpperCase().replace('.', ''), value: profiles.filter((p) => toMs(p.createdAt) >= d.getTime() && toMs(p.createdAt) < next.getTime()).length });
    }
    return out;
  }, [profiles, now]);
  const maxMonth = Math.max(1, ...months.map((m) => m.value));

  const topMembers = useMemo(() => {
    const counts = new Map();
    used.forEach((t) => counts.set(t.uid, (counts.get(t.uid) || 0) + 1));
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([uid, count]) => ({ uid, count, profile: byId.get(uid) }));
  }, [used, profiles]);

  const lastEventWithEntries = perEvent.find((r) => r.entries > 0);
  const hours = useMemo(() => {
    if (!lastEventWithEntries) return [];
    const buckets = new Map();
    tickets.filter((t) => t.eventId === lastEventWithEntries.event.id && t.usedAt).forEach((t) => {
      const h = new Date(toMs(t.usedAt)).getHours();
      buckets.set(h, (buckets.get(h) || 0) + 1);
    });
    return [...buckets.entries()].sort((a, b) => ((a[0] + 12) % 24) - ((b[0] + 12) % 24)).map(([hour, value]) => ({ label: `${pad2(hour)}:00`, value }));
  }, [tickets, lastEventWithEntries]);
  const maxHour = Math.max(1, ...hours.map((h) => h.value));

  return <div className="admin-overview">
    <div className="admin-stats adm-stats-4">
      <div className="stat-card"><span>MEMBRI TOTALI</span><strong>{pad2(profiles.length)}</strong><Users size={19} /><small>+{newMembers30} negli ultimi 30 giorni</small></div>
      <div className="stat-card"><span>EVENTI ATTIVI</span><strong>{pad2(liveEvents.length)}</strong><CalendarDays size={19} /><small>{events.length} eventi in totale</small></div>
      <div className="stat-card"><span>QR GENERATI</span><strong>{pad2(tickets.length)}</strong><QrCode size={19} /><small>Uno per membro per evento</small></div>
      <div className="stat-card"><span>INGRESSI</span><strong>{pad2(used.length)}</strong><DoorOpen size={19} /><small>Presenza media {avgAttendance}% · {blocked} sospesi</small></div>
    </div>

    <div className="adm-report-grid">
      <section className="adm-panel">
        <div className="admin-list-head"><h3>NUOVI MEMBRI · ULTIMI 6 MESI</h3></div>
        <div className="adm-bars">{months.map((m) => <div className="adm-bar" key={m.label}><b style={{ height: `${(m.value / maxMonth) * 100}%` }}><em>{m.value}</em></b><span>{m.label}</span></div>)}</div>
      </section>
      <section className="adm-panel">
        <div className="admin-list-head"><h3>INGRESSI PER ORA {lastEventWithEntries ? `· ${lastEventWithEntries.event.title}` : ''}</h3></div>
        {hours.length ? <div className="adm-bars">{hours.map((h) => <div className="adm-bar" key={h.label}><b style={{ height: `${(h.value / maxHour) * 100}%` }}><em>{h.value}</em></b><span>{h.label}</span></div>)}</div> : <p className="admin-empty-line">Ancora nessun ingresso registrato.</p>}
      </section>
    </div>

    <div className="admin-list-head"><h3>RENDICONTO PER EVENTO</h3><button onClick={onNewEvent}>NUOVO EVENTO <ArrowRight size={15} /></button></div>
    <div className="adm-table">
      <div className="adm-tr adm-th adm-report-row"><span>DATA</span><span>EVENTO</span><span>QR</span><span>INGRESSI</span><span>PRESENZA</span><span>STATO</span></div>
      {perEvent.length ? perEvent.map(({ event, issued, entries }) => <div className="adm-tr adm-report-row" key={event.id}>
        <span className="mono">{event.dateLabel}</span><strong>{event.title}</strong><span>{issued}</span><span>{entries}</span>
        <span className="adm-meter"><i style={{ width: `${percent(entries, issued)}%` }} /><b>{percent(entries, issued)}%</b></span>
        <StateChip event={event} now={now} />
      </div>) : <p className="admin-empty-line">Nessun evento pubblicato. Crea il primo per generare i QR dei membri.</p>}
    </div>

    <div className="admin-list-head"><h3>MEMBRI PIÙ PRESENTI</h3></div>
    <div className="adm-table">
      {topMembers.length ? topMembers.map((row, i) => <div className="adm-tr adm-top-row" key={row.uid}><span className="mono">#{pad2(i + 1)}</span><strong>{row.profile?.fullName || 'Profilo eliminato'}</strong><span>{row.profile?.email || '—'}</span><span>{row.count} {row.count === 1 ? 'ingresso' : 'ingressi'}</span></div>) : <p className="admin-empty-line">La classifica comparirà dopo i primi ingressi.</p>}
    </div>
  </div>;
}

/* ───────────────────────── EVENTI ───────────────────────── */

const emptyForm = { title: '', subtitle: '', description: '', venue: 'BASE Basement · Cava de’ Tirreni', date: '', time: '23:00', endDate: '', endTime: '05:00', accent: 'rust', publish: true };

function EventForm({ event, onClose }) {
  const existingPoster = usePoster(event);
  const [form, setForm] = useState(() => {
    if (!event) return emptyForm;
    const start = toInputParts(event.startAt); const end = toInputParts(event.endAt);
    return { title: event.title || '', subtitle: event.subtitle || '', description: event.description || '', venue: event.venue || '', date: start.date, time: start.time, endDate: end.date, endTime: end.time, accent: event.accent || 'rust', publish: event.status === 'published' };
  });
  const [poster, setPoster] = useState(null); // null = invariata, '' = rimossa, dataUrl = nuova
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const preview = poster === null ? existingPoster : poster;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const pickPoster = async (file) => {
    if (!file) return;
    setError('');
    try { setPoster(await compressPoster(file)); } catch (err) { setError(err.message); }
  };

  const submit = async (e) => {
    e.preventDefault(); setError('');
    const startAt = new Date(`${form.date}T${form.time}:00`);
    const endAt = new Date(`${form.endDate}T${form.endTime}:00`);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) { setError('La fine dell’evento deve essere successiva all’inizio.'); return; }
    setBusy(true);
    try {
      const ref = event ? doc(db, 'events', event.id) : doc(collection(db, 'events'));
      const batch = writeBatch(db);
      const posterVersion = poster ? Date.now() : event?.posterVersion || 0;
      const hasPoster = poster === null ? Boolean(event?.hasPoster) : Boolean(poster);
      const keepClosed = event?.status === 'closed';
      const data = {
        title: form.title.trim(), subtitle: form.subtitle.trim(), description: form.description.trim(), venue: form.venue.trim(), accent: form.accent,
        startAt: Timestamp.fromDate(startAt), endAt: Timestamp.fromDate(endAt),
        status: keepClosed ? 'closed' : form.publish ? 'published' : 'draft',
        hasPoster, posterVersion, updatedAt: serverTimestamp(),
      };
      if (event) batch.update(ref, data); else batch.set(ref, { ...data, createdAt: serverTimestamp() });
      if (poster) batch.set(doc(db, 'posters', ref.id), { image: poster, updatedAt: serverTimestamp() });
      if (poster === '') batch.delete(doc(db, 'posters', ref.id));
      await batch.commit();
      if (poster) setCachedPoster(ref.id, posterVersion, poster);
      onClose();
    } catch (err) {
      setError(err.code === 'permission-denied' ? 'Permessi mancanti: verifica di essere entrato come admin.' : err.message || 'Salvataggio non riuscito.');
    } finally { setBusy(false); }
  };

  return <div className="create-event-view">
    <div className="create-intro"><span className="eyebrow"><span className="eyebrow-line" /> {event ? 'MODIFICA EVENTO' : 'NUOVA NOTTE'}</span><p>{event ? 'Le modifiche compaiono subito su landing page e profili.' : 'Appena pubblicato, ogni membro trova nel profilo il suo QR personale per questo evento.'}</p></div>
    <form className="event-form" onSubmit={submit}>
      <div className="event-form-main">
        <label>TITOLO EVENTO<input required maxLength={72} value={form.title} onChange={set('title')} placeholder="es. THE FIRST AT BASE" /></label>
        <label>SOTTOTITOLO<input maxLength={90} value={form.subtitle} onChange={set('subtitle')} placeholder="Una notte. Una nuova base." /></label>
        <label>DESCRIZIONE<textarea rows="4" maxLength={600} value={form.description} onChange={set('description')} placeholder="Racconta la notte…" /></label>
        <div className="form-two"><label>DATA INIZIO<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, endDate: form.endDate && form.endDate > e.target.value ? form.endDate : nextCalendarDay(e.target.value) })} /></label><label>ORA INIZIO<input required type="time" value={form.time} onChange={set('time')} /></label></div>
        <div className="form-two"><label>DATA FINE<input required type="date" value={form.endDate} onChange={set('endDate')} /></label><label>ORA FINE<input required type="time" value={form.endTime} onChange={set('endTime')} /></label></div>
        <small className="form-footnote">All’orario di fine i QR di questo evento smettono di esistere: spariscono dai profili e lo scanner li rifiuta.</small>
        <label>LUOGO<input required maxLength={90} value={form.venue} onChange={set('venue')} /></label>
        <div className="form-two">
          <label>COLORE LOCANDINA<select value={form.accent} onChange={set('accent')}><option value="rust">Ruggine</option><option value="coral">Corallo</option></select></label>
          <label className="adm-check"><input type="checkbox" checked={form.publish} disabled={event?.status === 'closed'} onChange={set('publish')} /> {event?.status === 'closed' ? 'Evento chiuso' : 'Pubblica subito'}</label>
        </div>
      </div>
      <div className="event-form-side">
        <label className="upload-poster adm-upload">
          <input type="file" accept="image/*" onChange={(e) => pickPoster(e.target.files?.[0])} />
          {preview ? <img src={preview} alt="Anteprima locandina" /> : <><span className="upload-icon"><ImageIcon size={18} /></span><strong>CARICA LA LOCANDINA</strong><small>JPG o PNG · viene compressa in automatico</small></>}
        </label>
        {preview && <button type="button" className="adm-link-button" onClick={() => setPoster('')}><Trash2 size={13} /> RIMUOVI LOCANDINA</button>}
        <div className="adm-poster-preview"><Poster event={{ ...decorateEvent({ ...form, startAt: new Date(`${form.date}T${form.time || '23:00'}:00`), endAt: new Date(`${form.endDate}T${form.endTime || '05:00'}:00`) }), title: form.title || 'TITOLO EVENTO', hasPoster: false }} className="adm-mini-poster" /></div>
        {error && <p className="form-error">{error}</p>}
        <Button disabled={busy} className="publish-button">{busy ? 'SALVATAGGIO…' : event ? 'SALVA MODIFICHE' : form.publish ? 'PUBBLICA EVENTO' : 'SALVA BOZZA'} <ArrowRight size={17} /></Button>
        <button type="button" className="adm-link-button" onClick={onClose}><X size={13} /> ANNULLA</button>
      </div>
    </form>
  </div>;
}

function EventsView({ events, tickets, now, editing, setEditing }) {
  const [busyId, setBusyId] = useState('');
  const sorted = useMemo(() => [...events].sort((a, b) => toMs(b.startAt) - toMs(a.startAt)).map(decorateEvent), [events]);
  if (editing) return <EventForm key={editing === 'new' ? 'new' : editing.id} event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />;

  const run = async (event, action) => {
    setBusyId(event.id);
    try { await action(); } catch (err) { window.alert(err.message || 'Operazione non riuscita.'); } finally { setBusyId(''); }
  };
  const close = (event) => window.confirm(`Chiudere "${event.title}" adesso? Tutti i QR di questo evento smetteranno di funzionare.`)
    && run(event, () => commitInChunks([doc(db, 'events', event.id)], (b, ref) => b.update(ref, { status: 'closed', closedAt: serverTimestamp() })));
  const togglePublish = (event) => run(event, () => commitInChunks([doc(db, 'events', event.id)], (b, ref) => b.update(ref, { status: event.status === 'published' ? 'draft' : 'published' })));
  const remove = (event) => window.confirm(`Eliminare definitivamente "${event.title}"? Verranno cancellati anche locandina e QR collegati (e i dati nel report).`)
    && run(event, () => commitInChunks([
      doc(db, 'events', event.id), doc(db, 'posters', event.id),
      ...tickets.filter((t) => t.eventId === event.id).map((t) => doc(db, 'tickets', t.id)),
    ], (b, ref) => b.delete(ref)));

  return <div className="adm-events">
    <div className="admin-list-head"><h3>TUTTI GLI EVENTI · {sorted.length}</h3><Button variant="small" onClick={() => setEditing('new')}><Plus size={15} /> NUOVO EVENTO</Button></div>
    {sorted.length ? <div className="adm-event-cards">{sorted.map((event) => {
      const list = tickets.filter((t) => t.eventId === event.id);
      const entries = list.filter((t) => t.status === 'used').length;
      const ended = event.status === 'closed' || toMs(event.endAt) <= now;
      return <article className="adm-event-card" key={event.id}>
        <Poster event={event} className="adm-card-poster" />
        <div className="adm-event-body">
          <StateChip event={event} now={now} />
          <h4>{event.title}</h4>
          <p className="mono">{event.dateLabel} · {event.timeLabel}</p>
          <p className="mono">FINE: {formatDateTime(event.endAt)}</p>
          <div className="adm-event-stats"><span><QrCode size={14} /> {list.length} QR</span><span><DoorOpen size={14} /> {entries} ingressi</span></div>
          <div className="adm-actions">
            <button disabled={busyId === event.id} onClick={() => setEditing(event)}><Pencil size={13} /> Modifica</button>
            {!ended && <button disabled={busyId === event.id} onClick={() => togglePublish(event)}>{event.status === 'published' ? <><LockKeyhole size={13} /> Nascondi</> : <><Unlock size={13} /> Pubblica</>}</button>}
            {!ended && event.status === 'published' && <button disabled={busyId === event.id} onClick={() => close(event)}><X size={13} /> Chiudi ora</button>}
            <button className="adm-danger" disabled={busyId === event.id} onClick={() => remove(event)}><Trash2 size={13} /> Elimina</button>
          </div>
        </div>
      </article>;
    })}</div> : <p className="admin-empty-line">Nessun evento. Crea il primo: comparirà sulla landing page e nei profili dei membri.</p>}
  </div>;
}

/* ───────────────────────── MEMBRI ───────────────────────── */

function exportCsv(profiles, tickets) {
  const rows = [['Nome', 'Cognome', 'Email', 'Iscrizione', 'Ingressi', 'Stato']];
  profiles.forEach((p) => rows.push([p.firstName, p.lastName, p.email, formatDateTime(p.createdAt), tickets.filter((t) => t.uid === p.id && t.status === 'used').length, p.blocked ? 'Sospeso' : 'Attivo']));
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  link.download = `membri-base-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function MemberDetail({ person, tickets, eventsById, now, onClose }) {
  const [busy, setBusy] = useState(false);
  const list = tickets.filter((t) => t.uid === person.id).sort((a, b) => toMs(eventsById.get(b.eventId)?.startAt) - toMs(eventsById.get(a.eventId)?.startAt));
  const act = async (fn) => { setBusy(true); try { await fn(); } catch (err) { window.alert(err.message || 'Operazione non riuscita.'); } finally { setBusy(false); } };
  const toggleBlock = () => act(() => commitInChunks([doc(db, 'profiles', person.id)], (b, ref) => b.update(ref, person.blocked ? { blocked: false, blockedAt: deleteField() } : { blocked: true, blockedAt: serverTimestamp() })));
  const removeProfile = () => window.confirm(`Eliminare il profilo di ${person.fullName}? Verranno cancellati anche i suoi QR. L’account di accesso resta in Firebase Authentication: per rimuoverlo del tutto eliminalo da lì.`)
    && act(async () => { await commitInChunks([doc(db, 'profiles', person.id), ...list.map((t) => doc(db, 'tickets', t.id))], (b, ref) => b.delete(ref)); onClose(); });
  const resetTicket = (t) => act(() => commitInChunks([doc(db, 'tickets', t.id)], (b, ref) => b.update(ref, { status: 'issued', usedAt: deleteField(), usedBy: deleteField() })));
  const regenerate = (t) => window.confirm('Rigenerare il QR? Quello attuale smette subito di funzionare e il membro ne riceverà uno nuovo appena apre il profilo.')
    && act(() => commitInChunks([doc(db, 'tickets', t.id)], (b, ref) => b.delete(ref)));

  return <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="adm-drawer" role="dialog" aria-modal="true">
      <button className="icon-button modal-close" onClick={onClose} aria-label="Chiudi"><X size={20} /></button>
      <span className="eyebrow"><span className="eyebrow-line" /> SCHEDA MEMBRO</span>
      <h2>{person.fullName}</h2>
      <p className="adm-drawer-meta">{person.email}<br />Iscritto il {formatDateTime(person.createdAt)} · ID {person.id.slice(0, 8).toUpperCase()}</p>
      <div className="adm-actions">
        <button disabled={busy} onClick={toggleBlock}>{person.blocked ? <><Unlock size={13} /> Riattiva</> : <><LockKeyhole size={13} /> Sospendi</>}</button>
        <button className="adm-danger" disabled={busy} onClick={removeProfile}><Trash2 size={13} /> Elimina profilo</button>
      </div>
      <div className="admin-list-head"><h3>QR DEL MEMBRO · {list.length}</h3></div>
      {list.length ? list.map((t) => {
        const event = eventsById.get(t.eventId);
        const live = event && isEventLive(event, now);
        return <div className="adm-ticket-row" key={t.id}>
          {live && t.status !== 'used' ? <QRCodeSVG value={ticketPayload(t)} size={64} bgColor="#f5f3ed" fgColor="#11110f" /> : <span className="adm-ticket-dead"><QrCode size={22} /></span>}
          <div>
            <strong>{event?.title || 'Evento eliminato'}</strong>
            <span className="mono">NO. {ticketShortCode(t)} · {t.status === 'used' ? `ENTRATO ${formatDateTime(t.usedAt)}` : live ? 'VALIDO' : 'SCADUTO'}</span>
            <div className="adm-actions">
              {t.status === 'used' && live && <button disabled={busy} onClick={() => resetTicket(t)}><RotateCcw size={12} /> Annulla convalida</button>}
              {live && <button disabled={busy} onClick={() => regenerate(t)}><QrCode size={12} /> Rigenera QR</button>}
            </div>
          </div>
        </div>;
      }) : <p className="admin-empty-line">Questo membro non ha ancora QR: li riceve aprendo il profilo quando c’è un evento attivo.</p>}
    </section>
  </div>;
}

function MembersView({ profiles, tickets, events, now }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, decorateEvent(e)])), [events]);
  const entriesByUid = useMemo(() => {
    const map = new Map();
    tickets.forEach((t) => { if (t.status === 'used') map.set(t.uid, (map.get(t.uid) || 0) + 1); });
    return map;
  }, [tickets]);
  const term = search.trim().toLowerCase();
  const list = profiles.filter((p) => !term || `${p.fullName} ${p.email}`.toLowerCase().includes(term)).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  const selected = profiles.find((p) => p.id === selectedId);

  return <div className="members-view">
    <div className="adm-toolbar">
      <label className="adm-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca per nome o email" /></label>
      <button className="adm-link-button" onClick={() => exportCsv(list, tickets)}><Download size={14} /> ESPORTA CSV</button>
    </div>
    <div className="members-table">
      <div className="members-table-head adm-members-grid"><span>MEMBRO</span><span>EMAIL</span><span>ISCRIZIONE</span><span>INGRESSI</span><span>STATO</span></div>
      {list.length ? list.map((person) => <button className="members-table-row adm-members-grid adm-row-button" key={person.id} onClick={() => setSelectedId(person.id)}>
        <div className="member-name-cell"><span>{(person.firstName || '?').slice(0, 1).toUpperCase()}</span><strong>{person.fullName}</strong></div>
        <span>{person.email}</span><span>{formatDateTime(person.createdAt).split(',')[0]}</span><span>{entriesByUid.get(person.id) || 0}</span>
        <span className={person.blocked ? 'adm-chip adm-chip-red' : 'member-active'}><i /> {person.blocked ? 'SOSPESO' : 'ATTIVO'}</span>
      </button>) : <div className="admin-empty-line">{term ? 'Nessun membro trovato.' : 'Ancora nessun membro registrato.'}</div>}
    </div>
    <div className="member-count">{list.length} MEMBRI {term ? 'TROVATI' : 'IN TOTALE'}</div>
    {selected && <MemberDetail person={selected} tickets={tickets} eventsById={eventsById} now={now} onClose={() => setSelectedId('')} />}
  </div>;
}

/* ───────────────────────── VALIDATORE ───────────────────────── */

function feedback(tone) {
  try { navigator.vibrate?.(tone === 'ok' ? 120 : [80, 60, 80, 60, 160]); } catch { /* opzionale */ }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.frequency.value = tone === 'ok' ? 880 : tone === 'warn' ? 440 : 220;
    gain.gain.value = 0.12;
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + (tone === 'ok' ? 0.15 : 0.4));
    osc.onended = () => ctx.close();
  } catch { /* opzionale */ }
}

async function validateTicket(parsed, { tickets, selectedEventId }) {
  let { ticketId, code } = parsed;
  if (parsed.short) {
    const matches = tickets.filter((t) => ticketShortCode(t) === parsed.short && (!selectedEventId || t.eventId === selectedEventId));
    if (matches.length !== 1) return { tone: 'error', title: 'CODICE NON TROVATO', detail: matches.length ? 'Più QR con questo codice: scansiona il QR.' : 'Nessun QR corrisponde a questo codice.' };
    ({ id: ticketId, code } = matches[0]);
  }
  return runTransaction(db, async (tx) => {
    const ticketRef = doc(db, 'tickets', ticketId);
    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists() || ticketSnap.data().code !== code) return { tone: 'error', title: 'QR NON VALIDO', detail: 'Questo QR non esiste o è stato rigenerato.' };
    const ticket = ticketSnap.data();
    const [eventSnap, profileSnap] = await Promise.all([tx.get(doc(db, 'events', ticket.eventId)), tx.get(doc(db, 'profiles', ticket.uid))]);
    const event = eventSnap.exists() ? eventSnap.data() : null;
    const name = profileSnap.exists() ? profileSnap.data().fullName : 'Profilo eliminato';
    const base = { name, eventTitle: event?.title || 'Evento eliminato' };
    if (!event) return { ...base, tone: 'error', title: 'EVENTO ELIMINATO', detail: 'Il QR appartiene a un evento che non esiste più.' };
    if (selectedEventId && ticket.eventId !== selectedEventId) return { ...base, tone: 'error', title: 'EVENTO SBAGLIATO', detail: `QR valido per “${event.title}”, non per l’evento selezionato.` };
    if (event.status !== 'published' || toMs(event.endAt) <= Date.now()) return { ...base, tone: 'error', title: 'QR SCADUTO', detail: 'L’evento è terminato: questo QR non esiste più.' };
    if (!profileSnap.exists() || profileSnap.data().blocked) return { ...base, tone: 'error', title: 'MEMBRO NON ATTIVO', detail: 'Il profilo è sospeso o eliminato.' };
    if (ticket.status === 'used') return { ...base, tone: 'warn', title: 'GIÀ SCANSIONATO', detail: `Ingresso già registrato alle ${new Date(toMs(ticket.usedAt)).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.` };
    tx.update(ticketRef, { status: 'used', usedAt: serverTimestamp(), usedBy: auth.currentUser?.email || 'admin' });
    return { ...base, tone: 'ok', title: 'INGRESSO VALIDO', detail: 'Benvenuto a BASE.' };
  });
}

function ScannerView({ events, tickets, now }) {
  const liveEvents = useMemo(() => events.filter((e) => isEventLive(e, now)).sort((a, b) => toMs(a.startAt) - toMs(b.startAt)), [events, now]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [manual, setManual] = useState('');
  const busy = useRef(false);
  const last = useRef({ text: '', at: 0 });
  const context = useRef({ tickets, selectedEventId });
  context.current = { tickets, selectedEventId };

  useEffect(() => { if (selectedEventId && !liveEvents.some((e) => e.id === selectedEventId)) setSelectedEventId(''); }, [liveEvents, selectedEventId]);

  const check = useCallback(async (raw) => {
    if (busy.current) return;
    const nowMs = Date.now();
    if (raw === last.current.text && nowMs - last.current.at < 4000) return;
    last.current = { text: raw, at: nowMs };
    busy.current = true;
    let outcome;
    const parsed = parseScan(raw);
    if (!parsed) outcome = { tone: 'error', title: 'QR NON RICONOSCIUTO', detail: 'Questo non è un QR di BASE.' };
    else {
      try { outcome = await validateTicket(parsed, context.current); }
      catch (err) { outcome = { tone: 'error', title: 'ERRORE DI VERIFICA', detail: err.code === 'unavailable' ? 'Connessione assente: riprova.' : err.message }; }
    }
    outcome.time = new Date();
    feedback(outcome.tone);
    setResult(outcome);
    setHistory((h) => [outcome, ...h].slice(0, 12));
    window.setTimeout(() => { busy.current = false; }, 1200);
  }, []);

  useEffect(() => {
    if (!cameraOn) return undefined;
    let scanner; let disposed = false;
    setCameraError('');
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (disposed) return;
      scanner = new Html5Qrcode('base-scanner', { verbose: false });
      scanner.start({ facingMode: 'environment' }, { fps: 12, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.72); return { width: s, height: s }; } }, (text) => check(text), () => {})
        .catch(() => { if (!disposed) { setCameraError('Fotocamera non disponibile. Consenti l’accesso alla fotocamera (serve HTTPS) oppure inserisci il codice a mano.'); setCameraOn(false); } });
    }).catch(() => setCameraError('Non riesco a caricare lo scanner. Ricarica la pagina.'));
    return () => {
      disposed = true;
      if (scanner?.isScanning) scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [cameraOn, check]);

  const scope = selectedEventId ? tickets.filter((t) => t.eventId === selectedEventId) : tickets.filter((t) => liveEvents.some((e) => e.id === t.eventId));
  const entered = scope.filter((t) => t.status === 'used').length;
  const icon = result?.tone === 'ok' ? <CheckCircle2 size={27} /> : result?.tone === 'warn' ? <AlertTriangle size={25} /> : result ? <X size={25} /> : <DoorOpen size={25} />;

  return <div className="scanner-view">
    <div className="scanner-intro"><span className="eyebrow"><span className="live-pulse" /> CONTROLLO ACCESSI</span><p>Inquadra il QR sullo schermo del membro. Ogni QR vale un solo ingresso e solo fino alla fine del suo evento.</p></div>
    <div className="adm-toolbar">
      <label className="adm-select">EVENTO<select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}><option value="">Tutti gli eventi attivi</option>{liveEvents.map((e) => <option key={e.id} value={e.id}>{e.title} · {decorateEvent(e).dateLabel}</option>)}</select></label>
      <span className="adm-counter"><DoorOpen size={15} /> {entered} / {scope.length} ENTRATI</span>
    </div>
    <div className="scanner-layout">
      <div className="scanner-box">
        <div className="scanner-topline"><span><ScanLine size={16} /> SCANNER BASE</span><span className="scanner-live">{cameraOn ? <><i /> LIVE</> : 'SPENTO'}</span></div>
        <div id="base-scanner" className="qr-scanner adm-scanner">{!cameraOn && <button className="adm-camera-start" onClick={() => setCameraOn(true)}><ScanLine size={30} /><span>AVVIA SCANNER</span></button>}</div>
        {cameraOn && <button className="adm-link-button adm-light" onClick={() => setCameraOn(false)}><X size={13} /> FERMA FOTOCAMERA</button>}
        {cameraError && <p className="form-error">{cameraError}</p>}
        <div className="scanner-manual"><span>OPPURE INSERISCI IL CODICE (NO. SOTTO IL QR)</span><form onSubmit={(e) => { e.preventDefault(); last.current = { text: '', at: 0 }; check(manual); setManual(''); }}><input value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} placeholder="es. 7KQ2M9XA" maxLength={12} /><button aria-label="Verifica codice"><ArrowRight size={17} /></button></form></div>
      </div>
      <div className={`scan-result adm-scan-${result?.tone || 'idle'}`}>
        <div className="scan-result-icon">{icon}</div>
        <span className="eyebrow">ESITO VERIFICA</span>
        {result ? <><h3>{result.title}</h3>{result.name && <p className="adm-scan-name">{result.name}</p>}<p>{result.eventTitle ? `${result.eventTitle} · ` : ''}{result.detail}</p><span className="scan-result-time"><Check size={14} /> {result.time.toLocaleTimeString('it-IT')}</span></>
          : <><h3>IN ATTESA<br /><em>DEL QR.</em></h3><p>Quando un QR viene letto, qui compare l’esito in tempo reale.</p></>}
        <div className="scan-result-bottom"><ShieldCheck size={14} /> VERIFICA AUTOMATICA · ANTI DUPLICATO</div>
      </div>
    </div>
    {history.length > 0 && <><div className="admin-list-head"><h3>ULTIME SCANSIONI</h3></div><div className="adm-table">{history.map((h, i) => <div className="adm-tr adm-history-row" key={`${h.time.getTime()}-${i}`}><span className="mono">{h.time.toLocaleTimeString('it-IT')}</span><span className={`adm-chip adm-chip-${h.tone === 'ok' ? 'green' : h.tone === 'warn' ? 'amber' : 'red'}`}><i /> {h.title}</span><strong>{h.name || '—'}</strong><span>{h.eventTitle || ''}</span></div>)}</div></>}
  </div>;
}

/* ───────────────────────── SHELL ───────────────────────── */

export default function AdminArea({ user, go, onLogout }) {
  const [tab, setTab] = useState('report');
  const [editing, setEditing] = useState(null);
  const [profiles, profilesError] = useCollection('profiles');
  const [events, eventsError] = useCollection('events');
  const [tickets, ticketsError] = useCollection('tickets');
  const now = useNow(15_000);
  const error = profilesError || eventsError || ticketsError;

  const tabs = [
    { id: 'report', label: 'Report', icon: BarChart3 },
    { id: 'events', label: 'Eventi', icon: CalendarDays, count: events.length },
    { id: 'members', label: 'Membri', icon: Users, count: profiles.length },
    { id: 'scanner', label: 'Validatore', icon: ScanLine },
  ];
  const title = tab === 'events' && editing ? (editing === 'new' ? 'Nuovo evento' : 'Modifica evento') : tabs.find((t) => t.id === tab)?.label;

  return <main className="admin-shell">
    <aside className="admin-sidebar"><Brand onClick={() => go('home')} /><div className="admin-side-label">CONTROL ROOM</div>
      {tabs.map(({ id, label, icon: Icon, count }) => <button key={id} className={`admin-nav-item ${tab === id ? 'selected' : ''}`} onClick={() => { setTab(id); setEditing(null); }}><Icon size={18} />{label}{count !== undefined && <span>{count}</span>}</button>)}
      <div className="admin-sidebar-bottom"><span className="admin-avatar">B</span><div><strong>{user.email}</strong><small>AMMINISTRATORE</small></div><button title="Esci" onClick={onLogout}><LogOut size={16} /></button></div>
    </aside>
    <section className="admin-content">
      <header className="admin-topbar"><div><span className="eyebrow"><span className="live-pulse" /> BASE / ADMIN</span><h1>{title}</h1></div>
        <div className="adm-topbar-actions">
          {tab !== 'events' && <button className="admin-date adm-hide-mobile" onClick={() => { setTab('events'); setEditing('new'); }}><Plus size={14} /> NUOVO EVENTO</button>}
          <button className="admin-date" onClick={() => go('home')}>SITO <ArrowUpRight size={14} /></button>
          <button className="admin-date adm-mobile-only" onClick={onLogout} aria-label="Esci"><LogOut size={14} /></button>
        </div>
      </header>
      {error && <p className="form-error adm-error"><Ticket size={13} /> {error}</p>}
      {tab === 'report' && <Reports profiles={profiles} events={events} tickets={tickets} now={now} onNewEvent={() => { setTab('events'); setEditing('new'); }} />}
      {tab === 'events' && <EventsView events={events} tickets={tickets} now={now} editing={editing} setEditing={setEditing} />}
      {tab === 'members' && <MembersView profiles={profiles} tickets={tickets} events={events} now={now} />}
      {tab === 'scanner' && <ScannerView events={events} tickets={tickets} now={now} />}
    </section>
  </main>;
}
