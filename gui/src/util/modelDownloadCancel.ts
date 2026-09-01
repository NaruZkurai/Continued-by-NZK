/**
 * Shared AbortController for the "model downloading" wait loop in
 * streamThunkWrapper.
 *
 * The ModelDownloadStatus cancel button calls `cancelActiveModelDownload()`
 * to abort the currently-active wait loop so it stops retrying and exits
 * cleanly instead of waiting forever.
 */

let activeAborter: AbortController | undefined;

export function setActiveModelDownloadAborter(
  aborter: AbortController | undefined,
): void {
  activeAborter = aborter;
}

export function cancelActiveModelDownload(): void {
  activeAborter?.abort();
}

export function isActiveModelDownloadAborted(): boolean {
  return activeAborter?.signal.aborted ?? false;
}
