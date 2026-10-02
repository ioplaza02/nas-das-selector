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
  const SERIES_CODE_FALLBACK_BY_PREFIX = [
    [/^HDL4-LXU/i, "LANDISKLX"],
    [/^HDL4-LX\d/i, "LANDISKLX"],
    [/^HDL2-LX\d/i, "LANDISKLX"]
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

  let nasEntries = [];      // 検索対象（variant単位でフラット化したNAS一覧）
  let dasProducts = [];
  let nasLoaded = false;
  let dasLoaded = false;
  let highlightedIndex = -1;
  let currentEntry = null;
  let currentRaidKey = null;

  // ---------- データ読み込み ----------

  fetch(NAS_DATA_URL)
    .then((res) => res.json())
    .then((data) => {
      const products = data.products || [];
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
      if (modelInput.value.trim()) modelInput.dispatchEvent(new Event("input"));
      applyStateFromUrl();
    })
    .catch(() => {
      updatedAtEl.textContent = "NASセレクターのデータ取得に失敗しました。時間をおいて再度お試しください。";
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

    const matched = [];
    dasProducts.forEach((p) => {
      if (p.compatNasSeries[seriesCode] !== true) return;
      const qualifying = (p.variants || []).filter((v) => v.capacityTB >= required);
      if (qualifying.length === 0) return;
      const sorted = [...qualifying].sort((a, b) => a.capacityTB - b.capacityTB);
      matched.push({ product: p, qualifying: sorted, best: sorted[0] });
    });

    matched.sort((a, b) => (a.best.priceIncTax || Infinity) - (b.best.priceIncTax || Infinity));

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
  let cardCounter = 0;

  function renderDasCard(m) {
    const id = `das-card-${cardCounter++}`;
    cardVariantMap[id] = m.qualifying;
    const p = m.product;
    const best = m.best;

    const badges = [
      `<span class="badge badge--drive">${DRIVE_TYPE_LABEL[p.driveType] || p.driveType}</span>`
    ];
    if (p.cartridge) badges.push(`<span class="badge badge--accent">カートリッジ式</span>`);
    if (p.warrantyYears) badges.push(`<span class="badge">${p.warrantyYears}年保証</span>`);

    const allBtn = m.qualifying.length > 1
      ? `<button type="button" class="all-years-btn" data-role="all-variants-btn">他の容量も見る（${m.qualifying.length}件）</button>`
      : "";

    return `
      <div class="das-card" id="${id}">
        <p class="das-card__model"><a href="${escapeAttr(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.modelCode)}</a></p>
        <div class="das-card__badges">${badges.join("")}</div>
        <div class="das-card__bottom-area" data-role="bottom-area">
          <div class="das-card__bottom" data-role="bottom">
            <p class="das-card__capacity" data-role="capacity">${formatTB(best.capacityTB)}</p>
            <p class="das-card__price" data-role="price">${priceHtml(best)}</p>
          </div>
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
        <span class="all-years-row__years">${formatTB(v.capacityTB)}</span>
        <span class="all-years-row__code">${escapeHtml(v.sku)}</span>
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
          allBtn.textContent = isOpen ? "閉じる" : `他の容量も見る（${count}件）`;
        });
      }
    });
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  } // ← initApp() の終わり
})();
