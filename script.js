// ===================== Casino Poker Night — Interactive =====================

const SUITS = [
  { sym: "♠", name: "spades",   color: "black" },
  { sym: "♥", name: "hearts",   color: "red"   },
  { sym: "♣", name: "clubs",    color: "black" },
  { sym: "♦", name: "diamonds", color: "red"   },
];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const STORAGE_KEY = "pokerNightSeats";
const PLAYER_ID_KEY = "pokerNightPlayerId";
const MY_SEAT_KEY = "pokerNightMySeat";
const API_URL = "/api/seats";
const POLL_MS = 5000;

// ----- State -----
let seats = {};
let mySeat = parseInt(localStorage.getItem(MY_SEAT_KEY) || "0", 10);
let pendingSeat = 0;
let deck = freshDeck();
let communityRevealed = 0;
let communityCards = [];
let useRemote = true;
let pollTimer = null;
let modalOpen = false;
const playerId = getOrCreatePlayerId();

function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

// ----- Deck helpers -----
function freshDeck() {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push({ rank: r, suit: s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function drawCard() {
  if (deck.length === 0) deck = freshDeck();
  return deck.pop();
}

// ----- Persistence: local fallback -----
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seats));
  if (mySeat) localStorage.setItem(MY_SEAT_KEY, String(mySeat));
  else localStorage.removeItem(MY_SEAT_KEY);
}

