console.log('loaded storyline')

// Wenn <timeline-view unit="…"> gesetzt ist, werden date-Werte als reine Zahlen behandelt
// (z.B. km statt Jahre) und mit der Einheit beschriftet.
let numericUnit = null;

// ---- Timeline View ---- //

// Custom element, das die Timeline selbst darstellt

class TimelineView extends HTMLElement {

  connectedCallback() {

    // während des Parsens stimmen Layout und Selektoren wie :last-of-type
    // noch nicht — Aufbau verschieben, bis das Dokument fertig geladen ist
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.connectedCallback());
      return;
    }

    const view = this;

    numericUnit = view.getAttribute('unit') || null;   // z.B. "km" -> date als Zahl statt Datum

    // ---- Variablen ---- //

    let axis, p0, p1, steep, reversed;                        // Geometrie der Linie
    let docEvents, events, positions;                         // Events (Dokument- bzw. Render-Reihenfolge)
    let timeMode, startTime, endTime, timeSpan;               // Zeitrahmen
    let docAnchors, maxScroll;                                // Scroll-Kopplung
    let track, line, eventEls, indicator, progress, preview, counter;  // gerenderte Elemente
    let activeEl = null;

    // Muster für interpolierte Datums-Anzeigen (Preview, depth-Jahr)
    const dateFormat = view.getAttribute('date-format') || 'YYYY';

    // effect="name" oder effect="name(arg1, arg2)": ruft die gleichnamige globale Funktion auf,
    // sobald ein Event aktiv wird. Werte aus der Klammer werden als Strings übergeben.
    //   effect="emojiRain(🌕⭐🚀)"        -> emojiRain('🌕⭐🚀')
    //   effect="colorChange(#1a1030, #fff)" -> colorChange('#1a1030', '#fff')
    function runEffect(docEvent) {
      const spec = docEvent.getAttribute('effect');
      const match = spec && spec.match(/^\s*(\w+)\s*(?:\((.*)\))?\s*$/);
      if (!match) return;
      const fn = window[match[1]];
      if (typeof fn !== 'function') return;
      const args = match[2] ? match[2].split(',').map((s) => s.trim()) : [];
      fn(...args);
    }


    // der Renderer bündelt alle Berührungspunkte zwischen Ablauf/Wiring
    // und Darstellung — austauschbar (Linie, später depth)
    const lineRenderer = {
      setupLayout,
      render,
      updateView,
      relayout,
      getPointerPosition,
    };

    const depthRenderer = {

      equalSpacing: true,

      setupLayout() {
        view.classList.add('tl-depth');
        reversed = false;   // depth kennt keine Richtungsumkehr
      },

      render() {
        let html = '';

        events.forEach((event) => {
          const dateLabel = eventLabel(event) || (numericUnit && eventStart(event) ? formatDate(getEventTime(event), dateFormat) : eventStart(event));
          const label = event.getAttribute('label');
          const image = event.getAttribute('image');

          html += `
            <div class="tl-event${image ? ' tl-has-image' : ''}">
              ${image ? `<img class="tl-image" src="${image}" alt="">` : ''}
              ${dateLabel ? `<p class="tl-date">${dateLabel}</p>` : ''}
              <p class="tl-label">${label}</p>
            </div>
          `;
        });

        const counterHtml = view.hasAttribute('counter') ? '<div class="tl-counter"></div>' : '';
        view.innerHTML = counterHtml + '<div class="tl-line"></div>' + html;
        eventEls = view.querySelectorAll('.tl-event');
        this.counterEl = view.querySelector('.tl-counter');
      },

      updateView(tlPos, activeIndex) {
        const AHEAD = 30;    // ab dieser Tiefe tauchen Karten auf
        const PERSP = 16;    // Kameraabstand: kleiner = dramatischere Perspektive
        const SLOPE = 4;     // wie steil die Flugbahn an der Kamera vorbeiführt
        const spacing = parseFloat(view.getAttribute('spacing')) || 1;   // >1 = weiter, <1 = flotter

        eventEls.forEach((el, i) => {
          const depth = (positions[i] - tlPos) * spacing;
          const z = 1 + depth / PERSP;   // Entfernung zur Kamera (1 = Bildmitte)

          // außer Sichtweite oder schon an der Kamera vorbei
          if (depth > AHEAD || z < 0.2) {
            el.style.visibility = 'hidden';
            return;
          }

          const scale = (1 / z) ** 1.4;
          const y = 50 - depth / z * SLOPE;
          const k = depth / AHEAD;
          const opacity = k > 0.85 ? (1 - k) / 0.15 : 1;

          el.style.top = y + '%';
          el.style.transform = `translate(-50%, -50%) scale(${scale})`;
          el.style.opacity = opacity;
          el.style.visibility = '';
          el.style.zIndex = Math.round(100 - depth);
        });

        // aktive Karte markieren — unverändert
        const el = eventEls[events.indexOf(docEvents[activeIndex])];
        if (el !== activeEl) {
          activeEl?.classList.remove('tl-active');
          el.classList.add('tl-active');
          activeEl = el;
          runEffect(docEvents[activeIndex]);
        }

        // Jahr im Hintergrund: zwischen den Nachbar-Events zeitlich interpoliert
        if (this.counterEl && timeMode) {
          const step = 100 / (events.length - 1 || 1);
          const i = Math.max(Math.min(Math.floor(tlPos / step), events.length - 2), 0);
          const frac = Math.min(Math.max((tlPos - i * step) / step, 0), 1);
          const a = getEventTime(events[i]);
          const b = getEventTime(events[Math.min(i + 1, events.length - 1)]);
          this.counterEl.textContent = formatDate(a + (b - a) * frac, dateFormat);
        }
      },

      relayout() {},

      getPointerPosition(e) {
        return null;   // depth hat keine Linie, auf die man klicken könnte
      },

    };

    const renderer = view.getAttribute('mode') === 'depth' ? depthRenderer : lineRenderer;

    // ---- Ablauf ---- //

    renderer.setupLayout();
    if (!setupEvents()) return;
    renderer.render();
    renderer.updateView(getReadingPosition(), getActiveIndex());
    listen();


    // ---- Modell: der Zahlenstrahl 0–100 und seine Kopplung an den Text ----

    // Events einsammeln, filtern und den Zeitrahmen bestimmen;
    // liefert false, wenn nichts darstellbar ist
    function setupEvents() {

      // alle aktiven <timeline-event> tags in Dokumentreihenfolge einsammeln
      docEvents = Array.from(document.querySelectorAll('timeline-event:not([disabled])'));

      // kein einziges date-Attribut → Timeline zeigt Erzählfortschritt statt Zeit,
      // die Punkte verteilen sich nach den Abständen der Events im Dokument
      timeMode = docEvents.some((docEvent) => eventStart(docEvent) != null);

      if (timeMode) {

        // Events ohne gültiges Datum aussortieren und melden
        docEvents = docEvents.filter((docEvent) => {
          if (isNaN(getEventTime(docEvent))) {
            console.warn('Storyline: Event ohne gültiges date-Attribut wird ignoriert:', docEvent);
            return false;
          }
          return true;
        });

        // Zeitspanne der Timeline bestimmen; Enden von Zeitspannen zählen mit
        const allTimes = docEvents.map(getEventTime);
        docEvents.forEach((docEvent) => {
          const end = eventEnd(docEvent);
          if (end && !isNaN(new Date(end).getTime())) allTimes.push(new Date(end).getTime());
        });
        startTime = view.hasAttribute('start')
          ? resolveDate(view.getAttribute('start'), Math.min(...allTimes))
          : Math.min(...allTimes);
        endTime = view.hasAttribute('end')
          ? resolveDate(view.getAttribute('end'), Math.max(...allTimes))
          : Math.max(...allTimes);

        // Events außerhalb der Zeitspanne aussortieren
        docEvents = docEvents.filter((docEvent) => {
          const time = getEventTime(docEvent);
          return time >= startTime && time <= endTime;
        });

      }

      if (docEvents.length === 0) {
        console.warn('Storyline: keine darstellbaren Events gefunden');
        return false;
      }

      // fürs Rendern: dieselben Events, nach Wert sortiert (numerisch — funktioniert für
      // Datum/Zeit wie für reine Zahlen, z.B. km)
      events = timeMode
        ? [...docEvents].sort((a, b) => getEventTime(a) - getEventTime(b))
        : [...docEvents];

      if (reversed) events.reverse();

      // Bezugswerte für die Positionsrechnung beider Modi
      timeSpan = endTime - startTime || 1;
      docAnchors = computeAnchors();
      maxScroll = document.documentElement.scrollHeight - window.innerHeight || 1;

      // jedes Datum wird auf eine Position zwischen 0 und 100 gemappt
      positions = events.map(getEventPosition);

      return true;
    }

    // Scroll-Anker aller Events: Position, bei der jedes die Mitte erreicht,
    // unerreichbare am Anfang/Ende proportional gestaucht
    function computeAnchors() {
      const ref = window.innerHeight / 2;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      const anchors = docEvents.map((event) => getDocTop(event) - ref);

      // Unerreichbare Anker am Anfang proportional in [0, ersten erreichbaren] stauchen
      const first = anchors.findIndex((a) => a >= 0);
      if (first > 0) {
        const from = anchors[0];
        const to = anchors[first];
        for (let i = 0; i < first; i++) {
          anchors[i] = (anchors[i] - from) / (to - from) * to;
        }
      }

      // dasselbe am Ende: in [letzten erreichbaren, maxScroll] stauchen
      let last = anchors.length - 1;
      while (last >= 0 && anchors[last] > maxScroll) last--;
      if (last >= 0 && last < anchors.length - 1) {
        const from = anchors[last];
        const to = anchors[anchors.length - 1];
        for (let i = last + 1; i < anchors.length; i++) {
          anchors[i] = from + (anchors[i] - from) / (to - from) * (maxScroll - from);
        }
      }

      return anchors;
    }

    function getTimePosition(time) {
      return (time - startTime) / timeSpan * 100;
    }

    function getEventPosition(event) {
      if (renderer.equalSpacing) {
        return events.indexOf(event) / (events.length - 1 || 1) * 100;
      }
      return timeMode
        ? getTimePosition(getEventTime(event))
        : docAnchors[docEvents.indexOf(event)] / maxScroll * 100;
    }

    // aktuelle Leseposition auf dem Zahlenstrahl: zwischen den Ankern
    // der umliegenden Events interpoliert
    function getReadingPosition() {
      const y = window.scrollY;
      const anchors = computeAnchors();

      let tlPos = getEventPosition(docEvents[0]);

      for (let i = 0; i < docEvents.length - 1; i++) {
        if (y >= anchors[i]) {
          const span = anchors[i + 1] - anchors[i];
          const frac = span > 0 ? Math.min((y - anchors[i]) / span, 1) : 1;
          const posA = getEventPosition(docEvents[i]);
          const posB = getEventPosition(docEvents[i + 1]);
          tlPos = posA + frac * (posB - posA);
        }
      }

      return tlPos;
    }

    // aktives Event: das, dessen Anker zuletzt passiert wurde
    function getActiveIndex() {
      const y = window.scrollY;
      const anchors = computeAnchors();

      let active = 0;
      for (let i = 0; i < anchors.length; i++) {
        if (y >= anchors[i]) active = i;
      }

      return active;
    }

    // Scroll-Position zur Linienposition t — die Umkehrung von getReadingPosition
    function getScrollTarget(t) {
      const anchors = computeAnchors();
      const y = window.scrollY;

      let target = null;

      // alle Lese-Abschnitte absuchen, in denen der Indikator t passiert,
      // und das Scroll-Ziel mit dem kürzesten Weg von hier wählen
      for (let i = 0; i < docEvents.length - 1; i++) {
        const posA = getEventPosition(docEvents[i]);
        const posB = getEventPosition(docEvents[i + 1]);
        if ((t - posA) * (t - posB) > 0 || posA === posB) continue;   // t liegt nicht dazwischen

        const frac = (t - posA) / (posB - posA);
        const candidate = anchors[i] + frac * (anchors[i + 1] - anchors[i]);

        if (target === null || Math.abs(candidate - y) < Math.abs(target - y)) {
          target = candidate;
        }
      }

      // t außerhalb des Event-Bereichs (z.B. zwischen letztem Event und
      // end="now"): zum nächstgelegenen Event springen
      if (target === null) {
        let nearest = 0;
        docEvents.forEach((event, i) => {
          const current = Math.abs(getEventPosition(event) - t);
          const best = Math.abs(getEventPosition(docEvents[nearest]) - t);
          if (current < best) nearest = i;
        });
        target = anchors[nearest];
      }

      return target;
    }

    // Scroll-Position, bei der ein bestimmtes Event die Lese-Linie erreicht
    function getEventTarget(event) {
      return computeAnchors()[docEvents.indexOf(event)];
    }
    

    // ---- Renderer: die Linie ----

    // start-pos/end-pos → Ausrichtung, Endpunkte und View-Klassen
    function setupLayout() {
      const startRaw = view.getAttribute('start-pos') || 'top-right';
      const endRaw = view.getAttribute('end-pos') || 'bottom-right';

      let startPos = parseCorner(startRaw);
      let endPos = parseCorner(endRaw);

      // die gemeinsame Kante der beiden Ecken bestimmt die Ausrichtung der Linie
      axis = null;
      if (startPos && endPos) {
        if (startPos.h === endPos.h && startPos.v !== endPos.v) axis = 'vertical';     // gleiche Seite, gegensätzliche Enden
        if (startPos.v === endPos.v && startPos.h !== endPos.h) axis = 'horizontal';   // gleiche Höhe, gegensätzliche Seiten
      }

      // keine gemeinsame Kante? Dann als freie Linie versuchen —
      // echte Koordinaten ("10% 80%") oder ein diagonales Ecken-Paar
      if (!axis) {
        p0 = parseCoords(startRaw) || cornerPoint(startPos);
        p1 = parseCoords(endRaw) || cornerPoint(endPos);
        if (p0 && p1) axis = 'free';
      }

      if (!axis) {
        console.warn('Storyline: start-pos/end-pos ergeben keine Linie — Standard wird verwendet');
        startPos = { v: 'top', h: 'right' };
        endPos = { v: 'bottom', h: 'right' };
        axis = 'vertical';
      }

      if (axis === 'vertical' && startPos.h === 'left') view.classList.add('tl-left');
      if (axis === 'horizontal') view.classList.add('tl-horizontal');
      if (axis === 'horizontal' && startPos.v === 'top') view.classList.add('tl-top');
      if (axis === 'free') view.classList.add('tl-free');

      // Endpunkte der Linie in Track-Prozenten; Querachse 0 = Mittelachse der Linie
      // (im freien Modus stehen p0/p1 an dieser Stelle schon fest)
      if (axis === 'vertical') {
        p0 = { x: 0, y: startPos.v === 'top' ? 0 : 100 };
        p1 = { x: 0, y: endPos.v === 'top' ? 0 : 100 };
      }
      if (axis === 'horizontal') {
        p0 = { x: startPos.h === 'left' ? 0 : 100, y: 0 };
        p1 = { x: endPos.h === 'left' ? 0 : 100, y: 0 };
      }

      // dominante Achse der Linie — entscheidet, wohin Labels ausweichen
      steep = Math.abs(p1.y - p0.y) >= Math.abs(p1.x - p0.x);

      // Render-Reihenfolge: läuft die Linie rückwärts (nach oben bzw. nach links)?
      reversed = steep ? p0.y > p1.y : p0.x > p1.x;
    }

    // baut das DOM der Timeline und richtet es ein
    function render() {
      const title = view.innerHTML.trim();

      let html = `
        ${title ? `<div class="tl-title">${title}</div>` : ''}
        <div class="tl-track">
          <div class="tl-line"></div>
          ${view.hasAttribute('progress') ? '<div class="tl-progress"></div>' : ''}
          <div class="tl-indicator">${view.hasAttribute('counter') ? '<span class="tl-counter"></span>' : ''}</div>
          ${view.hasAttribute('preview') ? '<div class="tl-preview"><span class="tl-preview-date"></span></div>' : ''}
      `;

      events.forEach((event, i) => {
        const dateLabel = eventLabel(event) || (numericUnit && eventStart(event) ? formatDate(getEventTime(event), dateFormat) : eventStart(event));
        const dateEnd = timeMode && eventEnd(event);
        const label = event.getAttribute('label');
        const image = event.getAttribute('image');
        const p = getLinePoint(positions[i]);

        html += `
          <div class="tl-event" style="left: ${p.x}%; top: ${p.y}%">
            ${dateEnd ? '<span class="tl-range"></span>' : '<span class="tl-dot"></span>'}
            <div class="tl-label-box">
              ${dateLabel ? `<p class="tl-date">${dateLabel}</p>` : ''}
              <p class="tl-label">${label}</p>
            </div>
            ${image ? `<img class="tl-image" src="${image}" alt="">` : ''}
          </div>
        `;
      });

      html += '</div>';
      view.innerHTML = html;

      track = view.querySelector('.tl-track');
      line = view.querySelector('.tl-line');
      eventEls = view.querySelectorAll('.tl-event');
      indicator = view.querySelector('.tl-indicator');
      progress = view.querySelector('.tl-progress');
      preview = view.querySelector('.tl-preview');
      counter = view.querySelector('.tl-counter');

      resolveCollisions();
      fitSize();
      updateLine();
      updateRanges();
    }

    // Kollisions-Auflösung von überlappenden Labels
    function resolveCollisions() {
      if (steep) {
        let prevBottom = -Infinity;

        eventEls.forEach((el) => {
          const box = el.querySelector('.tl-label-box');
          box.style.marginTop = '';
          let top = el.offsetTop;

          if (top < prevBottom) {
            box.style.marginTop = (prevBottom - top) + 'px';
            top = prevBottom;
          }

          prevBottom = top + box.offsetHeight + 4;
        });
        return;
      }

      // horizontal: bei Überlappung rutscht das Label in die nächste freie Zeile
      const laneEnds = [];   // rechtes Ende des letzten Labels je Zeile

      eventEls.forEach((el) => {
        const box = el.querySelector('.tl-label-box');
        box.style.marginTop = '';
        const left = el.offsetLeft;

        let lane = 0;
        while (lane < laneEnds.length && left < laneEnds[lane]) lane++;

        if (lane > 0) box.style.marginTop = lane * (box.offsetHeight + 4) + 'px';
        laneEnds[lane] = left + box.offsetWidth + 4;
      });
    }

    // View-Maße an den Inhalt anpassen
    function fitSize() {
      if (axis === 'vertical') {
        // Breite auf das breiteste Label anpassen
        const viewLeft = view.getBoundingClientRect().left;
        let maxRight = 0;

        const titleEl = view.querySelector('.tl-title');
        if (titleEl) {
          maxRight = Math.max(maxRight, titleEl.getBoundingClientRect().right - viewLeft);
        }

        eventEls.forEach((el) => {
          const right = el.getBoundingClientRect().right - viewLeft;
          maxRight = Math.max(maxRight, right);
        });

        view.style.width = maxRight + 'px';
      }

      if (axis === 'horizontal') {
        // Höhe ans tiefste Label anpassen
        const viewTop = view.getBoundingClientRect().top;
        let maxBottom = 0;
        eventEls.forEach((el) => {
          maxBottom = Math.max(maxBottom, el.getBoundingClientRect().bottom - viewTop);
        });
        view.style.height = maxBottom + 'px';
      }
    }

    // Punkt-Positionen neu berechnen (nach Resize ändern sich die Dokumentabstände)
    function updatePositions() {
      docAnchors = computeAnchors();
      maxScroll = document.documentElement.scrollHeight - window.innerHeight || 1;

      eventEls.forEach((el, i) => {
        const p = getLinePoint(getEventPosition(events[i]));
        el.style.left = p.x + '%';
        el.style.top = p.y + '%';
      });
    }

    // im freien Modus wird die Linie als rotierter Strahl von p0 nach p1 gelegt
    function updateLine() {
      if (axis !== 'free') return;

      const segment = getSegment(0, 100);
      line.style.left = p0.x + '%';
      line.style.top = p0.y + '%';
      line.style.width = segment.length + 'px';
      line.style.transform = `translateY(-50%) rotate(${segment.angle}rad)`;
    }

    // Balken für Zeiträume anlegen
    function updateRanges() {
      eventEls.forEach((el, i) => {
        const range = el.querySelector('.tl-range');
        if (!range) return;

        const rangeEnd = numericUnit
          ? Number(eventEnd(events[i]))
          : new Date(eventEnd(events[i])).getTime();
        if (isNaN(rangeEnd)) {
          console.warn('Storyline: ungültiges date-end wird ignoriert:', events[i]);
          return;
        }

        const start = getEventPosition(events[i]);
        const end = Math.min(getTimePosition(rangeEnd), 100);
        const segment = getSegment(start, end);
        range.style.width = segment.length + 'px';
        range.style.transform = `translateY(-50%) rotate(${segment.angle}rad)`;
      });
    }

    // Indikator, Progress und Highlight auf den aktuellen Stand bringen
    function updateView(tlPos, activeIndex) {
      const el = eventEls[events.indexOf(docEvents[activeIndex])];
      if (el !== activeEl) {
        activeEl?.classList.remove('tl-active');
        el.classList.add('tl-active');
        activeEl = el;
        runEffect(docEvents[activeIndex]);
      }

      const p = getLinePoint(tlPos);
      indicator.style.left = p.x + '%';
      indicator.style.top = p.y + '%';

      if (counter && timeMode) {
        counter.textContent = formatDate(startTime + tlPos / 100 * timeSpan, dateFormat);
      }

      if (progress) {
        const segment = getSegment(0, tlPos);
        progress.style.left = p0.x + '%';
        progress.style.top = p0.y + '%';
        progress.style.width = segment.length + 'px';
        progress.style.transform = `translateY(-50%) rotate(${segment.angle}rad)`;
      }
    }

    // Neuberechnungen nach einem Window Resize
    function relayout() {
      updatePositions();
      resolveCollisions();
      updateLine();
      updateRanges();
    }

    // übersetzt eine Position 0–100 entlang der Linie in Track-Koordinaten
    function getLinePoint(pos) {
      return {
        x: p0.x + (p1.x - p0.x) * pos / 100,
        y: p0.y + (p1.y - p0.y) * pos / 100,
      };
    }

    // Länge und Winkel eines Segments zwischen zwei Positionen auf der Linie
    function getSegment(posA, posB) {
      const a = getLinePoint(posA);
      const b = getLinePoint(posB);
      const dx = (b.x - a.x) / 100 * track.clientWidth;
      const dy = (b.y - a.y) / 100 * track.clientHeight;
      return { length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
    }

    // übersetzt eine Mausposition in die nächstliegende Position 0–100 auf der Linie
    function getPointerPosition(e) {
      const rect = track.getBoundingClientRect();

      // p0, p1 und Mauspunkt in Track-Pixel
      const x0 = p0.x / 100 * rect.width;
      const y0 = p0.y / 100 * rect.height;
      const dx = (p1.x - p0.x) / 100 * rect.width;
      const dy = (p1.y - p0.y) / 100 * rect.height;
      const px = e.clientX - rect.left - x0;
      const py = e.clientY - rect.top - y0;

      // Projektion des Mauspunkts auf die Strecke, geklemmt auf 0–100
      const t = (px * dx + py * dy) / (dx * dx + dy * dy) * 100;
      return Math.min(Math.max(t, 0), 100);
    }

    // ---- Wiring: Modell und Renderer zusammenstecken ----

    function listen() {
      window.addEventListener('scroll', () => {
        renderer.updateView(getReadingPosition(), getActiveIndex());
      });

      window.addEventListener('resize', () => {
        renderer.relayout();
        renderer.updateView(getReadingPosition(), getActiveIndex());
      });

      view.addEventListener('click', (e) => {
        const eventEl = e.target.closest('.tl-event');

        let target;
        if (eventEl) {
          // Klick auf Punkt oder Label: exakt zum zugehörigen Event
          const index = [...eventEls].indexOf(eventEl);
          target = getEventTarget(events[index]);
        } else {
          // Klick auf die Linie: exakt zur geklickten Position
          const t = renderer.getPointerPosition(e);
          if (t === null) return;   // dieser Renderer hat keine klickbare Linie
          target = getScrollTarget(t);
        }

        window.scrollTo({ top: target, behavior: 'smooth' });
      });

      if (preview) {
        view.addEventListener('pointermove', (e) => {
          const t = renderer.getPointerPosition(e);
          if (t === null) return;
          const p = getLinePoint(t);
          preview.style.left = p.x + '%';
          preview.style.top = p.y + '%';
          if (timeMode) {
            preview.querySelector('.tl-preview-date').textContent =
              formatDate(startTime + t / 100 * timeSpan, dateFormat);
          }
          preview.classList.add('tl-preview-active');
        });

        view.addEventListener('pointerleave', () => {
          preview.classList.remove('tl-preview-active');
        });
      }
    }

  }

}

