/** A backup that can't be restored, with the record that stopped it. */
export class BackupRestoreError extends Error {
  constructor(
    message: string,
    public status = 422
  ) {
    super(message);
    this.name = "BackupRestoreError";
  }
}