// ----- API client -----
async function apiGetSeats() {
  const res = await fetch(API_URL, { method: "GET" });
  if (!res.ok) throw new Error(`GET ${res.status}`);
  return await res.json();
}
async function apiPostSeat(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST ${res.status}`);
  return await res.json();
}

function setSyncStatus(online) {
  const ind = document.getElementById("syncIndicator");
  if (!ind) return;
  ind.classList.toggle("offline", !online);
  ind.querySelector(".sync-label").textContent = online ? "Live" : "Local";
}

// ----- Card rendering -----
function buildCardFace(card) {
  const colorClass = card.suit.color === "red" ? "red" : "";
  return `
    <div class="card-back"></div>
    <div class="card-face ${colorClass}">
      <span class="corner-tl">${card.rank}<span>${card.suit.sym}</span></span>
      <span class="center-suit">${card.suit.sym}</span>
      <span class="corner-br">${card.rank}<span>${card.suit.sym}</span></span>
    </div>`;
}

// ----- Seat rendering -----
function renderSeats() {
  document.querySelectorAll(".seat").forEach(seatEl => {
    const seatNum = parseInt(seatEl.dataset.seat, 10);
    const data = seats[seatNum];
    const chairName = seatEl.querySelector(".chair-name");
    const holeCards = seatEl.querySelectorAll(".hole-card");

    seatEl.classList.remove("taken", "mine");

    if (data) {
      seatEl.classList.add("taken");
      chairName.textContent = data.name;

      const isMe = data.playerId === playerId || seatNum === mySeat;
      if (isMe) seatEl.classList.add("mine");

      holeCards.forEach((hc, idx) => {
        const card = data.cards?.[idx];
        if (!card) return;
        const wasFlipped = hc.classList.contains("flipped");
        hc.innerHTML = buildCardFace(card);
        if (!wasFlipped) {
          setTimeout(() => hc.classList.add("flipped"), 150 + idx * 120);
        } else {
          hc.classList.add("flipped");
        }
      });
    } else {
      chairName.textContent = "Open Seat";
      holeCards.forEach(hc => {
        hc.classList.remove("flipped");
        hc.innerHTML = `<div class="card-back"></div>`;
      });
    }
  });
  renderRoster();
}

function renderRoster() {
  const ol = document.getElementById("roster");
  const empty = document.getElementById("rosterEmpty");
  if (!ol || !empty) return;

  const entries = Object.entries(seats)
    .map(([n, d]) => ({ seatNum: parseInt(n, 10), ...d }))
    .sort((a, b) => a.seatNum - b.seatNum);

  if (entries.length === 0) {
    empty.classList.remove("hidden");
    ol.innerHTML = "";
    return;
  }
  empty.classList.add("hidden");

  const suits = ["♠", "♥", "♣", "♦"];
  ol.innerHTML = entries.map((e, i) => {
    const mine = e.playerId === playerId || e.seatNum === mySeat;
    return `
      <li class="roster-item ${mine ? "mine" : ""}">
        <span class="roster-seat">${e.seatNum}</span>
        <span class="roster-name">${escapeHTML(e.name)}</span>
        <span class="roster-suit">${suits[i % 4]}</span>
      </li>`;
  }).join("");
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

// ----- Sync -----
async function syncFromServer() {
  if (!useRemote || modalOpen) return;
  try {
    const remote = await apiGetSeats();
    const localJson = JSON.stringify(seats);
    const remoteJson = JSON.stringify(remote);
    if (localJson !== remoteJson) {
      seats = remote;
      // Reconcile mySeat: if my playerId is on a seat, that's mine
      const mineEntry = Object.entries(seats).find(([, v]) => v.playerId === playerId);
      mySeat = mineEntry ? parseInt(mineEntry[0], 10) : 0;
      saveLocal();
      renderSeats();
    }
    setSyncStatus(true);
  } catch {
    useRemote = false;
    setSyncStatus(false);
    // Switch to local-only mode
    seats = loadLocal();
    renderSeats();
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(syncFromServer, POLL_MS);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ----- Seat claiming -----
function openSeatModal(seatNum) {
  pendingSeat = seatNum;
  modalOpen = true;
  document.getElementById("modalSeatNum").textContent = seatNum;
  const input = document.getElementById("nameInput");

  if (seats[seatNum]) {
    if (seats[seatNum].playerId === playerId) {
      input.value = seats[seatNum].name;
    } else {
      input.value = "";
      input.placeholder = `Currently: ${seats[seatNum].name}`;
    }
  } else {
    input.value = "";
    input.placeholder = "Your name...";
  }

  document.getElementById("seatModal").classList.add("open");
  setTimeout(() => input.focus(), 100);
}

function closeSeatModal() {
  document.getElementById("seatModal").classList.remove("open");
  pendingSeat = 0;
  modalOpen = false;
}

async function confirmSeat() {
  const name = document.getElementById("nameInput").value.trim();
  if (!name) {
    document.getElementById("nameInput").focus();
    return;
  }
  if (!pendingSeat) return;

  const previousSeat = mySeat && mySeat !== pendingSeat ? mySeat : 0;
  const cards = [drawCard(), drawCard()];
  const newEntry = { name, cards, playerId, claimedAt: Date.now() };

  // Optimistic local update
  if (previousSeat) delete seats[previousSeat];
  seats[pendingSeat] = newEntry;
  const claimedSeat = pendingSeat;
  mySeat = claimedSeat;
  saveLocal();
  renderSeats();
  burstConfetti();
  closeSeatModal();

  // Push to server
  if (useRemote) {
    try {
      const updated = await apiPostSeat({
        seatNum: claimedSeat,
        name,
        cards,
        playerId,
        previousSeat: previousSeat || undefined,
      });
      seats = updated;
      // Reconcile mySeat from server response
      const mineEntry = Object.entries(seats).find(([, v]) => v.playerId === playerId);
      mySeat = mineEntry ? parseInt(mineEntry[0], 10) : claimedSeat;
      saveLocal();
      renderSeats();
      setSyncStatus(true);
    } catch {
      useRemote = false;
      setSyncStatus(false);
    }
  }

  setTimeout(() => showReveal(claimedSeat), 900);
}

// ----- Reveal modal -----
function showReveal(seatNum) {
  const data = seats[seatNum];
  if (!data) return;

  modalOpen = true;
  document.getElementById("revealName").textContent = `${data.name} — Seat ${seatNum}`;
  const cardsWrap = document.getElementById("revealCards");
  cardsWrap.innerHTML = "";

  data.cards.forEach((card, idx) => {
    const el = document.createElement("div");
    el.className = "card community";
    el.innerHTML = buildCardFace(card);
    cardsWrap.appendChild(el);
    setTimeout(() => el.classList.add("flipped"), 250 + idx * 250);
  });

  document.getElementById("handRank").textContent = describeHand(data.cards);
  document.getElementById("revealModal").classList.add("open");
}

function describeHand(cards) {
  const [a, b] = cards;
  if (a.rank === b.rank) return `♠ Pocket ${a.rank}s — A premium hand`;
  if (a.suit.name === b.suit.name) return `♥ Suited ${a.rank}-${b.rank} — Flush potential`;
  const isHigh = c => ["A","K","Q","J","10"].includes(c.rank);
  if (isHigh(a) && isHigh(b)) return `♦ ${a.rank}-${b.rank} offsuit — High cards`;
  return `♣ ${a.rank}-${b.rank} — Play your luck`;
}

// ----- Community cards -----
function dealCommunity() {
  const cards = document.querySelectorAll(".community");
  const btn = document.getElementById("dealBtn");

  if (communityRevealed === 0) {
    communityCards = [];
    for (let i = 0; i < 3; i++) {
      const card = drawCard();
      communityCards.push(card);
      cards[i].innerHTML = buildCardFace(card);
      setTimeout(() => cards[i].classList.add("flipped"), 100 + i * 200);
    }
    communityRevealed = 3;
    btn.textContent = "Deal the Turn";
  } else if (communityRevealed === 3) {
    const card = drawCard();
    communityCards.push(card);
    cards[3].innerHTML = buildCardFace(card);
    setTimeout(() => cards[3].classList.add("flipped"), 100);
    communityRevealed = 4;
    btn.textContent = "Deal the River";
  } else if (communityRevealed === 4) {
    const card = drawCard();
    communityCards.push(card);
    cards[4].innerHTML = buildCardFace(card);
    setTimeout(() => cards[4].classList.add("flipped"), 100);
    communityRevealed = 5;
    btn.textContent = "Reshuffle";
    setTimeout(showShowdown, 1300);
  } else {
    cards.forEach(c => {
      c.classList.remove("flipped");
      c.innerHTML = `<div class="card-back"></div>`;
    });
    communityRevealed = 0;
    communityCards = [];
    deck = freshDeck();
    btn.textContent = "Deal the Flop";
  }
}

// ===================== Poker hand evaluation =====================
const RANK_VAL = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };
const RANK_WORD = { 2:"Two",3:"Three",4:"Four",5:"Five",6:"Six",7:"Seven",8:"Eight",9:"Nine",10:"Ten",11:"Jack",12:"Queen",13:"King",14:"Ace" };
function rankPlural(v) {
  const w = RANK_WORD[v];
  if (v === 6) return "Sixes";
  return w + "s";
}

function combinations5of7(arr) {
  // 21 combinations of 5 from 7
  const result = [];
  const n = arr.length;
  for (let a = 0; a < n - 4; a++)
   for (let b = a+1; b < n - 3; b++)
    for (let c = b+1; c < n - 2; c++)
     for (let d = c+1; d < n - 1; d++)
      for (let e = d+1; e < n; e++)
        result.push([arr[a], arr[b], arr[c], arr[d], arr[e]]);
  return result;
}

function scoreFive(five) {
  const values = five.map(c => RANK_VAL[c.rank]).sort((a, b) => b - a);
  const suits = five.map(c => c.suit.name);
  const flush = suits.every(s => s === suits[0]);

  // Straight detection (incl. wheel A-2-3-4-5)
  const unique = [...new Set(values)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) straightHigh = 5;
  }
  const straight = straightHigh > 0;

  // Group by count
  const counts = {};
  values.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: +v, count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  if (flush && straightHigh === 14) return { rank: 9, name: "Royal Flush",     kickers: [14] };
  if (flush && straight)             return { rank: 8, name: "Straight Flush",  kickers: [straightHigh] };
  if (groups[0].count === 4)         return { rank: 7, name: `Four ${rankPlural(groups[0].value)}`, kickers: [groups[0].value, groups[1]?.value || 0] };
  if (groups[0].count === 3 && groups[1]?.count >= 2)
                                     return { rank: 6, name: `Full House, ${rankPlural(groups[0].value)} over ${rankPlural(groups[1].value)}`, kickers: [groups[0].value, groups[1].value] };
  if (flush)                         return { rank: 5, name: "Flush",          kickers: values };
  if (straight)                      return { rank: 4, name: straightHigh === 5 ? "Straight, Wheel" : `Straight to the ${RANK_WORD[straightHigh]}`, kickers: [straightHigh] };
  if (groups[0].count === 3)         return { rank: 3, name: `Three ${rankPlural(groups[0].value)}`, kickers: [groups[0].value, ...values.filter(v => v !== groups[0].value)] };
  if (groups[0].count === 2 && groups[1]?.count === 2)
                                     return { rank: 2, name: `Two Pair, ${rankPlural(groups[0].value)} and ${rankPlural(groups[1].value)}`, kickers: [groups[0].value, groups[1].value, groups[2].value] };
  if (groups[0].count === 2)         return { rank: 1, name: `Pair of ${rankPlural(groups[0].value)}`, kickers: [groups[0].value, ...values.filter(v => v !== groups[0].value)] };
  return                                    { rank: 0, name: `${RANK_WORD[values[0]]} High`, kickers: values };
}

function bestHand(sevenCards) {
  let best = null;
  for (const combo of combinations5of7(sevenCards)) {
    const s = scoreFive(combo);
    if (!best || compareScore(s, best) > 0) best = { ...s, cards: combo };
  }
  return best;
}

function compareScore(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const len = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < len; i++) {
    const av = a.kickers[i] || 0;
    const bv = b.kickers[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// ===================== Showdown =====================
function showShowdown() {
  if (communityCards.length !== 5) return;

  const players = Object.entries(seats).map(([n, d]) => ({
    seatNum: parseInt(n, 10),
    name: d.name,
    cards: d.cards,
    playerId: d.playerId,
  }));

  const box = document.getElementById("showdownBox");
  const banner = document.getElementById("showdownBanner");
  const winnerHand = document.getElementById("winnerHand");
  const winnerName = document.getElementById("winnerName");
  const winnerCards = document.getElementById("winnerCards");
  const winnerUsing = document.getElementById("winnerUsing");
  const listEl = document.getElementById("showdownList");

  box.classList.remove("royal", "premium");

  // If no players are seated, show the board's best hand
  if (players.length === 0) {
    const score = scoreFive(communityCards);
    banner.textContent = "The Board";
    winnerHand.textContent = score.name;
    winnerName.textContent = "Community cards only";
    winnerUsing.textContent = "Pull up a seat to play next round";
    renderShowdownCards(winnerCards, communityCards);
    listEl.innerHTML = "";
    if (score.rank === 9) box.classList.add("royal");
    else if (score.rank >= 7) box.classList.add("premium");
    openShowdownModal();
    return;
  }

  // Evaluate each player
  const evaluated = players.map(p => ({
    ...p,
    best: bestHand([...p.cards, ...communityCards]),
  }));
  evaluated.sort((a, b) => compareScore(b.best, a.best));

  const top = evaluated[0];
  const ties = evaluated.filter(p => compareScore(p.best, top.best) === 0);

  banner.textContent = top.best.rank === 9 ? "Royal Flush!" : "The Showdown";
  winnerHand.textContent = top.best.name;
  winnerName.textContent = ties.length > 1
    ? `Split pot: ${ties.map(t => `${t.name} (Seat ${t.seatNum})`).join(", ")}`
    : `${top.name} — Seat ${top.seatNum}`;
  renderShowdownCards(winnerCards, top.best.cards);
  winnerUsing.textContent = `Using ${countHoleCardsUsed(top)} of ${top.name}'s hole cards`;

  // Other players list
  const others = evaluated.slice(ties.length);
  listEl.innerHTML = others.map((p, i) => `
    <li class="showdown-item">
      <span class="showdown-rank">#${i + 1 + ties.length}</span>
      <span class="showdown-name">${escapeHTML(p.name)} <span style="opacity:0.55;font-size:0.78em">· Seat ${p.seatNum}</span></span>
      <span class="showdown-hand">${escapeHTML(p.best.name)}</span>
    </li>
  `).join("");

  if (top.best.rank === 9) box.classList.add("royal");
  else if (top.best.rank >= 6) box.classList.add("premium");

  openShowdownModal();

  // Celebration for premium hands
  if (top.best.rank >= 6) {
    burstConfetti();
    if (top.best.rank === 9) {
      setTimeout(burstConfetti, 600);
      setTimeout(burstConfetti, 1200);
    }
  }
}

