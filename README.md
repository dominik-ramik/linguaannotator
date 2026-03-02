# LinguaAnnotator

**Fast and simple labeling for linguistic audio segmentation.**

LinguaAnnotator is a lightweight, browser-based tool designed to make annotating, aligning, and segmenting linguistic audio fast and intuitive as a lightweight alternative to tools like ELAN. It allows you to visually mark audio regions and export them as standard label files—perfectly formatted for batch-splitting in tools like Audacity.

## Features

* **100% Local Processing:** Your audio and video files are processed entirely in your browser. Nothing is uploaded to a server.
* **Interactive Waveform:** Powered by WaveSurfer.js with smooth zooming and timeline navigation.
* **Smart Region Handles:** * Trim and extend duration.
  * Move regions freely.
  * **Ripple-move:** Push all subsequent regions to the right to maintain spacing.
* **Flexible Import/Export:** Import Audacity-formatted labels or simple word lists (which auto-generate 3-second regions). Export back to standard `.txt` label files.
* **Auto-backup:** Work safely knowing your current annotations are preserved in your local session.

## How to Use

### 1. Preparation
* **Load audio / video:** Click **“Load audio / video”** to select your local media file.
* **Import labels** in one of two ways:
  * **Simple list** (one word per line): Automatically creates sequential 3-second regions you can then edit. *(Tip: You can always resize these default regions on the waveform afterward).*
  * **Audacity format** (Start / End / Label): Maps your labels directly to their exact timestamps.

### 2. Annotation & Alignment
* **Add labels manually:** Click **Add label** and position the new region on the waveform.
* **Fine-tune regions** to perfectly match the spoken audio:
  * **Left / Right handles:** Trim or extend the duration.
  * **Top handle:** Move the region freely within its current space.
  * **Bottom handle:** Ripple-move (pushes all following regions to the right).
  * **Rename:** Click the label text directly to edit the word.
* **Playback:** Click anywhere on the waveform and press <kbd>Space</kbd> to play or pause the audio.

### 3. Exporting & Splitting
Once you are happy with your aligned regions, click **Download labels**. 

To split your audio into individual files based on these labels using Audacity:
1. Open your original audio file in [Audacity](https://www.audacityteam.org/).
2. Go to **File → Import → Labels** and select your downloaded `.txt` file.
3. Go to **File → Export → Export Multiple** and choose to split the files based on your labels. Audacity will automatically save each marked region as its own audio file.

## 👨Author

Created by **Dominik M. Ramík** Website: [dominicweb.eu](https://dominicweb.eu) for [Plants amd People of Vanuatu](https://pvnh.net/plants-and-people-of-vanuatu/) research project

## 📄 License

LinguaAnnotator © 2026 by Dominik M. Ramík is licensed under CC BY-NC-SA 4.0. To view a copy of this license, visit https://creativecommons.org/licenses/by-nc-sa/4.0/