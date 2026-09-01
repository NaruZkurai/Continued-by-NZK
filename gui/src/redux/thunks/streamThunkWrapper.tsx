import { createAsyncThunk } from "@reduxjs/toolkit";

import { ModelDownloadStatus } from "../../components/ModelDownloadStatus";
import StreamErrorDialog from "../../pages/gui/StreamError";
import {
    analyzeError,
    isModelDownloadingError,
} from "../../util/errorAnalysis";
import {
    setActiveModelDownloadAborter,
} from "../../util/modelDownloadCancel";

const OVERLOADED_RETRIES = 3;
const OVERLOADED_DELAY_MS = 2000;

// Backoff bounds for the "model downloading" wait loop. The loop retries
// indefinitely (until the model is ready or the user cancels) but never
// polls the backend faster than this.
const MODEL_DOWNLOAD_BASE_DELAY_MS = 5000;
const MODEL_DOWNLOAD_MAX_DELAY_MS = 60000;

function isOverloadedErrorMessage(message?: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("overloaded") || lower.includes("529");
}

// Detect user-initiated cancellation so the wait loop exits instead of
// retrying forever (e.g. the user clicked "Stop waiting" or Stop generation).
function isCancelError(error: unknown): boolean {
  if (error === "cancel") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

import { selectSelectedChatModel } from "../slices/configSlice";
import { setDialogMessage, setShowDialog } from "../slices/uiSlice";
import { AppDispatch, RootState, ThunkApiType } from "../store";
import { cancelStream } from "./cancelStream";
import { saveCurrentSession } from "./session";

export const streamThunkWrapper = createAsyncThunk<
  void,
  () => Promise<void>,
  ThunkApiType
>("chat/streamWrapper", async (runStream, { dispatch, getState }) => {
  for (let attempt = 0; attempt <= OVERLOADED_RETRIES; attempt++) {
    try {
      await runStream();
      const state = getState();
      if (!state.session.isInEdit) {
        await dispatch(
          saveCurrentSession({
            openNewSession: false,
            generateTitle: true,
          }),
        );
      }
      return;
    } catch (e) {
      // Get the selected model from the state for error analysis
      const state = getState();
      const selectedModel = selectSelectedChatModel(state);
      const { message, isModelDownloading } = analyzeError(e, selectedModel);

      // The backend is still downloading the requested model. Wait and retry
      // until it is ready (instead of showing a fatal error dialog). Loop
      // indefinitely, backing off, and only stop when the user cancels.
      if (isModelDownloading || isModelDownloadingError(message)) {
        await waitForModelDownload(
          runStream,
          dispatch,
          getState,
          selectedModel?.title,
        );
        return;
      }

      const shouldRetry =
        isOverloadedErrorMessage(message) && attempt < OVERLOADED_RETRIES;

      if (shouldRetry) {
        await dispatch(cancelStream());
        const delayMs = OVERLOADED_DELAY_MS * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        await dispatch(cancelStream());
      } else {
        await dispatch(cancelStream());
        dispatch(setDialogMessage(<StreamErrorDialog error={e} />));
        dispatch(setShowDialog(true));

        return;
      }
    }
  }
});

/**
 * Wait for a model that the backend is currently downloading, retrying
 * `runStream` indefinitely (with capped backoff) until it succeeds or the
 * user cancels. Shows a status dialog during the wait.
 */
async function waitForModelDownload(
  runStream: () => Promise<void>,
  dispatch: AppDispatch,
  getState: () => RootState,
  modelName?: string,
): Promise<void> {
  const aborter = new AbortController();
  setActiveModelDownloadAborter(aborter);

  let attempt = 0;
  while (!aborter.signal.aborted) {
    attempt++;
    const delayMs = Math.min(
      MODEL_DOWNLOAD_BASE_DELAY_MS * 2 ** (attempt - 1),
      MODEL_DOWNLOAD_MAX_DELAY_MS,
    );

    // Show/refresh a status message so the user knows we're waiting.
    dispatch(
      setDialogMessage(
        <ModelDownloadStatus
          modelName={modelName}
          attempt={attempt}
          delayMs={delayMs}
        />,
      ),
    );
    dispatch(setShowDialog(true));

    // Wait for the next retry, aborting early if the user cancels.
    const slept = await sleepAbortable(delayMs, aborter.signal);
    if (aborter.signal.aborted || !slept) {
      break;
    }

    dispatch(cancelStream());

    try {
      await runStream();
      // Stream succeeded — clean up the status and finish.
      dispatch(setShowDialog(false));
      dispatch(setDialogMessage(undefined));
      setActiveModelDownloadAborter(undefined);
      const state = getState();
      if (!state.session.isInEdit) {
        await dispatch(
          saveCurrentSession({
            openNewSession: false,
            generateTitle: true,
          }),
        );
      }
      return;
    } catch (e) {
      if (isCancelError(e) || aborter.signal.aborted) {
        break;
      }
      if (!isModelDownloadingError((e as any)?.message)) {
        // The error changed / is no longer a download-in-progress error.
        // Fall through to the normal error dialog.
        dispatch(setShowDialog(false));
        dispatch(setDialogMessage(undefined));
        dispatch(setDialogMessage(<StreamErrorDialog error={e} />));
        dispatch(setShowDialog(true));
        setActiveModelDownloadAborter(undefined);
        return;
      }
      // Otherwise keep waiting (loop continues).
    }
  }

  dispatch(setShowDialog(false));
  dispatch(setDialogMessage(undefined));
  setActiveModelDownloadAborter(undefined);
}

/**
 * Promise version of setTimeout that resolves early when the given signal is
 * aborted. Returns false if it was aborted before the delay elapsed.
 */
function sleepAbortable(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