function countHoleCardsUsed(player) {
  const holeSet = new Set(player.cards.map(c => `${c.rank}-${c.suit.name}`));
  const used = player.best.cards.filter(c => holeSet.has(`${c.rank}-${c.suit.name}`)).length;
  return used;
}

function renderShowdownCards(wrap, cards) {
  wrap.innerHTML = "";
  cards.forEach((card, idx) => {
    const el = document.createElement("div");
    el.className = "card community";
    el.innerHTML = buildCardFace(card);
    wrap.appendChild(el);
    setTimeout(() => el.classList.add("flipped"), 200 + idx * 150);
  });
}

function openShowdownModal() {
  modalOpen = true;
  document.getElementById("showdownModal").classList.add("open");
}

function closeShowdownModal() {
  document.getElementById("showdownModal").classList.remove("open");
  modalOpen = false;
}

// ----- Confetti (gold-heavy) -----
function burstConfetti() {
  const palette = [
    { color: "#d4af37", weight: 5, class: "gold" },
    { color: "#f5d76e", weight: 4, class: "gold" },
    { color: "#fff2c0", weight: 3, class: "gold" },
    { color: "#c8102e", weight: 2, class: "" },
    { color: "#0a0a0a", weight: 2, class: "" },
    { color: "#f4e4c1", weight: 1, class: "" },
  ];
  const pool = [];
  palette.forEach(p => {
    for (let i = 0; i < p.weight; i++) pool.push(p);
  });

  const count = isPhone ? 45 : 80;
  for (let i = 0; i < count; i++) {
    const c = document.createElement("div");
    const p = pool[Math.floor(Math.random() * pool.length)];
    c.className = `confetti ${p.class}`;
    if (!p.class) c.style.background = p.color;

    const angle = Math.random() * Math.PI * 2;
    const dist = 200 + Math.random() * 360;
    c.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    c.style.setProperty("--dy", `${Math.sin(angle) * dist + 250}px`);
    c.style.setProperty("--dur", `${1.6 + Math.random() * 1.4}s`);
    c.style.animationDelay = `${Math.random() * 0.3}s`;

    // Random starting offset around the screen center
    c.style.top = `${48 + Math.random() * 4}%`;
    c.style.left = `${48 + Math.random() * 4}%`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3500);
  }

  // A burst of slow golden stars rising
  const starCount = isPhone ? 10 : 18;
  for (let i = 0; i < starCount; i++) {
    const s = document.createElement("div");
    s.className = "confetti star";
    const dx = (Math.random() - 0.5) * 400;
    s.style.setProperty("--dx", `${dx}px`);
    s.style.setProperty("--dy", `${-300 - Math.random() * 200}px`);
    s.style.setProperty("--dur", `${2 + Math.random() * 1.5}s`);
    s.style.animationDelay = `${Math.random() * 0.4}s`;
    s.style.top = `${50 + Math.random() * 6}%`;
    s.style.left = `${48 + Math.random() * 4}%`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 3800);
  }
}

