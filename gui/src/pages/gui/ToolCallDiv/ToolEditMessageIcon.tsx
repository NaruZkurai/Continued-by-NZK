// Pencil "Edit" button shown next to the trim button on tool-call rows.
// Lets you TEXT-EDIT the assistant message at the given history index, so you
// can manually shorten/rewrite conversation history to optimise prompt length.
import { PencilIcon } from "@heroicons/react/24/outline";
import { ToolbarButtonWithTooltip } from "../../../components/StyledMarkdownPreview/StepContainerPreToolbar/ToolbarButtonWithTooltip";

interface ToolEditMessageIconProps {
  onClick: () => void;
}

export function ToolEditMessageIcon({ onClick }: ToolEditMessageIconProps) {
  return (
    <ToolbarButtonWithTooltip
      tooltipContent="Edit this message text"
      onClick={onClick}
    >
      <PencilIcon className="h-3 w-3 flex-shrink-0 opacity-60 hover:brightness-125" />
    </ToolbarButtonWithTooltip>
  );
}
