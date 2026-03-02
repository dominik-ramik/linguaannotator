<template>
  <div class="editor">
    <!-- ── Toolbar ──────────────────────────────────────────────────────── -->
    <v-toolbar color="surface" :elevation="1" class="px-2 mt-4 mb-4">
      <!-- File group -->
      <v-btn
        variant="tonal"
        color="secondary"
        :prepend-icon="loadingWave ? '' : 'mdi-folder-open-outline'"
        :loading="loadingWave"
        :disabled="loadingWave"
        class="mr-1"
        @click="triggerAudioPick"
        >Load audio / video</v-btn
      >
      <input
        ref="audioFileInput"
        type="file"
        @change="onFile"
        accept="audio/*"
        style="display: none"
      />

      <v-btn
        variant="tonal"
        color="secondary"
        prepend-icon="mdi-file-document-outline"
        class="mr-2"
        @click="triggerLabelPick"
        :disabled="!waveReady"
        >Load labels</v-btn
      >
      <input
        ref="labelFileInput"
        type="file"
        @change="onLabelFile"
        accept=".txt"
        style="display: none"
      />

      <v-divider vertical class="mx-2" />

      <!-- Zoom -->
      <v-icon
        icon="mdi-magnify-plus-outline"
        size="24"
        color="medium-emphasis"
        class="mr-0 ml-3"
      />
      <v-slider
        v-model="zoom"
        min="5"
        max="100"
        hide-details
        color="primary"
        class="ml-2 mr-3"
        style="width: 120px; flex: none"
        @update:model-value="onZoom"
        :disabled="!waveReady"
      />

      <v-divider vertical class="mx-2" />

      <!-- Actions -->
      <v-btn
        variant="tonal"
        color="secondary"
        prepend-icon="mdi-download-outline"
        class="mr-1"
        :disabled="!waveReady"
        @click="downloadLabels"
        >Download labels</v-btn
      >

      <v-btn
        v-if="waveReady && groundTruth.length === 0"
        variant="tonal"
        color="secondary"
        prepend-icon="mdi-plus"
        @click="addDefaultLabel"
        >Add new label</v-btn
      >

      <v-spacer />

      <!-- Secondary -->
      <v-btn
        variant="tonal"
        color="secondary"
        prepend-icon="mdi-format-list-bulleted"
        class="mr-1"
        :disabled="!waveReady"
        @click="openModal"
        >View labels</v-btn
      >

      <v-btn
        variant="text"
        color="medium-emphasis"
        prepend-icon="mdi-github"
        @click="openGitHub"
        >LinguaAnnotator on GitHub</v-btn
      >
    </v-toolbar>

    <!-- ── Waveform (untouched) ────────────────────────────────────────── -->
    <div id="timeline" class="timeline"></div>
    <div id="waveform" class="waveform"></div>

    <!-- ── Labels dialog ──────────────────────────────────────────────── -->
    <v-dialog v-model="showOverlay" max-width="720" scrollable>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center pt-5 ps-6 pe-4">
          <span>Labels</span>
          <v-spacer />
          <v-btn
            icon="mdi-close"
            variant="text"
            density="compact"
            @click="closeModal"
          />
        </v-card-title>
        <v-card-subtitle class="ps-6 pb-2">
          Start(sec) &middot; End(sec) &middot; Label
        </v-card-subtitle>
        <v-divider />
        <v-card-text class="pa-4">
          <v-textarea
            v-model="ioText"
            readonly
            variant="outlined"
            rows="16"
            hide-details
            font-family="monospace"
            class="labels-textarea"
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="px-6 py-4 justify-end">
          <v-btn variant="outlined" color="secondary" @click="closeModal"
            >Close</v-btn
          >
          <v-btn
            variant="flat"
            color="primary"
            prepend-icon="mdi-content-copy"
            @click="exportLabels"
            >Copy to clipboard</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, createApp } from "vue";
import WaveSurfer from "wavesurfer.js";
// Import Wavesurfer plugins as ESM modules for bundlers
// Use the ESM builds which Vite can resolve
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.esm.js";
import RegionLabel from "./RegionLabel.vue";
import { createAttachDrag } from "./wave-editor/drag.js";
import { setupRegionDOM } from "./wave-editor/regionDom.js";
import { startAutoBackup, stopAutoBackup } from "./wave-editor/backup.js";

const waveformEl = ref(null);
const timelineEl = ref(null);

