// DASセレクター（バックアップ用HDD選定ツール）のデータを取得するスクレイパー。
//
// 使い方：
//   node scripts/scrape-das.mjs
//
// データソースは1つだけ：
//   https://www.iodata.jp/pio/io/nas/landisk/hdd.htm
// 「NAS本体×バックアップ用HDD(DAS)の対応表」。
//
// 方針：この対応表に載っている型番だけを対象にする（法人向け・個人向け問わず、
// 公式に対応が明記されているものだけを扱う）。対応表の各区分（linux-h1, windows2019,
// cons等）ごとに「NASシリーズ列」と「DAS型番の行」がある表になっており、
// 型番セルはその型番自身の商品ページへのリンクになっているので、そこから型番の
// 一覧とURLを取得し、それぞれの商品ページ（index.htm / spec.htm）から実際の容量・
// 価格・保証年数・ドライブ数を補って1つのデータにまとめる。
//
// 対応表は1行＝1シリーズ単位（例："HDJA-UTNB"が1〜32TBすべてを代表する）なので、
// 型番ごとの詳細（容量バリエーション等）は、その型番自身のページ側でしか分からない。

import fs from "node:fs/promises";

const HDD_COMPAT_URL = "https://www.iodata.jp/pio/io/nas/landisk/hdd.htm";
const HDD_COMPAT_ANCHORS = [
  "linux-h1", "linux-h2", "linux-e1", "linux-e2",
  "windows2025", "windows2022", "windows2019", "cons"
];

// HD1-REUT（カートリッジ式アダプター本体）専用の交換用カートリッジ。
// 対応表(hdd.htm)にはHD1-REUT自体しか出てこないため、実際に選べる容量は
// このカートリッジ側のページから別途補う（事前調査で確認済みのURL）。
const CARTRIDGE_SUPPLEMENTS = {
  "https://www.iodata.jp/product/nas/option/hdlh-opa": {
    forAdapterUrl: "https://www.iodata.jp/product/hdd/bizhdd/hd1-reut",
    // カード側の表示用。この場合、表示・リンク先ともに「カートリッジ(HDLH-OPA)
    // 本体」を主役にしたいので、hdd.htm由来のシリーズ名(HD1-REUT)ではなく
    // こちらを使う。
    cartridgeSeriesLabel: "HDLH-OPA"
  }
};

const OUTPUT_PATH = new URL("../data/das-products.json", import.meta.url);
const REQUEST_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 15000;

const USER_AGENT =
  "NasSelectorBot/1.0 (+https://github.com/ioplaza02/nas-das-selector; " +
  "monthly price/spec check for internal comparison tool)";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(url + " -> " + res.status);
  return res.text();
}

function getAttr(tagAttrs, name) {
  const re = new RegExp(name + '="(\\d+)"', "i");
  const m = re.exec(tagAttrs);
  return m ? Number(m[1]) : 1;
}

