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
            Precision labeling for linguistic audio segmentation | v.
            {{ version }}
          </div>
        </v-toolbar-title>
      </v-toolbar>
    </header>

    <WaveEditor />
    <main class="scrollable-content">
      <v-container max-width="780" class="mt-5 mb-10">
        <v-card rounded="lg">
          <v-card-title
            class="text-overline text-primary pt-5 ps-6 pb-1 system-font"
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
import { en } from "vuetify/locale";
import WaveEditor from "./components/WaveEditor.vue";
import { version } from "../package.json";
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
</style>