const wavesurfer = ref(null);
const regionsPlugin = ref(null);

/* --- Hidden file input refs and trigger helpers --- */
const audioFileInput = ref(null);
const labelFileInput = ref(null);
function triggerAudioPick() {
  try {
    if (audioFileInput.value) {
      // clear value so the same file can be re-selected
      audioFileInput.value.value = "";
      audioFileInput.value.click();
    }
  } catch (e) {}
}
function triggerLabelPick() {
  try {
    if (labelFileInput.value) {
      labelFileInput.value.value = "";
      labelFileInput.value.click();
    }
  } catch (e) {}
}

let attachDrag = null;

const zoom = ref(100);
const groundTruth = reactive([]);
const importingEntries = new Map(); // Temporary map during import: uid -> entry
const importingRegions = new Map(); // Temporary map during import: uid -> region instance

const showOverlay = ref(false);
const ioText = ref("");
const waveReady = ref(false);
const loadingWave = ref(false);

function createUid() {
  return `gt-${Math.random().toString(36).slice(2, 10)}`;
}

function openGitHub() {
  window.open("https://github.com/dominik-ramik/linguaannotator", "_blank");
}

function getLabelFromRegion(region) {
  if (region.data && typeof region.data.label === "string")
    return region.data.label;
  if (typeof region.content === "string") return region.content;
  if (region.content && region.content.innerText)
    return region.content.innerText;
  return "";
}

function ensureGroundTruthEntry(region, labelOverride) {
  if (!region) return null;
  const uid =
    region.data && typeof region.data.uid === "string"
      ? region.data.uid
      : createUid();
  const label =
    typeof labelOverride === "string" && labelOverride.length
      ? labelOverride
      : getLabelFromRegion(region);
  let entry = groundTruth.find((item) => item.uid === uid);
  // If no entry by uid, try to find one by start/end (within epsilon) to
  // avoid duplicates caused by multiple region-created events or async flows.
  if (!entry) {
    const eps = 1e-6;
    entry = groundTruth.find(
      (item) =>
        Math.abs((item.start || 0) - (region.start || 0)) < eps &&
        Math.abs((item.end || 0) - (region.end || 0)) < eps,
    );
    if (entry) {
      // Merge: assign the canonical uid from region (or keep existing) and update label
      const oldUid = entry.uid;
      entry.uid = uid;
      if (label && entry.label !== label) entry.label = label;
    }
  }
  if (!entry) {
    entry = { uid, start: region.start || 0, end: region.end || 0, label };
    groundTruth.push(entry);
  } else {
    entry.start = region.start || 0;
    entry.end = region.end || 0;
    if (entry.label !== label) entry.label = label;
  }
  region.data = Object.assign({}, region.data, { uid, label });
  try {
    if (typeof region.setOptions === "function")
      region.setOptions({ content: "" });
  } catch (e) {}
  // If a RegionLabel component is mounted, ensure its input shows the label
  try {
    if (region && region.__vueInstance && "label" in region.__vueInstance) {
      region.__vueInstance.label = entry.label;
    }
  } catch (err) {
    /* ignore */
  }
  return entry;
}

function removeGroundTruthEntry(region) {
  if (!region || !region.data) return;
  const uid = typeof region.data.uid === "string" ? region.data.uid : null;
  if (!uid) return;
  const idx = groundTruth.findIndex((item) => item.uid === uid);
  if (idx >= 0) groundTruth.splice(idx, 1);
}

function addRegionFromEntry(entry) {
  if (!regionsPlugin.value) return;
  try {
    const r = regionsPlugin.value.addRegion({
      start: entry.start,
      end: entry.end,
      data: { label: entry.label, uid: entry.uid },
    });
    if (r && entry && entry.uid) importingRegions.set(entry.uid, r);
    return r;
  } catch (err) {
    try {
      regionsPlugin.value.addRegion({
        start: entry.start,
        end: entry.end,
        data: { label: entry.label, uid: entry.uid },
      });
    } catch (e) {}
  }
}

function updateGroundTruthLabel(uid, label) {
  if (!uid) return;
  const entry = groundTruth.find((item) => item.uid === uid);
  if (!entry) return;
  entry.label = label;
  // Also update mounted component if present
  try {
    const region = regionsPlugin.value
      .getRegions()
      .find((r) => r.data && r.data.uid === uid);
    if (region && region.__vueInstance && "label" in region.__vueInstance) {
      region.__vueInstance.label = label;
    }
  } catch (err) {
    /* ignore */
  }
}

