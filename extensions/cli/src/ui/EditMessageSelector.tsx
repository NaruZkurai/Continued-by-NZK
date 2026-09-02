import { Box, Text, useInput } from "ink";
import React, { useMemo, useState } from "react";

import type { ChatHistoryItem } from "../../../../core/index.js";

import { defaultBoxStyles } from "./styles.js";
import { TextBuffer } from "./TextBuffer.js";

// Infer the Key type from useInput's callback parameters
type UseInputHandler = Parameters<typeof useInput>[0];
type Key = Parameters<UseInputHandler>[1];

/** Re-create a rewind point at the given message (rewind + continue). */
interface EditMessageSelectorProps
{ chatHistory: ChatHistoryItem[];
  onEdit: (messageIndex: number, newContent: string) => void;
  onRewind?: (messageIndex: number) => void;
  onExit: () => void; }

/** Roles the selector lets you act on (edit / rewind). */
const EDITABLE_ROLES = new Set(["user", "assistant", "thinking"]);

function roleLabel(role: string): string {
  if (role === "assistant") return "Agent";
  if (role === "thinking") return "Thinking";
  return "User";
}

/** Flatten string or MessagePart[] content into a plain string for preview/edit. */
function contentToString(content: any): string {
  if (typeof content === "string") { return content; }
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (part?.type === "text") return part.text ?? "";
        // Thinking parts carry the reasoning text (e.g. automode notices).
        if (part?.type === "thinking") return part.thinking ?? part.text ?? "";
        if (part?.type === "imageUrl") return "[Image]";
        return "";
      })
      .join("");
  }
  // Some thinking messages put prose under `.thinking` even when scalar.
  if (content && typeof content === "object" && typeof content.thinking === "string")
    { return content.thinking; }
  return "";
}

  /* Editable messages: user (prompt) and assistant (agent) turns. Thinking */
  /* system / tool blocks carry no editable prose, so they are skipped. */
