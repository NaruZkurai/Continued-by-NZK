import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAppDispatch } from "../redux/hooks";
import { setDialogMessage, setShowDialog } from "../redux/slices/uiSlice";
import { cancelStream } from "../redux/thunks/cancelStream";
import { cancelActiveModelDownload } from "../util/modelDownloadCancel";

export function ModelDownloadStatus({
  modelName,
  attempt,
  delayMs,
}: {
  modelName?: string;
  attempt: number;
  delayMs: number;
}) {
  const dispatch = useAppDispatch();

  const handleCancel = () => {
    // Abort the active wait loop so it stops retrying.
    cancelActiveModelDownload();
    // Cancel the current/next stream attempt for a clean teardown.
    dispatch(cancelStream());
    dispatch(setShowDialog(false));
    dispatch(setDialogMessage(undefined));
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <ArrowPathIcon className="h-4 w-4 animate-spin text-gray-500" />
        <h3 className="m-0 p-0 text-base font-medium">
          Waiting for model download…
        </h3>
      </div>

      {modelName ? (
        <p className="m-0 text-sm text-gray-600">
          The model <code>{modelName}</code> is still downloading on the
          server. It will be used as soon as it is ready.
        </p>
      ) : (
        <p className="m-0 text-sm text-gray-600">
          The model is still downloading on the server. It will be used as
          soon as it is ready.
        </p>
      )}

      <p className="m-0 text-xs text-gray-400">
        Retry attempt {attempt} in {(delayMs / 1000).toFixed(0)}s…
      </p>

      <button
        onClick={handleCancel}
        className="mt-1 flex w-fit cursor-pointer items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
        type="button"
      >
        <XMarkIcon className="h-3 w-3" />
        Stop waiting
      </button>
    </div>
  );
}