// <tr>ごとに、各セルのテキスト・href・colspanを持つ配列にする共通パーサー。
function parseTableRows(tableHtml) {
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [];
  let rowMatch;
  while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1];
    const cellRe = /<(t[dh])([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      const tagAttrs = cellMatch[2];
      const rawCell = cellMatch[3];
      const hrefMatch = rawCell.match(/href="([^"]+)"/);
      const text = rawCell.replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
      // セルの中に商品リンクが複数連結されている行（例：型番シリーズの内訳セルや、
      // まれに1セルに2商品分のリンクが並ぶデータ行）があるため、"最初のリンクの
      // テキストだけ"も別途保持しておく。型番セルの読み取りにはこちらを使う。
      const firstAnchorMatch = rawCell.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      const firstAnchorText = firstAnchorMatch
        ? firstAnchorMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim()
        : text;
      cells.push({
        text,
        firstAnchorText,
        href: hrefMatch ? hrefMatch[1] : null,
        colspan: getAttr(tagAttrs, "colspan")
      });
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

// 型番セルの「HD1-REUT※12」のような脚注記号を取り除いて、正味の型番だけにする。
// 「HDJA-UTN/LDC」のように"/"を含む型番（本体同梱パッケージ向けの型番）もあるため、
// "/"も型番の一部として許可する（これを除外すると"/"以降が丸ごと欠落してしまう）。
function cleanModelCode(text) {
  const m = text.match(/^[A-Z0-9][A-Z0-9\-\/]*/i);
  return m ? m[0] : text;
}

function resolveProductUrl(href) {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  return "https://www.iodata.jp" + (href.startsWith("/") ? href : "/" + href);
}

// URLの末尾を "index.htm" ありなし・スラッシュありなしバラバラな状態から、
// 「.../hdja-utnb」のような正規化キーにそろえる（同じ型番を重複登録しないため）。
function normalizeProductKey(url) {
  return url.replace(/index\.htm$/i, "").replace(/\/$/, "");
}

// hdd.htm全体を解析し、DAS型番ごとに「どの区分の、どのNASシリーズに、
// どの記号(◎○●×-)で対応しているか」を集約する。
// 戻り値: Map<正規化キー, { modelCode, sourceUrl, connection, compat: [{section, nasSeries, symbol}] }>
function extractCompatTable(html) {
  const anchors = [];
  for (const name of HDD_COMPAT_ANCHORS) {
    const re = new RegExp('(?:id|name)="' + name + '"', "i");
    const m = re.exec(html);
    if (m) anchors.push({ name, index: m.index });
  }
  anchors.sort((a, b) => a.index - b.index);

  const dasMap = new Map();

  const tableRe = /<table[^>]*>[\s\S]*?<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tableMatch[0];
    const tableIndex = tableMatch.index;
    let section = null;
    for (const a of anchors) {
      if (a.index <= tableIndex) section = a.name;
      else break;
    }
    if (!section) continue;

    const rows = parseTableRows(tableHtml);
    if (rows.length === 0) continue;
    // 「商品型番／接続方法／商品型番シリーズ名」の見出しを持つ表だけを対象にする
    if (!rows[0].some(c => /^商品型番$/.test(c.text))) continue;

    const seriesHeaderRow = rows[1];
    if (!seriesHeaderRow) continue;

    // NASシリーズ名の行をcolspan分だけ展開し、実際のデータ列数に合わせる
    // （例：「LAN DISK L」がcolspan=2なら、同じ名前を2列分並べる）
    const seriesNames = [];
    seriesHeaderRow.forEach(cell => {
      const cleanName = cell.text.replace(/[（(].*?[）)]/g, ""); // 「（※4）」等の注記を除く
      for (let i = 0; i < cell.colspan; i++) seriesNames.push(cleanName);
    });
    if (seriesNames.length === 0) continue;

    const expectedCellCount = 2 + seriesNames.length;

    // データ行は「型番セル＋接続方法セル＋対応記号×NASシリーズ数」の並びのはず。
    // 見出しや「シリーズ内訳」の行はセル数が合わないので、自然にスキップされる。
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (row.length !== expectedCellCount) continue;
      const modelCell = row[0];
      const connectionCell = row[1];
      const productUrl = resolveProductUrl(modelCell.href);
      if (!productUrl) continue; // 型番へのリンクが無い行はデータ行ではない

      const key = normalizeProductKey(productUrl);
      if (!dasMap.has(key)) {
        dasMap.set(key, {
          // 型番は「セル内の最初のリンクのテキスト」から取る（1セルに複数商品リンクが
          // 連結されているケースで、テキストが継ぎ接ぎにならないようにするため）
          modelCode: cleanModelCode(modelCell.firstAnchorText),
          sourceUrl: productUrl,
          connection: cleanModelCode(connectionCell.text),
          compat: []
        });
      }
      const entry = dasMap.get(key);
      for (let c = 0; c < seriesNames.length; c++) {
        const symbolCell = row[2 + c];
        if (!symbolCell) continue;
        entry.compat.push({ section, nasSeries: seriesNames[c], symbol: symbolCell.text });
      }
    }
  }
  return dasMap;
}

// 記号(◎○●×-)を「対応しているかどうか」の真偽値に変換する。
// ◎○●はいずれも「動作する」という意味なので、DASセレクターの絞り込みでは
// まとめて「対応」として扱う。詳しい違い（省電力・BitLocker対応）は
// 商品比較の補足情報として別途残す。
function symbolToSupport(symbol) {
  if (symbol === "◎" || symbol === "○" || symbol === "●") return true;
  if (symbol === "×") return false;
  return null; // "-" 等（未検証）
}

