import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { rustTexture } from './rust';
import { toMs, usePoster } from './lib';
import './landing.css';

gsap.registerPlugin(ScrollTrigger);

const DEFAULT_VENUE = 'Via Sbarri, 81059 Caianello (CE)';
const MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=Via+Sbarri+Caianello';
const INSTAGRAM = 'https://instagram.com/base.basement';
const MANIFESTO = 'BASE si sente prima di vederlo. Acciaio corten, luce bassa, un impianto che spinge dal pavimento. Una squadra che le notti le conosce da anni e adesso ha una casa.';
const PANELS = [
  ['Il suono', 'Resident e ospiti da tutto il Sud. Set lunghi, impianto pensato per la sala.'],
  ['La materia', 'Metallo ossidato, cemento, luce calda. Uno spazio che sembra già vissuto.'],
  ['Le notti', 'Ogni data ha il suo manifesto, la sua lista e la sua storia.'],
  ['I membri', 'Iscriviti una volta: per ogni notte trovi il tuo QR personale nel profilo.'],
  ['Evening', 'BASE nasce da Evening: la stessa squadra, un posto tutto suo.'],
];

const pad = (n) => String(n).padStart(2, '0');
const shortDate = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`; };
const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const longDate = (ms) => new Date(ms).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const parseLineup = (value) => (value || '').split(/\n|\|/).map((s) => s.trim()).filter(Boolean);

function Countdown({ start, end }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  if (now >= start && now < end) return <div className="lp-live"><span className="lp-dot" /> Stanotte si balla. Ci vediamo sotto.</div>;
  const s = Math.floor(Math.max(0, start - now) / 1000);
  const parts = [[Math.floor(s / 86400), 'giorni'], [Math.floor((s % 86400) / 3600), 'ore'], [Math.floor((s % 3600) / 60), 'min'], [s % 60, 'sec']];
  return <div className="lp-count" aria-label="Conto alla rovescia">{parts.map(([value, label]) => <div key={label}>{value}<span>{label}</span></div>)}</div>;
}

function LandingPoster({ event, lineup, className = '' }) {
  const image = usePoster(event);
  const start = toMs(event?.startAt);
  if (image) return <div className={`lp-poster lp-poster-photo ${className}`}><img src={image} alt={`Locandina ${event.title}`} /></div>;
  const titleLines = (event?.title || 'THE NEXT AT BASE').split(' ');
  const half = Math.ceil(titleLines.length / 2);
  return <div className={`lp-poster ${className}`}>
    <b>{titleLines.slice(0, half).join(' ')}<br />{titleLines.slice(half).join(' ')}<br />{start ? shortDate(start) : 'PRESTO'}</b>
    <big>BASE</big>
    <small><span>{lineup.length ? lineup.join(' | ') : 'Line up in arrivo'}<br />{start ? `Start ${clock(start).replace(':', '.')}` : ''}</span><span>{(event?.venue || DEFAULT_VENUE).split(',').map((part, i) => <span key={part}>{i > 0 && <br />}{part.trim()}</span>)}</span></small>
  </div>;
}

export default function Landing({ events, ready = true, user, onJoin, onLogin, onProfile }) {
  const root = useRef(null);
  const glRef = useRef(null);
  const preRef = useRef(null);
  const preNum = useRef(null);
  const curRef = useRef(null);
  const mqRef = useRef(null);
  const trackRef = useRef(null);
  const pwRef = useRef(null);

  const event = events[0];
  const others = events.slice(1);
  const start = toMs(event?.startAt);
  const end = toMs(event?.endAt);
  const lineup = useMemo(() => parseLineup(event?.lineup), [event?.lineup]);
  const marquee = `${(event?.title || 'THE NEXT AT BASE').toUpperCase()} / ${start ? shortDate(start) : 'PRESTO'} / WHAT’S THE CLUB? / `;
  const memberCta = user ? 'Vai al tuo QR' : 'Diventa membro';
  const goMember = user ? onProfile : onJoin;

  // Sfondi ruggine dei pannelli "Cos'è BASE?" (generati una volta).
  const panelBackgrounds = useMemo(() => PANELS.map(() => rustTexture(300, 360).color.toDataURL('image/jpeg', 0.8)), []);

  // Animazioni globali: scroll fluido, preloader, marquee, manifesto, sezione orizzontale, cursore, cubo 3D.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = window.matchMedia('(hover: none)').matches;
    let lenis; let stopCube; let disposed = false;
    const cleanups = [];
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); };

    const ctx = gsap.context(() => {
      if (!reduced) {
        lenis = new Lenis({ lerp: 0.09 });
        lenis.on('scroll', ScrollTrigger.update);
        const raf = (t) => lenis.raf(t * 1000);
        gsap.ticker.add(raf); gsap.ticker.lagSmoothing(0);
        cleanups.push(() => gsap.ticker.remove(raf));
      }

      on(root.current, 'click', (e) => {
        const link = e.target.closest('a[href^="#"]');
        if (!link) return;
        const target = root.current.querySelector(link.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { offset: 0 }); else target.scrollIntoView({ behavior: 'smooth' });
      });

      // Preloader 0→100 solo alla prima visita della sessione, poi le lettere di BASE salgono.
      const heroIn = () => {
        gsap.from('.lp-hero h1 .lp-ln > span', { yPercent: 115, duration: 1.3, stagger: 0.09, ease: 'power4.out' });
        gsap.from('.lp-meta > *', { opacity: 0, y: 24, duration: 1, stagger: 0.12, delay: 0.5 });
      };
      let seen = false;
      try { seen = sessionStorage.getItem('base-pre') === '1'; } catch { /* storage non disponibile */ }
      if (reduced || seen) {
        preRef.current?.remove();
        if (!reduced) heroIn();
      } else {
        gsap.set('.lp-hero h1 .lp-ln > span', { yPercent: 115 });
        const counter = { v: 0 };
        gsap.to(counter, {
          v: 100, duration: 1.7, ease: 'power2.inOut',
          onUpdate: () => { if (preNum.current) preNum.current.textContent = Math.round(counter.v); },
          onComplete: () => {
            try { sessionStorage.setItem('base-pre', '1'); } catch { /* opzionale */ }
            gsap.to(preRef.current, { yPercent: -100, duration: 1, ease: 'power4.inOut', onComplete: () => preRef.current?.remove() });
            window.setTimeout(heroIn, 350);
          },
        });
      }

      // Marquee che accelera con la velocità di scroll.
      let mx = 0; let vel = 0;
      lenis?.on('scroll', (e) => { vel = e.velocity; });
      const marqueeTick = () => {
        const el = mqRef.current; if (!el) return;
        mx -= 0.9 + Math.abs(vel) * 0.7;
        const w = el.scrollWidth / 2;
        if (mx < -w) mx += w;
        el.style.transform = `translate3d(${mx}px,0,0)`;
        vel *= 0.92;
      };
      gsap.ticker.add(marqueeTick);
      cleanups.push(() => gsap.ticker.remove(marqueeTick));

      if (!reduced) {
        gsap.fromTo('.lp-mani .lp-w', { opacity: 0.12 }, { opacity: 1, stagger: 0.12, ease: 'none', scrollTrigger: { trigger: '.lp-mani p', start: 'top 80%', end: 'bottom 50%', scrub: true } });
      }

      // Sezione orizzontale: i pannelli scorrono mentre la sezione resta ferma.
      const track = trackRef.current;
      gsap.to(track, {
        x: () => -(track.scrollWidth - window.innerWidth + window.innerWidth * 0.04),
        ease: 'none',
        scrollTrigger: { trigger: '.lp-hs', pin: true, scrub: 1, end: () => `+=${track.scrollWidth}`, invalidateOnRefresh: true },
      });

      // Cursore e pulsanti magnetici (solo con mouse).
      if (!touch) {
        const cur = curRef.current;
        const qx = gsap.quickTo(cur, 'x', { duration: 0.3 }); const qy = gsap.quickTo(cur, 'y', { duration: 0.3 });
        let magnet = null;
        on(window, 'mousemove', (e) => {
          qx(e.clientX); qy(e.clientY);
          const hover = e.target.closest?.('a, button, li, .lp-pw, .lp-pn');
          cur.classList.toggle('big', Boolean(hover && root.current.contains(hover)));
          const mag = e.target.closest?.('[data-mag]');
          if (magnet && magnet !== mag) { gsap.to(magnet, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1,.4)' }); magnet = null; }
          if (mag) {
            magnet = mag;
            const r = mag.getBoundingClientRect();
            gsap.to(mag, { x: (e.clientX - r.left - r.width / 2) * 0.35, y: (e.clientY - r.top - r.height / 2) * 0.5, duration: 0.4 });
          }
        });
      }
    }, root);

    import('./cube.js')
      .then((m) => m.startCube(glRef.current, { reducedMotion: reduced }))
      .then((stop) => { if (disposed) stop(); else stopCube = stop; })
      .catch(() => { /* WebGL non disponibile: la pagina resta valida senza cubo */ });

    return () => {
      disposed = true;
      stopCube?.();
      cleanups.forEach((fn) => fn());
      ctx.revert();
      lenis?.destroy();
    };
  }, []);

  // Animazioni legate all'evento mostrato: si rifanno quando l'admin lo cambia.
  const eventKey = `${event?.id || 'none'}|${lineup.join(',')}|${others.length}`;
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      if (reduced) return;
      gsap.fromTo('.lp-ev .lp-poster', { rotationY: -38, rotationX: 12, y: 90, transformPerspective: 900 }, { rotationY: 0, rotationX: 0, y: 0, ease: 'none', scrollTrigger: { trigger: '.lp-ev', start: 'top 85%', end: 'top 25%', scrub: 1 } });
      gsap.from('.lp-lineup li > span', { yPercent: 110, duration: 1, stagger: 0.12, ease: 'power4.out', scrollTrigger: { trigger: '.lp-lineup', start: 'top 85%' } });
      gsap.from('.lp-steps > div', { opacity: 0, y: 50, stagger: 0.12, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.lp-steps', start: 'top 85%' } });
      gsap.from('.lp-next-grid > article', { opacity: 0, y: 60, stagger: 0.1, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.lp-next-grid', start: 'top 85%' } });
      gsap.from('.lp-info > div', { opacity: 0, y: 40, stagger: 0.1, duration: 0.9, scrollTrigger: { trigger: '.lp-info', start: 'top 88%' } });
    }, root);
    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, [eventKey]);

  const tilt = (e) => {
    const r = pwRef.current.getBoundingClientRect();
    gsap.to(pwRef.current, { rotationY: ((e.clientX - r.left) / r.width - 0.5) * 18, rotationX: -((e.clientY - r.top) / r.height - 0.5) * 18, transformPerspective: 900, duration: 0.6, overwrite: true });
  };
  const untilt = () => gsap.to(pwRef.current, { rotationY: 0, rotationX: 0, duration: 0.9, ease: 'elastic.out(1,.5)' });

  return <div className="lp" ref={root}>
    <div className="lp-pre" ref={preRef}><b ref={preNum}>0</b><i>Caianello, CE</i></div>
    <div className="lp-grain" aria-hidden="true" />
    <div className="lp-cur" ref={curRef} aria-hidden="true" />
    <canvas className="lp-gl" ref={glRef} aria-hidden="true" />

    <header className="lp-head">
      <a className="lp-logo" href="#top">BASE</a>
      <nav>
        <a href="#evento">Evento</a>
        <a href="#base">Cos’è BASE</a>
        <a href="#info">Info</a>
        <button type="button" onClick={user ? onProfile : onLogin}>{user ? 'Il mio profilo' : 'Accedi'}</button>
      </nav>
    </header>

    <main>
      <section className="lp-hero" id="top">
        <h1 aria-label="BASE">{['B', 'A', 'S', 'E'].map((l) => <span className="lp-ln" key={l}><span>{l}</span></span>)}</h1>
        <div className="lp-meta">
          <div className="lp-meta-left">
            <p>Un club nuovo, costruito di acciaio ossidato e bassi. {start ? <>La prossima notte è {longDate(start)}.</> : ready && <>La prossima notte sta arrivando.</>}</p>
            <div className="lp-actions"><button type="button" className="lp-btn lp-btn-ember" data-mag onClick={goMember}>{memberCta}</button>{!user && <button type="button" className="lp-link" onClick={onLogin}>Sei già membro? Accedi</button>}</div>
          </div>
          <strong className={ready ? 'is-ready' : ''}>{start ? <>{shortDate(start)}<br />dalle {clock(start)}</> : <>Presto<br />sotto</>}</strong>
        </div>
      </section>

      <div className="lp-mq" aria-hidden="true"><div ref={mqRef}>{marquee.repeat(4)}</div></div>

      <section className="lp-mani"><p>{MANIFESTO.split(' ').map((w, i) => <span className="lp-w" key={`${w}-${i}`}>{w}</span>)}</p></section>

      <section id="evento" className="lp-ev">
        <div className="lp-pw" ref={pwRef} onMouseMove={tilt} onMouseLeave={untilt}><LandingPoster event={event} lineup={lineup} /></div>
        <div>
          <span className="lp-kicker">{event ? 'La prossima notte' : 'In arrivo'}</span>
          <h2>{event ? event.title : 'La prossima notte.'}</h2>
          {(event?.description || event?.subtitle) && <p className="lp-desc">{event.description || event.subtitle}</p>}
          {event ? <Countdown start={start} end={end} /> : <p className="lp-desc">Stiamo preparando la prossima data. Iscriviti: appena esce, il tuo QR d’ingresso compare nel profilo.</p>}
          {lineup.length > 0 && <ul className="lp-lineup">{lineup.map((name) => <li key={name}><span>{name}</span></li>)}</ul>}
          <button type="button" className="lp-btn" data-mag onClick={goMember}>{user ? 'Vai al tuo QR' : 'Diventa membro per entrare'}</button>
          <p className="lp-note">Ingresso riservato ai membri. Il QR personale lo trovi nel tuo profilo e vale una sola volta.</p>
        </div>
      </section>

      {others.length > 0 && <section className="lp-next">
        <h2>Le prossime notti.</h2>
        <div className="lp-next-grid">{others.map((item) => <article key={item.id}>
          <LandingPoster event={item} lineup={parseLineup(item.lineup)} className="lp-poster-small" />
          <h3>{item.title}</h3>
          <p>{shortDate(toMs(item.startAt))} · dalle {clock(toMs(item.startAt))}</p>
        </article>)}</div>
      </section>}

      <section className="lp-hs" id="base"><div className="lp-hs-in">
        <h2>Cos’è BASE?</h2>
        <div className="lp-track" ref={trackRef}>{PANELS.map(([title, text], i) => <div className="lp-pn" key={title} style={{ backgroundImage: `linear-gradient(180deg,#0b080722 20%,#0b0807e6),url(${panelBackgrounds[i]})` }}><h3>{title}</h3><p>{text}</p></div>)}</div>
      </div></section>

      <section className="lp-join" id="membri">
        <h2>Entra nella<br />BASE.</h2>
        <div className="lp-steps">
          <div><b>01</b><h3>Iscriviti</h3><p>Nome, cognome, email e password. Un minuto e sei dentro la community.</p></div>
          <div><b>02</b><h3>Ricevi il QR</h3><p>Per ogni nuova notte compare nel tuo profilo un QR personale, solo tuo.</p></div>
          <div><b>03</b><h3>Mostralo alla porta</h3><p>Una scansione e sei dentro. A fine serata il QR scade da solo.</p></div>
        </div>
        <button type="button" className="lp-btn lp-btn-ember" data-mag onClick={goMember}>{memberCta}</button>
      </section>

      <section id="info" className="lp-info-section">
        <h2>Come arrivare.</h2>
        <div className="lp-info">
          <div><h4>Dove</h4><a href={MAPS_URL} target="_blank" rel="noreferrer">{(event?.venue || DEFAULT_VENUE).split(',').map((part, i) => <span key={part}>{i > 0 && <br />}{part.trim()}</span>)}</a></div>
          <div><h4>Quando</h4>{start ? <>{longDate(start).replace(/^./, (c) => c.toUpperCase())}<br />Dalle {clock(start)}</> : 'Prossima data in arrivo'}</div>
          <div><h4>Ingresso</h4>Riservato ai membri.<br />Diritto di ammissione riservato.</div>
          <div><h4>Seguici</h4><a href={INSTAGRAM} target="_blank" rel="noreferrer">@base.basement</a></div>
        </div>
      </section>
    </main>

    <footer className="lp-foot"><div className="lp-big" aria-hidden="true">BASE</div><small><span>BASE by Evening</span><button type="button" onClick={goMember}>{memberCta} →</button><span>© BASE 2026</span></small></footer>
  </div>;
}
