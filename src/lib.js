import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Rotta non linkata del pannello admin. La sicurezza vera è nelle regole Firestore.
export const ADMIN_PATH = '/control-room';

export const toMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
};

export const isEventLive = (event, now = Date.now()) => event?.status === 'published' && toMs(event.endAt) > now;

export function eventState(event, now = Date.now()) {
  if (event.status === 'draft') return { label: 'BOZZA', tone: 'muted' };
  if (event.status === 'closed') return { label: 'CHIUSO', tone: 'red' };
  if (toMs(event.endAt) <= now) return { label: 'TERMINATO', tone: 'red' };
  if (toMs(event.startAt) <= now) return { label: 'IN CORSO', tone: 'green' };
  return { label: 'PUBBLICATO', tone: 'green' };
}

const pad = (n) => String(n).padStart(2, '0');

export function decorateEvent(event) {
  const start = new Date(toMs(event.startAt));
  const end = new Date(toMs(event.endAt));
  return {
    ...event,
    dateLabel: toMs(event.startAt) ? start.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace('.', '') : 'PROSSIMAMENTE',
    timeLabel: toMs(event.startAt) ? `${pad(start.getHours())}:${pad(start.getMinutes())} — ${pad(end.getHours())}:${pad(end.getMinutes())}` : '23:00 — LATE',
  };
}

// Valori per <input type="date|time"> a partire da un Timestamp.
export function toInputParts(value) {
  const ms = toMs(value);
  if (!ms) return { date: '', time: '' };
  const d = new Date(ms);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function nextCalendarDay(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const formatDateTime = (value) => {
  const ms = toMs(value);
  return ms ? new Date(ms).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
};

// Codice casuale non indovinabile: 24 caratteri base32.
export function randomCode(length = 24) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// Il QR contiene id del ticket e codice segreto: senza il codice il ticket non si convalida.
export const ticketPayload = (ticket) => `BASE1.${ticket.id}.${ticket.code}`;
export const ticketShortCode = (ticket) => ticket.code.slice(0, 8);

export function parseScan(raw) {
  const value = raw.trim();
  const match = value.match(/^BASE1\.([A-Za-z0-9_]+)\.([A-Z0-9]+)$/);
  if (match) return { ticketId: match[1], code: match[2] };
  const short = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return short.length === 8 ? { short } : null;
}

// Ridimensiona e comprime la locandina in JPEG così da stare in un documento Firestore (< 1 MB).
export async function compressPoster(file, maxSide = 1200, maxChars = 700_000) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  let quality = 0.82;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= maxChars) return dataUrl;
    if (quality > 0.55) quality -= 0.1; else scale *= 0.8;
  }
  throw new Error('Immagine troppo pesante anche dopo la compressione. Prova con un file più piccolo.');
}

// Le locandine stanno in posters/{eventId}: si scaricano solo quando servono.
const posterRequests = new Map();
const posterImages = new Map();

// posterVersion cambia a ogni nuova locandina, così la cache non mostra quella vecchia.
const posterKey = (eventId, version) => `${eventId}:${version || 0}`;

export function setCachedPoster(eventId, version, image) {
  posterImages.set(posterKey(eventId, version), image);
  posterRequests.set(posterKey(eventId, version), Promise.resolve(image));
}

export function usePoster(event) {
  const key = event?.hasPoster ? posterKey(event.id, event.posterVersion) : '';
  const [src, setSrc] = useState(() => posterImages.get(key) || '');
  useEffect(() => {
    if (!key) { setSrc(''); return undefined; }
    let alive = true;
    setSrc(posterImages.get(key) || '');
    if (!posterRequests.has(key)) {
      posterRequests.set(key, getDoc(doc(db, 'posters', event.id))
        .then((snap) => { const image = snap.exists() ? snap.data().image : ''; posterImages.set(key, image); return image; })
        .catch(() => { posterRequests.delete(key); return ''; }));
    }
    posterRequests.get(key).then((value) => { if (alive) setSrc(value); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return src;
}

export function useNow(interval = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}
