// スクレイピング結果の健全性チェック（DASセレクター用）。
// NASセレクター・ISSセレクターと同じ考え方：前回との件数比較で、
// 大きく減っていないかだけを確認する。
//
// 問題が無ければ終了コード0、問題があれば終了コード1を返す。

import fs from "node:fs";

const OLD_PATH = "data/das-products.previous.json";
const NEW_PATH = "data/das-products.json";

// DASセレクターは対象件数がもともと少なめ（現状25件前後）なので、
// 他の2ツールより緩めの閾値（2割）にしておく。
const DROP_THRESHOLD = 0.2;

function loadProductCount(path) {
  if (!fs.existsSync(path)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(path, "utf8"));
    return Array.isArray(json.products) ? json.products.length : null;
  } catch (e) {
    return null;
  }
}

const oldCount = loadProductCount(OLD_PATH);
const newCount = loadProductCount(NEW_PATH);

console.log(`前回のDAS件数: ${oldCount ?? "不明（初回実行など）"}`);
console.log(`今回のDAS件数: ${newCount ?? "不明（読み込み失敗）"}`);

if (newCount === null || newCount === 0) {
  console.error("異常あり: 新しいデータが空か、正しく読み込めませんでした。");
  process.exit(1);
}

if (oldCount !== null && oldCount > 0) {
  const dropRatio = (oldCount - newCount) / oldCount;
  if (dropRatio > DROP_THRESHOLD) {
    console.error(
      `異常あり: DAS件数が前回より${Math.round(dropRatio * 100)}%減少しています` +
      `（${oldCount}件 → ${newCount}件）。対応表のページ構造が変わった可能性があります。`
    );
    process.exit(1);
  }
}

console.log("健全性チェック: 問題ありませんでした。");
process.exit(0);
