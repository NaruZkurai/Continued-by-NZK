import { BuiltInToolNames } from "core/tools/builtIn";
import { useContext } from "react";
import { IdeMessengerContext } from "../../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../../redux/hooks";
import { selectPendingToolCalls } from "../../../../redux/selectors/selectToolCalls";
import { callToolById } from "../../../../redux/thunks/callToolById";
import { cancelToolCallThunk } from "../../../../redux/thunks/cancelToolCall";
import { getAltKeyLabel, getMetaKeyLabel, isJetBrains } from "../../../../util";
import { Button } from "../../../ui";
import { useMainEditor } from "../../TipTapEditor";

export const generateToolCallButtonTestId = (
  action: "accept" | "reject" | "allow-remember",
  toolCallId: string,
) => {
  return `${action}-tool-call-button-${toolCallId}`;
};

export function PendingToolCallToolbar() {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const jetbrains = isJetBrains();
  const pendingToolCalls = useAppSelector(selectPendingToolCalls);
  const editor = useMainEditor();
  const experimental = useAppSelector(
    (state) => state.config.config.experimental,
  );
  const yoloRestricted = experimental?.yoloRestricted ?? false;

  if (pendingToolCalls.length === 0) {
    return null;
  }

  const handleAccept = (toolCallId: string) => {
    void dispatch(callToolById({ toolCallId }));
  };

  const handleReject = (toolCallId: string) => {
    // put cursor in editor after last rejection
    if (pendingToolCalls.length === 1) {
      editor.mainEditor?.commands.focus();
    }
    void dispatch(cancelToolCallThunk({ toolCallId }));
  };

  // Accept the command AND persist it to the yolo allowlist so it no longer
  // prompts in the future. Only shown for terminal commands in yolo-restricted mode.
  const handleAllowAndRemember = (toolCall: (typeof pendingToolCalls)[number]) => {
    const command = toolCall.parsedArgs?.command as string | undefined;
    void dispatch(callToolById({ toolCallId: toolCall.toolCallId }));
    if (!command) {
      return;
    }
    const current = experimental?.yoloAllowList ?? [];
    if (current.includes(command)) {
      return; // already allowed
    }
    ideMessenger.post("config/updateSharedConfig", {
      yoloAllowList: [...current, command],
    });
  };

  const isTerminalCommand = (toolCall: (typeof pendingToolCalls)[number]) =>
    toolCall.toolCall.function.name === BuiltInToolNames.RunTerminalCommand;

  return (
    <div className="flex w-full flex-col pb-0.5">
      {pendingToolCalls.map((toolCall, index) => (
        <div
          key={toolCall.toolCallId}
          className="border-input bg-input flex items-center gap-2 rounded border"
        >
          <span className="text-description flex-1 truncate text-xs italic">
            {toolCall.tool?.displayTitle ?? toolCall.toolCall.function.name}
          </span>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-description-muted my-1 font-medium"
              onClick={() => handleReject(toolCall.toolCallId)}
              data-testid={generateToolCallButtonTestId(
                "reject",
                toolCall.toolCallId,
              )}
            >
              {/* JetBrains overrides cmd+backspace, so we have to use another shortcut */}
              {index === 0 && (
                <span className="text-2xs mr-1">
                  {jetbrains ? getAltKeyLabel() : getMetaKeyLabel()}⌫
                </span>
              )}
              <span>Reject</span>
            </Button>

            {yoloRestricted && isTerminalCommand(toolCall) && (
              <Button
                variant="ghost"
                size="sm"
                className="my-1 font-medium"
                onClick={() => handleAllowAndRemember(toolCall)}
                data-testid={generateToolCallButtonTestId(
                  "allow-remember",
                  toolCall.toolCallId,
                )}
                title="Accept and add this command to the yolo allow list so it won't ask again"
              >
                <span>Allow + remember</span>
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              className="my-1 font-medium"
              onClick={() => handleAccept(toolCall.toolCallId)}
              data-testid={generateToolCallButtonTestId(
                "accept",
                toolCall.toolCallId,
              )}
            >
              {index === 0 && (
                <span className="text-2xs mr-1">{getMetaKeyLabel()}⏎</span>
              )}
              <span>Accept</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
