/* ==========================================================================
   デジピック（Starfield のロックピッキング）

   同心円状のリングには 32 個のスロットが並び、そのうち何個かが「くぼみ」
   （＝埋めるべき穴）になっている。手持ちの鍵は歯の並びが固定されていて、
   回転させて歯をすべてくぼみに合わせたときだけ差し込める。差し込むと
   その歯の位置が埋まり、いちばん外側のリングのくぼみを埋め切ると解除、
   1 つ内側のリングへ進む。

   鍵はちょうど必要な本数だけ配られる。つまり 1 本でも間違ったリング・
   間違った位置で使うと、最後に埋められない穴が残って詰む。

   出題は「各リングの円周を鍵の本数ぶんの扇形に分け、その中に歯を散らして
   くぼみを作る」方式なので、生成した時点の配置がそのまま解になり必ず解ける。
   差し込むたびにバックトラック探索で残りが解けるか確認して詰みを知らせる。
   ========================================================================== */

(function () {
  "use strict";

  /* --- 定数 --------------------------------------------------------------- */

  const SLOTS = 32;               // リング 1 周のスロット数
  const STEP = 360 / SLOTS;       // スロット 1 つ分の角度

  const LEVELS = [
    { id: "novice", label: "初級", keysPerRing: [2, 2] },
    { id: "advanced", label: "中級", keysPerRing: [2, 2, 2] },
    { id: "expert", label: "上級", keysPerRing: [2, 3, 2, 2] },
    { id: "master", label: "達人", keysPerRing: [3, 3, 3, 3] },
  ];

  const KEY_COLORS = [
    "#ffd34d", "#5ad48a", "#4da3ff", "#ff7ad9",
    "#9b7bff", "#3fd0c9", "#ff8a5c", "#c9e34d",
    "#5ce1e6", "#e65c9c", "#8cff5c", "#f2b25c",
  ];

  const STORAGE_KEY = "puzzles:digipick:best";
  const SOLVER_LIMIT = 400000;    // 探索ノードの上限（固まらないための保険）

  /* --- ユーティリティ ------------------------------------------------------ */

  function randInt(n) {
    return Math.floor(Math.random() * n);
  }

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function range(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(i);
    return arr;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  /* --- 問題の生成 ---------------------------------------------------------- */

  /** total スロットを parts 個の扇形に分け、それぞれの長さを返す。 */
  function splitLengths(total, parts) {
    const MIN = 6;
    const lens = [];
    let rest = total;
    for (let i = 0; i < parts; i++) {
      const left = parts - i;
      if (left === 1) {
        lens.push(rest);
        break;
      }
      const avg = Math.floor(rest / left);
      const max = rest - MIN * (left - 1);
      let len = avg - 1 + randInt(3);
      len = Math.max(MIN, Math.min(len, max));
      lens.push(len);
      rest -= len;
    }
    return lens;
  }

  /**
   * 錠前を作る。リングごとに円周を鍵の本数ぶんの扇形へ分割し、
   * 各扇形の中に歯を散らしてくぼみを作る。扇形どうしは重ならないので、
   * 「生成時の配置」がそのまま 1 つの解になる。
   */
  function generateLock(level) {
    const rings = [];
    const keys = [];

    level.keysPerRing.forEach((keyCount, ringIndex) => {
      const open = new Array(SLOTS).fill(false);
      let cursor = randInt(SLOTS);

      for (const len of splitLengths(SLOTS, keyCount)) {
        const maxTeeth = len >= 12 ? 5 : 4;
        const teethCount = 2 + randInt(maxTeeth - 1);
        const picks = shuffle(range(len)).slice(0, teethCount).sort((a, b) => a - b);
        const teeth = picks.map((p) => p - picks[0]);
        const rotation = (cursor + picks[0]) % SLOTS;
        for (const t of teeth) open[(rotation + t) % SLOTS] = true;
        keys.push({ teeth: teeth });
        cursor = (cursor + len) % SLOTS;
      }

      rings.push({ open: open, filled: new Array(SLOTS).fill(null) });
    });

    const bag = shuffle(keys);
    bag.forEach((key, i) => {
      key.id = i;
      key.color = KEY_COLORS[i % KEY_COLORS.length];
      key.rotation = randInt(SLOTS);
      key.placed = null;
    });

    return { rings: rings, keys: bag };
  }

  /* --- 盤面の判定 ---------------------------------------------------------- */

  /** 歯がすべて「未使用のくぼみ」に乗るか。 */
  function fitsAt(ring, teeth, rotation) {
    for (const t of teeth) {
      const s = (rotation + t) % SLOTS;
      if (!ring.open[s] || ring.filled[s] !== null) return false;
    }
    return true;
  }

  function firstOpenSlot(open, filled) {
    for (let s = 0; s < SLOTS; s++) {
      if (open[s] && !filled[s]) return s;
    }
    return -1;
  }

  /**
   * 残りの鍵で残りのリングを埋め切れるか、バックトラックで調べる。
   * 「いちばん外側の未解除リングの、いちばん若い空きくぼみ」を必ず覆う
   * 置き方だけを試すので、分岐は歯の本数ぶんに抑えられる。
   */
  function solveRemaining(rings, keys) {
    const work = rings.map((r) => ({
      open: r.open,
      filled: r.filled.map((v) => v !== null),
    }));
    const pool = keys.filter((k) => !k.placed).map((k) => ({ id: k.id, teeth: k.teeth }));
    const used = new Array(pool.length).fill(false);
    const placements = [];
    let nodes = 0;
    let aborted = false;

    function activeIndex() {
      for (let i = 0; i < work.length; i++) {
        if (firstOpenSlot(work[i].open, work[i].filled) >= 0) return i;
      }
      return -1;
    }

    function canPlace(ring, teeth, rotation) {
      for (const t of teeth) {
        const s = (rotation + t) % SLOTS;
        if (!ring.open[s] || ring.filled[s]) return false;
      }
      return true;
    }

    function rec() {
      if (aborted) return false;
      if (++nodes > SOLVER_LIMIT) {
        aborted = true;
        return false;
      }
      const ri = activeIndex();
      if (ri < 0) return true;

      const ring = work[ri];
      const target = firstOpenSlot(ring.open, ring.filled);

      for (let i = 0; i < pool.length; i++) {
        if (used[i]) continue;
        const teeth = pool[i].teeth;
        const tried = new Set();
        for (const t of teeth) {
          const rotation = (target - t + SLOTS) % SLOTS;
          if (tried.has(rotation)) continue;
          tried.add(rotation);
          if (!canPlace(ring, teeth, rotation)) continue;

          for (const tt of teeth) ring.filled[(rotation + tt) % SLOTS] = true;
          used[i] = true;
          placements.push({ keyId: pool[i].id, ring: ri, rotation: rotation });

          if (rec()) return true;

          placements.pop();
          used[i] = false;
          for (const tt of teeth) ring.filled[(rotation + tt) % SLOTS] = false;
        }
      }
      return false;
    }

    const solved = rec();
    return { solved: solved, aborted: aborted, placements: placements };
  }

  /* --- SVG 用のパス --------------------------------------------------------- */

  function f(n) {
    return n.toFixed(2);
  }

  function polar(r, deg) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [r * Math.cos(rad), r * Math.sin(rad)];
  }

  /** 角度 a0→a1 の円弧帯（外半径 rOut / 内半径 rIn）。 */
  function arcPath(rOut, rIn, a0, a1) {
    const o0 = polar(rOut, a0);
    const o1 = polar(rOut, a1);
    const i1 = polar(rIn, a1);
    const i0 = polar(rIn, a0);
    const large = a1 - a0 > 180 ? 1 : 0;
    return (
      "M" + f(o0[0]) + " " + f(o0[1]) +
      "A" + f(rOut) + " " + f(rOut) + " 0 " + large + " 1 " + f(o1[0]) + " " + f(o1[1]) +
      "L" + f(i1[0]) + " " + f(i1[1]) +
      "A" + f(rIn) + " " + f(rIn) + " 0 " + large + " 0 " + f(i0[0]) + " " + f(i0[1]) + "Z"
    );
  }

  /** スロット 1 つぶんの円弧帯。pad はスロット同士の隙間（度）。 */
  function slotPath(rOut, rIn, index, pad) {
    const p = pad === undefined ? 0.9 : pad;
    return arcPath(rOut, rIn, index * STEP + p, (index + 1) * STEP - p);
  }

  /** ドーナツ形（fill-rule="evenodd" で中央を抜く）。 */
  function annulusPath(rOut, rIn) {
    return (
      "M" + f(-rOut) + " 0A" + f(rOut) + " " + f(rOut) + " 0 1 1 " + f(rOut) + " 0" +
      "A" + f(rOut) + " " + f(rOut) + " 0 1 1 " + f(-rOut) + " 0Z" +
      "M" + f(-rIn) + " 0A" + f(rIn) + " " + f(rIn) + " 0 1 0 " + f(rIn) + " 0" +
      "A" + f(rIn) + " " + f(rIn) + " 0 1 0 " + f(-rIn) + " 0Z"
    );
  }

  /** リング本数に応じた半径。リング 0 がいちばん外側。 */
  function ringGeometry(count) {
    const R_OUT = 94;
    const R_MIN = 26;
    const GAP = 5;
    const MAX_BAND = 24;
    const band = Math.min(MAX_BAND, (R_OUT - R_MIN - GAP * (count - 1)) / count);
    const bands = [];
    for (let i = 0; i < count; i++) {
      const outer = R_OUT - i * (band + GAP);
      bands.push({ outer: outer, inner: outer - band });
    }
    return { bands: bands, core: bands[count - 1].inner - 6 };
  }

  /* --- 状態 ---------------------------------------------------------------- */

  const lockEl = document.getElementById("lock");
  const trayEl = document.getElementById("tray");
  const messageEl = document.getElementById("message");
  const levelSegEl = document.getElementById("level-seg");
  const keysLeftEl = document.getElementById("keys-left");
  const ringsLeftEl = document.getElementById("rings-left");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const undoBtn = document.getElementById("undo");
  const hintBtn = document.getElementById("hint");
  const insertBtn = document.getElementById("insert");

  let level = LEVELS[0];
  let rings = [];
  let keys = [];
  let selectedKeyId = null;
  let hintedKeyId = null;
  let history = [];
  let cleared = false;
  let stuck = false;
  let hintsUsed = 0;
  let elapsed = 0;
  let timerId = null;
  let drag = null;

  function keyById(id) {
    return keys.find((k) => k.id === id) || null;
  }

  function selectedKey() {
    return selectedKeyId === null ? null : keyById(selectedKeyId);
  }

  function ringSolved(ring) {
    return firstOpenSlot(ring.open, ring.filled.map((v) => v !== null)) < 0;
  }

  /** いちばん外側の未解除リング。すべて解除済みなら -1。 */
  function activeRingIndex() {
    for (let i = 0; i < rings.length; i++) {
      if (!ringSolved(rings[i])) return i;
    }
    return -1;
  }

  function remainingKeys() {
    return keys.filter((k) => !k.placed);
  }

  /* --- 記録 ---------------------------------------------------------------- */

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveBest(record) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch (e) {
      /* 保存できなくても遊べるので無視する */
    }
  }

  function renderBest() {
    const best = loadBest()[level.id];
    bestEl.textContent = typeof best === "number" ? formatTime(best) : "—";
  }

  /* --- タイマー ------------------------------------------------------------ */

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    elapsed = 0;
    timeEl.textContent = formatTime(0);
    timerId = setInterval(() => {
      elapsed++;
      timeEl.textContent = formatTime(elapsed);
    }, 1000);
  }

  /* --- 描画 ---------------------------------------------------------------- */

  function renderLock() {
    const geo = ringGeometry(rings.length);
    const active = activeRingIndex();
    const parts = [];

    rings.forEach((ring, i) => {
      const band = geo.bands[i];
      const solved = ringSolved(ring);
      const cls =
        "dg-ring-base" + (solved ? " solved" : "") + (i === active ? " active" : "");
      parts.push(
        '<path class="' + cls + '" fill-rule="evenodd" d="' +
          annulusPath(band.outer, band.inner) + '"/>'
      );

      for (let s = 0; s < SLOTS; s++) {
        if (!ring.open[s]) continue;
        const d = slotPath(band.outer - 1.5, band.inner + 1.5, s);
        const holder = ring.filled[s];
        if (holder === null) {
          parts.push('<path class="dg-slot" d="' + d + '"/>');
        } else {
          const key = keyById(holder);
          // CSS の .dg-slot { fill } に負けないよう style 属性で色を指定する
          parts.push(
            '<path class="dg-slot filled" style="fill:' + key.color + '" d="' + d + '"/>'
          );
        }
      }
    });

    // 中心のハブ（残りの鍵の本数を出す）
    const core = geo.core;
    parts.push(
      '<circle class="dg-core' + (cleared ? " cleared" : "") +
        '" cx="0" cy="0" r="' + f(core) + '"/>'
    );
    if (cleared) {
      parts.push(
        '<text class="dg-core-num cleared" x="0" y="4" text-anchor="middle" font-size="' +
          f(Math.min(20, core * 0.62)) + '">OPEN</text>'
      );
    } else {
      parts.push(
        '<text class="dg-core-num" x="0" y="1" text-anchor="middle" font-size="' +
          f(Math.min(20, core * 0.72)) + '">' + remainingKeys().length + "</text>"
      );
      parts.push(
        '<text class="dg-core-label" x="0" y="' + f(Math.min(20, core * 0.72) * 0.72 + 2) +
          '" text-anchor="middle" font-size="' + f(Math.min(9, core * 0.32)) + '">KEYS</text>'
      );
    }

    // 選択中の鍵のプレビュー
    const key = selectedKey();
    if (key && !key.placed && active >= 0 && !cleared) {
      const band = geo.bands[active];
      const ok = fitsAt(rings[active], key.teeth, key.rotation);
      const span = key.teeth[key.teeth.length - 1];
      parts.push(
        '<path class="dg-spine ' + (ok ? "ok" : "ng") + '" d="' +
          arcPath(
            band.outer + 4,
            band.outer + 1.6,
            key.rotation * STEP + 1,
            (key.rotation + span + 1) * STEP - 1
          ) + '"/>'
      );
      for (const t of key.teeth) {
        parts.push(
          '<path class="dg-tooth ' + (ok ? "ok" : "ng") + '" d="' +
            slotPath(band.outer - 3.2, band.inner + 3.2, (key.rotation + t) % SLOTS, 2.4) +
            '"/>'
        );
      }
    }

    lockEl.innerHTML =
      '<svg class="dg-svg" viewBox="-104 -104 208 208" role="img" aria-label="' +
      lockLabel(active) + '">' + parts.join("") + "</svg>";
  }

  function lockLabel(active) {
    if (cleared) return "錠前は解除されました";
    const left = rings.length - (active < 0 ? rings.length : active);
    return "リング " + rings.length + " 本中 " + left + " 本が未解除、残りの鍵 " +
      remainingKeys().length + " 本";
  }

  /** 手持ちの鍵 1 本を小さな図にする。 */
  function keyThumb(key) {
    const span = key.teeth[key.teeth.length - 1];
    const parts = ['<circle class="dg-key-guide" cx="0" cy="0" r="35"/>'];
    parts.push(
      '<path fill="' + key.color + '" d="' +
        arcPath(50, 47, 1, (span + 1) * STEP - 1) + '"/>'
    );
    for (const t of key.teeth) {
      parts.push(
        '<path fill="' + key.color + '" d="' + slotPath(45, 27, t, 1.6) + '"/>'
      );
    }
    return '<svg viewBox="-54 -54 108 108" aria-hidden="true">' + parts.join("") + "</svg>";
  }

  function renderTray() {
    trayEl.innerHTML = "";
    keys.forEach((key, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dg-key" + (key.placed ? " placed" : "");
      if (key.id === hintedKeyId && !key.placed) btn.className += " hinted";
      btn.dataset.key = String(key.id);
      btn.disabled = !!key.placed || cleared;
      btn.setAttribute("aria-pressed", String(key.id === selectedKeyId && !key.placed));
      btn.innerHTML =
        '<span class="dg-key-thumb">' + keyThumb(key) + "</span>" +
        '<span class="dg-key-label">' +
        (key.placed ? "リング " + (key.placed.ring + 1) + " 済" : "鍵 " + (i + 1)) +
        "</span>";
      trayEl.appendChild(btn);
    });
  }

  function updateStats() {
    keysLeftEl.textContent = String(remainingKeys().length);
    const active = activeRingIndex();
    ringsLeftEl.textContent = String(active < 0 ? 0 : rings.length - active);
  }

  function updateButtons() {
    const key = selectedKey();
    undoBtn.disabled = history.length === 0 || cleared;
    hintBtn.disabled = cleared;
    insertBtn.disabled = cleared || !key || !!key.placed;
  }

  function renderAll() {
    renderLock();
    renderTray();
    updateStats();
    updateButtons();
  }

  /* --- 操作 ---------------------------------------------------------------- */

  function selectKey(id) {
    const key = keyById(id);
    if (!key || key.placed || cleared) return;
    selectedKeyId = id;
    renderLock();
    renderTray();
    updateButtons();
  }

  function selectNextKey() {
    const rest = remainingKeys();
    if (rest.length === 0) {
      selectedKeyId = null;
      return;
    }
    if (selectedKeyId !== null) {
      const current = keyById(selectedKeyId);
      if (current && !current.placed) return;
    }
    selectedKeyId = rest[0].id;
  }

  function rotateBy(delta) {
    const key = selectedKey();
    if (!key || key.placed || cleared) return;
    key.rotation = (key.rotation + delta + SLOTS) % SLOTS;
    renderLock();
  }

  function shakeLock() {
    lockEl.classList.remove("shake");
    // 連続で失敗したときもアニメーションが走るように、いったん再描画を挟む
    void lockEl.offsetWidth;
    lockEl.classList.add("shake");
    setTimeout(() => lockEl.classList.remove("shake"), 320);
  }

  function tryInsert() {
    if (cleared) return;
    const key = selectedKey();
    if (!key || key.placed) {
      messageEl.textContent = "差し込む鍵を選んでください。";
      return;
    }
    const active = activeRingIndex();
    if (active < 0) return;

    const ring = rings[active];
    if (!fitsAt(ring, key.teeth, key.rotation)) {
      messageEl.textContent = "この向きでは歯が入りません。回して合わせましょう。";
      shakeLock();
      return;
    }

    for (const t of key.teeth) ring.filled[(key.rotation + t) % SLOTS] = key.id;
    key.placed = { ring: active, rotation: key.rotation };
    history.push(key.id);
    hintedKeyId = null;
    stuck = false;

    if (activeRingIndex() < 0) {
      finishClear();
      return;
    }

    const solvedRing = ringSolved(ring);
    selectNextKey();
    renderAll();

    const check = solveRemaining(rings, keys);
    if (!check.aborted && !check.solved) {
      stuck = true;
      messageEl.textContent =
        "詰みです。この使い方では残りのくぼみを埋め切れません。「1 つ戻す」で戻しましょう。";
    } else if (solvedRing) {
      messageEl.textContent =
        "リング " + (active + 1) + " 解除！ 次のリングへ進みます。";
    } else {
      messageEl.textContent = "";
    }
  }

  function finishClear() {
    cleared = true;
    stuck = false;
    selectedKeyId = null;
    hintedKeyId = null;
    stopTimer();
    renderAll();

    if (hintsUsed > 0) {
      messageEl.textContent =
        "解除しました！（自動解除を使ったので記録は更新しません）";
      return;
    }
    const best = loadBest();
    const prev = best[level.id];
    if (typeof prev !== "number" || elapsed < prev) {
      best[level.id] = elapsed;
      saveBest(best);
      renderBest();
      messageEl.textContent = "解除しました！ 最短記録を更新（" + formatTime(elapsed) + "）";
    } else {
      messageEl.textContent = "解除しました！ タイム " + formatTime(elapsed);
    }
  }

  function undo() {
    if (cleared || history.length === 0) return;
    const key = keyById(history.pop());
    const ring = rings[key.placed.ring];
    for (const t of key.teeth) {
      ring.filled[(key.placed.rotation + t) % SLOTS] = null;
    }
    key.rotation = key.placed.rotation;
    key.placed = null;
    selectedKeyId = key.id;
    hintedKeyId = null;
    stuck = false;
    messageEl.textContent = "鍵を抜きました。";
    renderAll();
  }

  function showHint() {
    if (cleared) return;
    const result = solveRemaining(rings, keys);
    if (result.aborted) {
      messageEl.textContent = "この局面のヒントは計算しきれませんでした。";
      return;
    }
    if (!result.solved) {
      stuck = true;
      messageEl.textContent =
        "詰みです。この使い方では残りのくぼみを埋め切れません。「1 つ戻す」で戻しましょう。";
      return;
    }
    const first = result.placements[0];
    const key = keyById(first.keyId);
    key.rotation = first.rotation;
    selectedKeyId = key.id;
    hintedKeyId = key.id;
    hintsUsed++;
    messageEl.textContent =
      "ハイライトした鍵を、この向きのまま差し込みましょう。";
    renderAll();
  }

  /* --- リングをドラッグして回す -------------------------------------------- */

  function slotAtPointer(ev) {
    const svg = lockEl.querySelector("svg");
    if (!svg) return -1;
    const rect = svg.getBoundingClientRect();
    const dx = ev.clientX - (rect.left + rect.width / 2);
    const dy = ev.clientY - (rect.top + rect.height / 2);
    if (dx === 0 && dy === 0) return -1;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    deg = ((deg % 360) + 360) % 360;
    return Math.floor(deg / STEP) % SLOTS;
  }

  lockEl.addEventListener("pointerdown", (ev) => {
    const key = selectedKey();
    if (!key || key.placed || cleared) return;
    const slot = slotAtPointer(ev);
    if (slot < 0) return;
    drag = { slot: slot, rotation: key.rotation, keyId: key.id, pointerId: ev.pointerId };
    const svg = lockEl.querySelector("svg");
    if (svg) {
      svg.classList.add("grabbing");
      if (svg.setPointerCapture) svg.setPointerCapture(ev.pointerId);
    }
    ev.preventDefault();
  });

  lockEl.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const key = keyById(drag.keyId);
    if (!key || key.placed) return;
    const slot = slotAtPointer(ev);
    if (slot < 0) return;
    const next = (drag.rotation + slot - drag.slot + SLOTS * 2) % SLOTS;
    if (next !== key.rotation) {
      key.rotation = next;
      renderLock();
    }
  });

  function endDrag() {
    if (!drag) return;
    drag = null;
    const svg = lockEl.querySelector("svg");
    if (svg) svg.classList.remove("grabbing");
  }

  lockEl.addEventListener("pointerup", endDrag);
  lockEl.addEventListener("pointercancel", endDrag);

  /* --- キーボード操作 ------------------------------------------------------ */

  document.addEventListener("keydown", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const onButton = ev.target && ev.target.tagName === "BUTTON";

    if (ev.key === "ArrowLeft") {
      rotateBy(-1);
      ev.preventDefault();
    } else if (ev.key === "ArrowRight") {
      rotateBy(1);
      ev.preventDefault();
    } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      const rest = remainingKeys();
      if (rest.length === 0) return;
      const at = rest.findIndex((k) => k.id === selectedKeyId);
      const step = ev.key === "ArrowDown" ? 1 : -1;
      const next = rest[(at + step + rest.length) % rest.length] || rest[0];
      selectKey(next.id);
      ev.preventDefault();
    } else if ((ev.key === "Enter" || ev.key === " ") && !onButton) {
      tryInsert();
      ev.preventDefault();
    } else if (ev.key === "Escape") {
      selectedKeyId = null;
      renderAll();
    }
  });

  /* --- ゲーム進行 ---------------------------------------------------------- */

  function newGame() {
    const lock = generateLock(level);
    rings = lock.rings;
    keys = lock.keys;
    selectedKeyId = keys.length > 0 ? keys[0].id : null;
    hintedKeyId = null;
    history = [];
    cleared = false;
    stuck = false;
    hintsUsed = 0;
    drag = null;
    messageEl.textContent = "";
    renderAll();
    renderBest();
    startTimer();
  }

  function changeLevel(next) {
    level = next;
    for (const btn of levelSegEl.querySelectorAll("button")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.level === level.id));
    }
    newGame();
  }

  /* --- 初期化 -------------------------------------------------------------- */

  for (const lv of LEVELS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.level = lv.id;
    btn.textContent = lv.label;
    btn.setAttribute("aria-pressed", String(lv.id === level.id));
    btn.addEventListener("click", () => changeLevel(lv));
    levelSegEl.appendChild(btn);
  }

  trayEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".dg-key");
    if (!btn) return;
    selectKey(Number(btn.dataset.key));
  });

  document.getElementById("new-game").addEventListener("click", newGame);
  document.getElementById("rot-ccw").addEventListener("click", () => rotateBy(-1));
  document.getElementById("rot-cw").addEventListener("click", () => rotateBy(1));
  insertBtn.addEventListener("click", tryInsert);
  undoBtn.addEventListener("click", undo);
  hintBtn.addEventListener("click", showHint);

  newGame();
})();