customElements.define('timeline-view', TimelineView);



// ---- Timeline Event ---- //

// Custom element, das ein einzelnes Element auf der Timeline festlegt

class TimelineEvent extends HTMLElement {

  connectedCallback() {
    // console.log('Event: ', this.getAttribute('label'));
  }

}

customElements.define('timeline-event', TimelineEvent);


// ---- Helper Functions ---- //

// versteht "1969", "now" oder relative Angaben wie "-3y", "+6m", "+14d"
function resolveDate(value, anchorTime) {
  if (numericUnit) return Number(value);   // numerischer Modus: Wert direkt als Zahl
  if (value === 'now') return Date.now();

  const relative = value.match(/^([+-]\d+)([ymd])$/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const date = new Date(anchorTime);
    if (unit === 'y') date.setFullYear(date.getFullYear() + amount);
    if (unit === 'm') date.setMonth(date.getMonth() + amount);
    if (unit === 'd') date.setDate(date.getDate() + amount);
    return date.getTime();
  }

  return new Date(value).getTime();
}

// Achsenwert eines Events ablesen. date… und position… sind gleichwertige Namen:
// date… liest sich schön bei Zeit-Achsen, position… bei Zahlen-Achsen (z.B. km).
function eventStart(event) {
  return event.getAttribute('date') ?? event.getAttribute('position');
}

