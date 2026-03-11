<template>
  <v-app class="custom-flex-layout">
    <header>
      <v-toolbar color="surface" elevation="2" height="72">
        <template #prepend>
          <v-icon icon="mdi-waveform" color="primary" size="52" class="ml-3" />
        </template>
        <v-toolbar-title>
          <div class="text-headline-medium system-font">LinguaAnnotator</div>
          <div
            class="text-body-large system-font"
            style="font-size: 0.7em !important"
          >
            Fast and simple labeling for linguistic audio segmentation | v.
            {{ version }}
          </div>
        </v-toolbar-title>
      </v-toolbar>
    </header>

    <WaveEditor class="mb-2" @update-files="onUpdateFiles" />
    <main class="scrollable-content">
      <v-container class="mt-0 mb-10 d-flex flex-row align-start">
        <v-card width="640" rounded="lg">
          <v-card-title
            class="text-overline text-primary pt-5 ps-6 pb-1 system-font mb-6"
          >
            How to use
          </v-card-title>
          <v-card-text class="ps-6 pe-6 pb-2">
            <ol class="howto-list">
              <li>
                <strong>Load audio / video:</strong> Click “Load audio” to
                select your file.
              </li>
              <li>
                <strong>Import labels</strong> in one of two ways:
                <ul>
                  <li>
                    <strong>Simple list</strong> (one word per line):
                    automatically creates sequential 3-second regions you can
                    then edit.
                  </li>
                  <li>
                    <strong>Audacity format</strong> (Start / End / Label): maps
                    directly to timestamps.
                  </li>
                </ul>
              </li>
              <li>
                <strong>Add labels manually:</strong> click
                <em>Add label</em> and position the new region on the waveform.
              </li>
              <li>
                <strong>Fine-tune regions</strong> to perfectly match the audio:
                <ul>
                  <li>
                    <strong>Left / Right handles:</strong> trim or extend
                    duration.
                  </li>
                  <li>
                    <strong>Top handle:</strong> move the region freely within
                    its space.
                  </li>
                  <li>
                    <strong>Bottom handle:</strong> ripple-move (pushes all
                    following regions right).
                  </li>
                  <li>
                    <strong>Rename:</strong> click the label text directly to
                    edit it.
                  </li>
                </ul>
              </li>
              <li>
                <strong>Play / Pause:</strong> click anywhere on the waveform
                and press <v-kbd>Space</v-kbd>.
              </li>
              <li>
                <strong>Split audio in Audacity:</strong> once you’ve downloaded
                your labels file:
                <ol>
                  <li>Open your original audio in Audacity.</li>
                  <li>
                    Go to <strong>File → Import → Labels</strong> and select the
                    downloaded file.
                  </li>
                  <li>
                    Go to <strong>File → Export → Export Multiple</strong> to
                    save each label as its own audio file.
                  </li>
                </ol>
              </li>
            </ol>
          </v-card-text>
          <v-card-text class="ps-6 pe-6 pb-5 pt-0">
            <v-alert
              density="compact"
              variant="tonal"
              color="primary"
              icon="mdi-lightbulb-outline"
            >
              <strong>Tip:</strong> If you import a simple list, you can always
              resize the default 3-second regions on the waveform afterward.
            </v-alert>
          </v-card-text>
        </v-card>

        <!-- ── Backups ──────────────────────────────────────────────────── -->
        <v-card width="640" rounded="lg" class="ml-5">
          <v-card-title
            class="text-overline text-primary pt-5 ps-6 pb-1 system-font"
          >
            Currently loaded files
          </v-card-title>
          <v-card-text class="ps-6 pe-6 pb-4 pt-1">
            <div class="text-caption">
              <template v-if="currentAudio || currentLabelFile">
                <span v-if="currentAudio"><b>Audio:</b> {{ currentAudio }}</span>
                <span v-if="currentAudio && currentLabelFile"> &middot; </span>
                <span v-if="currentLabelFile"><b>Labels:</b> {{ currentLabelFile }}</span>
              </template>
              <span v-else class="text-medium-emphasis">None</span>
            </div>
          </v-card-text>
          <v-divider />
          <v-card-title
            class="text-overline text-primary pt-4 ps-6 pb-1 system-font mb-4"
          >
            Backups
          </v-card-title>
          <v-card-text class="ps-6 pe-6 pb-5 pt-1">
            <div
              v-if="backups.length === 0"
              class="text-body-small text-medium-emphasis"
            >
              No backups yet. Backups are saved automatically every
              {{ backupIntervalText }} when labels change.
            </div>
            <v-sheet
              v-else
              rounded="lg"
              color="surface-variant"
              class="pa-1"
            >
              <v-list density="compact" bg-color="transparent" class="py-0">
                <template
                  v-for="(backup, idx) in backups"
                  :key="backup.key"
                >
                  <v-list-item class="px-4 py-3" :lines="false">
                    <template #prepend>
                      <v-btn
                        size="default"
                        variant="tonal"
                        color="secondary"
                        prepend-icon="mdi-download"
                        class="mr-3"
                        style="align-self: flex-start;"
                        @click="handleDownloadBackup(backup.key)"
                        title="Download backup as label file"
                      >{{ formatBackupDate(backup.timestamp) }}</v-btn>
                    </template>
                    <v-list-item-subtitle class="text-caption" style="white-space: normal; opacity: 1;">
                      <template v-if="backup.audioFileName || backup.labelFileName">
                        <span v-if="backup.audioFileName"><b>Audio:</b> {{ backup.audioFileName }}</span>
                        <br />
                        <span v-if="backup.labelFileName"><b>Labels:</b> {{ backup.labelFileName }}</span>
                        <br />
                      </template>
                      <b>Labels count:</b> {{ backup.labelCount }}
                      <template
                        v-if="
                          backup.lastEditedLabels &&
                          backup.lastEditedLabels.length > 0
                        "
                      >
                        <br /><b>Last edited:</b>
                        <ul class="backup-edited-list">
                          <li
                            v-for="lbl in backup.lastEditedLabels"
                            :key="lbl"
                          >{{ lbl.split(':').slice(1).join(':') }} <span class="text-medium-emphasis" style="color: gray;">(#{{ lbl.split(':')[0] }})</span></li>
                        </ul>
                      </template>
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-divider v-if="idx < backups.length - 1" />
                </template>
              </v-list>
            </v-sheet>
            <v-alert
              density="compact"
              variant="tonal"
              color="primary"
              icon="mdi-lightbulb-outline"
              class="mt-4"
            >
              <strong>Tip:</strong> Backups are stored in your browser and remain available after reloading the page.
            </v-alert>
          </v-card-text>
        </v-card>
      </v-container>
    </main>

    <footer>
      <v-sheet class="pa-4" height="56" elevation="2" color="surface">
        <v-container class="pa-0 d-flex align-center h-100" fluid>
          <div class="d-flex align-center" style="gap: 12px">
            <div class="text-body-small">LinguaAnnotator</div>
            <div class="text-body-small muted">v. {{ version }}</div>
            <div class="text-body-small">•</div>
            <div class="text-body-small">
              by
              <a
                href="https://dominicweb.eu"
                target="_blank"
                rel="noreferrer"
                class="link"
                >Dominik M. Ramík</a
              >
            </div>
          </div>
          <v-spacer />
          <div class="d-flex align-center" style="gap: 8px">
            <v-btn
              variant="text"
              icon="mdi-github"
              href="https://github.com/dominik-ramik/linguaannotator"
              target="_blank"
              rel="noreferrer"
            />
            <v-btn
              variant="text"
              size="small"
              href="https://github.com/dominik-ramik/linguaannotator"
              target="_blank"
              rel="noreferrer"
              >View on GitHub</v-btn
            >
          </div>
        </v-container>
      </v-sheet>
    </footer>
  </v-app>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { en } from "vuetify/locale";
import WaveEditor from "./components/WaveEditor.vue";
import { version } from "../package.json";
import {
  getBackups,
  downloadBackup,
  BACKUP_INTERVAL_MS,
} from "./components/wave-editor/backup.js";

const backups = ref([]);
let backupRefreshTimer = null;
function formatInterval(ms) {
  const s = Math.round(ms / 1000);
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (rem === 0) return `${m} minute${m > 1 ? 's' : ''}`;
    return `${m} minute${m > 1 ? 's' : ''} ${rem} second${rem > 1 ? 's' : ''}`;
  }
  return `${s} second${s > 1 ? 's' : ''}`;
}
const backupIntervalText = formatInterval(BACKUP_INTERVAL_MS);
const currentAudio = ref("");
const currentLabelFile = ref("");