// 型番自身の商品ページ(index.htm)にある価格表から、SKU・容量・価格(税込/税抜)・JANを取り出す。
// NASセレクターのカタログスクレイパーと違い、対象が「型番自身のページ」なので、
// カタログ全体を横断検索する必要が無い（＝そのページの中の価格表を素直に読むだけ）。
function extractOwnVariants(html) {
  const variants = [];
  const tableRe = /<table[^>]*>[\s\S]*?<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tableMatch[0];
    const stripped = tableHtml.replace(/<[^>]+>/g, "");
    if (!/型番/.test(stripped) || !/￥/.test(stripped)) continue;

    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim());
      }
      if (cells.length < 3) continue;

      // 1列目が型番らしい文字列（大文字英数字・ハイフン・"/"）の行だけを価格行として扱う。
      // "HDJA-UTN1/LDC"のように"/"を含む型番の商品があるため、"/"も許可する
      // （許可しないと、この手の型番の商品が価格表ごと丸ごと検出できず、対応表に
      // 載っているのにDASセレクターの検索結果から漏れてしまう）。
      if (!/^[A-Z][A-Z0-9\-\/]+$/.test(cells[0])) continue;
      const rowText = cells.join(" ");

      const capMatch = rowText.match(/(\d+(?:\.\d+)?)\s*(TB|GB)/i);
      const priceMatch = rowText.match(/￥([\d,]+)(?:[^\d]*税抜￥([\d,]+))?/);
      if (!capMatch || !priceMatch) continue;

      const capValue = Number(capMatch[1]);
      const capacityTB = capMatch[2].toUpperCase() === "TB" ? capValue : capValue / 1000;
      const janMatch = rowText.match(/\b(\d{13})\b/);
      const status = /生産終了/.test(rowText) ? "生産終了" : "現行";

      variants.push({
        sku: cells[0],
        capacityTB,
        priceIncTax: Number(priceMatch[1].replace(/,/g, "")),
        priceExTax: priceMatch[2] ? Number(priceMatch[2].replace(/,/g, "")) : null,
        jan: janMatch ? janMatch[1] : "",
        status
      });
    }
  }
  // 同じSKUが複数箇所（トップページ＋価格表等）に重複して載ることがあるので、SKU単位でまとめる
  const bySku = new Map();
  for (const v of variants) {
    if (!bySku.has(v.sku)) bySku.set(v.sku, v);
  }
  return [...bySku.values()].sort((a, b) => a.capacityTB - b.capacityTB);
}

// 容量バリエーションを持たない単体商品（例：HD1-REUTのような、容量表記の無い
// カートリッジ式アダプター本体）向けの価格抽出。extractOwnVariants()は「TB/GB表記が
// 行内にあること」を必須にしているため、容量を持たない単体商品の価格行は拾えない。
// こちらは代わりに「期待する型番がセルに含まれていること」を手がかりにする。
function extractSingleItemPrice(html, expectedModelCode) {
  if (!html || !expectedModelCode) return null;
  const tableRe = /<table[^>]*>[\s\S]*?<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tableMatch[0];
    const stripped = tableHtml.replace(/<[^>]+>/g, "");
    if (!/型番/.test(stripped) || !/￥/.test(stripped)) continue;

    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim());
      }
      if (cells.length < 2) continue;
      if (!cells.some((c) => c.toUpperCase().includes(expectedModelCode.toUpperCase()))) continue;

      const rowText = cells.join(" ");
      const priceMatch = rowText.match(/￥([\d,]+)(?:[^\d]*税抜￥([\d,]+))?/);
      if (!priceMatch) continue;
      const janMatch = rowText.match(/\b(\d{13})\b/);
      return {
        priceIncTax: Number(priceMatch[1].replace(/,/g, "")),
        priceExTax: priceMatch[2] ? Number(priceMatch[2].replace(/,/g, "")) : null,
        jan: janMatch ? janMatch[1] : ""
      };
    }
  }
  return null;
}

