// effects.js — Beispiel-Effekte für das effect="…"-Attribut von <timeline-event>.
// Jede Funktion wird aufgerufen, sobald man beim Scrollen bei diesem Event ankommt,
// und bekommt das <timeline-event>-Element übergeben (z.B. um Attribute auszulesen).
//
// Verwendung im HTML:
//   <timeline-event date="1969" label="Mondlandung" effect="emojiRain" data-emoji="🌕"> … </timeline-event>


// Emoji-Regen — Emojis + Anzahl, z.B. effect="emojiRain(🌕⭐🚀, 40)". Defaults: 🌕⭐🚀, 24.
function emojiRain(emojis = '🌕⭐🚀', count = 24) {
  const chars = [...new Intl.Segmenter().segment(emojis)].map(s => s.segment);
  const total = Number(count);
  const spread = Math.min(total * 30, 4000);   // bei mehr Emojis fallen sie zeitversetzter (länger Regen)

  for (let i = 0; i < total; i++) {
    const drop = document.createElement('span');
    drop.textContent = chars[Math.floor(Math.random() * chars.length)];
    drop.style.cssText = 'position:fixed; top:-3rem; font-size:2rem; pointer-events:none; z-index:9999;';
    drop.style.left = Math.random() * 100 + 'vw';
    document.body.appendChild(drop);

    drop.animate(
      [{ transform: 'translateY(0) rotate(0deg)' },
       { transform: `translateY(110vh) rotate(${Math.random() * 360}deg)` }],
      { duration: 2000 + Math.random() * 2000, delay: Math.random() * spread, easing: 'linear' }
    ).onfinish = () => drop.remove();
  }
}


// Farbwechsel — setzt Hintergrund- UND Textfarbe, z.B. effect="colorChange(navy, gold)"
function colorChange(background = '#1a1030', text = '#ffffff') {
  document.body.style.transition = 'background-color 0.6s, color 0.6s';
  document.body.style.backgroundColor = background;
  document.body.style.color = text;
}


// Wackeln — schnelles, zufälliges Zittern. Stärke (px) und Dauer (ms),
// z.B. effect="shake(16, 700)"
function shake(intensity = 8, duration = 400) {
  const px = Number(intensity);
  const steps = 16;
  const frames = [];
  for (let i = 0; i < steps; i++) {
    const decay = 1 - i / steps;   // klingt zum Ende hin aus
    const x = (Math.random() * 2 - 1) * px * decay;
    const y = (Math.random() * 2 - 1) * px * decay;
    frames.push({ transform: `translate(${x}px, ${y}px)` });
  }
  frames.push({ transform: 'translate(0, 0)' });
  document.body.animate(frames, { duration: Number(duration), easing: 'linear' });
}


// Eigener Effekt — schreibt hier euren eigenen Code rein.
// Aufruf im Tag: effect="custom"
function custom() {
  // euer Code, z.B.:
  // document.body.style.background = 'gold';
}
