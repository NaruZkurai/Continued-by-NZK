import { Tool, ToolCallDelta, ToolCallState } from "../..";
import { generateNaruZkurAIToolCallId } from "./systemToolUtils";

export interface SystemMessageToolsFramework {
  acceptedToolCallStarts: [string, string][];

  toolCallStateToSystemToolCall(state: ToolCallState): string;

  handleToolCallBuffer(
    chunk: string,
    state: ToolCallParseState,
  ): ToolCallDelta | undefined;

  toolToSystemToolDefinition: (tool: Tool) => string;

  systemMessagePrefix: string;

  systemMessageSuffix: string;

  exampleDynamicToolDefinition: string;

  exampleDynamicToolCall: string;

  createSystemMessageExampleCall(
    toolName: string,
    prefix: string,
    exampleArgs?: Array<[string, string | number]>,
  ): string;
}

export type ToolCallParseState = {
  toolCallId: string;
  isWithinArgStart: boolean;
  currentArgName: string | undefined;
  currentArgChunks: string[];
  processedArgNames: Set<string>;
  currentLineIndex: number;
  lineChunks: string[][];
  done: boolean;
};

export const getInitialToolCallParseState = (): ToolCallParseState => ({
  toolCallId: generateNaruZkurAIToolCallId(),
  isWithinArgStart: false,
  currentArgName: undefined,
  currentArgChunks: [],
  currentLineIndex: 0,
  processedArgNames: new Set(),
  lineChunks: [],
  done: false,
});