// 商品ページのテキストから、ドライブ数・保証年数・カートリッジ式かどうかを読み取る。
//
// ドライブ数の表記は商品によってバラバラ（例："2ドライブ搭載"、"2ドライブ 外付け
// ハードディスク"、"2台のハードディスクを搭載"）なので、複数パターンを順に試す。
function extractDriveWarrantyCartridge(combinedText) {
  let driveCount = 1; // 明記が無いモデルは基本的にシングルドライブ
  const driveMatch =
    combinedText.match(/(\d)\s*ドライブ/) ||
    combinedText.match(/(\d)\s*台のハードディスクを?\s*搭載/);
  if (driveMatch) driveCount = Number(driveMatch[1]);

  let warrantyYears = null;
  // 優先1：spec.htmの仕様表「保証期間 | 1年」（表のセルなのでタグ除去後は
  // 「保証期間 1年」のように空白区切りになる）。訴求文に年数が無い商品
  // （例：HDJA-UTR、HD1-REUT、HDLH-OPA）はこの表にしか書かれていない。
  // 優先2：「5年保証」等の訴求文。優先3：「3年間」等。
  const warrantyMatch =
    combinedText.match(/保証期間\s*[:：]?\s*(\d+)\s*年/) ||
    combinedText.match(/(\d)\s*年保証/) ||
    combinedText.match(/(\d)\s*年間/);
  if (warrantyMatch) warrantyYears = Number(warrantyMatch[1]);

  const cartridge = /カートリッジ/.test(combinedText);

  return { driveCount, warrantyYears, cartridge };
}

// 商品ページ(index.htm)のHTMLから、筐体のメイン画像URLを取り出す。
// 画像URLのパターンはページテンプレートによって異なる（例：フラットな
// "iodata.jp/image/{slug}_l.jpg" と、ネストした
// "iodata.jp/product/.../{slug}/image/{slug}_l.jpg" の両方が実在する）ため、
// テンプレートから推測せず、各ページのHTMLから直接読み取る。
// 優先順位: og:image メタタグ -> "_l.jpg"等で終わる<img src>
function extractImageUrl(html, pageUrl) {
  if (!html) return null;
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch) {
    const resolved = resolveImageUrl(ogMatch[1], pageUrl);
    if (resolved) return resolved;
  }
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+_l\.(?:jpg|jpeg|png))["']/i);
  if (imgMatch) {
    const resolved = resolveImageUrl(imgMatch[1], pageUrl);
    if (resolved) return resolved;
  }
  // 上記2パターンに当てはまらない商品ページもある（画像ファイル名がハッシュ値で
  // "_l"サフィックスが付かないパターン等）。その場合の最後の手段として、
  // alt属性に「シリーズ」を含む<img>タグ（型番の代表画像によく見られる書き方）を探す。
  const imgTagRe = /<img\b[^>]*>/gi;
  let tagMatch;
  while ((tagMatch = imgTagRe.exec(html)) !== null) {
    const tag = tagMatch[0];
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    if (altMatch && srcMatch && /シリーズ/.test(altMatch[1])) {
      const resolved = resolveImageUrl(srcMatch[1], pageUrl);
      if (resolved) return resolved;
    }
  }
  return null;
}

function resolveImageUrl(src, pageUrl) {
  try {
    return new URL(src, pageUrl).href;
  } catch {
    return null;
  }
}

// 接続方式の詳細表記（例："USB 5Gbps（USB 3.2 Gen1）／USB 2.0"）から、
// "USB 3.2 Gen1"のような規格名だけを取り出す。単に「USB」とだけ表示すると
// 商品同士の違いが分からないため、商品比較表で使う。
// 実際のページ文言（2026-10-02確認）："USB 5Gbps（USB 3.2 Gen1）／USB 2.0" 等。
function extractInterfaceDetail(text) {
  const m = text.match(/USB\s*3\.\d\s*Gen\s*\d/i);
  if (!m) return null;
  return m[0].replace(/\s+/g, " ").replace(/Gen\s*(\d)/i, "Gen$1").trim();
}

// 24時間連続稼働対応かどうか。実際のページ文言（2026-10-02確認）：
// "もちろん、24時間連続稼働にも対応しています。"
// "24時間常時稼働を前提に開発された高信頼NAS用ハードディスクを搭載"
function extract24hSupport(text) {
  return /24時間.{0,6}(連続稼働|常時稼働|常時稼動|稼働)/.test(text);
}

// 複数ドライブ機種が対応しているRAIDモードの一覧。1ドライブ機種はRAID非対応のため対象外。
// 実際のページ文言（2026-10-02確認）：
// 2ドライブ機："ミラーリング（RAID 1）" "ストライピング（RAID 0）"
// 4ドライブ機："RAID 0（ストライピングモード）、RAID 5（分散パリティモード）、
//              RAID 10（ミラーリング＋ストライピングモード）、マルチディスクモード"
function extractRaidModes(text, driveCount) {
  if (!driveCount || driveCount < 2) return [];
  const modes = [];
  const checks = [
    ["RAID 10", /RAID\s?10/i],
    ["RAID 6", /RAID\s?6/i],
    ["RAID 5", /RAID\s?5/i],
    ["RAID 1", /RAID\s?1(?!0)/i],
    ["RAID 0", /RAID\s?0/i]
  ];
  checks.forEach(([label, re]) => { if (re.test(text)) modes.push(label); });
  if (/マルチディスクモード/.test(text)) modes.push("マルチディスクモード");
  return modes;
}