// ===================== Balloons =====================
const BALLOON_COLORS = ["red", "black"];
const isPhone = matchMedia("(max-width: 700px)").matches;
const BALLOON_POSITIONS = isPhone
  ? [10, 28, 46, 66, 86]
  : [6, 16, 27, 38, 49, 60, 71, 82, 93];

function balloonSVG(color) {
  const grad = color === "red" ? "grad-balloon-red" : "grad-balloon-black";
  const knot = color === "red" ? "#3d0710" : "#000";
  return `
    <svg viewBox="0 0 80 140" class="balloon-svg" aria-hidden="true">
      <ellipse cx="40" cy="48" rx="32" ry="42" fill="url(#${grad})"/>
      <ellipse cx="29" cy="32" rx="9" ry="13" fill="url(#grad-balloon-highlight)" opacity="0.85"/>
      <ellipse cx="32" cy="24" rx="2.5" ry="3.5" fill="#ffffff" opacity="0.9"/>
      <ellipse cx="50" cy="62" rx="6" ry="3" fill="rgba(0,0,0,0.18)"/>
      <path d="M34 88 Q40 96 46 88 L43 92 L40 96 L37 92 Z" fill="${knot}"/>
      <path d="M40 96 Q46 108 36 118 Q30 125 42 134"
            stroke="#d4af37" stroke-width="1.3" fill="none"
            stroke-linecap="round" opacity="0.8"/>
    </svg>`;
}

