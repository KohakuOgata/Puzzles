/* ==========================================================================
   鍵はめパズル（ロックピッキング風のポリオミノ敷き詰めパズル）

   鍵ピース（ポリオミノ形状）を回転させて盤面の目標マスへ隙間なくはめ込む。
   問題は、鍵ピースを実際に隙間なく敷き詰めて盤面の形を作ってから
   ランダムな順序・向きに崩して出題するので、必ず解ける。

   「トライ」は Fallout/Skyrim 系のロックピッキングに近い緊張感を出す仕組み。
   1 回のトライの中では鍵をはめるたびに厳密被覆（exact cover）ソルバーで
   残りが解けるか判定し、解けなくなったら「詰み」。詰んだら
   トライを 1 つ消費して盤面を空に戻し、やり直す。トライが尽きるとロックが壊れる。
   ========================================================================== */

(function () {
  "use strict";

  /* --- 鍵ピースの形状ライブラリ ------------------------------------------- */

  const RAW_SHAPES = [
    { id: "mono", weight: 1, cells: [[0, 0]] },
    { id: "domino", weight: 3, cells: [[0, 0], [0, 1]] },
    { id: "tri-i", weight: 3, cells: [[0, 0], [0, 1], [0, 2]] },
    { id: "tri-l", weight: 4, cells: [[0, 0], [0, 1], [1, 0]] },
    { id: "tet-i", weight: 2, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
    { id: "tet-o", weight: 3, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
    { id: "tet-t", weight: 3, cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
    { id: "tet-s", weight: 2, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
    { id: "tet-z", weight: 2, cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
    { id: "tet-l", weight: 3, cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
    { id: "tet-j", weight: 3, cells: [[0, 1], [1, 1], [2, 0], [2, 1]] },
  ];

  function ck(r, c) {
    return r + "," + c;
  }

  function normalize(cells) {
    let minR = Infinity, minC = Infinity;
    for (const [r, c] of cells) {
      if (r < minR) minR = r;
      if (c < minC) minC = c;
    }
    return cells
      .map(([r, c]) => [r - minR, c - minC])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  function rotate90(cells) {
    return cells.map(([r, c]) => [c, -r]);
  }

  function shapeEquals(a, b) {
    if (a.length !== b.length) return false;
    const s = (cells) => cells.map((c) => c[0] + "," + c[1]).join(";");
    return s(a) === s(b);
  }

  function uniqueRotations(baseCells) {
    const rotations = [];
    let cur = normalize(baseCells);
    for (let i = 0; i < 4; i++) {
      if (!rotations.some((r) => shapeEquals(r, cur))) rotations.push(cur);
      cur = normalize(rotate90(cur));
    }
    return rotations;
  }

  const KEY_SHAPES = RAW_SHAPES.map((s) => ({
    id: s.id,
    weight: s.weight,
    rotations: uniqueRotations(s.cells),
  }));

  const KEY_COLORS = [
    "#ffd34d", "#5ad48a", "#4da3ff", "#ff7ad9",
    "#9b7bff", "#3fd0c9", "#ff8a5c", "#c9e34d",
    "#5ce1e6", "#e65c9c", "#8cff5c", "#f2b25c",
  ];

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  const LEVELS = [
    { id: "novice", label: "初級", keyCount: 5, tries: 5 },
    { id: "advanced", label: "中級", keyCount: 7, tries: 4 },
    { id: "expert", label: "上級", keyCount: 9, tries: 3 },
    { id: "master", label: "達人", keyCount: 12, tries: 3 },
  ];

  const STORAGE_KEY = "puzzles:key-fit:best";

  /* --- ユーティリティ ------------------------------------------------------ */

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** 出現しやすさの重みを反映した、試す順のシャッフル済みシェイプ索引一覧。 */
  function weightedShapeOrder() {
    const pool = [];
    KEY_SHAPES.forEach((s, idx) => {
      for (let i = 0; i < s.weight; i++) pool.push(idx);
    });
    const seen = new Set();
    const order = [];
    for (const idx of shuffle(pool)) {
      if (!seen.has(idx)) {
        seen.add(idx);
        order.push(idx);
      }
    }
    return order;
  }

  /* --- 盤面の生成（隙間なく鍵を敷き詰めて形を作る） ------------------------ */

  function tryGenerate(keyCount) {
    const size = 51; // 十分に広い作業用グリッド。あとで実際の外接矩形に切り詰める。
    const center = Math.floor(size / 2);
    const filled = new Set();
    const keys = []; // { shapeIndex, cells: [[r,c], ...] }（作業用グリッド座標）
    let frontier = [{ r: center, c: center }];

    for (let i = 0; i < keyCount; i++) {
      let placed = null;
      const candidates = shuffle(frontier);

      searchAnchor:
      for (const anchor of candidates) {
        for (const shapeIdx of weightedShapeOrder()) {
          const shape = KEY_SHAPES[shapeIdx];
          for (const rotIdx of shuffle(shape.rotations.map((_, idx) => idx))) {
            const rot = shape.rotations[rotIdx];
            for (const pivotIdx of shuffle(rot.map((_, idx) => idx))) {
              const pivot = rot[pivotIdx];
              const originR = anchor.r - pivot[0];
              const originC = anchor.c - pivot[1];
              const cells = rot.map(([dr, dc]) => [originR + dr, originC + dc]);
              const ok = cells.every(
                ([r, c]) => r >= 0 && c >= 0 && r < size && c < size && !filled.has(ck(r, c))
              );
              if (!ok) continue;
              placed = { shapeIdx, cells };
              break searchAnchor;
            }
          }
        }
      }

      if (!placed) return null;

      for (const [r, c] of placed.cells) filled.add(ck(r, c));
      keys.push({ shapeIndex: placed.shapeIdx, cells: placed.cells });

      const nextFrontier = frontier.filter((f) => !filled.has(ck(f.r, f.c)));
      for (const [r, c] of placed.cells) {
        for (const [dr, dc] of DIRS) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
          if (filled.has(ck(nr, nc))) continue;
          if (!nextFrontier.some((f) => f.r === nr && f.c === nc)) nextFrontier.push({ r: nr, c: nc });
        }
      }
      frontier = nextFrontier;
    }

    let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
    for (const k of keys) {
      for (const [r, c] of k.cells) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }

    const rows = maxR - minR + 1;
    const cols = maxC - minC + 1;
    const finalKeys = keys.map((k, idx) => ({
      id: idx,
      shapeIndex: k.shapeIndex,
      color: KEY_COLORS[idx % KEY_COLORS.length],
    }));

    const targetSet = new Set();
    for (const k of keys) {
      for (const [r, c] of k.cells) targetSet.add(ck(r - minR, c - minC));
    }

    return { rows: rows, cols: cols, targetSet: targetSet, keys: finalKeys, trayOrder: shuffle(finalKeys.map((k) => k.id)) };
  }

  function generateBoard(level) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const result = tryGenerate(level.keyCount);
      if (result) return result;
    }
    return null;
  }

  /* --- ソルバー（厳密被覆・バックトラック） --------------------------------- */

  /**
   * emptyCells（"r,c" の Set）を remainingKeys（{id, shapeIndex}[]）で
   * 過不足なく敷き詰められるか探索する。
   * 「まだ空いているマスのうち一番若い番号のマス」を必ず何かの鍵で埋める、
   * という順序で探索するので枝刈りが効く。
   */
  function solve(emptyCells, remainingKeys, rows, cols) {
    const empty = new Set(emptyCells);
    const keysLeft = remainingKeys.slice();
    const placements = [];
    let nodes = 0;
    let aborted = false;
    const LIMIT = 400000;

    function firstEmptyCell() {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (empty.has(ck(r, c))) return [r, c];
        }
      }
      return null;
    }

    function dfs() {
      if (++nodes > LIMIT) {
        aborted = true;
        return false;
      }
      const target = firstEmptyCell();
      if (!target) return keysLeft.length === 0;
      const [tr, tc] = target;

      for (let i = 0; i < keysLeft.length; i++) {
        const key = keysLeft[i];
        const shape = KEY_SHAPES[key.shapeIndex];
        for (let rotIdx = 0; rotIdx < shape.rotations.length; rotIdx++) {
          const rot = shape.rotations[rotIdx];
          for (let pivotIdx = 0; pivotIdx < rot.length; pivotIdx++) {
            const pivot = rot[pivotIdx];
            const originR = tr - pivot[0], originC = tc - pivot[1];
            const cells = rot.map(([dr, dc]) => [originR + dr, originC + dc]);
            if (!cells.every(([r, c]) => empty.has(ck(r, c)))) continue;

            for (const [r, c] of cells) empty.delete(ck(r, c));
            keysLeft.splice(i, 1);
            placements.push({ keyId: key.id, rotIndex: rotIdx, cells: cells });

            if (dfs()) return true;

            placements.pop();
            keysLeft.splice(i, 0, key);
            for (const [r, c] of cells) empty.add(ck(r, c));
            if (aborted) return false;
          }
        }
      }
      return false;
    }

    const ok = dfs();
    return { solved: ok, placements: ok ? placements.slice() : null, aborted: aborted };
  }

  /** ある形状のいずれかの向きが、今の空きマスのどこかに収まるか。 */
  function shapeFitsSomewhere(shapeIndex, emptyCells, rows, cols) {
    const shape = KEY_SHAPES[shapeIndex];
    for (const rot of shape.rotations) {
      const pivot = rot[0];
      for (const cellStr of emptyCells) {
        const parts = cellStr.split(",");
        const rr = Number(parts[0]), cc = Number(parts[1]);
        const originR = rr - pivot[0], originC = cc - pivot[1];
        const cells = rot.map(([dr, dc]) => [originR + dr, originC + dc]);
        if (cells.every(([r, c]) => r >= 0 && c >= 0 && r < rows && c < cols && emptyCells.has(ck(r, c)))) {
          return true;
        }
      }
    }
    return false;
  }

  /* --- 記録（localStorage） ------------------------------------------------ */

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

  /* --- 画面まわり ------------------------------------------------------------ */

  const boardEl = document.getElementById("board");
  const trayEl = document.getElementById("tray");
  const triesEl = document.getElementById("tries");
  const keysLeftEl = document.getElementById("keys-left");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const messageEl = document.getElementById("message");
  const levelSegEl = document.getElementById("level-seg");
  const giveUpBtn = document.getElementById("give-up");
  const hintBtn = document.getElementById("hint");

  let level = LEVELS[0];
  let board = null;          // { rows, cols, targetSet, keys, trayOrder }
  let emptyCells = new Set();
  let placedCells = new Map(); // "r,c" -> keyId
  let remainingKeys = [];      // { id, shapeIndex, color, rotationIndex }
  let selectedKeyId = null;
  let hoverCell = null;
  let hintPlacement = null;    // { keyId, cells: [[r,c], ...] }
  let triesLeft = 0;
  let cleared = false;
  let stuck = false;
  let jammed = false;          // トライを使い切って失敗
  let cellEls = [];            // cellEls[r][c]
  let startedAt = null;
  let tickId = null;

  const currentBest = () => {
    const v = readBest()[level.id];
    return typeof v === "number" ? v : null;
  };

  /* --- タイマー -------------------------------------------------------------- */

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

  /* --- 盤面 DOM -------------------------------------------------------------- */

  function buildBoard() {
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--dp-rows", String(board.rows));
    boardEl.style.setProperty("--dp-cols", String(board.cols));
    cellEls = [];

    for (let r = 0; r < board.rows; r++) {
      const row = [];
      for (let c = 0; c < board.cols; c++) {
        const isTarget = board.targetSet.has(ck(r, c));
        const el = document.createElement(isTarget ? "button" : "div");
        el.className = "cell " + (isTarget ? "target" : "wall");
        if (isTarget) {
          el.type = "button";
          el.dataset.r = String(r);
          el.dataset.c = String(c);
          el.addEventListener("mouseenter", () => handleCellHover(r, c));
          el.addEventListener("focus", () => handleCellHover(r, c));
          el.addEventListener("click", () => handleCellClick(r, c));
        } else {
          el.setAttribute("aria-hidden", "true");
        }
        boardEl.appendChild(el);
        row.push(el);
      }
      cellEls.push(row);
    }

    boardEl.addEventListener("mouseleave", () => {
      hoverCell = null;
      paintBoard();
    });
  }

  function computePlacementCells(key, anchor) {
    const shape = KEY_SHAPES[key.shapeIndex];
    const rot = shape.rotations[key.rotationIndex];
    const pivot = rot[0];
    const originR = anchor.r - pivot[0];
    const originC = anchor.c - pivot[1];
    return rot.map(([dr, dc]) => [originR + dr, originC + dc]);
  }

  function isPlacementValid(cells) {
    return cells.every(
      ([r, c]) => r >= 0 && c >= 0 && r < board.rows && c < board.cols && emptyCells.has(ck(r, c))
    );
  }

  function paintBoard() {
    let previewCells = null;
    let previewValid = false;
    if (selectedKeyId !== null && hoverCell !== null && !stuck && !cleared && !jammed) {
      const key = remainingKeys.find((k) => k.id === selectedKeyId);
      if (key) {
        previewCells = computePlacementCells(key, hoverCell);
        previewValid = isPlacementValid(previewCells);
      }
    }
    const previewSet = new Set((previewCells || []).map(([r, c]) => ck(r, c)));
    const hintSet = new Set((hintPlacement ? hintPlacement.cells : []).map(([r, c]) => ck(r, c)));

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        if (!board.targetSet.has(ck(r, c))) continue;
        const el = cellEls[r][c];
        const key = ck(r, c);
        const filledKeyId = placedCells.get(key);

        el.classList.remove("filled", "preview-ok", "preview-bad", "hint");
        el.style.removeProperty("--key-color");

        if (filledKeyId !== undefined) {
          const keyDef = board.keys.find((k) => k.id === filledKeyId);
          el.classList.add("filled");
          el.style.setProperty("--key-color", keyDef.color);
          el.disabled = true;
          el.setAttribute("aria-label", "マス " + (r + 1) + "," + (c + 1) + "：鍵で埋まっています");
        } else {
          el.disabled = stuck || cleared || jammed;
          if (hintSet.has(key)) {
            el.classList.add("hint");
          } else if (previewSet.has(key)) {
            el.classList.add(previewValid ? "preview-ok" : "preview-bad");
          }
          el.setAttribute("aria-label", "マス " + (r + 1) + "," + (c + 1) + "：空き");
        }
      }
    }
  }

  function shapeCells4x4(rot) {
    let maxR = 0, maxC = 0;
    for (const [r, c] of rot) {
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
    const set = new Set(rot.map(([r, c]) => r + "," + c));
    return { set: set, rows: maxR + 1, cols: maxC + 1 };
  }

  function buildTrayTile(key) {
    const shape = KEY_SHAPES[key.shapeIndex];
    const rot = shape.rotations[key.rotationIndex];
    const info = shapeCells4x4(rot);

    const tile = document.createElement("div");
    tile.className = "dp-key";
    tile.dataset.key = String(key.id);
    tile.style.setProperty("--key-color", key.color);
    tile.tabIndex = 0;
    tile.setAttribute("role", "button");
    tile.setAttribute("aria-label", "鍵 " + (key.id + 1));

    const mini = document.createElement("div");
    mini.className = "dp-key-shape";
    mini.style.setProperty("--mini-rows", String(Math.max(info.rows, 1)));
    mini.style.setProperty("--mini-cols", String(Math.max(info.cols, 1)));
    for (let r = 0; r < info.rows; r++) {
      for (let c = 0; c < info.cols; c++) {
        const sq = document.createElement("span");
        sq.className = "mini-cell" + (info.set.has(r + "," + c) ? " on" : "");
        mini.appendChild(sq);
      }
    }
    tile.appendChild(mini);

    const rotateBtn = document.createElement("button");
    rotateBtn.type = "button";
    rotateBtn.className = "dp-key-rotate";
    rotateBtn.setAttribute("aria-label", "回転");
    rotateBtn.textContent = "⟳";
    rotateBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      rotateKey(key.id);
    });
    tile.appendChild(rotateBtn);

    tile.addEventListener("click", () => selectKey(key.id));
    tile.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectKey(key.id);
      } else if (ev.key.toLowerCase() === "r") {
        ev.preventDefault();
        rotateKey(key.id);
      }
    });

    return tile;
  }

  function paintTray() {
    trayEl.innerHTML = "";
    const order = board.trayOrder.filter((id) => remainingKeys.some((k) => k.id === id));
    for (const id of order) {
      const key = remainingKeys.find((k) => k.id === id);
      const tile = buildTrayTile(key);
      tile.classList.toggle("selected", selectedKeyId === key.id);
      const dead = !shapeFitsSomewhere(key.shapeIndex, emptyCells, board.rows, board.cols);
      tile.classList.toggle("dead", dead);
      if (dead) tile.title = "この鍵は今の盤面のどこにも置けません。";
      if (stuck || cleared || jammed) tile.classList.add("locked");
      trayEl.appendChild(tile);
    }
  }

  function updateStats() {
    triesEl.textContent = triesLeft + " / " + level.tries;
    keysLeftEl.textContent = remainingKeys.length + " / " + board.keys.length;
    const best = currentBest();
    bestEl.textContent = best === null ? "—" : best + " トライ";
  }

  function updateButtons() {
    giveUpBtn.disabled = cleared || jammed;
    hintBtn.disabled = cleared || jammed || stuck;
  }

  /* --- 操作 -------------------------------------------------------------- */

  function selectKey(id) {
    if (stuck || cleared || jammed) return;
    selectedKeyId = selectedKeyId === id ? null : id;
    hintPlacement = null;
    messageEl.textContent = "";
    paintBoard();
    paintTray();
  }

  function rotateKey(id) {
    if (stuck || cleared || jammed) return;
    const key = remainingKeys.find((k) => k.id === id);
    if (!key) return;
    const shape = KEY_SHAPES[key.shapeIndex];
    key.rotationIndex = (key.rotationIndex + 1) % shape.rotations.length;
    hintPlacement = null;
    paintBoard();
    paintTray();
  }

  function handleCellHover(r, c) {
    if (selectedKeyId === null || stuck || cleared || jammed) return;
    hoverCell = { r: r, c: c };
    paintBoard();
  }

  function shakeBoard() {
    boardEl.classList.remove("shake");
    // 強制リフローで再アニメーションできるようにする
    void boardEl.offsetWidth;
    boardEl.classList.add("shake");
  }

  function handleCellClick(r, c) {
    if (stuck || cleared || jammed) return;
    if (selectedKeyId === null) {
      messageEl.textContent = "先に下の鍵を選んでください。";
      return;
    }
    const key = remainingKeys.find((k) => k.id === selectedKeyId);
    const cells = computePlacementCells(key, { r: r, c: c });
    if (!isPlacementValid(cells)) {
      messageEl.textContent = "そこには置けません（壁や他の鍵と重なります）。";
      shakeBoard();
      return;
    }
    commitPlacement(key, cells);
  }

  function commitPlacement(key, cells) {
    startTimer();
    for (const [r, c] of cells) {
      emptyCells.delete(ck(r, c));
      placedCells.set(ck(r, c), key.id);
    }
    remainingKeys = remainingKeys.filter((k) => k.id !== key.id);
    selectedKeyId = null;
    hoverCell = null;
    hintPlacement = null;
    messageEl.textContent = "";
    paintBoard();
    paintTray();
    checkProgress();
  }

  function checkProgress() {
    if (remainingKeys.length === 0 && emptyCells.size === 0) {
      onClear();
      updateStats();
      updateButtons();
      return;
    }

    const remaining = remainingKeys.map((k) => ({ id: k.id, shapeIndex: k.shapeIndex }));
    const result = solve(emptyCells, remaining, board.rows, board.cols);
    if (!result.aborted && !result.solved) {
      stuck = true;
      messageEl.textContent =
        "このままでは残りの鍵で盤面を埋めきれません。詰みです。「この試行をやめる」でやり直しましょう。";
      paintBoard();
      paintTray();
    }
    updateStats();
    updateButtons();
  }

  function onClear() {
    cleared = true;
    stopTimer();
    boardEl.classList.add("cleared");
    const used = level.tries - triesLeft + 1;
    const best = currentBest();
    if (best === null || used < best) {
      saveBest(level.id, used);
      messageEl.textContent = "ロック解除！ " + used + " トライで成功 — 自己ベスト更新 🎉";
    } else {
      messageEl.textContent = "ロック解除！ " + used + " トライで成功（ベスト " + best + " トライ）";
    }
  }

  function startAttempt(isNewPuzzle) {
    emptyCells = new Set(board.targetSet);
    placedCells = new Map();
    remainingKeys = board.keys.map((k) => ({
      id: k.id,
      shapeIndex: k.shapeIndex,
      color: k.color,
      rotationIndex: Math.floor(Math.random() * KEY_SHAPES[k.shapeIndex].rotations.length),
    }));
    selectedKeyId = null;
    hoverCell = null;
    hintPlacement = null;
    stuck = false;
    cleared = false;
    jammed = false;
    boardEl.classList.remove("cleared", "jammed");
    resetTimer();
    messageEl.textContent = isNewPuzzle ? "" : "この試行をやめて、盤面を空に戻しました。";
    paintBoard();
    paintTray();
    updateStats();
    updateButtons();
  }

  function giveUp() {
    if (cleared || jammed) return;
    triesLeft--;
    if (triesLeft <= 0) {
      gameOver();
      return;
    }
    startAttempt(false);
  }

  function gameOver() {
    jammed = true;
    stopTimer();
    boardEl.classList.add("jammed");
    messageEl.textContent = "トライを使い切り、ロックが壊れてしまいました…「新しい問題」で仕切り直しましょう。";
    paintBoard();
    paintTray();
    updateStats();
    updateButtons();
  }

  function showHint() {
    if (cleared || jammed || stuck) return;
    const remaining = remainingKeys.map((k) => ({ id: k.id, shapeIndex: k.shapeIndex }));
    const result = solve(emptyCells, remaining, board.rows, board.cols);
    if (result.aborted) {
      messageEl.textContent = "この局面のヒントは計算しきれませんでした。";
      return;
    }
    if (!result.solved) {
      stuck = true;
      messageEl.textContent =
        "詰みです。「この試行をやめる」でやり直しましょう。";
      paintBoard();
      paintTray();
      updateButtons();
      return;
    }
    const first = result.placements[0];
    const key = remainingKeys.find((k) => k.id === first.keyId);
    key.rotationIndex = first.rotIndex;
    selectedKeyId = first.keyId;
    hintPlacement = { keyId: first.keyId, cells: first.cells };
    messageEl.textContent = "ハイライトした鍵を、盤面のハイライトした場所に置いてみましょう。";
    paintBoard();
    paintTray();
  }

  function newGame() {
    messageEl.textContent = "問題を作っています…";
    const generated = generateBoard(level);
    if (!generated) {
      messageEl.textContent = "問題を作れませんでした。もう一度お試しください。";
      return;
    }
    board = generated;
    triesLeft = level.tries;
    buildBoard();
    startAttempt(true);
  }

  function changeLevel(next) {
    level = next;
    for (const btn of levelSegEl.querySelectorAll("button")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.level === level.id));
    }
    newGame();
  }

  /* --- キーボード操作 ------------------------------------------------------ */

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && selectedKeyId !== null) {
      selectedKeyId = null;
      hintPlacement = null;
      paintBoard();
      paintTray();
    }
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

  document.getElementById("new-game").addEventListener("click", newGame);
  giveUpBtn.addEventListener("click", giveUp);
  hintBtn.addEventListener("click", showHint);

  newGame();
})();