// <meta name="description">の中身を取り出す。
// 実例：HDW-UTNCシリーズのドライブ数（2ドライブ）は本文には書かれておらず、
// このメタディスクリプションにしか書かれていなかった。通常のタグ除去
// （<[^>]+>を空白に置換する処理）だとメタタグごと丸ごと消えてcontent属性の
// 中身も失われてしまうため、タグを除去する前に別途ここで抜き出しておく。
function extractMetaDescription(html) {
  if (!html) return "";
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  return m ? m[1] : "";
}

// 型番の表示テキストは他商品と衝突しうる（実例：「HDW-UTB」という表示名が
// 別々の2商品ページに使われているケースがあった）ので、IDは重複しないURL側から作る。
function idFromKey(key) {
  const segments = key.split("/").filter(Boolean);
  return segments[segments.length - 1] || key;
}

function driveTypeFromCount(count) {
  if (count >= 4) return "quad";
  if (count === 2) return "dual";
  return "single";
}

async function fetchDasProductDetail(sourceUrl) {
  const base = normalizeProductKey(sourceUrl) + "/";
  const indexUrl = base + "index.htm";
  const specUrl = base + "spec.htm";

  let indexHtml = "";
  let indexText = "";
  try {
    indexHtml = await fetchText(indexUrl);
    indexText = indexHtml.replace(/<[^>]+>/g, " ");
  } catch (err) {
    console.warn("  -> 商品ページ取得失敗:", indexUrl, "(" + err.message + ")");
  }
  await sleep(REQUEST_INTERVAL_MS);

  let specHtml = "";
  let specText = "";
  try {
    specHtml = await fetchText(specUrl);
    specText = specHtml.replace(/<[^>]+>/g, " ");
  } catch (err) {
    console.warn("  -> spec.htm取得失敗:", specUrl, "(" + err.message + ")");
  }
  await sleep(REQUEST_INTERVAL_MS);

  const metaDescription = extractMetaDescription(indexHtml) + " " + extractMetaDescription(specHtml);
  const combined = metaDescription + " " + indexText + " " + specText;
  const variants = extractOwnVariants(indexHtml);
  const { driveCount, warrantyYears, cartridge } = extractDriveWarrantyCartridge(combined);
  const imageUrl = extractImageUrl(indexHtml, indexUrl);
  const interfaceDetail = extractInterfaceDetail(combined);
  const supports24h = extract24hSupport(combined);
  const raidModes = extractRaidModes(combined, driveCount);

  return { variants, driveCount, warrantyYears, cartridge, imageUrl, interfaceDetail, supports24h, raidModes, indexHtml };
}

