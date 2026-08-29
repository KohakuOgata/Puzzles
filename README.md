# Puzzles

ランダム生成できる小さなパズルを集めたアーカイブ。ビルド不要の静的サイトで、GitHub Pages にそのまま公開して遊べます。

**▶ 遊ぶ: https://kohakuogata.github.io/Puzzles/**

## 収録パズル

| パズル | 説明 | 状態 |
| --- | --- | --- |
| [ライツアウト](puzzles/lights-out/) | すべてのライトを消す。押したマスと上下左右が同時に反転する。3×3〜7×7、ヒント・最少手数記録つき。 | 遊べる |
| [水そそぎパズル](puzzles/water-sort/) | 試験管の液体を移し替えて同じ色を揃える。同じ色の上か空の試験管にだけ注げる。難易度 4 段階、ヒント・1手戻すつき。 | 遊べる |
| [デジピック](puzzles/digipick/) | Starfield のロックピッキングと同じ仕組み。鍵を回して歯をリングのくぼみに合わせ、外側のリングから順に解除する。難易度 4 段階、詰み判定・1 手戻す・自動解除つき。 | 遊べる |
| [鍵はめパズル](puzzles/key-fit/) | 鍵ピースを回転させて盤面に隙間なくはめ込み、すべてのマスを埋める敷き詰めパズル。難易度 4 段階、トライ制・ヒントつき。 | 遊べる |

## ローカルで動かす

外部ライブラリもビルド手順もありません。適当な静的サーバーで開くだけです。

```bash
python -m http.server 4173
```

その後 http://localhost:4173 を開きます。
（`file://` で直接開いても動きますが、ブラウザによっては読み込みが制限されるためサーバー経由を推奨します。）

## 構成

```
.
├── index.html              # パズル選択画面
├── assets/
│   ├── css/base.css        # 全ページ共通のスタイル
│   └── js/puzzles.js       # パズル一覧のレジストリ + カード描画
└── puzzles/
    ├── lights-out/         # パズル 1 つにつき 1 ディレクトリ
    │   ├── index.html
    │   ├── game.js
    │   └── style.css
    ├── water-sort/
    │   ├── index.html
    │   ├── game.js
    │   └── style.css
    ├── key-fit/
    │   ├── index.html
    │   ├── game.js
    │   └── style.css
    └── digipick/
        ├── index.html
        ├── game.js
        └── style.css
```

各パズルは自分のディレクトリの中で完結しています。共通なのは `assets/` の土台だけなので、1 つのパズルを直しても他に影響しません。

## パズルを追加する

1. `puzzles/<id>/` を作り、`index.html` / `game.js` / `style.css` を置く。
   既存の `puzzles/lights-out/` をひな形にするのが早いです。
2. `assets/js/puzzles.js` の `PUZZLES` 配列にエントリを 1 つ足す。

```js
{
  id: "my-puzzle",          // puzzles/<id>/ に対応
  name: "パズル名",
  icon: "🧩",               // カードに出す絵文字
  desc: "一行説明。",
  tags: ["論理", "1人用"],
  status: "ready",          // "ready" = 遊べる / "soon" = 準備中（リンク無効）
}
```

選択画面のカードはこの配列から自動で生成されるので、トップページの HTML を触る必要はありません。

### 作るときの方針

- **必ず解ける問題を生成する。** ライツアウトでは「全消灯の盤面をランダムに押した状態」を初期盤面にすることで保証しています。水そそぎパズルのように、ランダム生成したあとソルバーで解けるか検証する方式でも構いません。
- **依存ゼロ・素の HTML/CSS/JS で書く。** ビルド工程を挟まないので、リポジトリの中身がそのまま公開されるものになります。
- **共通スタイルを使う。** `.wrap` / `.btn` / `.seg` / `.stats` / `.card` などは `assets/css/base.css` にあります。パズル固有の見た目だけ `style.css` に書きます。
- **スマホでも遊べるように。** タップ操作とレスポンシブ幅を前提にします。

## GitHub Pages への公開

リポジトリの Settings → Pages で、Source を **Deploy from a branch**、ブランチを `main` / `(root)` に設定すれば公開されます。ビルドは不要です。`.nojekyll` を置いてあるため、Jekyll による変換は行われません。

## ライセンス

MIT
