import { PencilIcon } from "@heroicons/react/24/outline";
import { ChatHistoryItem } from "core";
import { renderChatMessage, stripImages } from "core/util/messageContent";
import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { selectUIConfig } from "../../redux/slices/configSlice";
import {
    deleteMessage,
    updateHistoryItemAtIndex,
} from "../../redux/slices/sessionSlice";
import { saveCurrentSession } from "../../redux/thunks/session";
import HeaderButtonWithToolTip from "../gui/HeaderButtonWithToolTip";
import ThinkingBlockPeek from "../mainInput/belowMainInput/ThinkingBlockPeek";
import StyledMarkdownPreview from "../StyledMarkdownPreview";
import ConversationSummary from "./ConversationSummary";
import InlineEdit from "./InlineEdit";
import ResponseActions from "./ResponseActions";
import ThinkingIndicator from "./ThinkingIndicator";

interface StepContainerProps {
  item: ChatHistoryItem;
  index: number;
  isLast: boolean;
  latestSummaryIndex?: number;
}

export default function StepContainer(props: StepContainerProps) {
  const dispatch = useAppDispatch();
  const [isTruncated, setIsTruncated] = useState(false);
  const [editing, setEditing] = useState<"content" | "reasoning" | null>(null);
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const uiConfig = useAppSelector(selectUIConfig);

  // Calculate dimming and indicator state based on latest summary index
  const latestSummaryIndex = props.latestSummaryIndex ?? -1;
  const isBeforeLatestSummary =
    latestSummaryIndex !== -1 && props.index <= latestSummaryIndex;
  const isLatestSummary =
    latestSummaryIndex !== -1 && props.index === latestSummaryIndex;

  const historyItemAfterThis = useAppSelector(
    (state) => state.session.history[props.index + 1],
  );
  const showResponseActions =
    (props.isLast || historyItemAfterThis?.message.role === "user") &&
    !(props.isLast && (isStreaming || props.item.toolCallStates));

  useEffect(() => {
    if (!isStreaming) {
      const content = renderChatMessage(props.item.message).trim();
      const endingPunctuation = [".", "?", "!", "```", ":"];

      // If not ending in punctuation or emoji, we assume the response got truncated
      if (
        content.trim() !== "" &&
        !(
          endingPunctuation.some((p) => content.endsWith(p)) ||
          /\p{Emoji}/u.test(content.slice(-2))
        )
      ) {
        setIsTruncated(true);
      } else {
        setIsTruncated(false);
      }
    }
  }, [props.item.message.content, isStreaming]);

  function onDelete() {
    dispatch(deleteMessage(props.index));
  }

  function onContinueGeneration() {
    window.postMessage(
      {
        messageType: "userInput",
        data: {
          input: "Continue your response exactly where you left off:",
        },
      },
      "*",
    );
  }

  function commitEdit(kind: "content" | "reasoning", newText: string) {
    const { message } = props.item;
    if (kind === "content") {
      dispatch(
        updateHistoryItemAtIndex({
          index: props.index,
          updates: { message: { ...message, content: newText } as any },
        }),
      );
    } else {
      dispatch(
        updateHistoryItemAtIndex({
          index: props.index,
          updates: {
            reasoning: {
              ...(props.item.reasoning ?? {}),
              text: newText,
            } as any,
          },
        }),
      );
    }
    dispatch(saveCurrentSession({ openNewSession: false, generateTitle: false }));
    setEditing(null);
  }

  const editLabel = (kind: "content" | "reasoning") =>
    kind === "content" ? "Edit message" : "Edit thought";

  return (
    <div>
      <div
        className={`bg-background p-1 px-1.5 ${isBeforeLatestSummary ? "opacity-35" : ""}`}
      >
        {uiConfig?.displayRawMarkdown ? (
          editing === "content" ? (
            <InlineEdit
              initialText={renderChatMessage(props.item.message)}
              onSave={(t) => commitEdit("content", t)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <>
              <div className="absolute right-2 top-1">
                <HeaderButtonWithToolTip
                  text={editLabel("content")}
                  tabIndex={-1}
                  onClick={() => setEditing("content")}
                >
                  <PencilIcon className="text-description-muted h-3.5 w-3.5" />
                </HeaderButtonWithToolTip>
              </div>
              <pre className="text-2xs max-w-full overflow-x-auto whitespace-pre-wrap break-words p-4">
                {renderChatMessage(props.item.message)}
              </pre>
            </>
          )
        ) : (
          <>
            {props.item.reasoning?.text?.trim() && (
              <div
                className="relative mx-1 mb-2 mt-1 border-t border-solid pb-1 pt-2"
                style={{ borderColor: "var(--vscode-panel-border)" }}
              >
                {editing === "reasoning" ? (
                  <InlineEdit
                    initialText={props.item.reasoning.text}
                    onSave={(t) => commitEdit("reasoning", t)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <ThinkingBlockPeek
                      content={props.item.reasoning.text}
                      index={props.index}
                      prevItem={props.index > 0 ? props.item : null}
                      inProgress={!props.item.reasoning?.endAt}
                    />
                    <div className="absolute right-2 top-0">
                      <HeaderButtonWithToolTip
                        text={editLabel("reasoning")}
                        tabIndex={-1}
                        onClick={() => setEditing("reasoning")}
                      >
                        <PencilIcon className="text-description-muted h-3.5 w-3.5" />
                      </HeaderButtonWithToolTip>
                    </div>
                  </>
                )}
              </div>
            )}

            {editing === "content" ? (
              <InlineEdit
                initialText={renderChatMessage(props.item.message)}
                onSave={(t) => commitEdit("content", t)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="relative">
                <div className="absolute right-2 top-1 z-10">
                  <HeaderButtonWithToolTip
                    text={editLabel("content")}
                    tabIndex={-1}
                    onClick={() => setEditing("content")}
                  >
                    <PencilIcon className="text-description-muted h-3.5 w-3.5" />
                  </HeaderButtonWithToolTip>
                </div>
                <StyledMarkdownPreview
                  isRenderingInStepContainer
                  source={stripImages(props.item.message.content)}
                  itemIndex={props.index}
                />
              </div>
            )}
          </>
        )}
        {props.isLast && <ThinkingIndicator historyItem={props.item} />}
      </div>

      {showResponseActions && (
        <div
          className={`mt-2 h-7 transition-opacity duration-300 ease-in-out ${isBeforeLatestSummary || isStreaming ? "opacity-35" : ""} ${isStreaming && "pointer-events-none cursor-not-allowed"}`}
        >
          <ResponseActions
            isTruncated={isTruncated}
            onDelete={onDelete}
            onContinueGeneration={onContinueGeneration}
            index={props.index}
            item={props.item}
            isLast={props.isLast}
          />
        </div>
      )}

      {/* Show compaction indicator for the latest summary */}
      {isLatestSummary && (
        <div className="mx-1.5 my-5">
          <div className="flex items-center">
            <div className="border-border flex-1 border-t border-solid"></div>
            <span className="text-description mx-3 text-xs">
              Previous Conversation Compacted
            </span>
            <div className="border-border flex-1 border-t border-solid"></div>
          </div>
        </div>
      )}

      {/* ConversationSummary is outside the dimmed container so it's always at full opacity */}
      <ConversationSummary item={props.item} index={props.index} />
    </div>
  );
}
