/* ==========================================================================
   15パズル
   空きマスと同じ行・列のタイルを押すとスライドする。数字を昇順に揃えればクリア。
   盤面は「揃った状態からランダムにスライドさせた結果」を初期状態にするため、必ず解ける。
   ========================================================================== */

(function () {
  "use strict";

  const SIZES = [3, 4, 5];
  const STORAGE_KEY = "puzzles:15-puzzle:best";

  const boardEl = document.getElementById("board");
  const movesEl = document.getElementById("moves");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const messageEl = document.getElementById("message");
  const sizeSegEl = document.getElementById("size-seg");

  let size = 4;
  let board = [];        // 現在の盤面（0 = 空きマス、それ以外はタイル番号）
  let initialBoard = []; // 「やり直す」で戻る初期盤面
  let moves = 0;
  let cleared = false;
  let startedAt = null;
  let tickId = null;

  /* --- 盤面ロジック ------------------------------------------------------ */

  function solvedBoard() {
    const n = size * size;
    const state = new Array(n);
    for (let i = 0; i < n - 1; i++) state[i] = i + 1;
    state[n - 1] = 0;
    return state;
  }

  const isCleared = (state) => state.every((v, i) => v === (i === state.length - 1 ? 0 : i + 1));

  /** 揃った盤面からランダムにスライドさせて、必ず解ける盤面を作る。 */
  function generate() {
    const state = solvedBoard();
    let blank = state.length - 1;
    let lastBlank = -1;
    const steps = size * size * 40;

    for (let s = 0; s < steps; s++) {
      const neighbors = blankNeighbors(blank).filter((i) => i !== lastBlank);
      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      state[blank] = state[next];
      state[next] = 0;
      lastBlank = blank;
      blank = next;
    }
    return state;
  }

  function blankNeighbors(blankIdx) {
    const r = Math.floor(blankIdx / size);
    const c = blankIdx % size;
    const result = [];
    if (r > 0) result.push(blankIdx - size);
    if (r < size - 1) result.push(blankIdx + size);
    if (c > 0) result.push(blankIdx - 1);
    if (c < size - 1) result.push(blankIdx + 1);
    return result;
  }

  /** idx のタイルが空きマスと同じ行・列にあれば、その間を 1 手でスライドする。 */
  function slideTo(idx) {
    const blankIdx = board.indexOf(0);
    if (idx === blankIdx) return false;

    const r = Math.floor(idx / size);
    const c = idx % size;
    const br = Math.floor(blankIdx / size);
    const bc = blankIdx % size;
    if (r !== br && c !== bc) return false;

    const step = r === br ? (idx < blankIdx ? 1 : -1) : (idx < blankIdx ? size : -size);
    for (let i = blankIdx; i !== idx; i -= step) {
      board[i] = board[i - step];
    }
    board[idx] = 0;
    return true;
  }

  /* --- 記録（localStorage） ---------------------------------------------- */

  function readBest() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function currentBest() {
    const v = readBest()[size];
    return typeof v === "number" ? v : null;
  }

  function saveBest(value) {
    try {
      const all = readBest();
      all[size] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      /* 保存できなくても遊べるので無視する */
    }
  }

  /* --- タイマー ---------------------------------------------------------- */

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return m + ":" + s;
  }

  function startTimer() {
    if (tickId !== null) return;
    startedAt = Date.now();
    tickId = setInterval(() => {
      timeEl.textContent = formatTime(Date.now() - startedAt);
    }, 250);
  }

  function stopTimer() {
    if (tickId !== null) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  function resetTimer() {
    stopTimer();
    startedAt = null;
    timeEl.textContent = "00:00";
  }

  /* --- 描画 -------------------------------------------------------------- */

  function buildBoard() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + size + ", 1fr)";
    boardEl.classList.remove("cleared");

    for (let i = 0; i < size * size; i++) {
      const r = Math.floor(i / size);
      const c = i % size;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.i = String(i);
      cell.setAttribute("aria-label", (r + 1) + "行" + (c + 1) + "列");
      cell.addEventListener("click", () => handlePress(i));
      boardEl.appendChild(cell);
    }
    paint();
  }

  function paint() {
    const cells = boardEl.children;
    for (let i = 0; i < cells.length; i++) {
      const v = board[i];
      const cell = cells[i];
      cell.textContent = v === 0 ? "" : String(v);
      cell.classList.toggle("blank", v === 0);
      cell.classList.toggle("home", v !== 0 && v === i + 1);
      cell.setAttribute("aria-label", v === 0 ? "空きマス" : "タイル " + v);
    }
    movesEl.textContent = String(moves);
    const best = currentBest();
    bestEl.textContent = best === null ? "—" : best + " 手";
  }

  /* --- 操作 -------------------------------------------------------------- */

  function handlePress(idx) {
    if (cleared) return;
    if (!slideTo(idx)) return;

    startTimer();
    moves++;
    paint();

    if (isCleared(board)) {
      cleared = true;
      stopTimer();
      boardEl.classList.add("cleared");

      const best = currentBest();
      if (best === null || moves < best) {
        saveBest(moves);
        messageEl.textContent = "クリア！ " + moves + " 手 — 自己ベスト更新 🎉";
      } else {
        messageEl.textContent = "クリア！ " + moves + " 手（ベスト " + best + " 手）";
      }
      paint();
    }
  }

  function newGame() {
    board = generate();
    initialBoard = board.slice();
    moves = 0;
    cleared = false;
    messageEl.textContent = "";
    resetTimer();
    buildBoard();
  }

  function restart() {
    board = initialBoard.slice();
    moves = 0;
    cleared = false;
    messageEl.textContent = "";
    resetTimer();
    boardEl.classList.remove("cleared");
    paint();
  }

  function changeSize(next) {
    size = next;
    for (const btn of sizeSegEl.querySelectorAll("button")) {
      btn.setAttribute("aria-pressed", String(Number(btn.dataset.size) === size));
    }
    newGame();
  }

  /* --- キーボード操作（矢印で空きマスを動かす） --------------------------- */

  document.addEventListener("keydown", (ev) => {
    const dirs = {
      ArrowUp: -size,
      ArrowDown: size,
      ArrowLeft: -1,
      ArrowRight: 1,
    };
    const d = dirs[ev.key];
    if (d === undefined || cleared) return;

    const blankIdx = board.indexOf(0);
    const target = blankIdx + d;
    if (target < 0 || target >= size * size) return;
    // 左右移動が行をまたいでいないか確認する
    if (Math.abs(d) === 1 && Math.floor(target / size) !== Math.floor(blankIdx / size)) return;

    ev.preventDefault();
    handlePress(target);
  });

  /* --- 初期化 ------------------------------------------------------------ */

  for (const n of SIZES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.size = String(n);
    btn.textContent = n + "×" + n;
    btn.setAttribute("aria-pressed", String(n === size));
    btn.addEventListener("click", () => changeSize(n));
    sizeSegEl.appendChild(btn);
  }

  document.getElementById("new-game").addEventListener("click", newGame);
  document.getElementById("restart").addEventListener("click", restart);

  newGame();
})();
