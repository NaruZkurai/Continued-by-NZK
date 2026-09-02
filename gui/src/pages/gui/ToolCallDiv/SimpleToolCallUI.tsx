import { Tool, ToolCallState } from "core";
import { renderChatMessage } from "core/util/messageContent";
import { ComponentType, useContext, useMemo, useState } from "react";
import InlineEdit from "../../../components/StepContainer/InlineEdit";
import {
    ContextItemsPeekItem,
    openContextItem,
} from "../../../components/mainInput/belowMainInput/ContextItemsPeek";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { updateHistoryItemAtIndex } from "../../../redux/slices/sessionSlice";
import { saveCurrentSession } from "../../../redux/thunks/session";
import { ToggleWithIcon } from "./ToggleWithIcon";
import { ToolCallStatusMessage } from "./ToolCallStatusMessage";
import { ToolEditMessageIcon } from "./ToolEditMessageIcon";
import { ToolTruncateHistoryIcon } from "./ToolTruncateHistoryIcon";
import { toolCallStateToContextItems } from "./utils";

interface SimpleToolCallUIProps {
  toolCallState: ToolCallState;
  tool: Tool | undefined;
  icon?: ComponentType<React.SVGProps<SVGSVGElement>>;
  historyIndex: number;
}

export function SimpleToolCallUI({
  icon: Icon,
  toolCallState,
  tool,
  historyIndex,
}: SimpleToolCallUIProps) {
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

  const [open, setOpen] = useState(false);

  const isToggleable = shownContextItems.length > 1;
  const isSingleItem = shownContextItems.length === 1;
  const shouldShowContent = isToggleable ? open : false;
  const isClickable = isToggleable || isSingleItem;

  function handleClick() {
    if (isToggleable) {
      setOpen((prev) => !prev);
    } else if (isSingleItem) {
      openContextItem(shownContextItems[0], ideMessenger);
    }
  }

  return (
    <div className="mt-1 flex flex-col px-4">
      <div className="flex min-w-0 flex-row items-center justify-between gap-2">
        <div
          className={`text-description flex min-w-0 flex-row items-center justify-between gap-1.5 text-xs transition-colors duration-200 ease-in-out ${
            isClickable ? "cursor-pointer hover:brightness-125" : ""
          }`}
          onClick={isClickable ? handleClick : undefined}
          data-testid="context-items-peek"
        >
          <ToggleWithIcon
            icon={Icon}
            isToggleable={isToggleable}
            open={shouldShowContent}
            isClickable={isSingleItem}
          />
          <ToolCallStatusMessage tool={tool} toolCallState={toolCallState} />
        </div>

        <div className="flex flex-row items-center gap-1">
          {historyItem?.message.role === "assistant" && (
            <ToolEditMessageIcon onClick={() => setEditing(true)} />
          )}
          {!!toolCallState.output?.length && (
            <ToolTruncateHistoryIcon historyIndex={historyIndex} />
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

      {isToggleable && (
        <div
          className={`mt-2 overflow-y-auto transition-all duration-300 ease-in-out ${
            shouldShowContent ? "max-h-[50vh] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {shownContextItems.length > 0 ? (
            shownContextItems.map((contextItem, idx) => (
              <ContextItemsPeekItem key={idx} contextItem={contextItem} />
            ))
          ) : (
            <div className="text-description pl-5 text-xs italic">
              No tool call output
            </div>
          )}
        </div>
      )}
    </div>
  );
}