function buildGroundTruthText() {
  if (groundTruth.length === 0) return "";
  const sorted = [...groundTruth].sort(
    (a, b) => (a.start || 0) - (b.start || 0),
  );
  return sorted
    .map((entry) => {
      const start = Number(entry.start || 0);
      const end = Number(entry.end || 0);
      return `${start.toFixed(6)}\t${end.toFixed(6)}\t${entry.label || ""}`;
    })
    .join("\n");
}

function refreshIoTextFromGroundTruth() {
  ioText.value = buildGroundTruthText();
}

function logGroundTruth() {
  console.log(
    "Ground truth labels:",
    groundTruth.map((entry) => ({ ...entry })),
  );
}

function onFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  // Mark waveform as not-ready while loading a new file so UI controls
  // (zoom, load labels) stay disabled until Wavesurfer emits `ready`.
  try {
    waveReady.value = false;
  } catch (e) {}
  try {
    loadingWave.value = true;
  } catch (err) {}
  wavesurfer.value.load(URL.createObjectURL(file));
}

function onZoom() {
  if (wavesurfer.value) wavesurfer.value.zoom(zoom.value);
}

function addDefaultLabel() {
  if (!regionsPlugin.value) return;
  const dur =
    wavesurfer.value && typeof wavesurfer.value.getDuration === "function"
      ? Number(wavesurfer.value.getDuration())
      : NaN;
  const s = 0;
  const e = !isNaN(dur) && isFinite(dur) ? Math.min(3, dur) : 3;
  if (e <= s) return;
  try {
    regionsPlugin.value.addRegion({
      start: s,
      end: e,
      data: { label: "Text", uid: createUid() },
    });
  } catch (err) {
    try {
      regionsPlugin.value.addRegion({
        start: s,
        end: e,
        data: { label: "Text", uid: createUid() },
      });
    } catch (e) {}
  }
}

function computeCanAddAdjacent(region) {
  const regs = regionsPlugin.value
    ? regionsPlugin.value
        .getRegions()
        .filter((r) => r !== region && !r._removed)
    : [];
  const dur =
    wavesurfer.value && typeof wavesurfer.value.getDuration === "function"
      ? Number(wavesurfer.value.getDuration())
      : NaN;
  // left
  const leftEnd = Number(region.start || 0);
  const leftStart = Math.max(0, leftEnd - 3);
  let canLeft = leftEnd > leftStart;
  if (canLeft) {
    for (const r of regs) {
      const rs = Number(r.start || 0);
      const re = Number(r.end || 0);
      if (!(re <= leftStart || rs >= leftEnd)) {
        canLeft = false;
        break;
      }
    }
  }
  // right
  const rightStart = Number(region.end || 0);
  let rightEnd = rightStart + 3;
  if (!isNaN(dur) && isFinite(dur)) rightEnd = Math.min(rightEnd, dur);
  let canRight = rightEnd > rightStart;
  if (canRight) {
    for (const r of regs) {
      const rs = Number(r.start || 0);
      const re = Number(r.end || 0);
      if (!(re <= rightStart || rs >= rightEnd)) {
        canRight = false;
        break;
      }
    }
  }
  return { canLeft, canRight };
}

function recomputeAllCanAdd() {
  if (!regionsPlugin.value) return;
  const regs = regionsPlugin.value.getRegions().filter((r) => !r._removed);
  regs.forEach((r) => {
    try {
      if (r && r.__vueInstance) {
        const flags = computeCanAddAdjacent(r);
        r.__vueInstance.canAddLeft = flags.canLeft;
        r.__vueInstance.canAddRight = flags.canRight;
      }
    } catch (e) {}
  });
}

