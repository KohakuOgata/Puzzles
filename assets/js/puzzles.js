/**
 * パズル一覧のレジストリ。
 * パズルを追加するときは puzzles/<id>/ を作り、ここに 1 エントリ足すだけ。
 *
 *   id     : ディレクトリ名（puzzles/<id>/ に対応）
 *   name   : 表示名
 *   icon   : カードに出す絵文字
 *   desc   : 一行説明
 *   tags   : 分類用ラベル
 *   status : "ready"（遊べる） / "soon"（準備中・リンク無効）
 */
const PUZZLES = [
  {
    id: "lights-out",
    name: "ライツアウト",
    icon: "💡",
    desc: "すべてのライトを消す。押したマスと上下左右が同時に反転する。",
    tags: ["論理", "1人用", "自動生成"],
    status: "ready",
  },
  {
    id: "water-sort",
    name: "水そそぎパズル",
    icon: "🧪",
    desc: "試験管の液体を移し替えて、同じ色を 1 本にまとめる。",
    tags: ["並べ替え", "1人用", "自動生成"],
    status: "ready",
  },
];

/** 一覧を #puzzle-list に描画する。 */
function renderPuzzleList(container) {
  container.innerHTML = "";
  for (const p of PUZZLES) {
    const ready = p.status === "ready";
    const card = document.createElement(ready ? "a" : "div");
    card.className = "card" + (ready ? "" : " soon");
    if (ready) card.href = `puzzles/${p.id}/`;

    card.innerHTML = `
      <div class="card-thumb">${p.icon}</div>
      <h2 class="card-title">${p.name}</h2>
      <p class="card-desc">${p.desc}</p>
      <div class="tags">${p.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
    `;
    container.appendChild(card);
  }

  // 「これから増えます」の空きスロット
  const placeholder = document.createElement("div");
  placeholder.className = "card soon";
  placeholder.innerHTML = `
    <div class="card-thumb">➕</div>
    <h2 class="card-title">準備中</h2>
    <p class="card-desc">新しいパズルを追加予定。</p>
    <div class="tags"><span class="tag">coming soon</span></div>
  `;
  container.appendChild(placeholder);
}
