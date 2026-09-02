// Reusable inline editor used by per-message Edit buttons (agent replies and
// thinking bubbles). Swaps the rendered block for an editable textarea and
// calls onSave with the new text (or onCancel to discard).
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import HeaderButtonWithToolTip from "../gui/HeaderButtonWithToolTip";

interface InlineEditProps {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export default function InlineEdit({
  initialText,
  onSave,
  onCancel,
}: InlineEditProps) {
  const [text, setText] = useState(initialText);

  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full resize-y rounded-md border border-solid border-[color:var(--vscode-panel-border)] bg-[color:var(--vscode-editor-background)] p-2 text-sm text-[color:var(--vscode-editor-foreground)]"
      />
      <div className="flex justify-end gap-1">
        <HeaderButtonWithToolTip
          text="Save"
          onClick={() => onSave(text)}
          testId="inline-edit-save"
        >
          <CheckIcon className="text-success h-4 w-4" />
        </HeaderButtonWithToolTip>
        <HeaderButtonWithToolTip
          text="Cancel"
          onClick={onCancel}
          testId="inline-edit-cancel"
        >
          <XMarkIcon className="text-description-muted h-4 w-4" />
        </HeaderButtonWithToolTip>
      </div>
    </div>
  );
}
