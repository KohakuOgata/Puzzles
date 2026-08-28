/* ==========================================================================
   ライツアウト
   マスを押すと自分と上下左右が反転する。全消灯でクリア。
   盤面は「全消灯からランダムに押した結果」を初期状態にするため、必ず解ける。
   ========================================================================== */

(function () {
  "use strict";

  const SIZES = [3, 4, 5, 6, 7];
  const STORAGE_KEY = "puzzles:lights-out:best";

  const boardEl = document.getElementById("board");
  const movesEl = document.getElementById("moves");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const messageEl = document.getElementById("message");
  const sizeSegEl = document.getElementById("size-seg");

  let size = 5;
  let board = [];        // 現在の盤面（0 = 消灯 / 1 = 点灯）
  let initialBoard = []; // 「やり直す」で戻る初期盤面
  let moves = 0;
  let cleared = false;
  let startedAt = null;
  let tickId = null;

  /* --- 盤面ロジック ------------------------------------------------------ */

  const at = (r, c) => r * size + c;
  const NEIGHBORS = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];

  /** (r, c) と上下左右を反転させる。 */
  function toggle(state, r, c) {
    for (const [dr, dc] of NEIGHBORS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
        state[at(rr, cc)] ^= 1;
      }
    }
  }

  const isCleared = (state) => state.every((v) => v === 0);

  /** 全消灯からランダムに押して、必ず解ける盤面を作る。 */
  function generate() {
    let state;
    do {
      state = new Array(size * size).fill(0);
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (Math.random() < 0.5) toggle(state, r, c);
        }
      }
    } while (isCleared(state)); // 最初からクリア済みの盤面は作らない
    return state;
  }

  /* --- ソルバー（GF(2) の連立方程式を掃き出し法で解く） ------------------ */

  /**
   * 現在の盤面を消すために押すべきマスの一覧を返す。
   * 解が複数あるときは押す回数が最小のものを選ぶ。解けない場合は null。
   */
  function solve(state) {
    const n = size;
    const N = n * n;
    const rows = [];

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const row = new Uint8Array(N + 1);
        for (const [dr, dc] of NEIGHBORS) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < n && cc >= 0 && cc < n) row[rr * n + cc] = 1;
        }
        row[N] = state[at(r, c)];
        rows.push(row);
      }
    }

    // 掃き出し法（既約行階段形まで落とす）
    const pivotCols = [];
    let pivot = 0;
    for (let col = 0; col < N && pivot < N; col++) {
      let sel = -1;
      for (let i = pivot; i < N; i++) {
        if (rows[i][col]) { sel = i; break; }
      }
      if (sel === -1) continue;

      const tmp = rows[pivot];
      rows[pivot] = rows[sel];
      rows[sel] = tmp;

      for (let i = 0; i < N; i++) {
        if (i !== pivot && rows[i][col]) {
          for (let j = col; j <= N; j++) rows[i][j] ^= rows[pivot][j];
        }
      }
      pivotCols.push(col);
      pivot++;
    }

    // 「0 = 1」の行があれば解なし（生成方法上ここには来ない）
    for (let i = pivot; i < N; i++) {
      if (rows[i][N]) return null;
    }

    const particular = new Uint8Array(N);
    for (let i = 0; i < pivotCols.length; i++) {
      particular[pivotCols[i]] = rows[i][N];
    }

    // 自由変数から解空間の基底を作る
    const pivotSet = new Set(pivotCols);
    const freeCols = [];
    for (let col = 0; col < N; col++) {
      if (!pivotSet.has(col)) freeCols.push(col);
    }
    const basis = freeCols.map((f) => {
      const v = new Uint8Array(N);
      v[f] = 1;
      for (let i = 0; i < pivotCols.length; i++) v[pivotCols[i]] = rows[i][f];
      return v;
    });

    // 基底が少ないうちは全組み合わせを試し、最小手数の解を選ぶ
    const weight = (v) => v.reduce((a, b) => a + b, 0);
    let best = particular;
    if (basis.length > 0 && basis.length <= 16) {
      let bestWeight = weight(particular);
      for (let mask = 1; mask < (1 << basis.length); mask++) {
        const cand = particular.slice();
        for (let b = 0; b < basis.length; b++) {
          if (mask & (1 << b)) {
            for (let i = 0; i < N; i++) cand[i] ^= basis[b][i];
          }
        }
        const w = weight(cand);
        if (w < bestWeight) { bestWeight = w; best = cand; }
      }
    }

    const cells = [];
    for (let i = 0; i < N; i++) {
      if (best[i]) cells.push(i);
    }
    return cells;
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

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.setAttribute("aria-label", (r + 1) + "行" + (c + 1) + "列");
        cell.addEventListener("click", () => handlePress(r, c));
        boardEl.appendChild(cell);
      }
    }
    paint();
  }

  function paint() {
    const cells = boardEl.children;
    for (let i = 0; i < cells.length; i++) {
      const on = board[i] === 1;
      cells[i].classList.toggle("on", on);
      cells[i].classList.remove("hint");
      cells[i].setAttribute("aria-pressed", String(on));
    }
    movesEl.textContent = String(moves);
    const best = currentBest();
    bestEl.textContent = best === null ? "—" : best + " 手";
  }

  /* --- 操作 -------------------------------------------------------------- */

  function handlePress(r, c) {
    if (cleared) return;
    startTimer();
    toggle(board, r, c);
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

  function showHint() {
    if (cleared) return;
    const solution = solve(board);
    if (!solution || solution.length === 0) return;

    const target = solution[Math.floor(Math.random() * solution.length)];
    paint();
    boardEl.children[target].classList.add("hint");
    messageEl.textContent = "あと最短 " + solution.length + " 手。緑のマスを押してみよう。";
  }

  function changeSize(next) {
    size = next;
    for (const btn of sizeSegEl.querySelectorAll("button")) {
      btn.setAttribute("aria-pressed", String(Number(btn.dataset.size) === size));
    }
    newGame();
  }

  /* --- キーボード操作（矢印でフォーカス移動） ---------------------------- */

  boardEl.addEventListener("keydown", (ev) => {
    const dirs = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const d = dirs[ev.key];
    const target = ev.target;
    if (!d || !target.dataset || target.dataset.r === undefined) return;
    ev.preventDefault();
    const r = Math.min(size - 1, Math.max(0, Number(target.dataset.r) + d[0]));
    const c = Math.min(size - 1, Math.max(0, Number(target.dataset.c) + d[1]));
    boardEl.children[at(r, c)].focus();
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
  document.getElementById("hint").addEventListener("click", showHint);

  newGame();
})();