async function main() {
  console.log("hdd.htm（対応表）を取得します...");
  const compatHtml = await fetchText(HDD_COMPAT_URL);
  const dasMap = extractCompatTable(compatHtml);
  console.log("対応表から", dasMap.size, "件のDAS型番を検出しました。");
  await sleep(REQUEST_INTERVAL_MS);

  const products = [];
  let done = 0;
  for (const [key, entry] of dasMap) {
    done++;
    console.log("[" + done + "/" + dasMap.size + "] " + entry.modelCode + " を取得中...");

    const detail = await fetchDasProductDetail(entry.sourceUrl);
    let variants = detail.variants;
    let cartridge = detail.cartridge;
    // 本体(アダプター)側のページ画像。カートリッジ式アダプターの場合は後段で
    // カートリッジ側の画像に差し替える（表示上の主役はカートリッジそのものにしたいため）。
    let imageUrl = detail.imageUrl;
    let requiresSeparateEnclosure = false;
    let warrantyYears = detail.warrantyYears;
    let enclosureInfo = null;
    let displaySeriesLabel = entry.modelCode;
    let displaySourceUrl = entry.sourceUrl;

    // HD1-REUT（カートリッジ式アダプター本体）は、それ自体には容量バリエーションが無く、
    // 別売りの交換用カートリッジ(HDLH-OPAシリーズ)の容量がそのまま選択肢になる。
    for (const [cartridgeUrl, info] of Object.entries(CARTRIDGE_SUPPLEMENTS)) {
      if (normalizeProductKey(info.forAdapterUrl) === key) {
        console.log("  -> カートリッジ式アダプターとして、交換用カートリッジの容量を補います:", cartridgeUrl);
        const cartridgeDetail = await fetchDasProductDetail(cartridgeUrl);
        if (cartridgeDetail.variants.length > 0) {
          variants = cartridgeDetail.variants;
          cartridge = true;
          // この場合の価格は「交換用カートリッジ（HDD本体）」単体の価格であり、
          // 本体ケース（entry.modelCode、例："HD1-REUT"）は別売り。カートリッジだけ
          // 買っても本体ケースが無いと使えないため、その旨をサイト側で案内するための
          // フラグと、案内文に使う本体ケース側の商品名・価格をまとめておく。
          requiresSeparateEnclosure = true;
          // 表示上は「カートリッジ(HDLH-OPA)」を主役にする：シリーズ名・リンク先とも
          // hdd.htm由来のHD1-REUTではなくカートリッジ側に差し替える。
          displaySeriesLabel = info.cartridgeSeriesLabel || entry.modelCode;
          displaySourceUrl = cartridgeUrl;

          // 本体ケース(HD1-REUT)自体の価格は、容量表記が無いため通常の
          // extractOwnVariants()では拾えない。専用の抽出関数で別途拾う
          // （detail.indexHtmlは冒頭でHD1-REUTの商品ページから既に取得済みのものを再利用）。
          const enclosurePrice = extractSingleItemPrice(detail.indexHtml, entry.modelCode);
          enclosureInfo = {
            modelCode: entry.modelCode,
            priceIncTax: enclosurePrice ? enclosurePrice.priceIncTax : null,
            priceExTax: enclosurePrice ? enclosurePrice.priceExTax : null,
            url: entry.sourceUrl
          };
        }
        // 保証もカートリッジ(HDD本体)側のものを使う（本体ケースは1年、カートリッジは3年など
        // 異なるため）。カートリッジ側に記載があれば差し替える。
        if (requiresSeparateEnclosure && cartridgeDetail.warrantyYears) {
          warrantyYears = cartridgeDetail.warrantyYears;
        }
        // カートリッジ側の画像があればそちらを優先し、無ければ本体(アダプター)側の画像を使う。
        if (cartridgeDetail.imageUrl) {
          imageUrl = cartridgeDetail.imageUrl;
        }
        await sleep(REQUEST_INTERVAL_MS);
      }
    }

    if (variants.length === 0) {
      console.warn("  -> 価格表が見つからなかったためスキップします:", entry.sourceUrl);
      continue;
    }

    // NASセレクター側の`series`フィールド（例:"LAN DISK H"）と突き合わせやすいよう、
    // 対応関係は「NASシリーズ名 -> 対応しているか(true/false/null)」の形にまとめる。
    // 同じNASシリーズ名が複数の区分・複数列に出てくることがあるので、
    // どれか一つでもtrueならtrue、を採用する（一番緩い側に寄せる）。
    const compatBySeries = {};
    for (const c of entry.compat) {
      const supported = symbolToSupport(c.symbol);
      if (!(c.nasSeries in compatBySeries) || supported === true) {
        compatBySeries[c.nasSeries] = supported;
      }
    }

    let id = idFromKey(key);
    if (products.some(p => p.id === id)) id = id + "-" + products.length; // 念のための重複回避

    products.push({
      id,
      modelCode: entry.modelCode,
      driveType: driveTypeFromCount(detail.driveCount),
      driveCount: detail.driveCount,
      cartridge,
      requiresSeparateEnclosure,
      enclosureInfo,
      displaySeriesLabel,
      displaySourceUrl,
      warrantyYears,
      connection: entry.connection,
      interfaceDetail: detail.interfaceDetail,
      supports24h: detail.supports24h,
      raidModes: detail.raidModes,
      compatNasSeries: compatBySeries,
      imageUrl,
      variants,
      sourceUrl: entry.sourceUrl,
      lastCheckedAt: new Date().toISOString()
    });
  }

  const output = {
    updatedAt: new Date().toISOString(),
    products
  };

  await fs.mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log("完了。DAS型番:", products.length, "件を data/das-products.json に書き出しました。");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