function addAdjacentRegion(side, baseRegion) {
  if (!regionsPlugin.value || !baseRegion) return false;
  const dur =
    wavesurfer.value && typeof wavesurfer.value.getDuration === "function"
      ? Number(wavesurfer.value.getDuration())
      : NaN;
  if (side === "left") {
    const end = Number(baseRegion.start || 0);
    let start = Math.max(0, end - 3);
    if (end <= start) return false;
    // ensure no overlap
    const regs = regionsPlugin.value
      .getRegions()
      .filter((r) => r !== baseRegion);
    for (const r of regs) {
      const rs = Number(r.start || 0);
      const re = Number(r.end || 0);
      if (!(re <= start || rs >= end)) return false;
    }
    try {
      regionsPlugin.value.addRegion({
        start,
        end,
        data: { label: "Text", uid: createUid() },
      });
      return true;
    } catch (e) {
      return false;
    }
  } else if (side === "right") {
    const start = Number(baseRegion.end || 0);
    let end = start + 3;
    if (!isNaN(dur) && isFinite(dur)) end = Math.min(end, dur);
    if (end <= start) return false;
    const regs = regionsPlugin.value
      .getRegions()
      .filter((r) => r !== baseRegion);
    for (const r of regs) {
      const rs = Number(r.start || 0);
      const re = Number(r.end || 0);
      if (!(re <= start || rs >= end)) return false;
    }
    try {
      regionsPlugin.value.addRegion({
        start,
        end,
        data: { label: "Text", uid: createUid() },
      });
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function onLabelFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  // If there are existing labels, warn the user that loading will clear them
  if (groundTruth.length > 0) {
    const ok = window.confirm(
      "There are existing labels. Loading a label file will remove all current labels. Do you want to proceed?",
    );
    if (!ok) {
      // reset file input so the user can re-select later
      try {
        e.target.value = "";
      } catch (err) {}
      return;
    }
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    if (typeof text === "string") {
      importLabelsFromText(text);
    }
  };
  reader.readAsText(file);
}

function deleteRegion(id) {
  const r = regionsPlugin.value.getRegions().find((x) => x.id === id);
  if (r) r.remove();
}

function openModal() {
  refreshIoTextFromGroundTruth();
  showOverlay.value = true;
}

function closeModal() {
  showOverlay.value = false;
}

function importLabels() {
  const raw = ioText.value;
  if (!raw) return;
  if (!regionsPlugin.value) return;
  // Warn before importing if there are existing labels
  if (groundTruth.length > 0) {
    const ok = window.confirm(
      "There are existing labels. Importing will remove all current labels. Do you want to proceed?",
    );
    if (!ok) return;
  }
  importLabelsFromText(raw);
  closeModal();
}

function downloadLabels() {
  const text = buildGroundTruthText();
  if (!text) {
    alert("No labels to download");
    return;
  }

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `labels_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportLabels() {
  refreshIoTextFromGroundTruth();
  const text = buildGroundTruthText();
  navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard!"));
}

async function importLabelsFromText(raw) {
  if (!regionsPlugin.value) return;
  const entries = [];
  raw.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const p = line.split("\t");

    if (p.length >= 3) {
      const s = parseFloat(p[0].trim());
      const e = parseFloat(p[1].trim());
      const lbl = p[2].trim();
      if (isNaN(s) || isNaN(e)) {
        console.warn("Invalid numbers in line:", line);
        return;
      }
      entries.push({ start: s, end: e, label: lbl, uid: createUid() });
    } else {
      console.warn(
        "Line does not have 3 tab-separated parts:",
        line,
        "parts:",
        p,
      );
    }
  });

  // If no tab-separated entries were found, support a simple format where the
  // file is just one label per line. Create sequential 3-second regions in
  // the order they appear in the file. Cap region ends to audio duration if
  // available, and skip any invalid zero-length ranges.
  if (entries.length === 0) {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length > 0) {
      const audioDur =
        wavesurfer.value && typeof wavesurfer.value.getDuration === "function"
          ? Number(wavesurfer.value.getDuration())
          : NaN;
      lines.forEach((lbl, idx) => {
        const s = idx * 3;
        let e = s + 3;
        if (!isNaN(audioDur) && isFinite(audioDur) && e > audioDur)
          e = audioDur;
        if (e <= s) return; // skip invalid ranges
        entries.push({ start: s, end: e, label: lbl, uid: createUid() });
      });
    }
  }

  // Clear current ground truth and regions first
  groundTruth.splice(0, groundTruth.length);
  regionsPlugin.value.clearRegions();

  if (entries.length === 0) {
    refreshIoTextFromGroundTruth();
    return;
  }

  // Keep a temporary map of importing entries so region-created can consult it
  importingEntries.clear();
  entries.forEach((entry) => importingEntries.set(entry.uid, entry));

  // Create regions from entries
  entries.forEach((entry) => addRegionFromEntry(entry));

  // Wait until Wavesurfer reports regions for (most) entries, with timeout
  const eps = 0.05; // tolerate up to 50ms timing differences
  function findRegionForEntry(entry) {
    // Prefer the direct importingRegions map if we created the region just now
    if (importingRegions.has(entry.uid)) return importingRegions.get(entry.uid);
    const regs = regionsPlugin.value.getRegions();
    // Prefer uid match
    let r = regs.find(
      (rr) =>
        rr.data && typeof rr.data.uid === "string" && rr.data.uid === entry.uid,
    );
    if (r) return r;
    // Fallback to start/end match within eps
    r = regs.find(
      (rr) =>
        Math.abs((rr.start || 0) - (entry.start || 0)) < eps &&
        Math.abs((rr.end || 0) - (entry.end || 0)) < eps,
    );
    return r || null;
  }

  const timeoutMs = 2000;
  const startTime = Date.now();
  // Poll until all entries have a matched region or timeout
  await new Promise((resolve) => {
    const tid = setInterval(() => {
      const allMatched = entries.every((entry) => !!findRegionForEntry(entry));
      if (allMatched || Date.now() - startTime > timeoutMs) {
        clearInterval(tid);
        resolve();
      }
    }, 30);
  });

  // Now apply labels from import into the actual regions and groundTruth
  entries.forEach((entry) => {
    const region = findRegionForEntry(entry);
    if (!region) {
      console.warn("Could not find region for imported entry", entry);
      return;
    }
    try {
      // Ensure region has uid/label in data
      region.data = Object.assign({}, region.data, {
        uid: entry.uid,
        label: entry.label,
      });
    } catch (e) {}
    try {
      if (typeof region.setOptions === "function")
        region.setOptions({ content: "" });
    } catch (e) {}

    // If an entry already exists in groundTruth for this uid, update its label.
    const existing = groundTruth.find((g) => g.uid === entry.uid);
    if (existing) {
      // Update via helper so mounted component also receives the new label
      updateGroundTruthLabel(entry.uid, entry.label);
      existing.start = region.start || existing.start;
      existing.end = region.end || existing.end;
    } else {
      // Otherwise, ensureGroundTruthEntry will create it using the region
      ensureGroundTruthEntry(region, entry.label);
    }
  });

  // Clean up and refresh
  importingEntries.clear();
  importingRegions.clear();
  refreshIoTextFromGroundTruth();
}

onMounted(() => {
  // Create plugin instances via their factories
  const regionsInst = RegionsPlugin.create();
  const timelineInst = TimelinePlugin.create({ container: "#timeline" });
  regionsPlugin.value = regionsInst;

  wavesurfer.value = WaveSurfer.create({
    container: "#waveform",
    waveColor: "#4F4A85",
    progressColor: "#383351",
    cursorColor: "#ff0",
    barWidth: 2,
    height: 250,
    scrollParent: true,
    minPxPerSec: 100,
    autoScroll: true,
    plugins: [timelineInst, regionsInst],
  });

  // Create the attachDrag function bound to our wavesurfer and regions plugin.
  // Pass a callback so drags can notify the editor to sync groundTruth entries.
  attachDrag = createAttachDrag(wavesurfer, regionsPlugin, (r) => {
    try {
      ensureGroundTruthEntry(r);
      // Also refresh exported text for UI if needed
      refreshIoTextFromGroundTruth();
    } catch (err) {
      /* ignore */
    }
  });

  wavesurfer.value.on("ready", () => {
    waveReady.value = true;
    try { loadingWave.value = false; } catch (e) {}
    if (regionsPlugin.value) {
      regionsPlugin.value
        .getRegions()
        .forEach((region) => ensureGroundTruthEntry(region));
      refreshIoTextFromGroundTruth();
    }
    // Start automatic backups when wavesurfer is ready
    startAutoBackup(groundTruth);
  });
  // If Wavesurfer reports an error while loading/decoding, ensure UI
  // returns to a non-ready state so controls remain disabled.
  try {
    wavesurfer.value.on("error", () => {
      try {
        waveReady.value = false;
        loadingWave.value = false;
      } catch (e) {}
    });
  } catch (e) {}

  // Global hotkey: Space toggles play/pause at current cursor position
  const globalPlayPause = (ev) => {
    const isSpace = ev.code === "Space" || ev.key === " ";
    if (!isSpace) return;

    // If any input/textarea/contenteditable currently has focus, ignore the spacebar.
    // Use a :focus selector which is more robust than checking ev.target.tagName (which can be a DIV).
    const focusedEditable = document.querySelector(
      "input:focus, textarea:focus, [contenteditable]:focus",
    );
    if (focusedEditable) return;

    // Prevent default (browser may have bindings) and toggle playback
    ev.preventDefault();
    ev.stopPropagation();
    if (!wavesurfer.value) return;
    try {
      const playing = wavesurfer.value.isPlaying();
      const cursorTime = wavesurfer.value.getCurrentTime();
      if (playing) {
        wavesurfer.value.pause();
      } else {
        // Play from current cursor time
        if (typeof wavesurfer.value.play === "function")
          wavesurfer.value.play(cursorTime);
      }
    } catch (err) {
      // ignore errors from API differences
    }
  };
  window.addEventListener("keydown", globalPlayPause);

  // region events
  regionsPlugin.value.on("region-created", (r) => {
    // If this region was created during import, get the label from the importing map
    const importedEntry =
      r.data && r.data.uid ? importingEntries.get(r.data.uid) : null;
    const labelOverride = importedEntry ? importedEntry.label : undefined;
    const entry = ensureGroundTruthEntry(r, labelOverride);
    if (!entry) return;
    try {
      const el = r.element;
      el.innerHTML = "";
      const mountEl = document.createElement("div");
      el.appendChild(mountEl);
      // Ensure wavesurfer's built-in content rendering is disabled for this region
      try {
        if (typeof r.setOptions === "function") r.setOptions({ content: "" });
      } catch (e) {}
      const app = createApp(RegionLabel, {
        region: r,
        initialLabel: entry.label,
        uid: entry.uid,
        onLabelUpdate: (value) => updateGroundTruthLabel(entry.uid, value),
        onDeleteRegion: () => {
          try {
            r.remove();
          } catch (e) {}
        },
        onAddRegionLeft: () => {
          addAdjacentRegion("left", r);
        },
        onAddRegionRight: () => {
          addAdjacentRegion("right", r);
        },
        canAddLeft: computeCanAddAdjacent(r).canLeft,
        canAddRight: computeCanAddAdjacent(r).canRight,
      });
      const instance = app.mount(mountEl);
      r.__vueApp = app;
      r.__vueInstance = instance;
      // ensure instance flags are set on the mounted instance
      try {
        const flags = computeCanAddAdjacent(r);
        if (instance) {
          instance.canAddLeft = flags.canLeft;
          instance.canAddRight = flags.canRight;
        }
      } catch (e) {}
      try {
        if (instance && "label" in instance) {
          instance.label = entry.label;
        }
      } catch (err) {
        /* ignore */
      }
      setTimeout(() => {
        if (instance.topHandle)
          attachDrag(instance.topHandle, r, "move-single");
        if (instance.bottomHandle)
          attachDrag(instance.bottomHandle, r, "move-ripple");
        if (instance.resLHandle) attachDrag(instance.resLHandle, r, "resize-l");
        if (instance.resRHandle) attachDrag(instance.resRHandle, r, "resize-r");
      }, 0);
    } catch (err) {
      setupRegionDOM(r, attachDrag);
    }
  });

  regionsPlugin.value.on("region-updated", (region) => {
    ensureGroundTruthEntry(region);
    recomputeAllCanAdd();
  });
  regionsPlugin.value.on("region-removed", (r) => {
    console.log("Region being removed:", r.id, r);

    // Mark the region as removed so drag logic and other computations skip it
    r._removed = true;

    try {
      if (r && r.__vueApp) {
        r.__vueApp.unmount();
        delete r.__vueApp;
        if (r.__vueInstance) delete r.__vueInstance;
      }
    } catch (e) {}

    // Let wavesurfer handle its own DOM cleanup — do NOT aggressively
    // manipulate r.element here. Previous attempts to clone/replace/hide the
    // element broke wavesurfer's internal bookkeeping and caused ghost regions
    // to remain in the plugin's region list.

    removeGroundTruthEntry(r);
    recomputeAllCanAdd();
    try {
      refreshIoTextFromGroundTruth();
    } catch (e) {}
  });
});

onBeforeUnmount(() => {
  stopAutoBackup();
  waveReady.value = false;
  try {
    window.removeEventListener("keydown", globalPlayPause);
  } catch (e) {}
  if (wavesurfer.value) wavesurfer.value.destroy();
});

// --- Custom Region DOM Setup (from original implementation) ---
</script>

<style scoped>
.waveform {
  height: 250px;
  background: #111;
}
.timeline {
  height: 20px;
  background: #111;
}
.labels-textarea :deep(textarea) {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
  line-height: 1.65;
}
</style>
