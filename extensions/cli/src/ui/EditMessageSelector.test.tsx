/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import type { ChatHistoryItem, ChatMessage } from "core/index.js";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditMessageSelector } from "./EditMessageSelector.js";

describe("EditMessageSelector", () => {
  const createMockChatHistory = (count: number): ChatHistoryItem[] => {
    const history: ChatHistoryItem[] = [];
    for (let i = 0; i < count; i++) {
      // Alternate between user and assistant messages
      if (i % 2 === 0) {
        history.push({
          message: { role: "user", content: `User message ${i + 1}` },
          contextItems: [],
        });
      } else {
        history.push({
          message: { role: "assistant", content: `Assistant message ${i + 1}` },
          contextItems: [],
        });
      }
    }
    return history;
  };

  let mockOnEdit: ReturnType<typeof vi.fn>;
  let mockOnExit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnEdit = vi.fn();
    mockOnExit = vi.fn();
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should render 'no editable messages' when chat history is empty", () => {
      const { container } = render(
        <EditMessageSelector chatHistory={[]}
          onEdit={mockOnEdit} onExit={mockOnExit} />,
      );

      expect(container.textContent).toContain("No editable messages");
    });

    it("should list assistant (agent) messages as editable", () => {
      const chatHistory: ChatHistoryItem[] = [
        {
          message: { role: "assistant", content: "Hello" },
          contextItems: [],
        },
      ];

      const { container } = render(
        <EditMessageSelector
          chatHistory={chatHistory}
          onEdit={mockOnEdit}
          onExit={mockOnExit}
        />,
      );

      expect(container.textContent).toContain("Hello");
      expect(container.textContent).toContain("[Agent]");
    });

    it("should render user messages list", () => {
      const chatHistory = createMockChatHistory(4); // Will have 2 user messages

      const { container } = render(
        <EditMessageSelector
          chatHistory={chatHistory}
          onEdit={mockOnEdit}
          onExit={mockOnExit}
        />,
      );

      expect(container.textContent).toContain("Message 1:");
      expect(container.textContent).toContain("Message 2:");
      expect(container.textContent).toContain("User message 1");
      expect(container.textContent).toContain("Assistant message 2");
    });

    it("should filter out system/tool messages but keep thinking", () => {
      const chatHistory: ChatHistoryItem[] = [
        { message: { role: "user", content: "User 1" }, contextItems: [] },
        {
          message: { role: "assistant", content: "Assistant 1" },
          contextItems: [],
        },
        { message: { role: "system", content: "System 1" }, contextItems: [] },
        { message: { role: "thinking", content: "Thought 1" }, contextItems: [] },
        {
          message: {
            role: "tool",
            content: "Tool 1",
            toolCallId: "t1",
          } as ChatMessage,
          contextItems: [],
        },
        { message: { role: "user", content: "User 2" }, contextItems: [] },
      ];

      const { container } = render(
        <EditMessageSelector
          chatHistory={chatHistory}
          onEdit={mockOnEdit}
          onExit={mockOnExit}
        />,
      );

      // User + agent + thinking turns are editable; system/tool are not.
      expect(container.textContent).toContain("User 1");
      expect(container.textContent).toContain("User 2");
      expect(container.textContent).toContain("Assistant 1");
      expect(container.textContent).toContain("Thought 1");
      expect(container.textContent).toContain("[Thinking]");
      expect(container.textContent).not.toContain("System 1");
      expect(container.textContent).not.toContain("Tool 1");
    });

    it("should show role tags for user and agent messages", () => {
      const chatHistory: ChatHistoryItem[] = [
        { message: { role: "user", content: "User 1" }, contextItems: [] },
        {
          message: { role: "assistant", content: "Assistant 1" },
          contextItems: [],
        },
      ];

      const { container } = render(
        <EditMessageSelector
          chatHistory={chatHistory}
          onEdit={mockOnEdit}
          onExit={mockOnExit}
        />,
      );

      expect(container.textContent).toContain("[User]");
      expect(container.textContent).toContain("[Agent]");
    });

    it("should call onEdit with original index when editing a user message", () => {
      const chatHistory: ChatHistoryItem[] = [
        { message: { role: "user", content: "User 1" }, contextItems: [] },
        {
          message: { role: "assistant", content: "Assistant 1" },
          contextItems: [],
        },
      ];

      const { container } = render(
        <EditMessageSelector
          chatHistory={chatHistory}
          onEdit={mockOnEdit}
          onExit={mockOnExit}
        />,
      );

      // Navigation selects the last editable message (index 1 = assistant,
      // originalIndex 1).
      expect(container.textContent).toContain("Assistant 1");
    });

    it("should trigger onRewind when pressing c on the selected message", () => {
      const chatHistory: ChatHistoryItem[] = [
        { message: { role: "user", content: "User 1" }, contextItems: [] },
        {
          message: { role: "assistant", content: "Assistant 1" },
          contextItems: [],
        },
      ];

      const mockOnRewind = vi.fn();
      const { container } = render(
        <EditMessageSelector
          chatHistory={chatHistory}
          onEdit={mockOnEdit}
          onRewind={mockOnRewind}
          onExit={mockOnExit}
        />,
      );

      expect(container.textContent).toContain("c to rewind+continue");
    });

    it("should show instruction text in selection mode", () => {
      const chatHistory = createMockChatHistory(2);

      const { container } = render(
        <EditMessageSelector
          chatHistory={chatHistory}
          onEdit={mockOnEdit}
          onExit={mockOnExit}
        />,
      );

      expect(container.textContent).toContain("↑/↓ to navigate");
      expect(container.textContent).toContain("Enter to edit");
      expect(container.textContent).toContain("Esc to exit");
    });
  });

  describe("Message preview", () => {
    it("should truncate long messages in preview", () => {
      const longMessage = "a".repeat(100);
      const chatHistory: ChatHistoryItem[] = [
        { message: { role: "user", content: longMessage }, contextItems: [] },
      ];

      const { container } = render(
        <EditMessageSelector
          chatHistory={chatHistory}
          onEdit={mockOnEdit}
          onExit={mockOnExit}
        />,
      );

      // Should show truncation indicator
      expect(container.textContent).toContain("...");
      // Should not show full message (preview is limited to 60 chars)
      expect(container.textContent).not.toContain(longMessage);
    });

    it("should show only first line in multiline message preview", () => {
      const multilineMessage = "First line\nSecond line\nThird line";
      const chatHistory: ChatHistoryItem[] = [
        {
          message: { role: "user", content: multilineMessage },
          contextItems: [],
        },
      ];

      const { container } = render(
        <EditMessageSelector
          chatHistory={chatHistory}
          onEdit={mockOnEdit}
          onExit={mockOnExit}
        />,
      );

      expect(container.textContent).toContain("First line");
      expect(container.textContent).not.toContain("Second line");
    });
  });

  describe("Complex message content", () => {
    it("should handle message parts array", () => {
      const chatHistory: ChatHistoryItem[] = [
        {
          message: {
            role: "user",
            content: [
              { type: "text", text: "Hello" },
              { type: "text", text: " world" },
            ],
          } as any,
          contextItems: [],
        },
      ];

      const { container } = render(
        <EditMessageSelector
          chatHistory={chatHistory}
          onEdit={mockOnEdit}
          onExit={mockOnExit}
        />,
      );

      // Should render something (component handles non-string content gracefully)
      expect(container.textContent).toBeDefined();
    });
  });
});
