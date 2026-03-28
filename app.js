const STORAGE_KEY = "wastewise_claude_api_key";
const HISTORY_KEY = "wastewise_history";
const MAX_HISTORY = 12;

const CATEGORY_META = {
  "wet waste": {
    label: "Wet Waste",
    slug: "wet",
    iconId: "icon-wet",
    examples: ["fruit peels", "leftover food", "tea leaves"],
    caution: "Compost when possible. Keep it separate from plastics to avoid contamination.",
    defaultTip: "Drain excess liquid and place in the wet/organic bin.",
    ecoFact: "Composting wet waste cuts methane emissions from landfills."
  },
  "dry waste": {
    label: "Dry Waste",
    slug: "dry",
    iconId: "icon-dry",
    examples: ["paper", "clean plastic", "cardboard"],
    caution: "Rinse containers lightly and dry them before disposal for better recycling.",
    defaultTip: "Keep dry recyclables clean and flattened to save sorting effort.",
    ecoFact: "Recycling one ton of paper can save over a dozen mature trees."
  },
  hazardous: {
    label: "Hazardous Waste",
    slug: "hazardous",
    iconId: "icon-hazardous",
    examples: ["paint thinner", "pesticides", "chemical cleaners"],
    caution: "Store in sealed original containers and use authorized collection points.",
    defaultTip: "Do not mix with household waste. Take to hazardous collection.",
    ecoFact: "Small amounts of toxic chemicals can pollute large volumes of groundwater."
  },
  "e-waste": {
    label: "E-Waste",
    slug: "e-waste",
    iconId: "icon-e-waste",
    examples: ["chargers", "old phones", "wires"],
    caution: "Wipe personal data from devices before dropping them at certified centers.",
    defaultTip: "Drop electronics at certified e-waste facilities for safe recovery.",
    ecoFact: "Recovering metals from e-waste lowers mining pressure and energy demand."
  },
  medical: {
    label: "Medical Waste",
    slug: "medical",
    iconId: "icon-medical",
    examples: ["expired medicines", "syringes", "bandages"],
    caution: "Never discard sharps loosely. Use a puncture-proof container first.",
    defaultTip: "Seal and hand over medical waste at pharmacy or hospital take-back points.",
    ecoFact: "Safe medical disposal prevents infection risk and water contamination."
  }
};

const CATEGORY_ALIASES = {
  wet: "wet waste",
  organic: "wet waste",
  compost: "wet waste",
  biodegradable: "wet waste",
  dry: "dry waste",
  recyclable: "dry waste",
  recycle: "dry waste",
  hazardous: "hazardous",
  toxic: "hazardous",
  chemical: "hazardous",
  ewaste: "e-waste",
  electronic: "e-waste",
  electronics: "e-waste",
  "e-waste": "e-waste",
  medical: "medical",
  pharma: "medical",
  medicine: "medical",
  biomedical: "medical"
};

const form = document.getElementById("classifier-form");
const itemInput = document.getElementById("waste-item");
const analyzeBtn = document.getElementById("analyze-btn");
const formMessage = document.getElementById("form-message");

const apiKeyInput = document.getElementById("api-key");
const saveKeyBtn = document.getElementById("save-key-btn");

const resultCard = document.getElementById("result-card");
const resultCategory = document.getElementById("result-category");
const resultItem = document.getElementById("result-item");
const resultTip = document.getElementById("result-tip");
const resultFact = document.getElementById("result-fact");
const resultSource = document.getElementById("result-source");
const confidenceFill = document.getElementById("confidence-fill");
const confidenceText = document.getElementById("confidence-text");
const resetBtn = document.getElementById("reset-btn");
const resultIcon = document.querySelector("#result-icon use");
const copyBtn = document.getElementById("copy-btn");

const dustbinContainer = document.getElementById("dustbin-container");
const dustbinVisual = document.getElementById("dustbin-visual");
const dustbinLabel = document.getElementById("dustbin-label");

