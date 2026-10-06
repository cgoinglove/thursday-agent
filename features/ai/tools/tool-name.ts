/**
 * Every tool name the model sees. Tools and prompts both import from here so
 * the two cannot drift. Pinned MCP tool names (`<server>__<tool>`) come from
 * the servers at run time and are not listed.
 */
export const TOOL_NAMES = {
  memory_recall: "memory_recall",
  memory_create: "memory_create",
  memory_remember: "memory_remember",
  memory_describe: "memory_describe",
  memory_forget: "memory_forget",

  bash: "bash",
  write_file: "write_file",

  tool_search: "tool_search",
  tool_call: "tool_call",

  load_skill: "load_skill",

  web_search: "web_search",

  thread_start: "thread_start",
  thread_tell: "thread_tell",
  thread_answer: "thread_answer",
  thread_status: "thread_status",
  thread_cancel: "thread_cancel",
  thread_show: "thread_show",
  thread_seen: "thread_seen",
  routine: "routine",
  routine_watch: "routine_watch",
  send_message: "send_message",
  thread_recall: "thread_recall",

  sign_in_use: "sign_in_use",
  sign_in_keep: "sign_in_keep",

  check_mail: "check_mail",

  look_at: "look_at",

  make_deck: "make_deck",

  describe_self: "describe_self",

  end_call: "end_call",
  emote: "emote",
} as const;

/**
 * Tools on the app's built-in studio server (config STUDIO_SERVER). Reached
 * through `tool_search` / `tool_call` like any connected server's tools.
 */
export const STUDIO_TOOLS = {
  generate_image: "generate_image",
  generate_speech: "generate_speech",
  transcribe: "transcribe",
  generate_video: "generate_video",
} as const;
