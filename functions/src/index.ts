import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';

function requireAdmin(request: CallableRequest<unknown>) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Accedi per continuare.');
  const isAdmin = request.auth.token.admin === true || request.auth.token.email === 'base@admin.com';
  if (!isAdmin) throw new HttpsError('permission-denied', 'Permessi amministratore richiesti.');
  return request.auth.uid;
}

function asText(value: unknown, max = 180) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function eventExpiryMs(event: FirebaseFirestore.DocumentData) {
  if (typeof event.endsAt?.toMillis === 'function') return event.endsAt.toMillis();
  if (typeof event.date === 'string') {
    const [year, month, day] = event.date.split('-').map(Number);
    if (year && month && day) return Date.UTC(year, month - 1, day + 1, 4);
  }
  return 0;
}

export const publishEvent = onCall({ region: REGION, timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  requireAdmin(request);
  const title = asText(request.data?.title, 72);
  const date = asText(request.data?.date, 10);
  const time = asText(request.data?.time, 32);
  const endIso = asText(request.data?.endsAt, 40);
  const venue = asText(request.data?.venue, 180);
  const endDate = new Date(endIso);
  if (!title || !date || !time || !venue || !endIso || Number.isNaN(endDate.getTime())) throw new HttpsError('invalid-argument', 'Titolo, data, orario, fine evento e luogo sono obbligatori.');
  if (endDate.getTime() <= Date.now()) throw new HttpsError('invalid-argument', 'La fine dell’evento deve essere nel futuro.');
  const posterUrl = asText(request.data?.posterUrl, 1500);
  if (posterUrl && !posterUrl.startsWith('https://firebasestorage.googleapis.com/')) {
    throw new HttpsError('invalid-argument', 'La locandina deve provenire da Firebase Storage.');
  }

  const eventRef = db.collection('events').doc();
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace('.', '');
  await eventRef.set({
    title,
    subtitle: asText(request.data?.subtitle, 100),
    description: asText(request.data?.description, 1200),
    date,
    dateLabel,
    time,
    timeLabel: time,
    endsAt: Timestamp.fromDate(endDate),
    venue,
    posterUrl,
    accent: 'coral',
    status: 'publishing',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: request.auth!.uid,
  });

  try {
    let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let ticketCount = 0;
    while (true) {
      let query = db.collection('profiles').where('role', '==', 'member').orderBy('uid').limit(400);
      if (last) query = query.startAfter(last);
      const page = await query.get();
      if (page.empty) break;
      last = page.docs[page.docs.length - 1];
      const ticketRefs = page.docs.map((profile) => db.collection('tickets').doc(`${eventRef.id}_${profile.id}`));
      const existing = ticketRefs.length ? await db.getAll(...ticketRefs) : [];
      const batch = db.batch();
      let newInBatch = 0;
      page.docs.forEach((profile, index) => {
        if (existing[index].exists) return;
        const data = profile.data();
        batch.set(ticketRefs[index], {
          uid: profile.id,
          eventId: eventRef.id,
          eventTitle: title,
          code: randomBytes(24).toString('base64url'),
          memberName: asText(data.fullName, 120),
          status: 'issued',
          createdAt: FieldValue.serverTimestamp(),
        });
        newInBatch += 1;
      });
      if (newInBatch) await batch.commit();
      ticketCount += page.size;
      if (page.size < 400) break;
    }
    await eventRef.update({ status: 'published', ticketCount, publishedAt: FieldValue.serverTimestamp() });
    return { eventId: eventRef.id, ticketCount };
  } catch (error) {
    await eventRef.update({ status: 'draft', publishError: 'Ticket generation failed' });
    console.error('Event publishing failed', { eventId: eventRef.id, error });
    throw new HttpsError('internal', 'Evento salvato come bozza, ma non è stato possibile generare tutti i ticket.');
  }
});

export const redeemTicket = onCall({ region: REGION }, async (request) => {
  const adminUid = requireAdmin(request);
  const code = asText(request.data?.code, 128);
  if (!code) throw new HttpsError('invalid-argument', 'Codice ticket mancante.');
  const matches = await db.collection('tickets').where('code', '==', code).limit(2).get();
  if (matches.empty) throw new HttpsError('not-found', 'Biglietto non riconosciuto.');
  if (matches.size > 1) throw new HttpsError('failed-precondition', 'Codice ticket non univoco.');
  const ticketRef = matches.docs[0].ref;
  const ticketInfo = await db.runTransaction(async (transaction) => {
    const ticketSnap = await transaction.get(ticketRef);
    if (!ticketSnap.exists) throw new HttpsError('not-found', 'Biglietto non riconosciuto.');
    const ticket = ticketSnap.data()!;
    if (ticket.status === 'expired') throw new HttpsError('failed-precondition', 'Evento terminato: il biglietto è scaduto.');
    if (ticket.status !== 'issued') throw new HttpsError('failed-precondition', 'Biglietto già utilizzato.');
    const eventRef = db.collection('events').doc(ticket.eventId);
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists || eventSnap.data()?.status !== 'published') throw new HttpsError('failed-precondition', 'Evento non attivo.');
    const event = eventSnap.data()!;
    const expiry = eventExpiryMs(event);
    if (expiry <= Date.now()) {
      transaction.update(ticketRef, { status: 'expired', expiredAt: FieldValue.serverTimestamp() });
      return { expired: true, eventTitle: '', memberName: '' };
    }
    transaction.update(ticketRef, { status: 'used', checkedInAt: FieldValue.serverTimestamp(), checkedInBy: adminUid });
    return { expired: false, eventTitle: event.title || ticket.eventTitle || 'Evento BASE', memberName: ticket.memberName || '' };
  });
  if (ticketInfo.expired) throw new HttpsError('failed-precondition', 'Evento terminato: il biglietto è scaduto.');
  return { eventTitle: ticketInfo.eventTitle, memberName: ticketInfo.memberName };
});