function onUpdateFiles(payload) {
  currentAudio.value = payload.audioFileName || "";
  currentLabelFile.value = payload.labelFileName || "";
}

function refreshBackups() {
  backups.value = getBackups();
}

function formatBackupDate(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function handleDownloadBackup(key) {
  downloadBackup(key);
}

onMounted(() => {
  refreshBackups();
  backupRefreshTimer = setInterval(refreshBackups, 15000);
});

onBeforeUnmount(() => {
  if (backupRefreshTimer) {
    clearInterval(backupRefreshTimer);
    backupRefreshTimer = null;
  }
});
</script>

<style>
/* 1. Kill the default browser window scrollbar */
html {
  overflow: hidden !important;
}

/* 2. Global Flexbox layout for the app */
.custom-flex-layout {
  display: flex !important;
  flex-direction: column !important;
  height: 100dvh !important;
}

/* 3. Ensure Header and Footer never shrink or grow */
header,
footer {
  flex-shrink: 0;
  z-index: 10; /* Keeps shadows rendering over the main content */
}

/* 4. Main content stretches and scrolls internally */
.scrollable-content {
  flex-grow: 1;
  overflow-y: auto;
  position: relative;
  background-color: var(--v-theme-background);
}

/* Existing HowTo Styles */
.howto-list {
  margin: 0;
  padding-left: 1.4em;
  font-size: 14px;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.7);
}
.howto-list > li {
  margin-bottom: 10px;
}
.howto-list strong {
  color: rgba(255, 255, 255, 0.87);
}
.howto-list ul,
.howto-list ol {
  margin-top: 6px;
  padding-left: 1.2em;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: rgba(255, 255, 255, 0.5);
}
.backup-edited-list {
  margin: 2px 0 0 0;
  padding-left: 1.2em;
  display: flex;
  flex-direction: column;
  gap: 1px;
  list-style: disc;
}
</style>
