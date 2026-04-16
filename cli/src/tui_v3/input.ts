const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SGR_MOUSE_PACKET_PATTERN = /^(?:<?\d+;\d+;\d+[mM])+$/;
const SGR_MOUSE_PACKET_GLOBAL_PATTERN = /\x1b\[<(\d+);\d+;\d+[mM]/g;
const X10_MOUSE_PACKET_GLOBAL_PATTERN = /\x1b\[M([\x20-\xff])[\x20-\xff][\x20-\xff]/g;

export type TerminalMouseAction = "scroll-up" | "scroll-down" | "mouse";

function parseMouseButtonCode(code: number): TerminalMouseAction {
  if (code === 64) {
    return "scroll-up";
  }

  if (code === 65) {
    return "scroll-down";
  }

  return "mouse";
}

export function parseTerminalMouseActions(payload: string): TerminalMouseAction[] {
  const actions: TerminalMouseAction[] = [];

  for (const match of payload.matchAll(SGR_MOUSE_PACKET_GLOBAL_PATTERN)) {
    const buttonCode = Number.parseInt(match[1] ?? "", 10);
    actions.push(parseMouseButtonCode(buttonCode));
  }

  for (const match of payload.matchAll(X10_MOUSE_PACKET_GLOBAL_PATTERN)) {
    const encodedButton = match[1]?.charCodeAt(0);
    if (typeof encodedButton === "number") {
      actions.push(parseMouseButtonCode(encodedButton - 32));
    }
  }

  return actions;
}

export function sanitizeComposerInput(input: string): string {
  if (!input) {
    return "";
  }

  if (SGR_MOUSE_PACKET_PATTERN.test(input)) {
    return "";
  }

  if (CONTROL_CHARACTER_PATTERN.test(input)) {
    return "";
  }

  return input;
}
