/* ==========================================================================
   ブリーチプロトコル（Cyberpunk 2077 のハッキングミニゲーム）

   G×G のコードマトリクスから、行→列→行…と軸を交互に切り替えながら
   セルを選んでいく。最初の 1 手だけは一番上の行から自由に選べる。
   選んだコードは順番にバッファへ積まれ、バッファの中に「シーケンス」欄の
   コード列と連続して同じ並びができれば、そのシーケンスは成立する。

   出題は「解になるコード列（パス）」を先に軸のルールに沿って作り、
   そのコード列をマトリクスに埋め込んでからシーケンスをその部分列として
   切り出す方式なので、パスをそのまま辿れば必ず全シーケンスが揃う。
   ========================================================================== */

(function () {
  "use strict";

  /* --- 定数 --------------------------------------------------------------- */

  const HEX_CODES = ["1C", "55", "BD", "E9", "7A", "FF", "3D", "A2"];

  const LEVELS = [
    { id: "novice", label: "初級", grid: 5, buffer: 4, symbols: 3, seqLens: [2, 2] },
    { id: "advanced", label: "中級", grid: 5, buffer: 5, symbols: 4, seqLens: [2, 3] },
    { id: "expert", label: "上級", grid: 6, buffer: 6, symbols: 5, seqLens: [3, 3] },
    { id: "master", label: "達人", grid: 7, buffer: 7, symbols: 6, seqLens: [3, 4, 3] },
  ];

  const SEQ_COLORS = ["#08f7fe", "#ff2e63", "#f5d300", "#7cff6b"];

  const SEQ_NAMES = [
    "ICE中和", "カメラ制御", "タレット制御", "データマイン V1",
    "データマイン V2", "データマイン V3", "武器グリッチ", "光学妨害",
    "マスターキー抽出", "サブネット侵入",
  ];

  const STORAGE_KEY = "puzzles:breach-protocol:best";
  const SOLVER_LIMIT = 500000;

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

  function key(r, c) {
    return r + "," + c;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function findSubsequence(buffer, target) {
    if (target.length === 0 || target.length > buffer.length) return -1;
    for (let i = 0; i + target.length <= buffer.length; i++) {
      let ok = true;
      for (let j = 0; j < target.length; j++) {
        if (buffer[i + j] !== target[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  }

  /* --- 問題の生成 ---------------------------------------------------------- */

  /**
   * 軸のルール（最初は行 0、以降は「直前の列」「直前の行」を交互）に沿って
   * 長さ B のパス（マス目の並び）を作る。同じマスは使わない。
   */
  function generatePath(G, B) {
    const path = [];
    const used = new Set();

    const c0 = randInt(G);
    path.push({ r: 0, c: c0 });
    used.add(key(0, c0));

    let axis = "col";
    let value = c0;

    for (let i = 1; i < B; i++) {
      const candidates = [];
      if (axis === "col") {
        for (let r = 0; r < G; r++) if (!used.has(key(r, value))) candidates.push(r);
      } else {
        for (let c = 0; c < G; c++) if (!used.has(key(value, c))) candidates.push(c);
      }
      const free = candidates[randInt(candidates.length)];
      const cell = axis === "col" ? { r: free, c: value } : { r: value, c: free };
      path.push(cell);
      used.add(key(cell.r, cell.c));
      axis = axis === "col" ? "row" : "col";
      value = free;
    }

    return path;
  }

  /** パスの部分列としてシーケンスを K 個切り出す。内容が重複しないようにする。 */
  function pickSequences(pathValues, lens) {
    const B = pathValues.length;
    const names = shuffle(SEQ_NAMES);
    const seqs = [];

    lens.forEach((len, i) => {
      let values = null;
      for (let attempt = 0; attempt < 30; attempt++) {
        const maxStart = B - len;
        const start = randInt(maxStart + 1);
        const candidate = pathValues.slice(start, start + len);
        const dup = seqs.some(
          (s) => s.values.length === candidate.length && s.values.every((v, j) => v === candidate[j])
        );
        if (!dup) {
          values = candidate;
          break;
        }
      }
      if (!values) values = pathValues.slice(0, len);
      seqs.push({
        id: i,
        name: names[i % names.length],
        color: SEQ_COLORS[i % SEQ_COLORS.length],
        values: values,
        matched: false,
      });
    });

    return seqs;
  }

  function generatePuzzle(level) {
    const G = level.grid;
    const B = level.buffer;
    const alphabet = HEX_CODES.slice(0, level.symbols);

    const path = generatePath(G, B);
    const pathValues = path.map(() => alphabet[randInt(alphabet.length)]);

    const grid = [];
    for (let r = 0; r < G; r++) grid.push(new Array(G).fill(null));
    path.forEach((cell, i) => {
      grid[cell.r][cell.c] = pathValues[i];
    });
    for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        if (grid[r][c] === null) grid[r][c] = alphabet[randInt(alphabet.length)];
      }
    }

    const sequences = pickSequences(pathValues, level.seqLens);

    return { grid: grid, G: G, B: B, sequences: sequences };
  }

  /* --- 探索（ヒント・詰み判定） --------------------------------------------- */

  function candidateCells(grid, G, constraint, used) {
    const cells = [];
    if (constraint.axis === "row") {
      for (let c = 0; c < G; c++) if (!used.has(key(constraint.value, c))) cells.push({ r: constraint.value, c: c });
    } else {
      for (let r = 0; r < G; r++) if (!used.has(key(r, constraint.value))) cells.push({ r: r, c: constraint.value });
    }
    return shuffle(cells);
  }

  function pendingValues(bufferValues, sequences) {
    return sequences.filter((s) => findSubsequence(bufferValues, s.values) < 0).map((s) => s.values);
  }

  /**
   * 現在の状態から、残り手数以内で全シーケンスを揃えられるか探索する。
   * 揃えられるなら、その完了までの手順（マス目の並び）を返す。
   */
  function solveFrom(grid, G, used, constraint, bufferValues, depthLeft, sequences) {
    let nodes = 0;
    let aborted = false;

    function rec(used, constraint, bufferValues, depthLeft) {
      if (aborted) return null;
      if (++nodes > SOLVER_LIMIT) {
        aborted = true;
        return null;
      }
      if (pendingValues(bufferValues, sequences).length === 0) return [];
      if (depthLeft === 0) return null;

      const cells = candidateCells(grid, G, constraint, used);
      for (const cell of cells) {
        const value = grid[cell.r][cell.c];
        const newUsed = new Set(used);
        newUsed.add(key(cell.r, cell.c));
        const newConstraint = {
          axis: constraint.axis === "row" ? "col" : "row",
          value: constraint.axis === "row" ? cell.c : cell.r,
        };
        const rest = rec(newUsed, newConstraint, bufferValues.concat(value), depthLeft - 1);
        if (rest !== null) return [cell].concat(rest);
      }
      return null;
    }

    const moves = rec(used, constraint, bufferValues, depthLeft);
    return { solved: moves !== null, aborted: aborted, moves: moves };
  }

  /* --- 状態 ---------------------------------------------------------------- */

  const matrixEl = document.getElementById("matrix");
  const bufferEl = document.getElementById("buffer");
  const seqListEl = document.getElementById("seq-list");
  const messageEl = document.getElementById("message");
  const levelSegEl = document.getElementById("level-seg");
  const bufferUsageEl = document.getElementById("buffer-usage");
  const seqProgressEl = document.getElementById("seq-progress");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const undoBtn = document.getElementById("undo");
  const hintBtn = document.getElementById("hint");

  let level = LEVELS[0];
  let grid = [];
  let G = 0;
  let B = 0;
  let sequences = [];
  let picks = [];
  let used = new Set();
  let constraint = { axis: "row", value: 0 };
  let hintedCell = null;
  let cleared = false;
  let over = false;
  let stuck = false;
  let hintsUsed = 0;
  let elapsed = 0;
  let timerId = null;

  function bufferValues() {
    return picks.map((p) => p.value);
  }

  function matchedCount() {
    return sequences.filter((s) => s.matched).length;
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

  /* --- 判定 ---------------------------------------------------------------- */

  function refreshMatches() {
    const values = bufferValues();
    for (const seq of sequences) {
      seq.matched = findSubsequence(values, seq.values) >= 0;
    }
  }

  /* --- 描画 ---------------------------------------------------------------- */

  function renderMatrix() {
    matrixEl.style.gridTemplateColumns = "repeat(" + G + ", 1fr)";
    matrixEl.innerHTML = "";
    const canPick = !cleared && !over;
    const candidates = canPick ? new Set(candidateCells(grid, G, constraint, used).map((c) => key(c.r, c.c))) : new Set();

    for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bp-cell";
        const k = key(r, c);
        if (used.has(k)) btn.className += " used";
        else if (candidates.has(k)) btn.className += " valid";
        if (hintedCell && hintedCell.r === r && hintedCell.c === c) btn.className += " hinted";
        if (constraint.axis === "row" && constraint.value === r && canPick) btn.className += " scan-line";
        if (constraint.axis === "col" && constraint.value === c && canPick) btn.className += " scan-line";
        btn.textContent = grid[r][c];
        btn.disabled = !canPick || used.has(k) || !candidates.has(k);
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        matrixEl.appendChild(btn);
      }
    }
  }

  function renderBuffer() {
    const values = bufferValues();
    // 成立したシーケンスに含まれるバッファの位置を色分けする
    const covered = values.map(() => null);
    for (const seq of sequences) {
      if (!seq.matched) continue;
      const start = findSubsequence(values, seq.values);
      for (let i = 0; i < seq.values.length; i++) {
        if (covered[start + i] === null) covered[start + i] = seq.color;
      }
    }

    bufferEl.innerHTML = "";
    for (let i = 0; i < B; i++) {
      const slot = document.createElement("div");
      slot.className = "bp-slot" + (i < values.length ? " filled" : "");
      if (covered[i]) {
        slot.style.borderColor = covered[i];
        slot.style.color = covered[i];
        slot.style.boxShadow = "0 0 0 1px " + covered[i] + " inset";
      }
      slot.textContent = i < values.length ? values[i] : "--";
      bufferEl.appendChild(slot);
    }
  }

  function renderSequences() {
    seqListEl.innerHTML = "";
    for (const seq of sequences) {
      const card = document.createElement("div");
      card.className = "bp-seq" + (seq.matched ? " matched" : "");
      card.style.setProperty("--seq-color", seq.color);

      const head = document.createElement("div");
      head.className = "bp-seq-head";
      head.innerHTML =
        '<span class="bp-seq-dot"></span><span class="bp-seq-name">' + seq.name + "</span>" +
        '<span class="bp-seq-status">' + (seq.matched ? "✓ 完了" : "") + "</span>";
      card.appendChild(head);

      const codes = document.createElement("div");
      codes.className = "bp-seq-codes";
      codes.innerHTML = seq.values.map((v) => '<span class="bp-seq-code">' + v + "</span>").join("");
      card.appendChild(codes);

      seqListEl.appendChild(card);
    }
  }

  function updateStats() {
    bufferUsageEl.textContent = picks.length + " / " + B;
    seqProgressEl.textContent = matchedCount() + " / " + sequences.length;
  }

  function updateButtons() {
    undoBtn.disabled = picks.length === 0 || cleared;
    hintBtn.disabled = cleared || over;
  }

  function renderAll() {
    renderMatrix();
    renderBuffer();
    renderSequences();
    updateStats();
    updateButtons();
  }

  /* --- 操作 ---------------------------------------------------------------- */

  function pick(r, c) {
    if (cleared || over) return;
    const k = key(r, c);
    if (used.has(k)) return;
    const candidates = candidateCells(grid, G, constraint, used);
    if (!candidates.some((cell) => cell.r === r && cell.c === c)) return;

    const value = grid[r][c];
    picks.push({ r: r, c: c, value: value, constraintBefore: constraint });
    used.add(k);
    constraint = {
      axis: constraint.axis === "row" ? "col" : "row",
      value: constraint.axis === "row" ? c : r,
    };
    hintedCell = null;
    stuck = false;
    messageEl.textContent = "";

    refreshMatches();

    if (matchedCount() === sequences.length) {
      finishClear();
      return;
    }

    if (picks.length >= B) {
      over = true;
      stopTimer();
      renderAll();
      messageEl.textContent =
        "バッファが尽きました。" + matchedCount() + " / " + sequences.length +
        " 個のシーケンスしか揃いませんでした。「1 つ戻す」でやり直すか、新しい問題に挑戦しましょう。";
      return;
    }

    renderAll();

    const check = solveFrom(grid, G, used, constraint, bufferValues(), B - picks.length, sequences);
    if (!check.aborted && !check.solved) {
      stuck = true;
      messageEl.textContent =
        "詰みです。このままでは残りのシーケンスを揃えられません。「1 つ戻す」で戻りましょう。";
    }
  }

  function finishClear() {
    cleared = true;
    over = false;
    stuck = false;
    hintedCell = null;
    stopTimer();
    renderAll();

    if (hintsUsed > 0) {
      messageEl.textContent = "全シーケンス成立！（ヒントを使ったので記録は更新しません）";
      return;
    }
    const best = loadBest();
    const prev = best[level.id];
    if (typeof prev !== "number" || elapsed < prev) {
      best[level.id] = elapsed;
      saveBest(best);
      renderBest();
      messageEl.textContent = "全シーケンス成立！ 最短記録を更新（" + formatTime(elapsed) + "）";
    } else {
      messageEl.textContent = "全シーケンス成立！ タイム " + formatTime(elapsed);
    }
  }

  function undo() {
    if (cleared || picks.length === 0) return;
    const last = picks.pop();
    used.delete(key(last.r, last.c));
    constraint = last.constraintBefore;
    over = false;
    stuck = false;
    hintedCell = null;
    refreshMatches();
    messageEl.textContent = "1 手戻しました。";
    renderAll();
  }

  function showHint() {
    if (cleared || over) return;
    const result = solveFrom(grid, G, used, constraint, bufferValues(), B - picks.length, sequences);
    if (result.aborted) {
      messageEl.textContent = "この局面のヒントは計算しきれませんでした。";
      return;
    }
    if (!result.solved) {
      stuck = true;
      messageEl.textContent =
        "詰みです。このままでは残りのシーケンスを揃えられません。「1 つ戻す」で戻りましょう。";
      return;
    }
    if (result.moves.length === 0) {
      messageEl.textContent = "すでに全シーケンスが揃っています。";
      return;
    }
    hintedCell = result.moves[0];
    hintsUsed++;
    messageEl.textContent = "ハイライトしたマスを選びましょう。";
    renderAll();
  }

  /* --- ゲーム進行 ---------------------------------------------------------- */

  function newGame() {
    const puzzle = generatePuzzle(level);
    grid = puzzle.grid;
    G = puzzle.G;
    B = puzzle.B;
    sequences = puzzle.sequences;
    picks = [];
    used = new Set();
    constraint = { axis: "row", value: 0 };
    hintedCell = null;
    cleared = false;
    over = false;
    stuck = false;
    hintsUsed = 0;
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

  matrixEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".bp-cell");
    if (!btn) return;
    pick(Number(btn.dataset.r), Number(btn.dataset.c));
  });

  document.getElementById("new-game").addEventListener("click", newGame);
  undoBtn.addEventListener("click", undo);
  hintBtn.addEventListener("click", showHint);

  newGame();
})();
