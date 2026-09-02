import { Tool, ToolCallState } from "core";
import { renderChatMessage } from "core/util/messageContent";
import { useContext, useMemo, useState } from "react";
import InlineEdit from "../../../components/StepContainer/InlineEdit";
import { openContextItem } from "../../../components/mainInput/belowMainInput/ContextItemsPeek";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { updateHistoryItemAtIndex } from "../../../redux/slices/sessionSlice";
import { saveCurrentSession } from "../../../redux/thunks/session";
import { ToolCallStatusMessage } from "./ToolCallStatusMessage";
import { ToolEditMessageIcon } from "./ToolEditMessageIcon";
import { ToolTruncateHistoryIcon } from "./ToolTruncateHistoryIcon";
import { toolCallStateToContextItems } from "./utils";

interface ToolCallDisplayProps {
  children: React.ReactNode;
  icon: React.ReactNode;
  tool: Tool | undefined;
  toolCallState: ToolCallState;
  historyIndex: number;
}

export function ToolCallDisplay({
  tool,
  toolCallState,
  children,
  icon,
  historyIndex,
}: ToolCallDisplayProps) {
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();
  const historyItem = useAppSelector(
    (state) => state.session.history[historyIndex],
  );
  const [editing, setEditing] = useState(false);
  const shownContextItems = useMemo(() => {
    const contextItems = toolCallStateToContextItems(toolCallState);
    return contextItems.filter((item) => !item.hidden);
  }, [toolCallState]);

  const isClickable = shownContextItems.length > 0;

  function handleClick() {
    if (shownContextItems.length > 0) {
      openContextItem(shownContextItems[0], ideMessenger);
    }
  }
  return (
    <div className="flex flex-col justify-center px-4">
      <div className="mb-2 flex flex-col">
        <div className="flex flex-row items-start justify-between gap-1.5">
          <div
            className={`flex min-w-0 flex-row items-center gap-2 transition-colors duration-200 ease-in-out ${
              isClickable ? "cursor-pointer hover:brightness-125" : ""
            }`}
            onClick={isClickable ? handleClick : undefined}
          >
            <div className="mt-[1px] h-4 w-4 flex-shrink-0 font-semibold">
              {icon}
            </div>
            {tool?.faviconUrl && (
              <img src={tool.faviconUrl} className="h-4 w-4 rounded-sm" />
            )}
            <ToolCallStatusMessage tool={tool} toolCallState={toolCallState} />
          </div>
          {!!toolCallState.output?.length && (
            <ToolTruncateHistoryIcon historyIndex={historyIndex} />
          )}
          {historyItem?.message.role === "assistant" && (
            <ToolEditMessageIcon onClick={() => setEditing(true)} />
          )}
        </div>
      </div>

      {editing && historyItem?.message.role === "assistant" && (
        <InlineEdit
          initialText={renderChatMessage(historyItem.message)}
          onCancel={() => setEditing(false)}
          onSave={(newText) => {
            dispatch(
              updateHistoryItemAtIndex({
                index: historyIndex,
                updates: {
                  message: {
                    ...historyItem.message,
                    content: newText,
                  } as any,
                },
              }),
            );
            dispatch(
              saveCurrentSession({
                openNewSession: false,
                generateTitle: false,
              }),
            );
            setEditing(false);
          }}
        />
      )}
      <div>{children}</div>
    </div>
  );
}
