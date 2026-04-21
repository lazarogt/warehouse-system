export interface BackupRecord {
  fileName: string;
  filePath: string;
  createdAt: string;
  size: number;
}

export interface CreateBackupResult extends BackupRecord {
  reason: "manual" | "automatic" | "restore-point";
}

export interface RestoreBackupPayload {
  filePath?: string;
}

export interface RestoreBackupResult {
  restored: boolean;
  restoredFrom: string | null;
  preRestoreBackupPath: string | null;
  restartRequired: boolean;
}