const quickPicksList = document.getElementById("quick-picks-list");
const voiceBtn = document.getElementById("voice-btn");

const statTotal = document.getElementById("stat-total");
const statLive = document.getElementById("stat-live");
const statFallback = document.getElementById("stat-fallback");
const statTop = document.getElementById("stat-top");

const historyList = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const exportHistoryBtn = document.getElementById("export-history-btn");

let latestSnapshot = null;
let historyEntries = [];
let speechRecognition = null;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function normalizeCategory(raw) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z-\s]/g, "").replace(/\s+/g, " ");
  return CATEGORY_ALIASES[cleaned] || (CATEGORY_META[cleaned] ? cleaned : null);
}

function heuristicallyClassify(item) {
  const text = item.toLowerCase();

  const checks = [
    { key: "medical", terms: ["tablet", "medicine", "syringe", "bandage", "mask", "injection", "expired syrup"] },
    { key: "e-waste", terms: ["charger", "battery", "cable", "phone", "laptop", "earphones", "adapter"] },
    { key: "hazardous", terms: ["paint", "thinner", "cleaner", "chemical", "pesticide", "acid", "solvent"] },
    { key: "wet waste", terms: ["food", "peel", "tea", "leftover", "vegetable", "fruit", "egg shell"] },
    { key: "dry waste", terms: ["paper", "plastic", "cardboard", "box", "bottle", "newspaper", "packaging"] }
  ];

  for (const group of checks) {
    if (group.terms.some((term) => text.includes(term))) {
      const meta = CATEGORY_META[group.key];
      return {
        category: group.key,
        tip: meta.defaultTip,
        ecoFact: meta.ecoFact,
        confidence: 0.66,
        source: "Offline Fallback"
      };
    }
  }

  const fallbackMeta = CATEGORY_META["dry waste"];
  return {
    category: "dry waste",
    tip: "If the item is clean and non-organic, place it in dry waste; otherwise check local guidance.",
    ecoFact: fallbackMeta.ecoFact,
    confidence: 0.45,
    source: "Offline Fallback"
  };
}

function extractJsonObject(text) {
  if (typeof text !== "string") return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildSnapshot(rawItem, result) {
  const meta = CATEGORY_META[result.category];
  return {
    item: rawItem,
    category: result.category,
    label: meta.label,
    tip: result.tip,
    ecoFact: result.ecoFact,
    confidence: clamp(result.confidence, 0, 1),
    source: result.source,
    timestamp: new Date().toISOString()
  };
}

async function queryClaude(item, apiKey) {
  const prompt = [
    "Classify the following disposal item into exactly one category.",
    "Allowed categories: wet waste, dry waste, hazardous, e-waste, medical.",
    "Return valid JSON only with this schema:",
    '{"category":"<allowed value>","tip":"<1 practical sentence>","ecoFact":"<1 awareness sentence>","confidence":0.0}',
    "Rules:",
    "- category must match one allowed category exactly",
    "- confidence must be between 0 and 1",
    "- no markdown, no extra text",
    `Item: ${item}`
  ].join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 220,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Claude request failed (${response.status}): ${bodyText.slice(0, 160)}`);
  }

  const payload = await response.json();
  const contentText = (payload.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");

  const data = extractJsonObject(contentText);
  if (!data) {
    throw new Error("Claude response did not contain valid JSON.");
  }

  const normalized = normalizeCategory(data.category);
  if (!normalized) {
    throw new Error("Claude returned an invalid category.");
  }

  return {
    category: normalized,
    tip: String(data.tip || "").trim() || CATEGORY_META[normalized].defaultTip,
    ecoFact: String(data.ecoFact || "").trim() || CATEGORY_META[normalized].ecoFact,
    confidence: clamp(Number(data.confidence) || 0.6, 0.05, 0.99),
    source: "Live Claude"
  };
}

function setLoadingState(isLoading) {
  analyzeBtn.disabled = isLoading;
  analyzeBtn.textContent = isLoading ? "Thinking..." : "Classify";
}

function renderResult(result, rawItem) {
  const meta = CATEGORY_META[result.category];
  const klass = `category-${meta.slug}`;
  const dustbinClass = `dustbin-${meta.slug}`;

  resultCard.classList.remove("hidden", "category-wet", "category-dry", "category-hazardous", "category-e-waste", "category-medical");
  resultCard.classList.add(klass);

  resultCategory.textContent = meta.label;
  resultItem.textContent = rawItem;
  resultTip.textContent = result.tip;
  resultFact.textContent = result.ecoFact;
  resultSource.textContent = result.source;

  const pct = Math.round(clamp(result.confidence, 0, 1) * 100);
  confidenceFill.style.width = `${pct}%`;
  confidenceText.textContent = `${pct}%`;

  resultIcon.setAttribute("href", `#${meta.iconId}`);

  dustbinVisual.className = dustbinClass;
  dustbinLabel.textContent = `${meta.label} ♻︎`;
  dustbinContainer.classList.remove("hidden");

  latestSnapshot = buildSnapshot(rawItem, result);
}

function persistHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEntries));
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    historyEntries = Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    historyEntries = [];
  }
}

