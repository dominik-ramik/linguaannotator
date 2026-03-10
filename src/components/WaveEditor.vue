<template>
  <div class="editor">
    <!-- ── Drop overlay ──────────────────────────────────────────────── -->
    <transition name="drop-fade">
      <div v-if="isDragOver" class="drop-overlay">
        <v-icon icon="mdi-file-arrow-down-outline" size="64" color="primary" />
        <div class="text-h6 mt-3">Drop to load</div>
      </div>
    </transition>

    <!-- ── Unsupported file dialog ────────────────────────────────────── -->
    <v-dialog v-model="unsupportedFileDialog" max-width="400">
      <v-card rounded="lg">
        <v-card-title class="pt-5 ps-6">Unsupported file type</v-card-title>
        <v-card-text class="ps-6 pe-6">
          Only audio&nbsp;/&nbsp;video files and <strong>.txt</strong> label
          files can be dropped here.
        </v-card-text>
        <v-card-actions class="px-6 pb-5 justify-end">
          <v-btn
            variant="flat"
            color="primary"
            @click="unsupportedFileDialog = false"
            >OK</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

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

      <v-switch
        v-model="showExtendedCommands"
        label="Show label commands"
        class="mx-2 mt-5"
        :disabled="!waveReady"
      />

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

    <!-- ── Toast ─────────────────────────────────────────────────────── -->
    <v-snackbar
      v-model="toast.show"
      :color="toast.color"
      location="bottom center"
      :timeout="3000"
      rounded="pill"
    >
      <v-icon :icon="toast.icon" class="mr-2" />{{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount, createApp, defineEmits } from "vue";
import WaveSurfer from "wavesurfer.js";
// Import Wavesurfer plugins as ESM modules for bundlers
// Use the ESM builds which Vite can resolve
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.esm.js";
import RegionLabel from "./RegionLabel.vue";
import { createAttachDrag } from "./wave-editor/drag.js";
import { setupRegionDOM } from "./wave-editor/regionDom.js";
import { startAutoBackup, stopAutoBackup, trackLabelEdit, setBackupFileNames, saveImmediateBackup } from "./wave-editor/backup.js";

const emit = defineEmits(["update-files"]);

const waveformEl = ref(null);
const timelineEl = ref(null);

// Displayed filenames for reference under the waveform
const audioFileName = ref("");
const labelFileName = ref("");

const wavesurfer = ref(null);
const regionsPlugin = ref(null);

/* --- Hidden file input refs and trigger helpers --- */
const audioFileInput = ref(null);
const labelFileInput = ref(null);
const isDragOver = ref(false);
const unsupportedFileDialog = ref(false);
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
let isImporting = false; // True while importLabelsFromText is running

const showOverlay = ref(false);
const ioText = ref("");
const waveReady = ref(false);
const loadingWave = ref(false);
const showExtendedCommands = ref(false);

const toast = reactive({ show: false, text: "", color: "success", icon: "mdi-check-circle-outline" });
let _toastTimer = null;
function showToast(text, { color = "success", icon = "mdi-check-circle-outline" } = {}) {
  if (_toastTimer) clearTimeout(_toastTimer);
  toast.text = text;
  toast.color = color;
  toast.icon = icon;
  toast.show = true;
  _toastTimer = setTimeout(() => { toast.show = false; }, 3200);
}

let pendingAudioName = "";

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
  try {
    if (region && region.__vueInstance && "label" in region.__vueInstance) {
      if (typeof labelOverride === "string" && labelOverride.length) {
        // Authoritative label supplied (import / adjacent-add): push it into
        // the component so the textbox shows the correct value.
        if (region.__vueInstance.label !== entry.label)
          region.__vueInstance.label = entry.label;
      } else {
        // No override (resize / drag → region-updated): the component is the
        // source of truth for what the user typed. Read it back so we don't
        // clobber in-progress edits.
        const liveLabel = region.__vueInstance.label;
        if (typeof liveLabel === "string" && liveLabel !== entry.label)
          entry.label = liveLabel;
      }
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
  // Track as edited — skip during label file imports
  if (!isImporting) {
    try {
      const sorted = [...groundTruth].sort((a, b) => (a.start || 0) - (b.start || 0));
      const pos = sorted.findIndex(e => e.uid === uid) + 1;
      if (pos > 0) trackLabelEdit(pos, label);
    } catch (_) {}
  }
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

function loadAudioFile(file) {
  if (!file) return;
  pendingAudioName = file.name;
  // store filename for UI reference
  try { audioFileName.value = file.name; } catch (e) {}
  try { emit('update-files', { audioFileName: audioFileName.value || '', labelFileName: labelFileName.value || '' }); } catch (e) {}
  try { setBackupFileNames(audioFileName.value, labelFileName.value); } catch (e) {}
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

function onFile(e) {
  loadAudioFile(e.target.files[0]);
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

function addAdjacentRegion(side, baseRegion, initialLabel) {
  console.log("Attempting to add adjacent region on", side, "of", baseRegion, "with label", initialLabel);
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
      const uid = createUid();
      const lbl = initialLabel || "Text";
      importingEntries.set(uid, { label: lbl });
      const newReg = regionsPlugin.value.addRegion({
        start,
        end,
        data: { label: lbl, uid },
      });
      // Belt-and-suspenders: WaveSurfer may fire region-created before
      // applying data, so guarantee the label a tick later.
      setTimeout(() => {
        try {
          const reg = newReg ||
            regionsPlugin.value.getRegions().find((r) => r.data && r.data.uid === uid);
          if (!reg) return;
          // Ensure region data has the label
          try { reg.data = Object.assign({}, reg.data, { uid, label: lbl }); } catch (_) {}
          // Fix groundTruth entry
          const gtEntry = groundTruth.find((e) => e.uid === uid);
          if (gtEntry && gtEntry.label !== lbl) gtEntry.label = lbl;
          // Fix mounted component input
          if (reg.__vueInstance && "label" in reg.__vueInstance &&
              reg.__vueInstance.label !== lbl) {
            reg.__vueInstance.label = lbl;
          }
        } catch (_) {}
        importingEntries.delete(uid);
      }, 0);
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
      const uid = createUid();
      const lbl = initialLabel || "Text";
      importingEntries.set(uid, { label: lbl });
      const newReg = regionsPlugin.value.addRegion({
        start,
        end,
        data: { label: lbl, uid },
      });
      // Belt-and-suspenders: WaveSurfer may fire region-created before
      // applying data, so guarantee the label a tick later.
      setTimeout(() => {
        try {
          const reg = newReg ||
            regionsPlugin.value.getRegions().find((r) => r.data && r.data.uid === uid);
          if (!reg) return;
          // Ensure region data has the label
          try { reg.data = Object.assign({}, reg.data, { uid, label: lbl }); } catch (_) {}
          // Fix groundTruth entry
          const gtEntry = groundTruth.find((e) => e.uid === uid);
          if (gtEntry && gtEntry.label !== lbl) gtEntry.label = lbl;
          // Fix mounted component input
          if (reg.__vueInstance && "label" in reg.__vueInstance &&
              reg.__vueInstance.label !== lbl) {
            reg.__vueInstance.label = lbl;
          }
        } catch (_) {}
        importingEntries.delete(uid);
      }, 0);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function loadLabelFile(file) {
  if (!file) return;
  // If there are existing labels, warn the user that loading will clear them
  if (groundTruth.length > 0) {
    const ok = window.confirm(
      "There are existing labels. Loading a label file will remove all current labels. Do you want to proceed?",
    );
    if (!ok) return;
  }
  const labelName = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    if (typeof text === "string") {
      importLabelsFromText(text);
      // store label filename for UI reference
      try { labelFileName.value = labelName; } catch (e) {}
      try { emit('update-files', { audioFileName: audioFileName.value || '', labelFileName: labelFileName.value || '' }); } catch (e) {}
      try { setBackupFileNames(audioFileName.value, labelFileName.value); } catch (e) {}
      showToast(`Labels loaded: ${labelName}`, { icon: "mdi-tag-multiple-outline" });
    }
  };
  reader.readAsText(file);
}

function onLabelFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  // Reset input upfront so the same file can be re-selected later
  try { e.target.value = ""; } catch (err) {}
  loadLabelFile(file);
}

function handleDocDragOver(e) {
  e.preventDefault();
  isDragOver.value = true;
}

function handleDocDragLeave(e) {
  // Only clear when leaving the browser viewport entirely
  if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
    isDragOver.value = false;
  }
}

function handleDocDrop(e) {
  e.preventDefault();
  isDragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
    loadAudioFile(file);
  } else if (
    file.name.toLowerCase().endsWith(".txt") ||
    file.type === "text/plain"
  ) {
    loadLabelFile(file);
  } else {
    unsupportedFileDialog.value = true;
  }
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
  // Use original label filename if available, append timestamp before extension
  try {
    const original = labelFileName && labelFileName.value ? labelFileName.value : null;
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    let outName;
    if (original && original.length) {
      const idx = original.lastIndexOf(".");
      if (idx > 0) {
        const base = original.slice(0, idx);
        const ext = original.slice(idx);
        outName = `${base}_${ts}${ext}`;
      } else {
        outName = `${original}_${ts}.txt`;
      }
    } else {
      outName = `labels_${ts}.txt`;
    }
    a.download = outName;
  } catch (e) {
    a.download = `labels_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
  }
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
  isImporting = true;
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
    isImporting = false;
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
  isImporting = false;
  // Immediately save a baseline backup (empty lastEditedLabels).
  // This also updates the snapshot so the interval won't fire for unedited data.
  try { saveImmediateBackup(groundTruth); } catch (_) {}
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
  }, (r) => {
    // Track the primary dragged/resized region as edited.
    try {
      const uid = r.data && r.data.uid;
      if (!uid) return;
      const entry = groundTruth.find(e => e.uid === uid);
      if (!entry) return;
      const sorted = [...groundTruth].sort((a, b) => (a.start || 0) - (b.start || 0));
      const pos = sorted.findIndex(e => e.uid === uid) + 1;
      if (pos > 0) trackLabelEdit(pos, entry.label || '');
    } catch (_) {}
  });

  wavesurfer.value.on("ready", () => {
    waveReady.value = true;
    try { loadingWave.value = false; } catch (e) {}
    // Move cursor to the beginning of the file when a new audio/video is loaded
    try {
      if (wavesurfer.value && typeof wavesurfer.value.seekTo === "function") {
        wavesurfer.value.seekTo(0);
      } else if (wavesurfer.value && typeof wavesurfer.value.setCurrentTime === "function") {
        wavesurfer.value.setCurrentTime(0);
      }
      if (wavesurfer.value && typeof wavesurfer.value.pause === "function") wavesurfer.value.pause();
    } catch (e) {}
    if (pendingAudioName) {
      showToast(`Loaded: ${pendingAudioName}`, { icon: "mdi-waveform" });
      pendingAudioName = "";
    }
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
    // If this region was created during import or adjacent-add, get the label
    // from the importing map and immediately clean up the entry so it doesn't linger.
    const importedEntry =
      r.data && r.data.uid ? importingEntries.get(r.data.uid) : null;
    if (importedEntry && r.data && r.data.uid) importingEntries.delete(r.data.uid);
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
        onAddRegionLeft: (initialLabel) => {
          addAdjacentRegion("left", r, initialLabel);
        },
        onAddRegionRight: (initialLabel) => {
          addAdjacentRegion("right", r, initialLabel);
        },
            showExtendedCommands: showExtendedCommands.value,
        canAddLeft: computeCanAddAdjacent(r).canLeft,
        canAddRight: computeCanAddAdjacent(r).canRight,
      });
      const instance = app.mount(mountEl);
      r.__vueApp = app;
      r.__vueInstance = instance;
      // Ensure the instance receives the current showExtendedCommands flag
      try {
        if (instance) instance.showExtendedCommands = showExtendedCommands.value;
      } catch (e) {}
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

function updateAllShowExtended() {
  if (!regionsPlugin.value) return;
  const regs = regionsPlugin.value.getRegions().filter((r) => r && r.__vueInstance);
  regs.forEach((r) => {
    try {
      r.__vueInstance.showExtendedCommands = showExtendedCommands.value;
    } catch (e) {}
  });
}

watch(showExtendedCommands, () => updateAllShowExtended());

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

  document.addEventListener("dragover", handleDocDragOver);
  document.addEventListener("dragleave", handleDocDragLeave);
  document.addEventListener("drop", handleDocDrop);
});

onBeforeUnmount(() => {
  stopAutoBackup();
  waveReady.value = false;
  try {
    window.removeEventListener("keydown", globalPlayPause);
  } catch (e) {}
  document.removeEventListener("dragover", handleDocDragOver);
  document.removeEventListener("dragleave", handleDocDragLeave);
  document.removeEventListener("drop", handleDocDrop);
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
.editor {
  position: relative;
}
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  border: 2px dashed rgb(var(--v-theme-primary));
  pointer-events: none;
  color: rgb(var(--v-theme-primary));
}
.drop-fade-enter-active,
.drop-fade-leave-active {
  transition: opacity 0.15s ease;
}
.drop-fade-enter-from,
.drop-fade-leave-to {
  opacity: 0;
}

.file-info {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}
.file-info-inner {
  text-align: center;
  font-size: 12px;
  color: rgb(var(--v-theme-medium-emphasis));
}
.file-info .file-name {
  display: inline-block;
}
.file-info .file-name + .file-name {
  margin-left: 12px;
}
</style>
