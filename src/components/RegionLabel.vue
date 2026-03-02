<template>
  <div class="region-vue" style="border: 1px solid white">
    <!-- Top handle: move within free space (blocked by neighbors) -->
    <div class="top-row" style="display: flex; position: relative">
      <div class="handle-top" ref="topHandle" style="text-align: center; flex-grow: 1;">↔</div>
      <button class="menu-btn" ref="menu" @click.stop="toggleMenu" style="padding-left: 0.4em; padding-right: 0.4em; background-color: #ffffff22; border: none; color: inherit; cursor: pointer">⋯</button>
      <div v-if="menuOpen" class="menu-popup" @click.stop>
        <button class="menu-item" @click="doDelete">Delete</button>
        <button class="menu-item" @click="doAddLeft" :disabled="!canAddLeft">Add left</button>
        <button class="menu-item" @click="doAddRight" :disabled="!canAddRight">Add right</button>
      </div>
    </div>
    <!-- Middle row: left resize | text | right resize -->
    <div class="middle-row" style="display: flex; height: 2em;">
      <div class="resize-handle resize-l" ref="resLHandle" style="width: 60px; text-align: center; background-color: #ffffff22;">&lt;</div>
      <input
        type="text"
        class="region-input"
        style="flex-grow: 1; min-width: 10px;"
        v-model="label"
        @mousedown.stop
        @keydown.space.stop
      />
      <div class="resize-handle resize-r" ref="resRHandle" style="width: 60px; text-align: center; background-color: #ffffff22;">&gt;</div>
    </div>

    <!-- Bottom handle: move with ripple effect -->
    <div class="handle-bottom" ref="bottomHandle" style="text-align: center; height: 3em;">
      ⇼ <span style="font-size: 0.6em;"> {{ durationText }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";

const props = defineProps({
  region: Object,
  initialLabel: { type: String, default: "" },
  uid: { type: String, default: "" },
  onLabelUpdate: Function,
  onDeleteRegion: Function,
  onAddRegionLeft: Function,
  onAddRegionRight: Function,
  canAddLeft: { type: Boolean, default: false },
  canAddRight: { type: Boolean, default: false },
});
const label = ref("");
const topHandle = ref(null);
const bottomHandle = ref(null);
const resLHandle = ref(null);
const resRHandle = ref(null);
const infoRow = ref(null);
const durationText = ref("");
const menuOpen = ref(false);
const canAddLeft = ref(Boolean(props.canAddLeft));
const canAddRight = ref(Boolean(props.canAddRight));

// Expose refs so parent can attach drag handlers and allow parent to set label
// Also expose the canAdd flags so the parent can update them directly on the
// mounted instance (WaveEditor sets instance.canAddLeft/Right).
defineExpose({ topHandle, bottomHandle, resLHandle, resRHandle, label, canAddLeft, canAddRight });

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function doDelete() {
  menuOpen.value = false;
  try {
    // Mark region as removed immediately so drag handlers on sibling regions
    // stop treating this region as an obstacle
    if (props.region) props.region._removed = true;
    if (typeof props.onDeleteRegion === "function") props.onDeleteRegion();
    else if (props.region && typeof props.region.remove === "function") props.region.remove();
  } catch (e) {}
}

function doAddLeft() {
  menuOpen.value = false;
  try {
    if (canAddLeft.value && typeof props.onAddRegionLeft === "function") props.onAddRegionLeft();
  } catch (e) {}
}

function doAddRight() {
  menuOpen.value = false;
  try {
    if (canAddRight.value && typeof props.onAddRegionRight === "function") props.onAddRegionRight();
  } catch (e) {}
}

function readLabelFromRegion(r) {
  if (r.data && typeof r.data.label === "string") return r.data.label;
  if (typeof r.content === "string") return r.content;
  if (r.content && r.content.innerText) return r.content.innerText;
  return "";
}

onMounted(() => {
  const r = props.region;
  // Initialize label from passed initialLabel prop first (avoids races),
  // then fall back to reading from region object.
  const initialLabel =
    props.initialLabel && props.initialLabel.length
      ? props.initialLabel
      : readLabelFromRegion(r);
  label.value = initialLabel;

  // Watch textarea value and sync back to region
  watch(label, (v) => {
    try {
      if (r.data && r.data.label === v) return;
      // Ensure the wavesurfer region does NOT render the label text in its
      // default content area. The authoritative text is the RegionLabel input
      // which is synced to the ground truth. So clear region.content here.
      if (typeof r.setOptions === "function") r.setOptions({ content: "" });
    } catch (e) {}
    try {
      r.data = Object.assign({}, r.data, { label: v });
    } catch (e) {}
    if (typeof props.onLabelUpdate === "function") {
      try {
        props.onLabelUpdate(v);
      } catch (err) {
        /* ignore */
      }
    }
  });

  // Duration display: update the info-row with region duration in seconds
  const updateDuration = () => {
    try {
      const s = Number(r.start || 0);
      const e = Number(r.end || 0);
      let d = e - s;
      if (!isFinite(d) || d < 0) d = 0;
      durationText.value = `${d.toFixed(1)}s`;
    } catch (err) {
      durationText.value = "";
    }
  };

  // Initialize and watch for changes to start/end
  updateDuration();
  // Try to listen to region update events if available (Wavesurfer region may
  // emit update/update-end). Fallback to polling while the component is
  // mounted so durationText updates live during drags/resizes.
  let stopFns = [];
  try {
    if (r && typeof r.on === "function") {
      const cb = () => updateDuration();
      r.on("update", cb);
      r.on("update-end", cb);
      stopFns.push(() => {
        if (typeof r.un === "function") r.un("update", cb);
        if (typeof r.un === "function") r.un("update-end", cb);
        if (typeof r.off === "function") {
          r.off("update", cb);
          r.off("update-end", cb);
        }
      });
    }
  } catch (err) {
    /* ignore */
  }

  // Poll as fallback if no event listeners were attached
  if (stopFns.length === 0) {
    let lastS = Number(r.start || 0);
    let lastE = Number(r.end || 0);
    const tid = setInterval(() => {
      const s2 = Number(r.start || 0);
      const e2 = Number(r.end || 0);
      if (s2 !== lastS || e2 !== lastE) {
        lastS = s2;
        lastE = e2;
        updateDuration();
      }
    }, 120);
    stopFns.push(() => clearInterval(tid));
  }

  // Ensure we also update once if any direct property change occurs
  watch(
    () => [r.start, r.end],
    () => updateDuration(),
  );

  // Watch incoming canAdd props so UI enables/disables buttons
  watch(() => props.canAddLeft, (v) => { canAddLeft = !!v; });
  watch(() => props.canAddRight, (v) => { canAddRight = !!v; });

  function toggleMenu() {
    menuOpen.value = !menuOpen.value;
  }

  function doDelete() {
    menuOpen.value = false;
    try {
      // Mark region as removed immediately so drag handlers on sibling regions
      // stop treating this region as an obstacle
      if (props.region) props.region._removed = true;
      if (typeof props.onDeleteRegion === "function") props.onDeleteRegion();
      else if (props.region && typeof props.region.remove === "function") props.region.remove();
    } catch (e) {}
  }

  function doAddLeft() {
    menuOpen.value = false;
    try { if (typeof props.onAddRegionLeft === 'function') props.onAddRegionLeft(); } catch (e) {}
  }

  function doAddRight() {
    menuOpen.value = false;
    try { if (typeof props.onAddRegionRight === 'function') props.onAddRegionRight(); } catch (e) {}
  }

  onBeforeUnmount(() => {
    stopFns.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
  });
});
</script>

<style scoped>
.menu-popup {
  position: absolute;
  right: 6px;
  top: 28px;
  background: rgba(20,20,20,0.95);
  border: 1px solid rgba(255,255,255,0.06);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;
}
.menu-item {
  background: transparent;
  color: #ddd;
  border: none;
  padding: 6px 10px;
  text-align: left;
  cursor: pointer;
}
.menu-item:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
 
<style scoped>
.region-vue {
  height: 5em;
  display: flex;
  flex-direction: column;
  overflow: visible;
  /* Ensure children (top/middle/bottom) stretch to full width */
  align-items: stretch;
}

/* Top handle: MOVE freely within limits */
.handle-top {
  height: 18px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  cursor: grab;
  border-radius: 3px 3px 0 0;
  opacity: 0.95;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 0;
  color: transparent;
  font-weight: bold;
  letter-spacing: 0;
  user-select: none;
  transition: all 0.15s ease;
  position: relative;
}
.handle-top::before {
  content: "";
  position: absolute;
  width: 20px;
  height: 3px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 2px;
  top: 50%;
  transform: translateY(-50%);
}
.handle-top:hover {
  opacity: 1;
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
}
.handle-top:active {
  cursor: grabbing;
  opacity: 1;
}

/* Middle row: left resize | text input | right resize */
.middle-row {
  flex-grow: 1;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  background: rgba(30, 30, 40, 0.85);
  backdrop-filter: blur(4px);
  /* Make middle row take full width of the parent region-vue */
  width: 100%;
  /* allow flex children to shrink properly inside constrained widths */
  min-width: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.region-input {
  flex: 1;
  border: none;
  background: transparent;
  text-align: center;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  outline: none;
  padding: 6px 10px;
  /* allow input to shrink horizontally when needed */
  min-width: 0;
  width: 100%;
  /* allow multi-line wrapping */
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  resize: none; /* prevent user resizing the textarea */
  height: 100%;
  transition: background 0.15s ease;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.region-input:focus {
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
}
.region-input:focus {
  background: rgba(0, 0, 0, 0.5);
}

/* Left resize handle: thin vertical strip on left side */
.resize-l {
  /* Fixed width flex item on the left */
  flex-shrink: 0;
  width: 10px;
  background: linear-gradient(
    90deg,
    rgba(255, 193, 7, 0.6) 0%,
    rgba(255, 193, 7, 0.3) 100%
  );
  cursor: ew-resize;
  border-right: 1px solid rgba(255, 193, 7, 0.5);
  transition: all 0.15s ease;
  position: relative;
}
.resize-l::before {
  content: "";
  position: absolute;
  left: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 1px;
}
.resize-l:hover {
  background: linear-gradient(
    90deg,
    rgba(255, 193, 7, 0.9) 0%,
    rgba(255, 193, 7, 0.6) 100%
  );
  width: 12px;
  box-shadow: inset 2px 0 4px rgba(255, 193, 7, 0.3);
}

/* Right resize handle: thin vertical strip on right side with ripple */
.resize-r {
  /* Fixed width flex item on the right */
  flex-shrink: 0;
  width: 10px;
  background: linear-gradient(
    270deg,
    rgba(220, 53, 69, 0.6) 0%,
    rgba(220, 53, 69, 0.3) 100%
  );
  cursor: ew-resize;
  border-left: 1px solid rgba(220, 53, 69, 0.5);
  transition: all 0.15s ease;
  position: relative;
}
.resize-r::before {
  content: "";
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 1px;
}
.resize-r:hover {
  background: linear-gradient(
    270deg,
    rgba(220, 53, 69, 0.9) 0%,
    rgba(220, 53, 69, 0.6) 100%
  );
  width: 12px;
  box-shadow: inset -2px 0 4px rgba(220, 53, 69, 0.3);
}

/* Bottom handle: RIPPLE - moves this and all right labels */
.handle-bottom {
  height: 20px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  cursor: ns-resize;
  border-radius: 0 0 3px 3px;
  opacity: 0.95;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 0;
  font-weight: bold;
  color: transparent;
  user-select: none;
  transition: all 0.15s ease;
  position: relative;
}
.handle-bottom:hover {
  opacity: 1;
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
}
.handle-bottom:active {
  cursor: move;
  opacity: 1;
}
.handle-bottom:hover{
    background-color: red;
}
</style>