function createBalloon(color, opts = {}) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `balloon balloon-${color}`;
  el.setAttribute("aria-label", "Pop balloon");
  el.dataset.color = color;

  const x      = opts.x      ?? (5 + Math.random() * 90);
  const dur    = opts.dur    ?? (22 + Math.random() * 12);
  const delay  = opts.delay  ?? 0;
  const drift  = opts.drift  ?? ((Math.random() - 0.5) * 90);
  const bobDur = 1.8 + Math.random() * 1.6;
  const bobDel = -Math.random() * 2;

  el.style.setProperty("--x",         `${x}%`);
  el.style.setProperty("--dur",       `${dur}s`);
  el.style.setProperty("--delay",     `${delay}s`);
  el.style.setProperty("--drift",     `${drift}px`);
  el.style.setProperty("--bob-dur",   `${bobDur}s`);
  el.style.setProperty("--bob-delay", `${bobDel}s`);

  el.innerHTML = `
    <div class="balloon-shift">
      <div class="balloon-bob">${balloonSVG(color)}</div>
    </div>`;

  el.addEventListener("click", () => popBalloon(el));
  return el;
}

function popBalloon(el) {
  if (el.classList.contains("popped")) return;
  el.classList.add("popped");

  const svg = el.querySelector(".balloon-svg");
  const r = svg.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top  + r.height / 2;
  const color = el.dataset.color;

  spawnPopShards(cx, cy, color);
  spawnPopGlitter(cx, cy);

  setTimeout(() => {
    el.remove();
    // Respawn so the air always has balloons
    setTimeout(() => {
      const container = document.getElementById("balloons");
      if (!container) return;
      const newColor = BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];
      container.appendChild(createBalloon(newColor, {
        x: 5 + Math.random() * 90,
        dur: 22 + Math.random() * 12,
        delay: 0,
        drift: (Math.random() - 0.5) * 90,
      }));
    }, 1200 + Math.random() * 1800);
  }, 600);
}

