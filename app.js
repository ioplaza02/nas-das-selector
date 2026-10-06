(() => {
  "use strict";

  const SITE_PASSWORD = "das2026";
  const STORAGE_KEY = "das-selector-auth";

  const gate = document.getElementById("password-gate");
  const appRoot = document.getElementById("app-root");
  const form = document.getElementById("password-form");
  const input = document.getElementById("password-input");
  const toggle = document.getElementById("password-toggle");
  const errorMsg = document.getElementById("password-error");

  function unlock() {
    gate.hidden = true;
    appRoot.hidden = false;
    initApp();
  }

  if (localStorage.getItem(STORAGE_KEY) === "1") {
    unlock();
  } else {
    input.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (input.value === SITE_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, "1");
      errorMsg.hidden = true;
      unlock();
    } else {
      errorMsg.hidden = false;
    }
  });

  toggle.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
  });

  // ---------- ここから先はパスワード認証後に実行する本体ロジック ----------

  function initApp() {

  const NAS_DATA_URL = "https://ioplaza02.github.io/nas-selector/data/products.json";
  const DAS_DATA_URL = "data/das-products.json";

  // NASセレクター側の series 表記 → DAS対応表（hdd.htm）側のシリーズコード。
  // 公式ページの列見出し脚注を実際に確認して確定させたもの（2026-10-02確認）。
  // 「LAN DISK LE」「LAN DISK LV」はNASセレクター独自の分類名だが、
  // hdd.htm側ではどちらも同じ「LAN DISK L」列（LANDISKL）を見ればよい。
  const SERIES_MAP = {
    "LAN DISK A": "LANDISKA",
    "LAN DISK H": "LANDISKH",
    "LAN DISK X": "LANDISKX",
    "LAN DISK Z": "LANDISKZ",
    "LAN DISK LE": "LANDISKL",
    "LAN DISK LV": "LANDISKL",
    "LAN DISK for SOHO": "LANDISKT",
    "LAN DISK LX": "LANDISKLX"
  };

  // NASセレクター側で series が空（未分類）のまま残っている型番向けの保険。
  // 「LAN DISK LX」シリーズ（HDL4-LX／HDL4-LXU／HDL2-LXなど）は、NASセレクターの
  // カタログ分類ロジックが対応しておらず series:null になっているが、
  // hdd.htm側の脚注で「LAN DISK LXシリーズ：HDL4-LX, HDL4-LXU, HDL2-LX」と
  // 明記されているのを確認済みのため、型番の先頭一致で直接救済する。
  // （根本対応としては、NASセレクター側のscrape.mjsでこのシリーズにも
  // 正しくseriesを振るよう直す方が望ましい）
  //
  // 2026-10-02追記：HDL4-LVUB（例：HDL4-LV04UB）等、同じくNASセレクター側で
  // series:null のまま残っている型番ファミリーが他にも12種類見つかったため、
  // 同じ方式でまとめて救済する。それぞれhdd.htm（公式対応表）で実際に列見出しを
  // 確認済み（2026-10-02確認、調査内容はAreasメモ参照）：
  //   ・HDL4-LVB/HDL2-LVB/HDL4-LVUB → 既存のHDL4-LV/HDL2-LV/HDL4-LVUと同じ
  //     「LAN DISK L」列（ハイエンドモデル①の表）に実際に型番リンクとして掲載あり
  //   ・HDL2-LENB/HDL1-LENB → 既存のHDL2-LEN/HDL1-LENと同じ「LAN DISK L」列
  //     （ただし別表＝エントリーモデル①の表。見出し文字列は同じ「LAN DISK L」なので
  //     スクレイパー側のOR-merge処理により同じ対応結果にまとまる）
  //   ・HDL4-Z25SI3BB/HDL4-Z25WI3BB/HDL2-Z25SI3BB/HDL2-Z25WI3BB/
  //     HDL4-Z25SI3BUB/HDL4-Z25WI3BUB → 2025年モデル表の「LAN DISK Z」列に
  //     （暗号化対応のB/UB付き型番も含めて）型番リンクとして掲載あり。
  //     SI3系・WI3系で別セルだが見出しはどちらも「LAN DISK Z」で同じため、
  //     対応可否に差は無い（B/UB無しの型番と同一グループ）
  //   ・BCSP-LVREUT(04/08/16) → NAS本体とバックアップ用HDD(HD1-REUT＋
  //     HDLH-OPAカートリッジ)がセットになった製品。hdd.htm上に型番自体の掲載は
  //     無いが、NAS部分がHDL2-LVシリーズそのものなので、同じ「LAN DISK L」列
  //     として扱う
  const SERIES_CODE_FALLBACK_BY_PREFIX = [
    [/^HDL4-LXU/i, "LANDISKLX"],
    [/^HDL4-LX\d/i, "LANDISKLX"],
    [/^HDL2-LX\d/i, "LANDISKLX"],
    [/^HDL4-LV\d+UB$/i, "LANDISKL"],
    [/^HDL4-LV\d+B$/i, "LANDISKL"],
    [/^HDL2-LV\d+B$/i, "LANDISKL"],
    [/^HDL2-LE\d+NB$/i, "LANDISKL"],
    [/^HDL1-LE\d+NB$/i, "LANDISKL"],
    [/^HDL4-Z25SI3B\d+UB$/i, "LANDISKZ"],
    [/^HDL4-Z25SI3B\d+B$/i, "LANDISKZ"],
    [/^HDL4-Z25WI3B\d+UB$/i, "LANDISKZ"],
    [/^HDL4-Z25WI3B\d+B$/i, "LANDISKZ"],
    [/^HDL2-Z25SI3B\d+B$/i, "LANDISKZ"],
    [/^HDL2-Z25WI3B\d+B$/i, "LANDISKZ"],
    [/^BCSP-LVREUT\d+$/i, "LANDISKL"]
  ];

  function resolveSeriesCode(entry) {
    if (entry.series && SERIES_MAP[entry.series]) return SERIES_MAP[entry.series];
    const hit = SERIES_CODE_FALLBACK_BY_PREFIX.find(([re]) => re.test(entry.sku));
    return hit ? hit[1] : null;
  }

  // NASセレクター側の raidSupport（表示用ラベル）→ 実効容量テーブルのキー
  const RAID_LABEL_TO_KEY = {
    "RAIDeX": "raidex",
    "RAID 0": "raid0",
    "RAID 1": "raid1",
    "RAID 5": "raid5",
    "RAID 6": "raid6"
  };
  const RAID_KEY_TO_LABEL = {
    raidex: "RAIDeX", raid0: "RAID 0", raid1: "RAID 1", raid5: "RAID 5", raid6: "RAID 6"
  };
  // デフォルトで選びたいRAIDモードの優先順位（冗長性が高く、かつI-O DATAの
  // 看板機能であるRAIDeXを優先。無ければ冗長性のあるRAID5/6/1、最後にRAID0）
  const RAID_PRIORITY = ["raidex", "raid5", "raid6", "raid1", "raid0"];

  const DRIVE_TYPE_LABEL = { single: "1ドライブ", dual: "2ドライブ", quad: "4ドライブ" };
  const DRIVE_TYPE_RANK = { single: 0, dual: 1, quad: 2 };
  // ドライブ数ごとのメリットを一言で表すタグ（並べて見たときに違いがパッと分かるように）
  const DRIVE_TYPE_BENEFIT = {
    single: "シンプルな単体型",
    dual: "単体でRAID構成が可能",
    quad: "大容量をまとめて収納"
  };

  const el = (sel) => document.querySelector(sel);
  const modelInput = el("#model-input");
  const suggestBox = el("#model-suggest");
  const emptyState = el("#empty-state");
  const nasInfo = el("#nas-info");
  const nasImage = el("#nas-image");
  const nasDesc = el("#nas-desc");
  const nasModelEl = el("#nas-model");
  const raidWrap = el("#nas-raid-wrap");
  const raidBtnRow = el("#raid-btn-row");
  const capacitySummary = el("#capacity-summary");
  const resultWrap = el("#result-wrap");
  const resultTitle = el("#result-title");
  const resultCount = el("#result-count");
  const dasGroups = el("#das-groups");
  const shareBtn = el("#share-btn");
  const shareFeedback = el("#share-feedback");
  const updatedAtEl = el("#updated-at");
  const compareBar = el("#compare-bar");
  const compareBarText = el("#compare-bar-text");
  const compareBtn = el("#compare-btn");
  const compareModal = el("#compare-modal");
  const compareModalCloseBtn = el("#compare-modal-close-btn");
  const compareTableEl = el("#compare-table");
  const compareModalNote = el("#compare-modal-note");
  const includeDiscontinuedToggle = el("#include-discontinued-toggle");

  let nasEntries = [];      // 検索対象（variant単位でフラット化したNAS一覧）
  let nasSeriesList = null; // 「一覧から機種を選ぶ」パネル用（NASセレクターのシリーズ一覧そのまま）
  let dasProducts = [];
  let nasLoaded = false;
  let dasLoaded = false;
  let highlightedIndex = -1;
  let currentEntry = null;
  let currentRaidKey = null;
  // 商品比較（チェックを付けた商品を、下部バー→ポップアップの表で見比べられるようにする）
  let compareSelection = new Map(); // id -> { product, variant }
  const COMPARE_MAX = 4;

  // ---------- データ読み込み ----------

  fetch(NAS_DATA_URL)
    .then((res) => res.json())
    .then((data) => {
      const products = data.products || [];
      nasSeriesList = products; // 「一覧から機種を選ぶ」パネル用に、シリーズ単位の一覧も残しておく
      const flat = [];
      products.forEach((p) => {
        const variants = p.variants || [];
        variants.forEach((v) => {
          if (!v.sku) return;
          flat.push({
            sku: String(v.sku).toUpperCase(),
            displaySku: v.sku,
            capacityTB: v.capacityTB,
            status: v.status || p.status || "現行",
            series: p.series || null,
            name: p.name || null,
            imageUrl: p.imageUrl || null,
            raidSupport: p.raidSupport || [],
            effectiveCapacityTB: v.effectiveCapacityTB || null
          });
        });
      });
      nasEntries = flat;
      nasLoaded = true;
      if (browseIsOpen()) renderBrowse();
      if (modelInput.value.trim()) modelInput.dispatchEvent(new Event("input"));
      applyStateFromUrl();
    })
    .catch(() => {
      updatedAtEl.textContent = "NASセレクターのデータ取得に失敗しました。時間をおいて再度お試しください。";
      nasSeriesList = [];
      if (browseIsOpen()) renderBrowse();
    });

  fetch(DAS_DATA_URL)
    .then((res) => res.json())
    .then((data) => {
      dasProducts = data.products || [];
      dasLoaded = true;
      renderUpdatedAt(data.updatedAt);
      if (currentEntry) renderResults();
    })
    .catch(() => {
      updatedAtEl.textContent = "DASデータの読み込みに失敗しました。時間をおいて再度お試しください。";
    });

  function renderUpdatedAt(iso) {
    if (!iso) return;
    const d = new Date(iso);
    const formatted = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    const daysSince = (Date.now() - d.getTime()) / 86400000;
    updatedAtEl.textContent = `データ最終更新日：${formatted}` +
      (daysSince > 40 ? "（40日以上更新されていません。最新情報は公式サイトでご確認ください）" : "");
  }

  // ---------- URLパラメータの復元（NASセレクター連携・共有リンク用） ----------

  function applyStateFromUrl() {
    const params = new URLSearchParams(location.search);
    const model = params.get("model");
    if (model && nasLoaded) {
      modelInput.value = model;
      const exact = nasEntries.find((e) => e.sku === model.toUpperCase());
      if (exact) {
        selectEntry(exact, params.get("raid"));
        return;
      }
      modelInput.dispatchEvent(new Event("input"));
    } else if (model) {
      modelInput.value = model;
    }
  }

  // ---------- 一覧から機種を選ぶ（キーボードを使わずにマウスだけで選べるパネル。ISSセレクターと同じ） ----------
  //
  // NASセレクターのシリーズ一覧（画像・シリーズ名・容量別の型番）をそのまま使う。
  // 型番を入力したときの候補と同じく、生産終了のシリーズ・型番は出さない。
  // 容量ボタンを押すと、型番を入力して選んだときと同じ selectEntry() を呼ぶ。

  const browseToggle = el("#browse-toggle");
  const browsePanel = el("#browse-panel");
  const browseClose = el("#browse-close");
  const browseFilters = el("#browse-filters");
  const browseGrid = el("#browse-grid");
  const browseCount = el("#browse-count");
  const browseOpenInline = el("#browse-open-inline");

  const browseFilterState = { os: "all", install: "all", bay: "all" };
  const BROWSE_FILTER_DEFS = [
    { key: "os", label: "OS", options: [
      { value: "all", label: "すべて" },
      { value: "Linux OS", label: "Linux" },
      { value: "Windows OS", label: "Windows" }
    ] },
    { key: "install", label: "置き方", options: [
      { value: "all", label: "すべて" },
      { value: "BOXタイプ", label: "BOX（据え置き）" },
      { value: "ラックマウントタイプ", label: "ラックマウント" }
    ] },
    { key: "bay", label: "ドライブ数", options: null } // 実データから自動で作る
  ];

  function browseIsOpen() {
    return browsePanel.classList.contains("browse-panel--open");
  }

  function setBrowseOpen(open) {
    browsePanel.classList.toggle("browse-panel--open", open);
    browseToggle.setAttribute("aria-expanded", open ? "true" : "false");
    browseToggle.classList.toggle("browse-toggle--open", open);
    if (open) renderBrowse();
  }

  browseToggle.addEventListener("click", () => setBrowseOpen(!browseIsOpen()));
  browseClose.addEventListener("click", () => setBrowseOpen(false));
  if (browseOpenInline) {
    browseOpenInline.addEventListener("click", () => {
      setBrowseOpen(true);
      browsePanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // 「LAN DISK（HDL4-LXシリーズ）」→「HDL4-LXシリーズ」
  function seriesLabel(p) {
    const m = String(p.name || "").match(/（([^）]+)）/);
    return m ? m[1] : (p.name || p.series || "");
  }

  function browseableSeries() {
    if (!nasSeriesList || !nasLoaded) return null;
    const entryBySku = new Map(nasEntries.map((e) => [e.sku, e]));
    return nasSeriesList
      .filter((p) => p.status !== "生産終了")
      .map((p) => {
        const variants = (p.variants || [])
          .filter((v) => v.sku && v.status !== "生産終了")
          .map((v) => ({ ...v, entry: entryBySku.get(String(v.sku).toUpperCase()) }))
          .filter((v) => v.entry);
        return { p, variants };
      })
      .filter((s) => s.variants.length > 0);
  }

  function bayNumber(bay) {
    const m = String(bay || "").match(/(\d+)/);
    return m ? Number(m[1]) : 0;
  }

  function renderBrowseFilters(all) {
    const bays = [...new Set(all.map((s) => s.p.bay).filter(Boolean))].sort((a, b) => bayNumber(a) - bayNumber(b));
    browseFilters.innerHTML = "";
    BROWSE_FILTER_DEFS.forEach((def) => {
      const options = def.options || [{ value: "all", label: "すべて" }, ...bays.map((b) => ({ value: b, label: b }))];
      const row = document.createElement("div");
      row.className = "browse-filter-row";
      const label = document.createElement("span");
      label.className = "browse-filter-row__label";
      label.textContent = def.label;
      row.appendChild(label);
      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "browse-pill" + (browseFilterState[def.key] === opt.value ? " browse-pill--on" : "");
        btn.textContent = opt.label;
        btn.addEventListener("click", () => {
          browseFilterState[def.key] = opt.value;
          renderBrowse();
        });
        row.appendChild(btn);
      });
      browseFilters.appendChild(row);
    });
  }

  function renderBrowse() {
    const all = browseableSeries();
    if (!all) {
      browseFilters.innerHTML = "";
      browseCount.textContent = "";
      browseGrid.innerHTML = `<p class="browse-loading">機種の一覧を読み込んでいます…</p>`;
      return;
    }
    if (all.length === 0) {
      browseFilters.innerHTML = "";
      browseCount.textContent = "";
      browseGrid.innerHTML = `<p class="browse-loading">機種の一覧を読み込めませんでした。お手数ですが、上の検索欄に型番を入力してください。</p>`;
      return;
    }
    renderBrowseFilters(all);

    const list = all
      .filter((s) => browseFilterState.os === "all" || s.p.os === browseFilterState.os)
      .filter((s) => browseFilterState.install === "all" || s.p.install === browseFilterState.install)
      .filter((s) => browseFilterState.bay === "all" || s.p.bay === browseFilterState.bay)
      .sort((a, b) =>
        String(a.p.os).localeCompare(String(b.p.os)) ||
        bayNumber(a.p.bay) - bayNumber(b.p.bay) ||
        seriesLabel(a.p).localeCompare(seriesLabel(b.p)));

    browseCount.textContent = `${list.length}シリーズ`;
    browseGrid.innerHTML = "";
    if (list.length === 0) {
      browseGrid.innerHTML = `<p class="browse-loading">この組み合わせの機種はありません。条件を「すべて」に戻してみてください。</p>`;
      return;
    }

    list.forEach(({ p, variants }) => {
      const card = document.createElement("div");
      card.className = "browse-card";

      const imgWrap = document.createElement("div");
      imgWrap.className = "browse-card__image";
      if (p.imageUrl) {
        const img = document.createElement("img");
        img.src = p.imageUrl;
        img.alt = "";
        img.loading = "lazy";
        // 画像が読み込めなかった場合は、壊れた画像アイコンを出さずに空欄にする
        img.addEventListener("error", () => img.remove());
        imgWrap.appendChild(img);
      }
      card.appendChild(imgWrap);

      const name = document.createElement("p");
      name.className = "browse-card__name";
      name.textContent = seriesLabel(p);
      card.appendChild(name);

      const meta = document.createElement("p");
      meta.className = "browse-card__meta";
      meta.textContent = [p.os && p.os.replace(" OS", ""), p.install && p.install.replace("タイプ", ""), p.bay].filter(Boolean).join("・");
      card.appendChild(meta);

      const capLabel = document.createElement("p");
      capLabel.className = "browse-card__cap-label";
      capLabel.textContent = "容量を選ぶ";
      card.appendChild(capLabel);

      const pills = document.createElement("div");
      pills.className = "browse-card__caps";
      variants.forEach((v) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cap-btn";
        btn.title = v.sku;
        btn.innerHTML = `<span class="cap-btn__tb">${v.capacityTB != null ? escapeBrowse(v.capacityTB + "TB") : escapeBrowse(v.sku)}</span>`
          + `<span class="cap-btn__sku">${escapeBrowse(v.sku)}</span>`;
        btn.addEventListener("click", () => chooseFromBrowse(v.entry));
        pills.appendChild(btn);
      });
      card.appendChild(pills);
      browseGrid.appendChild(card);
    });
  }

  function escapeBrowse(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function chooseFromBrowse(entry) {
    modelInput.value = entry.displaySku;
    suggestBox.hidden = true;
    selectEntry(entry);
    setBrowseOpen(false);
    // パネルが閉じるアニメーション（0.3秒）でページの高さが変わるため、閉じ終わってから結果の位置へスクロールする
    setTimeout(() => {
      el("#nas-info").scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
  }

  // ---------- 型番検索・オートコンプリート ----------

  function findMatches(query) {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return nasEntries.filter((e) => e.sku.includes(q) && e.status !== "生産終了");
  }

  modelInput.addEventListener("input", () => {
    const q = modelInput.value.trim();
    if (!q) {
      suggestBox.hidden = true;
      showEmptyState();
      return;
    }
    const allMatches = findMatches(q);
    const matches = allMatches.slice(0, 30);
    if (matches.length === 0) {
      suggestBox.hidden = true;
      if (!nasLoaded) {
        showLoading(q);
      } else {
        showNoMatch(q);
      }
      return;
    }
    suggestBox.innerHTML = "";
    highlightedIndex = -1;
    matches.forEach((e) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = e.displaySku;
      btn.addEventListener("click", () => {
        modelInput.value = e.displaySku;
        suggestBox.hidden = true;
        selectEntry(e);
      });
      suggestBox.appendChild(btn);
    });
    if (allMatches.length > matches.length) {
      const note = document.createElement("p");
      note.className = "search__suggest-note";
      note.textContent = `ほか${allMatches.length - matches.length}件。もう少し文字を入れると絞り込めます`;
      suggestBox.appendChild(note);
    }
    suggestBox.hidden = false;

    const exact = nasEntries.find((e) => e.sku === q.toUpperCase() && e.status !== "生産終了");
    if (exact) selectEntry(exact);
  });

  modelInput.addEventListener("keydown", (e) => {
    if (suggestBox.hidden) return;
    const buttons = Array.from(suggestBox.querySelectorAll("button"));
    if (buttons.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % buttons.length;
      updateHighlight(buttons);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = (highlightedIndex - 1 + buttons.length) % buttons.length;
      updateHighlight(buttons);
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < buttons.length) {
        e.preventDefault();
        buttons[highlightedIndex].click();
      }
    } else if (e.key === "Escape") {
      suggestBox.hidden = true;
    }
  });

  function updateHighlight(buttons) {
    buttons.forEach((btn, i) => btn.classList.toggle("search__suggest-btn--active", i === highlightedIndex));
    const active = buttons[highlightedIndex];
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) suggestBox.hidden = true;
  });

  function showEmptyState() {
    currentEntry = null;
    emptyState.hidden = false;
    nasInfo.hidden = true;
    resultWrap.hidden = true;
  }

  function showLoading(query) {
    currentEntry = null;
    emptyState.hidden = true;
    nasInfo.hidden = true;
    resultWrap.hidden = false;
    shareBtn.hidden = true;
    resultTitle.textContent = query;
    resultCount.textContent = "";
    dasGroups.innerHTML = `<div class="no-match">データを読み込んでいます。少しお待ちください…</div>`;
  }

  function showNoMatch(query) {
    currentEntry = null;
    emptyState.hidden = true;
    nasInfo.hidden = true;
    resultWrap.hidden = false;
    shareBtn.hidden = true;
    resultTitle.textContent = query;
    resultCount.textContent = "";
    dasGroups.innerHTML = `<div class="no-match">「${escapeHtml(query)}」に一致する型番が見つかりませんでした。型番の一部だけでも検索できます（例：HB06 → HDL6-HB06）。</div>`;
  }

  // ---------- NAS選択後：実効容量・RAIDモードの処理 ----------

  function selectEntry(entry, initialRaidParam) {
    currentEntry = entry;
    emptyState.hidden = true;
    nasInfo.hidden = false;

    if (entry.imageUrl) {
      nasImage.src = entry.imageUrl;
      nasImage.alt = entry.displaySku;
      nasImage.hidden = false;
    } else {
      nasImage.hidden = true;
    }
    nasModelEl.textContent = entry.displaySku;
    if (entry.name) {
      nasDesc.textContent = entry.name;
      nasDesc.hidden = false;
    } else {
      nasDesc.hidden = true;
    }

    // このSKUで選べるRAIDモード（raidSupportのうち、実効容量データがあるものだけ）
    const availableKeys = [];
    if (entry.effectiveCapacityTB) {
      entry.raidSupport.forEach((label) => {
        const key = RAID_LABEL_TO_KEY[label];
        if (key && entry.effectiveCapacityTB[key] != null) availableKeys.push(key);
      });
    }

    if (availableKeys.length > 0) {
      raidWrap.hidden = false;
      // 「おすすめ」ラベルを付ける対象は、優先順位（RAIDeX>RAID5>RAID6>RAID1>RAID0）で
      // 決まる値に固定する。初期選択だけURLパラメータで上書きできるようにしておく。
      const recommendedKey = RAID_PRIORITY.find((k) => availableKeys.includes(k)) || availableKeys[0];
      let initialKey = availableKeys.find((k) => k === (initialRaidParam || "")) || recommendedKey;
      currentRaidKey = initialKey;
      renderRaidButtons(availableKeys, initialKey, recommendedKey);
    } else {
      raidWrap.hidden = true;
      currentRaidKey = null;
    }

    renderCapacitySummaryAndResults();
  }

  function renderRaidButtons(keys, selectedKey, recommendedKey) {
    raidBtnRow.innerHTML = "";
    keys.forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "raid-btn" + (key === selectedKey ? " raid-btn--selected" : "");
      btn.innerHTML = escapeHtml(RAID_KEY_TO_LABEL[key] || key) +
        (key === recommendedKey ? '<span class="raid-btn__tag">おすすめ</span>' : "");
      btn.addEventListener("click", () => {
        currentRaidKey = key;
        raidBtnRow.querySelectorAll(".raid-btn").forEach((b) => b.classList.remove("raid-btn--selected"));
        btn.classList.add("raid-btn--selected");
        renderCapacitySummaryAndResults();
      });
      raidBtnRow.appendChild(btn);
    });
  }

  // 実効容量（TB）を決める。実効容量データがあればRAIDモードに応じた値、
  // 無ければ搭載HDD容量をそのまま使う（参考値であることを明示する）。
  function getEffectiveCapacityInfo(entry) {
    if (currentRaidKey && entry.effectiveCapacityTB && entry.effectiveCapacityTB[currentRaidKey] != null) {
      return { value: entry.effectiveCapacityTB[currentRaidKey], estimated: false };
    }
    return { value: entry.capacityTB, estimated: true };
  }

  function renderCapacitySummaryAndResults() {
    const entry = currentEntry;
    const { value, estimated } = getEffectiveCapacityInfo(entry);
    const required = value * 2;

    let html = `<p class="capacity-summary__row"><span class="capacity-summary__label">実効容量</span><span class="capacity-summary__value">${formatTB(value)}</span>${estimated ? '<span class="badge badge--warn">実効容量データ未取得（搭載HDD容量を参考値として使用）</span>' : ""}</p>`;
    html += `<p class="capacity-summary__row"><span class="capacity-summary__label">おすすめのDAS容量</span><span class="capacity-summary__value capacity-summary__value--accent">${formatTB(required)} 以上</span><a href="#about-x2" class="capacity-summary__note-link">※</a></p>`;
    capacitySummary.innerHTML = html;

    renderResults();
  }

  function formatTB(n) {
    if (n == null) return "不明";
    return (Math.round(n * 100) / 100) + " TB";
  }

  // ---------- DASの絞り込み・表示 ----------

  function buildShareUrl() {
    if (!currentEntry) return location.href;
    const params = new URLSearchParams();
    params.set("model", currentEntry.displaySku);
    if (currentRaidKey) params.set("raid", currentRaidKey);
    return `${location.origin}${location.pathname}?${params.toString()}`;
  }

  includeDiscontinuedToggle.addEventListener("change", () => {
    if (currentEntry) renderResults();
  });

  shareBtn.addEventListener("click", async () => {
    const url = buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      window.prompt("このURLをコピーしてください", url);
      return;
    }
    shareFeedback.hidden = false;
    shareFeedback.textContent = "URLをコピーしました";
    setTimeout(() => { shareFeedback.hidden = true; }, 2500);
  });

  function renderResults() {
    if (!currentEntry) return;
    resultWrap.hidden = false;
    shareBtn.hidden = false;
    resultTitle.textContent = `${currentEntry.displaySku} のおすすめDAS`;

    // 検索し直すたびに比較選択はリセットする
    compareSelection.clear();
    updateCompareBar();

    if (!dasLoaded) {
      resultCount.textContent = "";
      dasGroups.innerHTML = `<div class="no-match">DASデータを読み込んでいます。少しお待ちください…</div>`;
      return;
    }

    const seriesCode = resolveSeriesCode(currentEntry);
    if (!seriesCode) {
      resultCount.textContent = "";
      dasGroups.innerHTML = `<div class="no-match">このNASのシリーズを自動判定できなかったため、対応確認ができませんでした。` +
        `<a href="https://www.iodata.jp/pio/io/nas/landisk/hdd.htm" target="_blank" rel="noopener noreferrer">公式のバックアップ用HDD対応表</a>で直接ご確認ください。</div>`;
      return;
    }

    const { value } = getEffectiveCapacityInfo(currentEntry);
    const required = value * 2;

    const includeDiscontinued = includeDiscontinuedToggle.checked;
    const matched = [];
    dasProducts.forEach((p) => {
      if (p.compatNasSeries[seriesCode] !== true) return;
      const qualifying = (p.variants || []).filter((v) =>
        v.capacityTB >= required && (includeDiscontinued || v.status !== "生産終了")
      );
      if (qualifying.length === 0) return;
      const sorted = [...qualifying].sort((a, b) => a.capacityTB - b.capacityTB);
      matched.push({ product: p, qualifying: sorted, best: sorted[0] });
    });

    // 並び順：まず「シンプルさ」（1ドライブ→2ドライブ→4ドライブ）を優先し、
    // 次に保証年数が長い方（5年保証を優先）、最後に価格が安い方を優先する。
    // これにより「1ドライブで5年保証」のようなスマートな選択肢が自然と上位に来る。
    matched.sort((a, b) => {
      const driveDiff = (DRIVE_TYPE_RANK[a.product.driveType] ?? 9) - (DRIVE_TYPE_RANK[b.product.driveType] ?? 9);
      if (driveDiff !== 0) return driveDiff;
      const warrantyDiff = (b.product.warrantyYears || 0) - (a.product.warrantyYears || 0);
      if (warrantyDiff !== 0) return warrantyDiff;
      return (a.best.priceIncTax || Infinity) - (b.best.priceIncTax || Infinity);
    });

    resultCount.textContent = `${matched.length}件のDASが対応しています（おすすめ容量 ${formatTB(required)} 以上）`;

    if (matched.length === 0) {
      dasGroups.innerHTML = `<div class="no-match">条件に合うDASが見つかりませんでした。必要容量が大きすぎる可能性があります。複数台・大容量モデルについては` +
        `<a href="https://www.iodata.jp/pio/io/nas/landisk/hdd.htm" target="_blank" rel="noopener noreferrer">公式の対応表</a>も合わせてご確認ください。</div>`;
      return;
    }

    dasGroups.innerHTML = `<div class="das-grid">${matched.map(renderDasCard).join("")}</div>`;
    bindCardEvents();
  }

  let cardVariantMap = {};
  let cardDataMap = {};
  let cardCounter = 0;

  function renderDasCard(m) {
    const id = `das-card-${cardCounter++}`;
    cardVariantMap[id] = m.qualifying;
    const p = m.product;
    const best = m.best;
    cardDataMap[id] = { product: p, variant: best };

    const badges = [
      `<span class="badge badge--drive">${DRIVE_TYPE_LABEL[p.driveType] || p.driveType}</span>`,
      `<span class="badge badge--benefit">${escapeHtml(DRIVE_TYPE_BENEFIT[p.driveType] || "")}</span>`
    ];
    if (p.cartridge) {
      badges.push(`<span class="badge badge--accent">${p.requiresSeparateEnclosure ? "カートリッジ式 + HDD" : "カートリッジ式"}</span>`);
    }
    if (p.warrantyYears) badges.push(`<span class="badge">${p.warrantyYears}年保証</span>`);
    if (best.status === "生産終了") badges.push(`<span class="badge badge--warn">生産終了品</span>`);

    let enclosureNote = "";
    if (p.requiresSeparateEnclosure) {
      // 公式ページの表現：外側＝「USB接続アダプター」、中身＝「専用のHDDカートリッジ」
      const enc = p.enclosureInfo;
      const encName = escapeHtml(enc ? enc.modelCode : p.modelCode);
      const encUrl = enc && enc.url ? enc.url : p.sourceUrl;
      const encPriceText = enc && enc.priceIncTax
        ? `（¥${enc.priceIncTax.toLocaleString()}${enc.priceExTax ? `・税抜¥${enc.priceExTax.toLocaleString()}` : ""}）`
        : "";
      const encLink = `<a href="${escapeAttr(encUrl)}" target="_blank" rel="noopener noreferrer">${encName}シリーズ${encPriceText}</a>`;
      enclosureNote = `<p class="das-card__enclosure-note">⚠ これは専用の「HDDカートリッジ」（中身）の価格です。外側の「USB接続アダプター」（本体ケース）として「${encLink}」が別売りのため、お持ちでない場合は合わせてお求めください。</p>`;
    }

    const allBtn = m.qualifying.length > 1
      ? `<button type="button" class="all-years-btn" data-role="all-variants-btn">型番をすべて表示する（${m.qualifying.length}件）</button>`
      : "";

    // 再生成前の古いデータでは本体ケース(HD1-REUT)の画像が入っているため、
    // カートリッジ(HDLH-OPA)の画像に差し替える（再生成後は p.imageUrl がそのまま正しい）
    const cardImageUrl = (p.requiresSeparateEnclosure && !p.displaySourceUrl)
      ? "https://www.iodata.jp/image/hdlh-opa_l.jpg"
      : p.imageUrl;
    const imageHtml = cardImageUrl
      ? `<img class="das-card__image" src="${escapeAttr(cardImageUrl)}" alt="" onerror="this.remove()">`
      : "";

    return `
      <div class="das-card" id="${id}">
        <div class="das-card__head">
          ${imageHtml}
          <div class="das-card__head-text">
            <p class="das-card__model"><a href="${escapeAttr(p.displaySourceUrl || (p.requiresSeparateEnclosure ? "https://www.iodata.jp/product/nas/option/hdlh-opa/" : p.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(best.sku)}</a></p>
            <p class="das-card__series">${escapeHtml(p.displaySeriesLabel || (p.requiresSeparateEnclosure ? best.sku.replace(/\d+$/, "") : p.modelCode))}シリーズ</p>
          </div>
          <label class="das-card__compare">
            <input type="checkbox" data-role="compare-checkbox" data-id="${id}">
            比較
          </label>
        </div>
        <div class="das-card__badges">${badges.join("")}</div>
        ${enclosureNote}
        <div class="das-card__bottom-area" data-role="bottom-area">
          <div class="das-card__bottom" data-role="bottom">
            <p class="das-card__capacity" data-role="capacity">${formatTB(best.capacityTB)}</p>
            <p class="das-card__price" data-role="price">${priceHtml(best)}</p>
          </div>
          ${best.jan ? `<p class="das-card__jan">JAN: ${escapeHtml(best.jan)}</p>` : ""}
          ${allBtn}
          <div class="all-years-accordion" data-role="all-variants-accordion">
            <div class="all-years-accordion__inner" data-role="all-variants-inner">${allVariantsInnerHtml(m.qualifying)}</div>
          </div>
        </div>
      </div>`;
  }

  function priceHtml(v) {
    if (!v.priceIncTax) return `<span class="das-card__price-sub">価格は公式サイトでご確認ください</span>`;
    return `¥${v.priceIncTax.toLocaleString()}<span class="das-card__price-sub">（税抜 ¥${(v.priceExTax || 0).toLocaleString()}）</span>`;
  }

  function allVariantsInnerHtml(variants) {
    return variants.map((v) => `
      <div class="all-years-row">
        <span class="all-years-row__code">${escapeHtml(v.sku)}</span>
        <span class="all-years-row__years">${formatTB(v.capacityTB)}</span>
        <span class="all-years-row__price">${priceHtml(v)}</span>
      </div>`).join("");
  }

  function bindCardEvents() {
    Object.keys(cardVariantMap).forEach((id) => {
      const cardEl = document.getElementById(id);
      if (!cardEl) return;
      const bottomArea = cardEl.querySelector('[data-role="bottom-area"]');
      const allBtn = cardEl.querySelector('[data-role="all-variants-btn"]');
      if (allBtn && bottomArea) {
        allBtn.addEventListener("click", () => {
          const isOpen = bottomArea.classList.toggle("das-card__bottom-area--open");
          const count = cardVariantMap[id].length;
          allBtn.textContent = isOpen ? "閉じる" : `型番をすべて表示する（${count}件）`;
        });
      }
      const compareCheckbox = cardEl.querySelector('[data-role="compare-checkbox"]');
      if (compareCheckbox) {
        compareCheckbox.addEventListener("change", () => {
          if (compareCheckbox.checked) {
            if (compareSelection.size >= COMPARE_MAX) {
              compareCheckbox.checked = false;
              window.alert(`比較は一度に${COMPARE_MAX}件までです。`);
              return;
            }
            compareSelection.set(id, cardDataMap[id]);
          } else {
            compareSelection.delete(id);
          }
          updateCompareBar();
        });
      }
    });
  }

  // ---------- 商品比較（下部バー・ポップアップ） ----------

  function updateCompareBar() {
    const count = compareSelection.size;
    if (count === 0) {
      compareBar.hidden = true;
      return;
    }
    compareBar.hidden = false;
    compareBarText.textContent = `商品比較（${count}件選択中）`;
    compareBtn.disabled = count < 2;
  }

  compareBtn.addEventListener("click", () => {
    if (compareSelection.size < 2) return;
    renderCompareTable();
    compareModal.hidden = false;
  });

  compareModalCloseBtn.addEventListener("click", () => { compareModal.hidden = true; });
  compareModal.querySelector('[data-role="compare-modal-close"]').addEventListener("click", () => {
    compareModal.hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !compareModal.hidden) compareModal.hidden = true;
  });

  // 行ごとに「比較に使う値（plain）」と「表示用HTML（html）」を分けて持つ。
  // plain側が全列で同じかどうかを見て、違いがある行だけハイライトする。
  function renderCompareTable() {
    const items = [...compareSelection.values()];

    const rows = [
      {
        label: "画像",
        noDiff: true,
        cells: items.map((it) => ({
          plain: "",
          html: it.product.imageUrl
            ? `<a href="${escapeAttr(it.product.displaySourceUrl || it.product.sourceUrl)}" target="_blank" rel="noopener noreferrer"><img class="compare-table__image" src="${escapeAttr(it.product.imageUrl)}" alt="" onerror="this.remove()"></a>`
            : "—"
        }))
      },
      {
        label: "容量",
        cells: items.map((it) => ({ plain: String(it.variant.capacityTB), html: formatTB(it.variant.capacityTB) }))
      },
      {
        label: "価格",
        cells: items.map((it) => ({
          plain: String(it.variant.priceIncTax || ""),
          html: `<span class="compare-table__price">${priceHtml(it.variant)}</span>`
        }))
      },
      {
        label: "ドライブ数",
        cells: items.map((it) => {
          const t = DRIVE_TYPE_LABEL[it.product.driveType] || it.product.driveType;
          return { plain: t, html: escapeHtml(t) };
        })
      },
      {
        label: "特徴",
        cells: items.map((it) => {
          const t = DRIVE_TYPE_BENEFIT[it.product.driveType] || "";
          return { plain: t, html: escapeHtml(t) };
        })
      },
      {
        label: "RAID対応",
        cells: items.map((it) => {
          const modes = it.product.raidModes || [];
          const t = modes.length ? modes.join(" / ") : (it.product.driveCount > 1 ? "情報なし" : "非対応（1ドライブ）");
          return { plain: t, html: escapeHtml(t) };
        })
      },
      {
        // 「カートリッジ式」と「本体ケース」は同じ話なので1行にまとめる。
        // カートリッジ式でない商品は「—」（対象外）、カートリッジ単体販売の商品には
        // 外側のUSB接続アダプターが別売りである旨を同じセルに添える。
        label: "カートリッジ式",
        cells: items.map((it) => {
          const p = it.product;
          if (!p.cartridge) return { plain: "—", html: "—" };
          if (!p.requiresSeparateEnclosure) return { plain: "○", html: "○" };
          const enc = p.enclosureInfo;
          const encName = escapeHtml(enc ? enc.modelCode : p.modelCode);
          const encPriceText = enc && enc.priceIncTax ? `（¥${enc.priceIncTax.toLocaleString()}）` : "";
          return {
            plain: "○（HDDカートリッジのみ）",
            html: `○ HDDカートリッジのみ<span class="compare-table__warn">⚠ 外側の「USB接続アダプター」${encName}シリーズ${encPriceText}が別売り。合わせてお求めください</span>`
          };
        })
      },
      {
        label: "保証年数",
        cells: items.map((it) => {
          const t = it.product.warrantyYears ? `${it.product.warrantyYears}年` : "不明";
          return { plain: t, html: escapeHtml(t) };
        })
      },
      {
        label: "接続方式",
        cells: items.map((it) => {
          const t = it.product.interfaceDetail || it.product.connection || "USB";
          return { plain: t, html: escapeHtml(t) };
        })
      },
      {
        label: "24時間稼働対応",
        cells: items.map((it) => ({ plain: it.product.supports24h ? "○" : "—", html: it.product.supports24h ? "○" : "—" }))
      }
    ];

    const headRow = `<tr><th class="compare-table__row-label"></th>${
      items.map((it) => `<th><a href="${escapeAttr(it.product.displaySourceUrl || it.product.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.variant.sku)}</a></th>`).join("")
    }</tr>`;

    const bodyRows = rows.map((r) => {
      const plainValues = r.cells.map((c) => c.plain);
      const hasDiff = !r.noDiff && items.length > 1 && plainValues.some((v) => v !== plainValues[0]);
      return `<tr${hasDiff ? ' class="compare-table__row--diff"' : ""}>
        <th class="compare-table__row-label">${escapeHtml(r.label)}</th>
        ${r.cells.map((c) => `<td>${c.html}</td>`).join("")}
      </tr>`;
    }).join("");

    compareTableEl.innerHTML = `<thead>${headRow}</thead><tbody>${bodyRows}</tbody>`;

    compareModalNote.innerHTML =
      `※ 保証期間内の修理は「センドバック」方式（本体を工場へ送付して修理する方式。出張修理ではありません）が基本です。` +
      `引き取り・当日訪問などより手厚い保守をご希望の場合は、` +
      `<a href="https://www.iodata.jp/support/service/iss/maintenance/hdd/index.htm" target="_blank" rel="noopener noreferrer">外付けHDD向けの訪問安心保守（ISS）のページ</a>でご確認ください。` +
      `RAID対応・インターフェース規格・24時間稼働対応は公式ページの記載から自動取得しているため、不明や情報なしと出る場合は公式ページで直接ご確認ください。`;
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  } // ← initApp() の終わり
})();
