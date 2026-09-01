import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isModelDownloadingError } from "../../util/errorAnalysis";
import { createMockStore, getEmptyRootState } from "../../util/test/mockStore";
import { streamThunkWrapper } from "./streamThunkWrapper";

// The model-downloading error exactly as returned by Unsloth Studio.
function modelDownloadingError(): Error {
  const err = new Error(
    "Downloading 'unsloth/Qwen3.5-2B-MTP-GGUF:UD-Q4_K_XL' (1.9 GB). Retry shortly. Track it in Unsloth Studio.",
  );
  (err as any).code = "model_downloading";
  return err;
}

describe("streamThunkWrapper model-downloading wait", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should not show an error dialog when the model is downloading", async () => {
    const store = createMockStore(getEmptyRootState());

    // The backend is still downloading the model. It will be ready on the
    // second attempt.
    let attempts = 0;
    const runStream = vi.fn(async () => {
      attempts++;
      if (attempts === 1) {
        throw modelDownloadingError();
      }
      // Second attempt succeeds.
      return;
    });

    const promise = store.dispatch(streamThunkWrapper(runStream) as any);

    // Advance through the first backoff (5s) so the retry happens.
    await vi.advanceTimersByTimeAsync(5000);

    // The stream should have succeeded now.
    await promise;

    const dispatchedActions = store.getActions();

    // We should NOT have dispatched the StreamErrorDialog.
    const errorDialogAction = dispatchedActions.find(
      (a: any) =>
        a.type === "ui/setDialogMessage" &&
        a.payload?.type?.name === "StreamErrorDialog",
    );
    expect(errorDialogAction).toBeUndefined();

    // We SHOULD have shown the waiting status at least once.
    const statusActions = dispatchedActions.filter(
      (a: any) =>
        a.type === "ui/setDialogMessage" &&
        a.payload?.type?.name === "ModelDownloadStatus",
    );
    expect(statusActions.length).toBeGreaterThan(0);

    // The stream was retried until the model was ready.
    expect(runStream).toHaveBeenCalledTimes(2);
  });

  it("isModelDownloadingError detects the exact Unsloth error", () => {
    expect(isModelDownloadingError(modelDownloadingError())).toBe(true);
    expect(isModelDownloadingError(new Error("generic error"))).toBe(false);
  });
});