function addHistoryEntry(entry) {
  historyEntries = [entry, ...historyEntries]
    .filter((item, idx, arr) => arr.findIndex((x) => x.item === item.item && x.timestamp === item.timestamp) === idx)
    .slice(0, MAX_HISTORY);

  persistHistory();
  renderHistory();
  renderStats();
}

function renderStats() {
  const total = historyEntries.length;
  const live = historyEntries.filter((entry) => entry.source === "Live Claude").length;
  const fallback = total - live;
  const byCategory = historyEntries.reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] || 0) + 1;
    return acc;
  }, {});

  const topPair = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  const top = topPair ? CATEGORY_META[topPair[0]].label : "-";

  statTotal.textContent = String(total);
  statLive.textContent = String(live);
  statFallback.textContent = String(fallback);
  statTop.textContent = top;
}

function renderHistory() {
  if (!historyEntries.length) {
    historyList.innerHTML = '<li class="history-empty">No classifications yet. Try a quick pick above.</li>';
    return;
  }

  historyList.innerHTML = historyEntries
    .map((entry, index) => {
      const stamp = new Date(entry.timestamp);
      const readableDate = Number.isNaN(stamp.getTime())
        ? "Unknown time"
        : stamp.toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });

      return `
        <li class="history-item">
          <div class="history-meta">
            <span>${escapeHtml(entry.label)}</span>
            <span>${escapeHtml(entry.source)} • ${escapeHtml(readableDate)}</span>
          </div>
          <div class="history-main">
            <strong>${escapeHtml(entry.item)}</strong>
            <button type="button" class="history-use" data-index="${index}">Reuse</button>
          </div>
        </li>
      `;
    })
    .join("");
}

function renderStoredSnapshot(entry) {
  renderResult(
    {
      category: entry.category,
      tip: entry.tip,
      ecoFact: entry.ecoFact,
      confidence: entry.confidence,
      source: entry.source
    },
    entry.item
  );
}

async function copyLatestResult() {
  if (!latestSnapshot) {
    setMessage("Run a classification first, then copy.", true);
    return;
  }

  const text = [
    `Item: ${latestSnapshot.item}`,
    `Category: ${latestSnapshot.label}`,
    `Tip: ${latestSnapshot.tip}`,
    `Eco Fact: ${latestSnapshot.ecoFact}`,
    `Confidence: ${Math.round(latestSnapshot.confidence * 100)}%`,
    `Source: ${latestSnapshot.source}`
  ].join("\n");

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temp = document.createElement("textarea");
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
    setMessage("Result copied to clipboard.");
  } catch {
    setMessage("Could not copy automatically. Please copy manually.", true);
  }
}