function eventEnd(event) {
  return event.getAttribute('date-end') ?? event.getAttribute('position-end');
}

function eventLabel(event) {
  return event.getAttribute('date-label') ?? event.getAttribute('position-label');
}

function getEventTime(event) {
  const date = eventStart(event);
  if (date == null) return NaN;
  if (numericUnit) return Number(date);   // reine Zahl (z.B. km) statt Datum
  return new Date(date).getTime();
}

// formatiert einen Zeitstempel nach einem Muster wie "DD.MM.YYYY" oder "HH:mm";
// Datumsteile groß (YYYY, MM, DD), Uhrzeitteile klein (HH, mm)
function formatDate(time, pattern) {
  if (numericUnit) return Math.round(time).toLocaleString('de-DE') + ' ' + numericUnit;
  const date = new Date(time);
  const lang = document.documentElement.lang || undefined;
  const pad = (n) => String(n).padStart(2, '0');

  return pattern
    .replace(/YYYY/g, date.getFullYear())
    .replace(/YY/g, pad(date.getFullYear() % 100))
    .replace(/MMMM/g, date.toLocaleString(lang, { month: 'long' }))
    .replace(/MMM/g, date.toLocaleString(lang, { month: 'short' }))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()));
}

function getDocTop(event) {
  return event.getBoundingClientRect().top + window.scrollY;
}

// Ecke als Koordinatenpunkt, z.B. { v: 'top', h: 'right' } → { x: 100, y: 0 }
function cornerPoint(corner) {
  if (!corner) return null;
  return { x: corner.h === 'left' ? 0 : 100, y: corner.v === 'top' ? 0 : 100 };
}

// prüft ein Ecken-Keyword wie "top-right" oder "right-top" und
// liefert es normalisiert als { v, h } zurück — oder null
function parseCorner(value) {
  const match = value.match(/^(top|bottom|left|right)-(top|bottom|left|right)$/);
  if (!match) return null;

  const parts = [match[1], match[2]];
  const v = parts.find((p) => p === 'top' || p === 'bottom');
  const h = parts.find((p) => p === 'left' || p === 'right');
  if (!v || !h) return null;   // beides von derselben Achse, z.B. "left-right"

  return { v, h };
}

// freie Koordinaten wie "10% 80%" → { x: 10, y: 80 }, sonst null
function parseCoords(value) {
  const match = value.match(/^(-?[\d.]+)%\s+(-?[\d.]+)%$/);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}