function spawnPopShards(x, y, color) {
  const palette = color === "red"
    ? ["#ff506a", "#c8102e", "#5e0712", "#ffbbc6", "#8b0a1f"]
    : ["#3a3a3a", "#1a1a1a", "#000",    "#555",    "#0f0f0f"];

  const count = isPhone ? 10 : 16;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "balloon-shard";
    s.style.left = `${x}px`;
    s.style.top  = `${y}px`;
    s.style.background = palette[i % palette.length];
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const dist  = 90 + Math.random() * 140;
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist + 120}px`);
    s.style.setProperty("--dur", `${0.9 + Math.random() * 0.6}s`);
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1800);
  }
}

function spawnPopGlitter(x, y) {
  const count = isPhone ? 8 : 14;
  for (let i = 0; i < count; i++) {
    const g = document.createElement("div");
    g.className = "balloon-glitter";
    g.style.left = `${x}px`;
    g.style.top  = `${y}px`;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 50 + Math.random() * 110;
    g.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    g.style.setProperty("--dy", `${Math.sin(angle) * dist - 30}px`);
    g.style.setProperty("--dur", `${1.0 + Math.random() * 0.9}s`);
    document.body.appendChild(g);
    setTimeout(() => g.remove(), 2100);
  }
}

function initBalloons() {
  const container = document.getElementById("balloons");
  if (!container) return;
  BALLOON_POSITIONS.forEach((x, i) => {
    const color = BALLOON_COLORS[i % 2];
    const dur   = 22 + Math.random() * 12;
    const delay = -Math.random() * dur;
    const drift = (Math.random() - 0.5) * 90;
    container.appendChild(createBalloon(color, { x, dur, delay, drift }));
  });
}

function initBalloonInteraction() {
  if (matchMedia("(hover: none)").matches) return; // skip on touch-only devices

  let mouseX = -9999, mouseY = -9999;
  let lastMove = 0;
  let raf = null;

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    lastMove = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });

  function loop() {
    const recent = performance.now() - lastMove < 700;
    const balloons = document.querySelectorAll(".balloon:not(.popped)");
    let anyShifted = false;

    balloons.forEach(b => {
      const shift = b.firstElementChild;
      if (!shift) return;
      const r = b.getBoundingClientRect();
      if (r.width === 0) return;
      const bx = r.left + r.width / 2;
      const by = r.top  + r.height / 2;
      const dx = bx - mouseX;
      const dy = by - mouseY;
      const dist = Math.hypot(dx, dy);

      if (recent && dist < 150 && dist > 0) {
        const force = (150 - dist) / 150;
        const nx = (dx / dist) * force * 32;
        const ny = (dy / dist) * force * 32;
        shift.style.transform = `translate(${nx}px, ${ny}px)`;
        anyShifted = true;
      } else if (shift.style.transform) {
        shift.style.transform = "";
      }
    });

    if (recent || anyShifted) {
      raf = requestAnimationFrame(loop);
    } else {
      raf = null;
    }
  }
}

// ----- Wire up -----
document.addEventListener("DOMContentLoaded", async () => {
  initBalloons();
  // Initial load
  seats = loadLocal();
  renderSeats();

  // Try remote
  try {
    seats = await apiGetSeats();
    const mineEntry = Object.entries(seats).find(([, v]) => v.playerId === playerId);
    mySeat = mineEntry ? parseInt(mineEntry[0], 10) : 0;
    saveLocal();
    renderSeats();
    setSyncStatus(true);
    startPolling();
  } catch {
    useRemote = false;
    setSyncStatus(false);
  }

  // Pause polling when tab hidden, resume when visible
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPolling();
    else if (useRemote) { syncFromServer(); startPolling(); }
  });

  document.querySelectorAll(".seat .chair").forEach(btn => {
    btn.addEventListener("click", () => {
      const seatEl = btn.closest(".seat");
      const seatNum = parseInt(seatEl.dataset.seat, 10);
      if (seats[seatNum]?.playerId === playerId) {
        showReveal(seatNum);
        return;
      }
      openSeatModal(seatNum);
    });
  });

  document.getElementById("confirmBtn").addEventListener("click", confirmSeat);
  document.getElementById("cancelBtn").addEventListener("click", closeSeatModal);
  document.getElementById("nameInput").addEventListener("keydown", e => {
    if (e.key === "Enter") confirmSeat();
    if (e.key === "Escape") closeSeatModal();
  });
  document.querySelector("#seatModal .modal-backdrop").addEventListener("click", closeSeatModal);

  document.getElementById("dealBtn").addEventListener("click", dealCommunity);

  document.getElementById("revealClose").addEventListener("click", () => {
    document.getElementById("revealModal").classList.remove("open");
    modalOpen = false;
  });
  document.querySelector("#revealModal .modal-backdrop").addEventListener("click", () => {
    document.getElementById("revealModal").classList.remove("open");
    modalOpen = false;
  });

  document.getElementById("showdownClose").addEventListener("click", closeShowdownModal);
  document.querySelector("#showdownModal .modal-backdrop").addEventListener("click", closeShowdownModal);
});