export function EditMessageSelector({ chatHistory, onEdit, onRewind, onExit,
  }: EditMessageSelectorProps) { const messages = useMemo(() => {
    return chatHistory.map((item, originalIndex) => ({ item, originalIndex }))
      .filter(({ item }) => EDITABLE_ROLES.has(item.message.role)); }, [chatHistory]);

  const [selectedIndex, setSelectedIndex] = useState( Math.max(0, messages.length - 1), );
  const [isEditing, setIsEditing] = useState(false);
  const [textBuffer] = useState(() => new TextBuffer());
  const [editText, setEditText] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);

  // Stable callback for TextBuffer state changes (e.g., paste finalization)
  const onStateChange = React.useCallback(() => { setEditText(textBuffer.text); setCursorPosition(textBuffer.cursor); }, [textBuffer]);

  // Set up callback for when TextBuffer state changes asynchronously
  React.useEffect(() => {
    textBuffer.setStateChangeCallback(onStateChange);

    return () => {
      // Clear any pending timers on unmount
      textBuffer.clear();
    };
  }, [textBuffer, onStateChange]);

  // Initialize edit text when selection changes
  React.useEffect(() => {
    if (!isEditing && messages[selectedIndex]) {
      const content = contentToString(
        messages[selectedIndex].item.message.content,
      );
      textBuffer.setText(content);
      setEditText(content);
      setCursorPosition(content.length);
    }
  }, [selectedIndex, isEditing, messages, textBuffer]);

  // Helper to get message content safely
  const getMessageContent = React.useCallback(
    (index: number): string => {
      return contentToString(messages[index]?.item.message.content);
    },
    [messages],
  );

  // Handle input when in editing mode
  const handleEditModeInput = React.useCallback(
    (input: string, key: Key) => {
      if (key.escape) {
        setIsEditing(false);
        // Reset text to original
        const content = getMessageContent(selectedIndex);
        textBuffer.setText(content);
        setEditText(content);
        setCursorPosition(content.length);
      } else if (key.return && !key.shift) {
        // Submit the edit
        // Expand all paste blocks before submission to restore original content
        textBuffer.expandAllPasteBlocks();
        const trimmedText = textBuffer.text.trim();
        if (trimmedText && messages[selectedIndex]) {
          onEdit(messages[selectedIndex].originalIndex, trimmedText);
        }
      } else if (key.return && key.shift) {
        // Handle newline
        textBuffer.handleInput("\n", key);
        setEditText(textBuffer.text);
        setCursorPosition(textBuffer.cursor);
      } else {
        // Let TextBuffer handle the input
        textBuffer.handleInput(input, key);
        setEditText(textBuffer.text);
        setCursorPosition(textBuffer.cursor);
      }
    },
    [
      getMessageContent,
      selectedIndex,
      textBuffer,
      messages,
      onEdit,
      setIsEditing,
      setEditText,
      setCursorPosition,
    ],
  );

  // Handle input when in navigation mode
  const handleNavigationInput = React.useCallback(
    (input: string, key: Key) => {
      if (key.upArrow || input === "k") {
        // Only navigate if there are messages
        if (messages.length > 0) {
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : messages.length - 1,
          );
        }
      } else if (key.downArrow || input === "j") {
        // Only navigate if there are messages
        if (messages.length > 0) {
          setSelectedIndex((prev) =>
            prev < messages.length - 1 ? prev + 1 : 0,
          );
        }
      } else if (input === "c" && onRewind && messages[selectedIndex]) {
        /* Create a rewind point at the selected message: rewind the history */
        /* there and continue, as if the user just asked to keep going. */
        onRewind(messages[selectedIndex].originalIndex);
      } else if (key.return) {
        /*  Start editing the selected message - set cursor to end */
        /*  Only allow editing if there are messages  */
        if (messages.length > 0) {
          const content = getMessageContent(selectedIndex);
          textBuffer.setCursor(content.length);
          setCursorPosition(content.length);
          setIsEditing(true);
        }
      } else if (key.escape || (key.ctrl && input === "d")) {
        onExit();
      }
    },
    [
      messages,
      getMessageContent,
      selectedIndex,
      textBuffer,
      onExit,
      onRewind,
      setSelectedIndex,
      setCursorPosition,
      setIsEditing,
    ],
  );

  useInput((input, key) => {
    if (isEditing) {
      handleEditModeInput(input, key);
    } else {
      handleNavigationInput(input, key);
    }
  });

  if (messages.length === 0) {
    return (
      <Box {...defaultBoxStyles("yellow")}>
        <Text color="yellow">No editable messages.</Text>
        <Text color="gray">Press Esc to exit</Text>
      </Box>
    );
  }

  const renderEditText = () => {
    if (editText.length === 0) {
      return (
        <Text italic color="gray">
          ▋(empty message)
        </Text>
      );
    }

    // Handle multi-line text with cursor
    const lines = editText.split("\n");
    let charCount = 0;
    let cursorLine = 0;
    let cursorCol = 0;

    // Find which line and column the cursor is on
    for (let i = 0; i < lines.length; i++) {
      if (cursorPosition <= charCount + lines[i].length) {
        cursorLine = i;
        cursorCol = cursorPosition - charCount;
        break;
      }
      charCount += lines[i].length + 1; // +1 for the newline character
    }

    // Handle cursor at the very end
    if (cursorPosition >= editText.length) {
      cursorLine = lines.length - 1;
      cursorCol = lines[cursorLine].length;
    }

    return (
      <Box flexDirection="column">
        {lines.map((line, lineIndex) => {
          if (lineIndex === cursorLine) {
            // Line with cursor
            const beforeCursor = line.slice(0, cursorCol);
            const atCursor = line.slice(cursorCol, cursorCol + 1);
            const afterCursor = line.slice(cursorCol + 1);

            return (
              <Text key={lineIndex}>
                {beforeCursor}
                <Text inverse>{atCursor || " "}</Text>
                {afterCursor}
              </Text>
            );
          } else {
            // Regular line - ensure empty lines still render
            return <Text key={lineIndex}>{line || " "}</Text>;
          }
        })}
      </Box>
    );
  };

  return (
    <Box {...defaultBoxStyles("yellow")}>
      <Text color="yellow" bold>
        Edit / Rewind (User + Agent messages)
      </Text>
      <Text color="gray">
        {isEditing
          ? "Enter to submit, Esc to cancel, Shift+Enter for newline"
          : "↑/↓ to navigate, Enter to edit, c to rewind+continue, Esc to exit"}
      </Text>
      <Text> </Text>

      {!isEditing && (
        <>
          <Text color="blue">Select a message (Enter edit, c rewind):</Text>
          <Text> </Text>
          {messages.map((msg, index) => {
            const isSelected = index === selectedIndex;
            const indicator = isSelected ? "➤ " : "  ";
            const color = isSelected ? "yellow" : "white";
            const content = contentToString(msg.item.message.content);
            const preview = content.split("\n")[0].slice(0, 60);
            const truncated = content.length > 60 ? "..." : "";
            const tag = roleLabel(msg.item.message.role);

            return (
              <Box key={msg.originalIndex} flexDirection="column">
                <Text bold={isSelected} color={color}>
                  {indicator}[{tag}] Message {index + 1}: {preview}
                  {truncated}
                </Text>
              </Box>
            );
          })}
        </>
      )}

      {isEditing && (
        <>
          <Text color="blue">
            Editing Message {selectedIndex + 1} (will rewind to this point):
          </Text>
          <Text> </Text>
          <Box
            borderStyle="round"
            borderColor="yellow"
            paddingX={1}
            flexDirection="column"
          >
            {renderEditText()}
          </Box>
        </>
      )}
    </Box>
  );
}
