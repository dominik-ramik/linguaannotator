const BACKUP_INTERVAL_MS = 30000; // 30 seconds
const MAX_BACKUPS = 10;
const BACKUP_KEY_PREFIX = 'lingua_backup_';
let backupTimer = null;
let lastBackupSnapshot = null;

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
 * Determine the 3 most recently edited labels by diffing against the previous
 * snapshot.  Falls back to the last 3 labels when no previous snapshot exists.
 */
function computeLastEditedLabels(currentGT, previousSnapshot) {
  const sorted = [...currentGT].sort((a, b) => (a.start || 0) - (b.start || 0));

  if (!previousSnapshot) {
    return sorted.slice(-3).map(e => e.label || '').reverse();
  }

  try {
    const prev = JSON.parse(previousSnapshot);
    const prevMap = new Map();
    prev.forEach(e => {
      const key = `${Number(e.start).toFixed(6)}_${Number(e.end).toFixed(6)}`;
      prevMap.set(key, e.label);
    });

    const changed = [];
    sorted.forEach(e => {
      const key = `${Number(e.start).toFixed(6)}_${Number(e.end).toFixed(6)}`;
      const prevLabel = prevMap.get(key);
      if (prevLabel === undefined || prevLabel !== e.label) {
        changed.push(e.label || '');
      }
    });

    if (changed.length > 0) return changed.slice(-3).reverse();
    return sorted.slice(-3).map(e => e.label || '').reverse();
  } catch {
    return sorted.slice(-3).map(e => e.label || '').reverse();
  }
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
    const lastEditedLabels = computeLastEditedLabels(groundTruth, lastBackupSnapshot);

    const backupData = {
      timestamp,
      labelCount: groundTruth.length,
      lastEditedLabels,
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
