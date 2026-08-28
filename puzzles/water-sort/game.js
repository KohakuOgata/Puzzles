/* ==========================================================================
   水そそぎパズル（試験管の色そろえ）
   試験管の一番上の液体を、同じ色の上か空の試験管へ移す。
   すべての試験管を「空」か「1 色だけで満杯」にすればクリア。
   問題はランダムに配ったあとソルバーで解けることを確かめてから出すので、
   必ず解ける。
   ========================================================================== */

(function () {
  "use strict";

  const CAP = 4; // 試験管 1 本に入る液体の量

  const LEVELS = [
    { id: "easy", label: "やさしい", colors: 4, empty: 2 },
    { id: "normal", label: "ふつう", colors: 6, empty: 2 },
    { id: "hard", label: "むずかしい", colors: 8, empty: 2 },
    { id: "expert", label: "達人", colors: 10, empty: 2 },
  ];

  // 色は 10 種類。記号は色が見分けづらいときの補助表示に使う。
  const COLORS = [
    { hex: "#ff5f56", name: "赤", symbol: "●" },
    { hex: "#ffa23a", name: "橙", symbol: "▲" },
    { hex: "#ffe14d", name: "黄", symbol: "■" },
    { hex: "#5ad48a", name: "緑", symbol: "◆" },
    { hex: "#3fd0c9", name: "青緑", symbol: "★" },
    { hex: "#4da3ff", name: "青", symbol: "♥" },
    { hex: "#9b7bff", name: "紫", symbol: "✚" },
    { hex: "#ff7ad9", name: "桃", symbol: "✿" },
    { hex: "#c08457", name: "茶", symbol: "▼" },
    { hex: "#b9c2d6", name: "銀", symbol: "◇" },
  ];

  const STORAGE_KEY = "puzzles:water-sort:best";

  /* --- パズルのロジック（DOM に依存しない部分） -------------------------- */

  /** 試験管が「完成」か（空、または 1 色だけで満杯）。 */
  function isTubeDone(tube) {
    if (tube.length === 0) return true;
    if (tube.length < CAP) return false;
    return tube.every((c) => c === tube[0]);
  }

  const isSolved = (tubes) => tubes.every(isTubeDone);

  /** tube の一番上にある同色のかたまりの長さ。 */
  function topRunLength(tube) {
    const color = tube[tube.length - 1];
    let n = 0;
    for (let i = tube.length - 1; i >= 0 && tube[i] === color; i--) n++;
    return n;
  }

  /** from から to へ注げるか。注げるなら移る量、注げないなら 0。 */
  function pourAmount(tubes, from, to) {
    if (from === to) return 0;
    const src = tubes[from];
    const dst = tubes[to];
    if (src.length === 0 || dst.length >= CAP) return 0;
    if (dst.length > 0 && dst[dst.length - 1] !== src[src.length - 1]) return 0;
    return Math.min(topRunLength(src), CAP - dst.length);
  }

  function applyPour(tubes, from, to, count) {
    const next = tubes.map((t) => t.slice());
    for (let i = 0; i < count; i++) next[to].push(next[from].pop());
    return next;
  }

  /** 実際に注げる手をすべて返す（プレイ側の手詰まり判定用）。 */
  function allPours(tubes) {
    const moves = [];
    for (let i = 0; i < tubes.length; i++) {
      for (let j = 0; j < tubes.length; j++) {
        const count = pourAmount(tubes, i, j);
        if (count > 0) moves.push({ from: i, to: j, count: count });
      }
    }
    return moves;
  }

  /**
   * 探索用の手。意味のない手を落として枝を減らす。
   *   - 完成済みの試験管からは注がない
   *   - 1 色だけの試験管を空の試験管へ移すだけの手は進展がないので除く
   *   - 空の試験管は互いに区別がないので 1 本だけ候補にする
   */
  function searchMoves(tubes) {
    const moves = [];
    for (let i = 0; i < tubes.length; i++) {
      const src = tubes[i];
      if (src.length === 0 || isTubeDone(src)) continue;
      const run = topRunLength(src);
      const wholeTube = run === src.length;
      let usedEmpty = false;

      for (let j = 0; j < tubes.length; j++) {
        if (i === j) continue;
        const dst = tubes[j];
        if (dst.length >= CAP) continue;
        if (dst.length === 0) {
          if (wholeTube || usedEmpty) continue;
          usedEmpty = true;
        } else if (dst[dst.length - 1] !== src[src.length - 1]) {
          continue;
        }
        const count = Math.min(run, CAP - dst.length);
        const fills = dst.length + count === CAP;
        const empties = count === src.length;
        // 完成する手・空になる手・合流する手を先に試すと早く解ける
        const score = (fills ? 4 : 0) + (empties ? 2 : 0) + (dst.length > 0 ? 1 : 0);
        moves.push({ from: i, to: j, count: count, score: score });
      }
    }
    moves.sort((a, b) => b.score - a.score);
    return moves;
  }

  /** 並び順の違いを無視した盤面のキー。 */
  function stateKey(tubes) {
    return tubes
      .map((t) => t.join(","))
      .sort()
      .join("|");
  }

  /**
   * 深さ優先で解を 1 つ探す。
   * 返り値: { moves: [...] }（解けた）/ { moves: null }（解けない）
   *         / { moves: null, aborted: true }（打ち切り＝解けるか不明）
   */
  function solve(tubes, nodeLimit) {
    const limit = nodeLimit || 200000;
    const visited = new Set();
    const path = [];
    let nodes = 0;
    let aborted = false;

    function dfs(state) {
      if (isSolved(state)) return true;
      if (++nodes > limit) {
        aborted = true;
        return false;
      }
      const key = stateKey(state);
      if (visited.has(key)) return false;
      visited.add(key);

      for (const mv of searchMoves(state)) {
        path.push({ from: mv.from, to: mv.to, count: mv.count });
        if (dfs(applyPour(state, mv.from, mv.to, mv.count))) return true;
        path.pop();
        if (aborted) return false;
      }
      return false;
    }

    const ok = dfs(tubes.map((t) => t.slice()));
    return { moves: ok ? path.slice() : null, aborted: aborted };
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  /**
   * 問題を作る。ランダムに配ってからソルバーで確認し、
   * 「解ける」と分かったものだけを返すので必ず解ける。
   */
  function generate(colorCount, emptyCount) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const pool = [];
      for (let c = 0; c < colorCount; c++) {
        for (let k = 0; k < CAP; k++) pool.push(c);
      }
      shuffle(pool);

      const tubes = [];
      for (let i = 0; i < colorCount; i++) tubes.push(pool.slice(i * CAP, (i + 1) * CAP));
      // 最初から揃っている試験管があると簡単すぎるので作り直す
      if (tubes.some(isTubeDone)) continue;
      for (let i = 0; i < emptyCount; i++) tubes.push([]);

      const result = solve(tubes, 120000);
      if (result.moves && result.moves.length >= colorCount) {
        return { tubes: tubes, solution: result.moves };
      }
    }
    return null;
  }

  /* --- 記録（localStorage） ---------------------------------------------- */

  function readBest() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveBest(levelId, value) {
    try {
      const all = readBest();
      all[levelId] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      /* 保存できなくても遊べるので無視する */
    }
  }

  /* --- 画面まわり -------------------------------------------------------- */

  const boardEl = document.getElementById("board");
  const movesEl = document.getElementById("moves");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const messageEl = document.getElementById("message");
  const levelSegEl = document.getElementById("level-seg");
  const undoBtn = document.getElementById("undo");
  const symbolBtn = document.getElementById("symbols");

  let level = LEVELS[1];
  let tubes = [];        // 現在の盤面（各試験管は下→上の色番号の配列）
  let initialTubes = []; // 「やり直す」で戻る初期盤面
  let history = [];      // 打った手（1 手戻す用）
  let moves = 0;
  let selected = null;   // 選択中の試験管の番号
  let cleared = false;
  let lastPour = null;   // 直前に注いだ先（注ぐ演出に使う）
  let hintMove = null;
  let plan = null;       // ヒント用に覚えておく解答手順
  let planKey = null;    // その手順が対応する盤面
  let startedAt = null;
  let tickId = null;

  const currentBest = () => {
    const v = readBest()[level.id];
    return typeof v === "number" ? v : null;
  };

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

  function tubeLabel(index) {
    const tube = tubes[index];
    if (tube.length === 0) return index + 1 + "番目の試験管：空";
    const names = tube
      .slice()
      .reverse()
      .map((c) => COLORS[c].name)
      .join("、");
    return index + 1 + "番目の試験管：上から " + names + "（" + tube.length + "/" + CAP + "）";
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    for (let i = 0; i < tubes.length; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tube";
      btn.dataset.index = String(i);
      btn.innerHTML = '<span class="tube-glass"></span><span class="tube-label">' + (i + 1) + "</span>";
      btn.addEventListener("click", () => handleTubeClick(i));
      boardEl.appendChild(btn);
    }
    paint();
  }

  function paint() {
    for (let i = 0; i < tubes.length; i++) {
      const btn = boardEl.children[i];
      const glass = btn.firstChild;

      glass.innerHTML = "";
      const poured = lastPour && lastPour.to === i ? lastPour.count : 0;
      for (let k = 0; k < tubes[i].length; k++) {
        const color = COLORS[tubes[i][k]];
        const seg = document.createElement("span");
        seg.className = "liquid" + (k >= tubes[i].length - poured ? " poured" : "");
        seg.style.background = color.hex;
        seg.dataset.symbol = color.symbol;
        glass.appendChild(seg);
      }

      btn.classList.toggle("selected", selected === i);
      btn.classList.toggle("done", tubes[i].length === CAP && isTubeDone(tubes[i]));
      btn.classList.toggle("hint-from", !!hintMove && hintMove.from === i);
      btn.classList.toggle("hint-to", !!hintMove && hintMove.to === i);
      btn.setAttribute("aria-label", tubeLabel(i));
      btn.setAttribute("aria-pressed", String(selected === i));
    }

    movesEl.textContent = String(moves);
    const best = currentBest();
    bestEl.textContent = best === null ? "—" : best + " 手";
    undoBtn.disabled = history.length === 0 || cleared;
    lastPour = null;
  }

  /* --- 操作 -------------------------------------------------------------- */

  function handleTubeClick(index) {
    if (cleared) return;
    hintMove = null;

    if (selected === null) {
      if (tubes[index].length === 0) {
        messageEl.textContent = "空の試験管からは注げません。";
        return;
      }
      selected = index;
      messageEl.textContent = "";
      paint();
      return;
    }

    if (selected === index) {
      selected = null;
      paint();
      return;
    }

    const count = pourAmount(tubes, selected, index);
    if (count === 0) {
      // 注げない相手を選んだときは、その試験管を新しい選択元にする
      selected = tubes[index].length === 0 ? null : index;
      messageEl.textContent = "同じ色の上か、空の試験管にだけ注げます。";
      paint();
      return;
    }

    startTimer();
    history.push({ from: selected, to: index, count: count });
    const followed =
      !!plan && plan.length > 0 &&
      plan[0].from === selected && plan[0].to === index && plan[0].count === count;
    tubes = applyPour(tubes, selected, index, count);
    // ヒント通りに打ったら手順を 1 つ進める。外れたら次のヒントで作り直す。
    if (followed) {
      plan = plan.slice(1);
      planKey = stateKey(tubes);
    } else {
      plan = null;
      planKey = null;
    }
    lastPour = { to: index, count: count };
    moves++;
    selected = null;
    messageEl.textContent = "";
    paint();
    checkState();
  }

  function checkState() {
    if (isSolved(tubes)) {
      cleared = true;
      stopTimer();
      boardEl.classList.add("cleared");
      const best = currentBest();
      if (best === null || moves < best) {
        saveBest(level.id, moves);
        messageEl.textContent = "クリア！ " + moves + " 手 — 自己ベスト更新 🎉";
      } else {
        messageEl.textContent = "クリア！ " + moves + " 手（ベスト " + best + " 手）";
      }
      paint();
      return;
    }
    if (allPours(tubes).length === 0) {
      messageEl.textContent = "動かせる手がありません。「1手戻す」か「やり直す」を使ってください。";
    }
  }

  function newGame() {
    messageEl.textContent = "問題を作っています…";
    const puzzle = generate(level.colors, level.empty);
    if (!puzzle) {
      messageEl.textContent = "問題を作れませんでした。もう一度お試しください。";
      return;
    }
    tubes = puzzle.tubes;
    initialTubes = tubes.map((t) => t.slice());
    history = [];
    moves = 0;
    selected = null;
    cleared = false;
    hintMove = null;
    lastPour = null;
    plan = null;
    planKey = null;
    messageEl.textContent = "";
    boardEl.classList.remove("cleared");
    resetTimer();
    buildBoard();
  }

  function restart() {
    tubes = initialTubes.map((t) => t.slice());
    history = [];
    moves = 0;
    selected = null;
    cleared = false;
    hintMove = null;
    lastPour = null;
    plan = null;
    planKey = null;
    messageEl.textContent = "";
    boardEl.classList.remove("cleared");
    resetTimer();
    paint();
  }

  function undo() {
    if (history.length === 0 || cleared) return;
    const last = history.pop();
    tubes = applyPour(tubes, last.to, last.from, last.count);
    moves--;
    selected = null;
    hintMove = null;
    plan = null;
    planKey = null;
    messageEl.textContent = "";
    paint();
  }

  function showHint() {
    if (cleared) return;

    // 同じ盤面のうちは前に見つけた手順をそのまま使う。
    // 毎回解き直すと別々の解をつまみ食いして堂々巡りになるため。
    const usable =
      plan && plan.length > 0 && planKey === stateKey(tubes) &&
      pourAmount(tubes, plan[0].from, plan[0].to) >= plan[0].count;
    if (!usable) {
      const result = solve(tubes, 200000);
      if (result.aborted) {
        messageEl.textContent = "この局面のヒントは計算しきれませんでした。";
        return;
      }
      if (!result.moves) {
        messageEl.textContent = "この状態からは揃えられません。「1手戻す」か「やり直す」を使ってください。";
        return;
      }
      plan = result.moves;
      planKey = stateKey(tubes);
    }

    hintMove = plan[0];
    selected = null;
    paint();
    messageEl.textContent =
      "あと " + plan.length + " 手。" +
      (hintMove.from + 1) + "番目 → " + (hintMove.to + 1) + "番目に注いでみよう。";
  }

  function changeLevel(next) {
    level = next;
    for (const btn of levelSegEl.querySelectorAll("button")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.level === level.id));
    }
    newGame();
  }

  /* --- キーボード操作（左右でフォーカス移動） ---------------------------- */

  boardEl.addEventListener("keydown", (ev) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[ev.key];
    const target = ev.target;
    if (!step || !target.dataset || target.dataset.index === undefined) return;
    ev.preventDefault();
    const next = Math.min(tubes.length - 1, Math.max(0, Number(target.dataset.index) + step));
    boardEl.children[next].focus();
  });

  /* --- 初期化 ------------------------------------------------------------ */

  for (const lv of LEVELS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.level = lv.id;
    btn.textContent = lv.label;
    btn.setAttribute("aria-pressed", String(lv.id === level.id));
    btn.addEventListener("click", () => changeLevel(lv));
    levelSegEl.appendChild(btn);
  }

  symbolBtn.addEventListener("click", () => {
    const on = boardEl.classList.toggle("symbols");
    symbolBtn.setAttribute("aria-pressed", String(on));
  });

  document.getElementById("new-game").addEventListener("click", newGame);
  document.getElementById("restart").addEventListener("click", restart);
  undoBtn.addEventListener("click", undo);
  document.getElementById("hint").addEventListener("click", showHint);

  newGame();
})();