function exportHistory() {
  if (!historyEntries.length) {
    setMessage("No history to export yet.", true);
    return;
  }

  const blob = new Blob([JSON.stringify(historyEntries, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  link.href = URL.createObjectURL(blob);
  link.download = `wastewise-history-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  setMessage("History exported.");
}

function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.disabled = true;
    voiceBtn.title = "Voice input not supported in this browser.";
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = "en-US";
  speechRecognition.interimResults = false;
  speechRecognition.maxAlternatives = 1;

  speechRecognition.onstart = () => {
    voiceBtn.classList.add("listening");
    setMessage("Listening... speak item name now.");
  };

  speechRecognition.onend = () => {
    voiceBtn.classList.remove("listening");
  };

  speechRecognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (!transcript) return;
    itemInput.value = transcript;
    setMessage("Voice captured. Press Classify to continue.");
  };

  speechRecognition.onerror = () => {
    setMessage("Voice input failed. Please type item manually.", true);
  };

  voiceBtn.addEventListener("click", () => {
    speechRecognition.start();
  });
}

function setMessage(text, isError = false) {
  formMessage.textContent = text;
  formMessage.style.color = isError ? "#b43721" : "var(--ink-soft)";
}

function loadApiKey() {
  const key = localStorage.getItem(STORAGE_KEY);
  if (!key) return;
  apiKeyInput.value = key;
}

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    localStorage.removeItem(STORAGE_KEY);
    setMessage("Saved mode: offline fallback only.");
    return;
  }

  localStorage.setItem(STORAGE_KEY, key);
  setMessage("API key saved in this browser.");
});

copyBtn.addEventListener("click", copyLatestResult);

quickPicksList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const item = target.dataset.item;
  if (!item) return;
  itemInput.value = item;
  form.requestSubmit();
});

historyList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const index = Number(target.dataset.index);
  if (Number.isNaN(index) || !historyEntries[index]) return;
  renderStoredSnapshot(historyEntries[index]);
  itemInput.value = historyEntries[index].item;
  setMessage("Loaded result from history.");
});

clearHistoryBtn.addEventListener("click", () => {
  historyEntries = [];
  persistHistory();
  renderHistory();
  renderStats();
  setMessage("History cleared.");
});

exportHistoryBtn.addEventListener("click", exportHistory);

resetBtn.addEventListener("click", () => {
  resultCard.classList.add("hidden");
  dustbinContainer.classList.add("hidden");
  itemInput.value = "";
  itemInput.focus();
  setMessage("Ready for your next item.");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rawItem = itemInput.value.trim();
  if (rawItem.length < 2) {
    setMessage("Please type a valid item name.", true);
    return;
  }

  if (/[^\w\s.,'()\-+/&]/.test(rawItem)) {
    setMessage("Please avoid unusual symbols and retry.", true);
    return;
  }

  setLoadingState(true);
  setMessage("Analyzing disposal category...");

  const apiKey = apiKeyInput.value.trim() || localStorage.getItem(STORAGE_KEY) || "";

  try {
    let result;
    if (apiKey) {
      result = await Promise.race([
        queryClaude(rawItem, apiKey),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out.")), 10000))
      ]);
    } else {
      result = heuristicallyClassify(rawItem);
    }

    renderResult(result, rawItem);
    addHistoryEntry(latestSnapshot);
    setMessage("Classification ready.");
  } catch (error) {
    const offline = heuristicallyClassify(rawItem);
    renderResult(offline, rawItem);
    addHistoryEntry(latestSnapshot);
    setMessage(`Live AI unavailable: ${error.message} Showing fallback result.`, true);
  } finally {
    setLoadingState(false);
  }
});

loadApiKey();
loadHistory();
renderHistory();
renderStats();
setupVoiceInput();
