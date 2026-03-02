const BACKUP_INTERVAL_MS = 60000; // 60 seconds
const MAX_BACKUPS = 10;
const BACKUP_KEY_PREFIX = 'lingua_backup_';
let backupTimer = null;

function saveBackupToLocalStorage(groundTruth) {
  try {
    const timestamp = Date.now();
    const backupData = {
      timestamp,
      groundTruth: groundTruth.map(entry => ({ ...entry }))
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
    console.log(`Backup saved: ${new Date(timestamp).toLocaleString()}`);
  } catch (err) {
    console.warn('Failed to save backup to localStorage:', err);
  }
}

export function startAutoBackup(groundTruthRef) {
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
