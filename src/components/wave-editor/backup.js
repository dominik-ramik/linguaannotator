export const BACKUP_INTERVAL_MS = 30000; // 30 seconds
const MAX_BACKUPS = 10;
const BACKUP_KEY_PREFIX = 'lingua_backup_';
const MAX_RECENT_EDITS = 3;
let backupTimer = null;
let lastBackupSnapshot = null;
const currentFileNames = { audio: '', labels: '' };

/**
 * Update the filenames that will be stored in every subsequent backup.
 */
export function setBackupFileNames(audio, labels) {
  currentFileNames.audio = audio || '';
  currentFileNames.labels = labels || '';
}

/**
 * Rolling list of the most recently edited labels (max MAX_RECENT_EDITS).
 * Each entry is a string key "position:text" where position is the 1-based
 * sort-order index of the label among all labels.
 */
const recentEdits = [];

/**
 * Track a label edit.  Call this when a label is moved, resized or renamed.
 * @param {number} position  1-based sort-order position of the label.
 * @param {string} text      Current text of the label.
 */
export function trackLabelEdit(position, text) {
  const key = `${position}:${text}`;
  // Remove any existing entry for this position (regardless of its text),
  // so successive renames of the same label count as a single edit.
  const posPrefix = `${position}:`;
  const idx = recentEdits.findIndex(e => e === key || e.startsWith(posPrefix));
  if (idx !== -1) recentEdits.splice(idx, 1);
  recentEdits.push(key);
  // Trim to constant length.
  while (recentEdits.length > MAX_RECENT_EDITS) recentEdits.shift();
}

/**
 * Save a backup immediately (e.g. right after a label file is imported).
 * lastEditedLabels will be empty since this is a baseline, not an edit session.
 * Updates the snapshot so the periodic timer won't fire again for the same data.
 * Does nothing if groundTruth is empty.
 */
export function saveImmediateBackup(groundTruth) {
  if (!groundTruth || groundTruth.length === 0) return;
  // Clear any edits that accumulated during import — they are not real user edits.
  recentEdits.length = 0;
  saveBackupToLocalStorage(groundTruth);
}

/**
 * Produce a deterministic serialization of groundTruth for change detection.
 */
function serializeGroundTruth(groundTruth) {
  const sorted = [...groundTruth].sort((a, b) => (a.start || 0) - (b.start || 0));
  return JSON.stringify(sorted.map(e => ({
    start: e.start,
    end: e.end,
    label: e.label
  })));
}

/**
 * Initialise lastBackupSnapshot from the most recent backup already in
 * localStorage so the first interval tick does not duplicate an identical entry.
 */
function initLastSnapshot() {
  try {
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(BACKUP_KEY_PREFIX));
    if (allKeys.length === 0) return;
    const entries = allKeys.map(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        return { timestamp: data.timestamp || 0, groundTruth: data.groundTruth };
      } catch { return null; }
    }).filter(Boolean).sort((a, b) => b.timestamp - a.timestamp);
    if (entries.length > 0 && entries[0].groundTruth) {
      lastBackupSnapshot = serializeGroundTruth(entries[0].groundTruth);
    }
  } catch { /* ignore */ }
}

function saveBackupToLocalStorage(groundTruth) {
  try {
    const currentSnapshot = serializeGroundTruth(groundTruth);

    // Skip saving when nothing changed since the last backup
    if (lastBackupSnapshot !== null && currentSnapshot === lastBackupSnapshot) {
      return;
    }

    const timestamp = Date.now();
    // Snapshot the running recent-edits list and clear it for the next interval.
    const lastEditedLabels = recentEdits.slice();
    recentEdits.length = 0;

    const backupData = {
      timestamp,
      labelCount: groundTruth.length,
      lastEditedLabels,
      audioFileName: currentFileNames.audio,
      labelFileName: currentFileNames.labels,
      groundTruth: [...groundTruth]
        .sort((a, b) => (a.start || 0) - (b.start || 0))
        .map(entry => ({ ...entry }))
    };

    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(BACKUP_KEY_PREFIX));
    const backupEntries = allKeys.map(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        return { key, timestamp: data.timestamp || 0 };
      } catch {
        return { key, timestamp: 0 };
      }
    }).sort((a, b) => b.timestamp - a.timestamp);

    if (backupEntries.length >= MAX_BACKUPS) {
      backupEntries.slice(MAX_BACKUPS - 1).forEach(entry => {
        localStorage.removeItem(entry.key);
      });
    }

    const backupKey = `${BACKUP_KEY_PREFIX}${timestamp}`;
    localStorage.setItem(backupKey, JSON.stringify(backupData));
    lastBackupSnapshot = currentSnapshot;
    console.log(`Backup saved: ${new Date(timestamp).toLocaleString()}`);
  } catch (err) {
    console.warn('Failed to save backup to localStorage:', err);
  }
}

export function startAutoBackup(groundTruthRef) {
  initLastSnapshot();
  recentEdits.length = 0;
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = setInterval(() => {
    try {
      if (groundTruthRef && groundTruthRef.length > 0) {
        saveBackupToLocalStorage(groundTruthRef);
      }
    } catch (err) {
      console.warn('Auto-backup failed', err);
    }
  }, BACKUP_INTERVAL_MS);
}

export function stopAutoBackup() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}

/**
 * Return all backups from localStorage, newest first.
 */
export function getBackups() {
  try {
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(BACKUP_KEY_PREFIX));
    return allKeys.map(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        return {
          key,
          timestamp: data.timestamp || 0,
          labelCount: data.labelCount || (data.groundTruth ? data.groundTruth.length : 0),
          lastEditedLabels: data.lastEditedLabels || [],
          audioFileName: data.audioFileName || '',
          labelFileName: data.labelFileName || '',
        };
      } catch {
        return null;
      }
    }).filter(Boolean).sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

/**
 * Download a specific backup as an Audacity-format .txt label file.
 */
export function downloadBackup(backupKey) {
  try {
    const raw = localStorage.getItem(backupKey);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data.groundTruth || data.groundTruth.length === 0) return;

    const sorted = [...data.groundTruth].sort((a, b) => (a.start || 0) - (b.start || 0));
    const text = sorted.map(entry => {
      const start = Number(entry.start || 0);
      const end = Number(entry.end || 0);
      return `${start.toFixed(6)}\t${end.toFixed(6)}\t${entry.label || ''}`;
    }).join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date(data.timestamp).toISOString().slice(0, 19).replace(/:/g, '-');
    a.download = `backup_${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('Failed to download backup:', err);
  }
}
