/* ==========================================================================
   けいさんチェイン
   スタートの数に、シャッフルされた四則演算パーツを 1 つずつ順番に適用し、
   すべて使い切ったときにゴールの数と一致させるパズル。
   問題は「ランダムな順番で実際に計算してみて、整数の範囲に収まった結果」を
   ゴールとして採用するため、必ず解ける（採用した順番自体が解になる）。
   ========================================================================== */

(function () {
  "use strict";

  const COUNTS = [4, 5, 6, 7];
  const STORAGE_KEY = "puzzles:calc-chain:best";
  const OPS = ["+", "-", "×", "÷"];

  const startNumEl = document.getElementById("start-num");
  const currentNumEl = document.getElementById("current-num");
  const goalNumEl = document.getElementById("goal-num");
  const chainEl = document.getElementById("chain");
  const poolEl = document.getElementById("pool");
  const movesEl = document.getElementById("moves");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const messageEl = document.getElementById("message");
  const countSegEl = document.getElementById("count-seg");
  const undoBtn = document.getElementById("undo");

  let count = 5;
  let start = 0;
  let goal = 0;
  let pieces = []; // 今の問題のパーツ全部（シャッフル済み） [{op, n, id}]
  let used = [];   // プレイヤーが並べた順番（pieces の一部への参照）
  let moves = 0;
  let cleared = false;
  let hintId = null; // ヒントで光らせているパーツの id
  let startedAt = null;
  let tickId = null;

  /* --- 分数（正確な計算のため、小数の誤差を避ける） ----------------------- */

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }

  function frac(n, d) {
    d = d === undefined ? 1 : d;
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    return { n: n / g, d: d / g };
  }

  const fracEq = (a, b) => a.n * b.d === b.n * a.d;

  function fracApply(v, piece) {
    const n = piece.n;
    switch (piece.op) {
      case "+": return frac(v.n + n * v.d, v.d);
      case "-": return frac(v.n - n * v.d, v.d);
      case "×": return frac(v.n * n, v.d);
      case "÷": return frac(v.n, v.d * n);
      default: return v;
    }
  }

  const fracToString = (v) => (v.d === 1 ? String(v.n) : v.n + "/" + v.d);

  /* --- 問題生成 ------------------------------------------------------------
     ランダムな開始数とパーツ列を作り、その順番どおりに実際に計算してみる。
     整数のまま 0〜9999 に収まり続ければ、その最終値をゴールとして採用する。
     （+/- だけ、×/÷ だけだと順番を変えても結果が変わらないので、
     両方の種類が混ざるまで作り直す。） --------------------------------- */

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  }

  function applyIntOp(value, op, n) {
    if (op === "+") return value + n;
    if (op === "-") return value - n;
    if (op === "×") return value * n;
    if (op === "÷") return value % n === 0 ? value / n : null;
    return null;
  }

  function generate(n) {
    for (let attempt = 0; attempt < 4000; attempt++) {
      const s = randInt(2, 20);
      const list = [];
      for (let i = 0; i < n; i++) {
        const op = OPS[randInt(0, OPS.length - 1)];
        const num = op === "+" || op === "-" ? randInt(1, 12) : randInt(2, 6);
        list.push({ op: op, n: num, id: i });
      }

      const hasAdditive = list.some((p) => p.op === "+" || p.op === "-");
      const hasMultiplicative = list.some((p) => p.op === "×" || p.op === "÷");
      if (!hasAdditive || !hasMultiplicative) continue;

      let value = s;
      let ok = true;
      for (const p of list) {
        const nv = applyIntOp(value, p.op, p.n);
        if (nv === null || !Number.isInteger(nv) || nv < 0 || nv > 9999) {
          ok = false;
          break;
        }
        value = nv;
      }
      if (!ok || value === s) continue;

      return { start: s, goal: value, pieces: shuffle(list) };
    }
    return null;
  }

  /* --- ソルバー（ヒント用） -------------------------------------------------
     残りパーツの並べ方をすべて試し、現在値からゴールに到達できる順番を 1 つ探す。
     見つかれば「次に使うとよいパーツ」を返せる。パーツ数は最大 7 なので
     全探索（最大 7! = 5040 通り）で十分間に合う。 ------------------------- */

  function findCompletion(fromValue, goalFrac, remaining) {
    const n = remaining.length;
    const takenFlags = new Array(n).fill(false);
    const order = [];

    function backtrack(value, depth) {
      if (depth === n) {
        return fracEq(value, goalFrac) ? order.slice() : null;
      }
      for (let i = 0; i < n; i++) {
        if (takenFlags[i]) continue;
        takenFlags[i] = true;
        order.push(remaining[i]);
        const result = backtrack(fracApply(value, remaining[i]), depth + 1);
        if (result) {
          takenFlags[i] = false;
          order.pop();
          return result;
        }
        takenFlags[i] = false;
        order.pop();
      }
      return null;
    }

    return backtrack(fromValue, 0);
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
    const v = readBest()[count];
    return typeof v === "number" ? v : null;
  }

  function saveBest(value) {
    try {
      const all = readBest();
      all[count] = value;
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

  /* --- ロジックのヘルパー -------------------------------------------------- */

  const pieceLabel = (p) => p.op + p.n;
  const opClass = (op) => ({ "+": "op-add", "-": "op-sub", "×": "op-mul", "÷": "op-div" })[op];

  function currentValueFrac() {
    let v = frac(start, 1);
    for (const p of used) v = fracApply(v, p);
    return v;
  }

  function remainingPieces() {
    return pieces.filter((p) => used.indexOf(p) === -1);
  }

  /* --- 描画 -------------------------------------------------------------- */

  function renderChain() {
    chainEl.innerHTML = "";
    let v = frac(start, 1);

    const startChip = document.createElement("div");
    startChip.className = "chain-value";
    startChip.textContent = fracToString(v);
    chainEl.appendChild(startChip);

    used.forEach((p, idx) => {
      v = fracApply(v, p);
      const isLast = idx === used.length - 1;

      const opChip = document.createElement("button");
      opChip.type = "button";
      opChip.className = "chain-op " + opClass(p.op);
      opChip.textContent = pieceLabel(p);
      if (!cleared) {
        opChip.title = isLast ? "クリックで取り消す" : "クリックでここから後ろをまとめて取り消す";
        opChip.addEventListener("click", () => removeFrom(idx));
      } else {
        opChip.disabled = true;
      }
      chainEl.appendChild(opChip);

      const valChip = document.createElement("div");
      valChip.className = "chain-value";
      valChip.textContent = fracToString(v);
      chainEl.appendChild(valChip);
    });

    currentNumEl.textContent = fracToString(v);
    currentNumEl.parentElement.classList.toggle(
      "match",
      !cleared && used.length === pieces.length && fracEq(v, frac(goal, 1))
    );
  }

  function renderPool() {
    poolEl.innerHTML = "";
    for (const p of remainingPieces()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "piece " + opClass(p.op);
      btn.textContent = pieceLabel(p);
      btn.classList.toggle("hint", hintId === p.id);
      btn.disabled = cleared;
      btn.addEventListener("click", () => placePiece(p));
      poolEl.appendChild(btn);
    }
  }

  function paint() {
    renderChain();
    renderPool();
    movesEl.textContent = String(moves);
    const best = currentBest();
    bestEl.textContent = best === null ? "—" : best + " 手";
    undoBtn.disabled = used.length === 0 || cleared;
  }

  /* --- 操作 -------------------------------------------------------------- */

  function placePiece(p) {
    if (cleared) return;
    startTimer();
    used.push(p);
    moves++;
    hintId = null;
    messageEl.textContent = "";
    paint();
    checkState();
  }

  function removeFrom(idx) {
    if (cleared || idx < 0 || idx >= used.length) return;
    moves += used.length - idx;
    used = used.slice(0, idx);
    hintId = null;
    messageEl.textContent = "";
    paint();
  }

  function removeLast() {
    removeFrom(used.length - 1);
  }

  function checkState() {
    if (used.length < pieces.length) return;

    const v = currentValueFrac();
    if (fracEq(v, frac(goal, 1))) {
      cleared = true;
      stopTimer();
      chainEl.classList.add("cleared");

      const best = currentBest();
      if (best === null || moves < best) {
        saveBest(moves);
        messageEl.textContent = "クリア！ " + moves + " 手 — 自己ベスト更新 🎉";
      } else {
        messageEl.textContent = "クリア！ " + moves + " 手（ベスト " + best + " 手）";
      }
      paint();
    } else {
      messageEl.textContent =
        "ゴールと違います（現在 " + fracToString(v) + " ／ 目標 " + goal +
        "）。「元に戻す」で並びを変えてみましょう。";
    }
  }

  function newGame() {
    messageEl.textContent = "問題を作っています…";
    const puzzle = generate(count);
    if (!puzzle) {
      messageEl.textContent = "問題を作れませんでした。もう一度お試しください。";
      return;
    }
    start = puzzle.start;
    goal = puzzle.goal;
    pieces = puzzle.pieces;
    used = [];
    moves = 0;
    cleared = false;
    hintId = null;
    messageEl.textContent = "";
    chainEl.classList.remove("cleared");
    resetTimer();
    startNumEl.textContent = String(start);
    goalNumEl.textContent = String(goal);
    paint();
  }

  function restart() {
    used = [];
    moves = 0;
    cleared = false;
    hintId = null;
    messageEl.textContent = "";
    chainEl.classList.remove("cleared");
    resetTimer();
    paint();
  }

  function showHint() {
    if (cleared) return;
    const remaining = remainingPieces();
    if (remaining.length === 0) return;

    const completion = findCompletion(currentValueFrac(), frac(goal, 1), remaining);
    if (!completion) {
      hintId = null;
      paint();
      messageEl.textContent = "今の並びからはゴールに届きません。「元に戻す」で一つ外してみましょう。";
      return;
    }

    hintId = completion[0].id;
    paint();
    messageEl.textContent =
      "あと " + remaining.length + " 個。次は「" + pieceLabel(completion[0]) + "」を使うとゴールに届きます。";
  }

  function changeCount(next) {
    count = next;
    for (const btn of countSegEl.querySelectorAll("button")) {
      btn.setAttribute("aria-pressed", String(Number(btn.dataset.count) === count));
    }
    newGame();
  }

  /* --- 初期化 ------------------------------------------------------------ */

  for (const c of COUNTS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.count = String(c);
    btn.textContent = c + "個";
    btn.setAttribute("aria-pressed", String(c === count));
    btn.addEventListener("click", () => changeCount(c));
    countSegEl.appendChild(btn);
  }

  document.getElementById("new-game").addEventListener("click", newGame);
  document.getElementById("restart").addEventListener("click", restart);
  undoBtn.addEventListener("click", removeLast);
  document.getElementById("hint").addEventListener("click", showHint);

  newGame();
})();
