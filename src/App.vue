<template>
  <div class="app">
    <header class="toolbar">
      <h1>LinguaAnnotator</h1>
      <h2>Precision labeling for linguistic audio segmentation</h2>
    </header>

    <main>
      <WaveEditor />

      <section class="howto" style="margin-left: 2em">
        <h2>How to use</h2>
        <ol>
          <li>
            <strong>Load audio / video:</strong> Click "Load audio" to select your file.
          </li>
          <li>
            <strong>Import labels</strong> in one of two ways:
            <ul>
              <li>
                <strong>Simple list</strong> (One word per line): Automatically
                creates sequential 3-second regions you can then edit.
              </li>
              <li>
                <strong>Audacity format</strong> (Start / End / Label): Maps
                directly to timestamps. You can continue editing these regions.
              </li>
            </ul>
          </li>
          <li>
            <strong>Add labels manually:</strong> Click <em>+ Add label</em> and
            position the new region on the waveform.
          </li>
          <li>
            <strong>Fine-tune regions</strong> to perfectly match the audio:
            <ul>
              <li>
                <strong>Left / Right handles:</strong> Trim or extend the
                duration.
              </li>
              <li>
                <strong>Top handle:</strong> Move the region freely within its
                space.
              </li>
              <li>
                <strong>Bottom handle:</strong> Ripple-move (pushes all
                following regions to the right).
              </li>
              <li>
                <strong>Rename:</strong> Click the label text directly to edit
                it.
              </li>
            </ul>
          </li>
          <li>
            <strong>Play / Pause:</strong> Click anywhere on the waveform and
            press <kbd>Space</kbd>.
          </li>
          <li>
            <strong>Split audio in Audacity:</strong> Once you've downloaded
            your finished labels file:
            <ol>
              <li>Open your original audio file in Audacity.</li>
              <li>
                Go to <strong>File → Import → Labels</strong> and select your
                downloaded text file.
              </li>
              <li>
                Go to <strong>File → Export → Export Multiple</strong> to save
                each label as its own audio file.
              </li>
            </ol>
          </li>
        </ol>
        <p class="muted">
          <strong>Tip:</strong> If you import a simple list, you can always
          resize the default 3-second regions on the waveform afterward to fit
          your needs.
        </p>
      </section>
    </main>
  </div>
</template>

<script setup>
import WaveEditor from "./components/WaveEditor.vue";
</script>

<style>
:root {
  --bg: #1e1e1e;
  --panel: #2d2d2d;
  --muted: #aaa;
}
body {
  margin: 0;
  font-family:
    system-ui,
    Segoe UI,
    Roboto,
    Arial;
}
.toolbar {
  background: var(--panel);
  color: white;
  padding: 12px;
}
.app {
  background: var(--bg);
  min-height: 100vh;
  color: #ddd;
}
</style>
