import * as z from "zod";
import { BOT_RUN } from "@/config";

/** Providers and model catalogs. Nothing is stored here; a model is named by whatever runs on it. */

export const textModelProviderSchema = z.enum([
  "openai",
  "chatgpt",
  "anthropic",
  "google",
  "xai",
  "vercel-ai-gateway",
  "openrouter",
  "mistral",
  "deepseek",
  "groq",
  "cerebras",
  "togetherai",
  "fireworks",
  "deepinfra",
  "cohere",
]);

/** Provider and model name — everything a call needs. */
export const textModelRefSchema = z.object({
  provider: textModelProviderSchema,
  model: z.string().trim().min(1, "Model name is required").max(80),
});

export type TextModelProviderId = z.infer<typeof textModelProviderSchema>;
export type TextModelRef = z.infer<typeof textModelRefSchema>;

/**
 * The one ladder the app sets, weakest first: the sdk's own `reasoning` setting minus its
 * `provider-default`, which is what an unset value means here. Each provider translates these
 * into its own shape (`reasoning_effort`, a thinking budget, a thinking level), so nothing here
 * is provider-specific. `max` is missing on purpose: no sdk setting reaches it.
 */
export const EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
export const effortSchema = z.enum(EFFORTS);
export type Effort = z.infer<typeof effortSchema>;

/** Size of a suggested model, not quality. A label rather than a price because prices move. */
const MODEL_TIERS = ["small", "mid", "large"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** One model worth offering, as the picker reads it. */
export type SuggestModel = {
  id: string;
  label: string;
  tier: ModelTier;
  /**
   * Context window in tokens, from the gateway's catalog for the same model. Only a catalog
   * provider can be asked at run time (ai/model readCatalog), so a provider used directly
   * reads its window here instead of guessing. Null where the gateway does not carry the
   * model: the run falls back to `BOT_RUN.compactAt`.
   */
  context?: number | null;
  /**
   * The steps of the ladder this model answers to, written down because only a catalog provider
   * can be asked at run time. Read off the provider's own sdk — the table it checks a model against, the
   * map it translates a step through — never guessed: a step a provider passes straight to its
   * API fails the whole call, not just the setting. An empty list is "this model has no ladder";
   * left out is "nobody has checked", and both run on the model's own default (ai/model runEffort).
   */
  efforts?: readonly Effort[];
};

/**
 * The providers that list what they carry and answer without a key: one key reaches every
 * model on the list, so their model field is the list itself (model-browser), and a model's
 * window and effort steps are read off its row when a run starts (ai/model readCatalog).
 */
export const CATALOG_PROVIDERS = ["vercel-ai-gateway", "openrouter"] as const;
export type CatalogProviderId = (typeof CATALOG_PROVIDERS)[number];

export const isCatalogProvider = (
  provider: string | null | undefined,
): provider is CatalogProviderId =>
  CATALOG_PROVIDERS.includes(provider as CatalogProviderId);

/**
 * A model's context window where the app can know it: the catalog row for a catalog
 * provider's model, else the window stamped on a directly used provider's shelf
 * (`SuggestModel.context`). Null when neither says. Pure, so the settings screen and a
 * run (ai/model compactBudget) read the same number.
 */
export function contextWindowOf(
  provider: TextModelProviderId,
  model: string,
  catalog: readonly CatalogModel[] = [],
): number | null {
  if (isCatalogProvider(provider)) {
    return catalog.find((row) => row.id === model)?.contextWindow ?? null;
  }
  const shelf = TEXT_MODEL_PROVIDERS[provider].suggestModels;
  return shelf.find((row) => row.id === model)?.context ?? null;
}

/**
 * Which steps a model takes: the catalog's own answer for a catalog provider's model, else what
 * its shelf row says. Null means nobody knows, which is not the same as an empty list ("it has none") —
 * a run sets nothing in either case, but a screen says something different about them.
 */
export function effortsOf(
  provider: TextModelProviderId,
  model: string,
  catalog: readonly CatalogModel[] = [],
): readonly Effort[] | null {
  if (isCatalogProvider(provider)) {
    return catalog.find((row) => row.id === model)?.efforts ?? null;
  }
  const shelf = TEXT_MODEL_PROVIDERS[provider].suggestModels;
  return shelf.find((row) => row.id === model)?.efforts ?? null;
}

/**
 * Where a run on a model with this window summarises itself, in tokens:
 * `BOT_RUN.compactHeadroom` of the window, or `BOT_RUN.compactAt` when the window
 * is unknown. What a bot's settings fill in, and what a run falls back to.
 */
export const compactAtFor = (window: number | null | undefined): number =>
  window && window > 0
    ? Math.round(window * BOT_RUN.compactHeadroom)
    : BOT_RUN.compactAt;

/** Providers that make non-text media. Kept apart from the text providers: the key is the same, but a text provider does not necessarily draw (Anthropic). */
const mediaModelProviderSchema = z.enum([
  "openai",
  "chatgpt",
  "google",
  "xai",
  "vercel-ai-gateway",
]);
export type MediaModelProviderId = z.infer<typeof mediaModelProviderSchema>;

/** The four things the studio makes or reads (ai/tools/studio.tool). */
const MEDIA_KINDS = ["image", "video", "speech", "transcription"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const mediaModelRefSchema = z.object({
  provider: mediaModelProviderSchema,
  model: z.string().trim().min(1, "Model name is required").max(120),
});
export type MediaModelRef = z.infer<typeof mediaModelRefSchema>;

/**
 * Suggested media models per provider and kind, cheapest first; the head runs when only the
 * provider is known. Suggestions, not a validation list. Ids follow each sdk's own spelling, so
 * the gateway names the same model differently (`spacexai/…`). An empty list means the provider
 * cannot make that kind — for a model the sdk cannot build as well as one that does not exist.
 */
export const MEDIA_MODEL_PROVIDERS: Record<
  MediaModelProviderId,
  {
    label: string;
    apiKeyName: string;
    models: Record<MediaKind, SuggestModel[]>;
  }
> = {
  openai: {
    label: "OpenAI",
    apiKeyName: "OPENAI_API_KEY",
    models: {
      image: [
        { id: "gpt-image-1-mini", label: "GPT Image 1 mini", tier: "small" },
        {
          id: "gpt-image-2.5-flare",
          label: "GPT Image 2.5 Flare",
          tier: "mid",
        },
        {
          id: "gpt-image-2.5-sunburst",
          label: "GPT Image 2.5 Sunburst",
          tier: "large",
        },
      ],
      // Sora exists, but the sdk's OpenAI provider has no video model (model.ts buildVideoModel)
      video: [],
      speech: [
        { id: "tts-1", label: "TTS 1", tier: "small" },
        { id: "gpt-4o-mini-tts", label: "4o mini TTS", tier: "mid" },
        { id: "tts-1-hd", label: "TTS 1 HD", tier: "large" },
      ],
      transcription: [
        {
          id: "gpt-4o-mini-transcribe",
          label: "4o mini Transcribe",
          tier: "small",
        },
        { id: "gpt-transcribe", label: "GPT Transcribe", tier: "mid" },
      ],
    },
  },
  /**
   * What the Codex CLI makes on a ChatGPT plan, signed in the same way (ai/chatgpt): pictures
   * with the model it draws with (codex-rs ext/image-generation tool.rs `IMAGE_MODEL`), under
   * a limit of the plan's own, and what they run on when nobody picked (`planMediaOf`). It has
   * no route to film, speak or transcribe on a plan.
   */
  chatgpt: {
    label: "GPT Subscription",
    apiKeyName: "CHATGPT_SIGN_IN",
    models: {
      image: [{ id: "gpt-image-2", label: "GPT Image 2", tier: "mid" }],
      video: [],
      speech: [],
      transcription: [],
    },
  },
  google: {
    label: "Gemini",
    apiKeyName: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: {
      image: [
        {
          id: "gemini-3.1-flash-lite-image",
          label: "3.1 Flash Lite Image",
          tier: "small",
        },
        {
          id: "gemini-3.1-flash-image",
          label: "3.1 Flash Image",
          tier: "mid",
        },
        {
          id: "gemini-3-pro-image",
          label: "3 Pro Image",
          tier: "large",
        },
      ],
      video: [
        {
          id: "veo-3.1-lite-generate-preview",
          label: "Veo 3.1 Lite",
          tier: "small",
        },
        {
          id: "veo-3.1-fast-generate-preview",
          label: "Veo 3.1 Fast",
          tier: "mid",
        },
        { id: "veo-3.1-generate-preview", label: "Veo 3.1", tier: "large" },
      ],
      speech: [
        {
          id: "gemini-2.5-flash-preview-tts",
          label: "2.5 Flash TTS",
          tier: "small",
        },
        {
          id: "gemini-3.1-flash-tts-preview",
          label: "3.1 Flash TTS",
          tier: "mid",
        },
        {
          id: "gemini-2.5-pro-preview-tts",
          label: "2.5 Pro TTS",
          tier: "large",
        },
      ],
      transcription: [
        {
          id: "gemini-3.5-transcribe",
          label: "3.5 Transcribe",
          tier: "mid",
        },
      ],
    },
  },
  xai: {
    label: "xAI",
    apiKeyName: "XAI_API_KEY",
    models: {
      image: [
        { id: "grok-imagine-image", label: "Grok Imagine", tier: "small" },
        {
          id: "grok-imagine-image-2.0",
          label: "Grok Imagine 2.0",
          tier: "mid",
        },
      ],
      video: [
        {
          id: "grok-imagine-video",
          label: "Grok Imagine Video",
          tier: "small",
        },
        {
          id: "grok-imagine-video-1.5",
          label: "Grok Imagine Video 1.5",
          tier: "mid",
        },
      ],
      // xAI's sdk takes no id for speech or transcription; these ids are labels only (model.ts buildSpeechModel)
      speech: [{ id: "grok-tts", label: "Grok TTS", tier: "mid" }],
      transcription: [{ id: "grok-stt", label: "Grok STT", tier: "mid" }],
    },
  },
  "vercel-ai-gateway": {
    label: "Vercel AI Gateway",
    apiKeyName: "AI_GATEWAY_API_KEY",
    models: {
      image: [
        {
          id: "bytedance/seedream-5.0-lite",
          label: "Seedream 5.0 Lite",
          tier: "small",
        },
        { id: "bfl/flux-2-klein-9b", label: "FLUX 2 Klein 9B", tier: "small" },
        {
          id: "spacexai/grok-imagine-image-2.0",
          label: "Grok Imagine 2.0",
          tier: "small",
        },
        { id: "bfl/flux-2-pro", label: "FLUX 2 Pro", tier: "mid" },
        {
          id: "bytedance/seedream-5.0-pro",
          label: "Seedream 5.0 Pro",
          tier: "mid",
        },
        { id: "recraft/recraft-v4.1", label: "Recraft V4.1", tier: "mid" },
        {
          id: "openai/gpt-image-2.5-sunburst",
          label: "GPT Image 2.5 Sunburst",
          tier: "large",
        },
      ],
      video: [
        {
          id: "bytedance/seedance-2.0-mini",
          label: "Seedance 2.0 Mini",
          tier: "small",
        },
        {
          id: "google/veo-3.1-lite-generate-001",
          label: "Veo 3.1 Lite",
          tier: "small",
        },
        {
          id: "alibaba/wan-v2.6-t2v",
          label: "Wan 2.6",
          tier: "small",
        },
        {
          id: "google/veo-3.1-fast-generate-001",
          label: "Veo 3.1 Fast",
          tier: "mid",
        },
        { id: "bytedance/seedance-2.5", label: "Seedance 2.5", tier: "mid" },
        {
          id: "spacexai/grok-imagine-video-1.5",
          label: "Grok Imagine Video 1.5",
          tier: "mid",
        },
        { id: "klingai/kling-v3.0-t2v", label: "Kling 3.0", tier: "large" },
        {
          id: "google/veo-3.1-generate-001",
          label: "Veo 3.1",
          tier: "large",
        },
      ],
      speech: [
        { id: "fish-audio/s1", label: "Fish Audio S1", tier: "small" },
        { id: "openai/tts-1", label: "OpenAI TTS 1", tier: "small" },
        { id: "spacexai/grok-tts", label: "Grok TTS", tier: "mid" },
        {
          id: "fish-audio/s2.1-pro",
          label: "Fish Audio S2.1 Pro",
          tier: "mid",
        },
        { id: "openai/tts-1-hd", label: "OpenAI TTS 1 HD", tier: "large" },
      ],
      transcription: [
        { id: "spacexai/grok-stt", label: "Grok STT", tier: "small" },
        {
          id: "fish-audio/transcribe-1",
          label: "Fish Transcribe 1",
          tier: "small",
        },
        {
          id: "openai/gpt-4o-mini-transcribe",
          label: "4o mini Transcribe",
          tier: "small",
        },
        {
          id: "openai/gpt-4o-transcribe",
          label: "4o Transcribe",
          tier: "mid",
        },
        {
          id: "google/gemini-3.5-transcribe",
          label: "Gemini 3.5 Transcribe",
          tier: "mid",
        },
      ],
    },
  },
};

/** The record above in a stable order — the pickers and the fallback walk it. */
export const MEDIA_MODEL_PROVIDER_LIST = (
  Object.keys(MEDIA_MODEL_PROVIDERS) as MediaModelProviderId[]
).map((id) => ({ id, ...MEDIA_MODEL_PROVIDERS[id] }));

/**
 * Whether a provider can make a kind; an empty list means "cannot", not "stale". The picker,
 * the save (config.const acceptsChoice) and the resolver (model.ts resolveMediaRef) all read this.
 */
export const canMakeKind = (provider: string, kind: MediaKind): boolean =>
  (MEDIA_MODEL_PROVIDERS[provider as MediaModelProviderId]?.models[kind]
    ?.length ?? 0) > 0;

/**
 * What a studio kind nobody picked a model for runs on: the GPT Subscription, for a kind it
 * makes, while someone is signed in on a plan other than Free. The plan is paid for either
 * way, where a key bills each picture, so a sign-in alone is enough (the maintainer, 09-28).
 * The Codex CLI does not draw on a Free plan (codex-rs core tools/spec_plan.rs
 * `image_generation_available`), so neither does this. Null otherwise: the tool is absent.
 * The server (ai/model resolveMediaRef) and Settings (config-setting) both ask this.
 */
export function planMediaOf(
  kind: MediaKind,
  /** The sign-in, with its plan as the token names it; null when nobody is signed in. */
  signIn: { plan: string | null } | null,
): MediaModelRef | null {
  if (!signIn || signIn.plan?.toLowerCase() === "free") return null;
  const [model] = MEDIA_MODEL_PROVIDERS.chatgpt.models[kind];
  return model ? { provider: "chatgpt", model: model.id } : null;
}

/**
 * Whether a GPT Subscription sign-in opens a spoken call: on every plan but Free. Codex's
 * realtime route answered a Free sign-in's call with 404 Not Found where a Plus sign-in's same
 * offer opened (measured 09-28); the Codex CLI names no plan for /voice, and OpenClaw's docs say a
 * subscription talks "when the account has access". A plan the token does not name is let
 * through, and the call says what the plan answered. The server (live.schema liveLineOf callers,
 * config.query isCallable) and every screen that asks for a voice read this.
 */
export function planCallsOf(
  /** The sign-in, with its plan as the token names it; null when nobody is signed in. */
  signIn: { plan: string | null } | null,
): boolean {
  return Boolean(signIn) && signIn?.plan?.toLowerCase() !== "free";
}

/** `provider/model` for a text model, as the default-model config stores it. */
export function parseTextModel(value: string | undefined): TextModelRef | null {
  const [provider, ...rest] = (value ?? "").trim().split("/");
  const parsed = textModelRefSchema.safeParse({
    provider,
    model: rest.join("/"),
  });
  return parsed.success ? parsed.data : null;
}

/** How a media pick is stored: "openai/gpt-image-2". Split on the first slash only; gateway ids carry a slash of their own. */
export function parseMediaModel(
  value: string | undefined,
): MediaModelRef | null {
  const [provider, ...rest] = (value ?? "").trim().split("/");
  const parsed = mediaModelRefSchema.safeParse({
    provider,
    model: rest.join("/"),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Suggested text models per provider, smallest shelf first. Suggestions, not a validation list;
 * `defaultModelOf` reads a tier and takes the first model on that shelf, so where a shelf holds
 * more than one, their order there is what a user who picked nothing runs.
 */
export const TEXT_MODEL_PROVIDERS: Record<
  TextModelProviderId,
  {
    label: string;
    apiKeyName: string;
    /** Reached by signing in to an account rather than a pasted key; `apiKeyName` is where the sign-in is kept. */
    signIn?: true;
    /** Where a key is made: the link beside its field. */
    keysAt?: string;
    /** How a key begins, shown in its empty field in place of the setting's name. */
    keyLooks?: string;
    /** The size it runs when nobody picked (`defaultModelOf`); the middle of its row when left out. */
    defaultTier?: ModelTier;
    suggestModels: SuggestModel[];
  }
> = {
  openai: {
    label: "OpenAI",
    apiKeyName: "OPENAI_API_KEY",
    keysAt: "https://platform.openai.com/api-keys",
    keyLooks: "sk-…",
    // The small one, which a call's backend also thinks with (LIVE_BACKEND_MODEL)
    defaultTier: "small",
    suggestModels: [
      {
        id: "gpt-6-luna",
        label: "6 Luna",
        tier: "small",
        context: 1_050_000,
        efforts: ["none", "low", "medium", "high", "xhigh"],
      },
      {
        id: "gpt-6.1-sol",
        label: "6.1 Sol",
        tier: "mid",
        context: 1_050_000,
        efforts: ["low", "medium", "high", "xhigh"],
      },
      {
        id: "gpt-6.1-terra",
        label: "6.1 Terra",
        tier: "mid",
        context: 1_050_000,
        efforts: ["none", "low", "medium", "high", "xhigh"],
      },
      {
        id: "gpt-6-astra",
        label: "6 Astra",
        tier: "large",
        context: 1_050_000,
        efforts: ["low", "medium", "high", "xhigh"],
      },
    ],
  },
  /**
   * The Codex models a ChatGPT plan carries, reached by signing in (ai/chatgpt). Which ones a
   * plan opens differs — a Free plan lists Luna alone — and the backend caps every
   * window at 272k, whatever the same model takes over the API. Nobody picking, a plan runs
   * its middle one (6.1 Sol): it is paid for either way (the maintainer, 09-26). A Free plan
   * runs Luna, the one it opens (ai/model resolveDefaultModel).
   */
  chatgpt: {
    label: "GPT Subscription",
    apiKeyName: "CHATGPT_SIGN_IN",
    signIn: true,
    suggestModels: [
      {
        id: "gpt-6-luna",
        label: "6 Luna",
        tier: "small",
        context: 272_000,
        efforts: ["none", "low", "medium", "high", "xhigh"],
      },
      {
        id: "gpt-6.1-sol",
        label: "6.1 Sol",
        tier: "mid",
        context: 272_000,
        efforts: ["low", "medium", "high", "xhigh"],
      },
      {
        id: "gpt-6.1-terra",
        label: "6.1 Terra",
        tier: "mid",
        context: 272_000,
        efforts: ["none", "low", "medium", "high", "xhigh"],
      },
      {
        id: "gpt-6-astra",
        label: "6 Astra",
        tier: "large",
        context: 272_000,
        efforts: ["low", "medium", "high", "xhigh"],
      },
    ],
  },
  anthropic: {
    label: "Claude",
    apiKeyName: "ANTHROPIC_API_KEY",
    keysAt: "https://platform.claude.com/settings/keys",
    keyLooks: "sk-ant-…",
    suggestModels: [
      {
        id: "claude-haiku-4-5",
        label: "Haiku 4.5",
        tier: "small",
        efforts: ["none", "minimal", "low", "medium", "high", "xhigh"],
      },
      {
        id: "claude-sonnet-5-5",
        label: "Sonnet 5.5",
        tier: "mid",
        context: 1_000_000,
        efforts: ["none", "low", "medium", "high", "xhigh"],
      },
      {
        id: "claude-opus-5-5",
        label: "Opus 5.5",
        tier: "large",
        context: 1_000_000,
        efforts: ["low", "medium", "high", "xhigh"],
      },
      {
        id: "claude-fable-5-1",
        label: "Fable 5.1",
        tier: "large",
        efforts: ["none", "low", "medium", "high", "xhigh"],
      },
    ],
  },
  google: {
    label: "Gemini",
    apiKeyName: "GOOGLE_GENERATIVE_AI_API_KEY",
    keysAt: "https://aistudio.google.com/apikey",
    keyLooks: "AIza…",
    suggestModels: [
      {
        id: "gemini-3.5-flash-lite",
        label: "3.5 Flash Lite",
        tier: "small",
        context: 1_000_000,
        efforts: ["minimal", "low", "medium", "high"],
      },
      {
        id: "gemini-3.8-flash",
        label: "3.8 Flash",
        tier: "mid",
        context: 1_000_000,
        efforts: ["low", "medium", "high"],
      },
    ],
  },
  xai: {
    label: "xAI",
    apiKeyName: "XAI_API_KEY",
    keysAt: "https://console.x.ai",
    keyLooks: "xai-…",
    suggestModels: [
      {
        id: "grok-4.7",
        label: "Grok 4.7",
        tier: "large",
        context: 500_000,
        efforts: ["none", "low", "medium", "high", "xhigh"],
      },
    ],
  },
  /**
   * Cross-vendor shelf, cheapest first, shown until the live catalog arrives. Vendor names are
   * the gateway's own (xAI is `spacexai`); ids are checked against the live list (model.ts liveGatewayIds).
   */
  "vercel-ai-gateway": {
    label: "Vercel AI Gateway",
    apiKeyName: "AI_GATEWAY_API_KEY",
    keysAt:
      "https://vercel.com/docs/ai-gateway/authentication-and-byok/authentication",
    suggestModels: [
      { id: "zai/glm-5.3-flash", label: "GLM 5.3 Flash", tier: "small" },
      {
        id: "google/gemini-3.8-flash",
        label: "Gemini 3.8 Flash",
        tier: "small",
      },
      {
        id: "openai/gpt-6-luna",
        label: "GPT 6 Luna",
        tier: "small",
        context: 1_050_000,
      },
      { id: "zai/glm-5.3", label: "GLM 5.3", tier: "mid" },
      {
        id: "spacexai/grok-4.7",
        label: "Grok 4.7",
        tier: "mid",
        context: 500_000,
      },
      {
        id: "anthropic/claude-sonnet-5.5",
        label: "Claude Sonnet 5.5",
        tier: "mid",
      },
      {
        id: "openai/gpt-6.1-sol",
        label: "GPT 6.1 Sol",
        tier: "mid",
        context: 1_050_000,
      },
      { id: "moonshotai/kimi-k3", label: "Kimi K3", tier: "mid" },
      {
        id: "anthropic/claude-opus-5.5",
        label: "Claude Opus 5.5",
        tier: "large",
        context: 1_000_000,
      },
      {
        id: "openai/gpt-6-astra",
        label: "GPT 6 Astra",
        tier: "large",
        context: 1_050_000,
      },
    ],
  },
  /**
   * The gateway's shelf as OpenRouter names it (xAI is `x-ai`, Z.ai `z-ai`), checked against
   * its live list (model.ts callableRows); shown until the catalog arrives.
   */
  openrouter: {
    label: "OpenRouter",
    apiKeyName: "OPENROUTER_API_KEY",
    keysAt: "https://openrouter.ai/settings/keys",
    keyLooks: "sk-or-…",
    suggestModels: [
      {
        id: "z-ai/glm-5.3-flash",
        label: "GLM 5.3 Flash",
        tier: "small",
        context: 1_310_720,
      },
      {
        id: "google/gemini-3.8-flash",
        label: "Gemini 3.8 Flash",
        tier: "small",
        context: 1_048_576,
      },
      {
        id: "openai/gpt-6-luna",
        label: "GPT 6 Luna",
        tier: "small",
        context: 1_050_000,
      },
      { id: "z-ai/glm-5.3", label: "GLM 5.3", tier: "mid", context: 1_310_720 },
      {
        id: "x-ai/grok-4.7",
        label: "Grok 4.7",
        tier: "mid",
        context: 500_000,
      },
      {
        id: "anthropic/claude-sonnet-5.5",
        label: "Claude Sonnet 5.5",
        tier: "mid",
        context: 1_000_000,
      },
      {
        id: "openai/gpt-6.1-sol",
        label: "GPT 6.1 Sol",
        tier: "mid",
        context: 1_050_000,
      },
      {
        id: "moonshotai/kimi-k3",
        label: "Kimi K3",
        tier: "mid",
        context: 1_048_576,
      },
      {
        id: "anthropic/claude-opus-5.5",
        label: "Claude Opus 5.5",
        tier: "large",
        context: 1_000_000,
      },
      {
        id: "openai/gpt-6-astra",
        label: "GPT 6 Astra",
        tier: "large",
        context: 1_050_000,
      },
    ],
  },
  mistral: {
    label: "Mistral",
    apiKeyName: "MISTRAL_API_KEY",
    keysAt: "https://console.mistral.ai/api-keys",
    suggestModels: [
      {
        id: "ministral-8b-latest",
        label: "Ministral 8B",
        tier: "small",
        efforts: [],
      },
      {
        id: "mistral-small-latest",
        label: "Small",
        tier: "mid",
        efforts: ["none", "high"],
      },
      {
        id: "mistral-medium-latest",
        label: "Medium",
        tier: "large",
        efforts: ["none", "high"],
      },
      {
        id: "mistral-large-latest",
        label: "Large",
        tier: "large",
        efforts: [],
      },
    ],
  },
  deepseek: {
    label: "DeepSeek",
    apiKeyName: "DEEPSEEK_API_KEY",
    keysAt: "https://platform.deepseek.com/api_keys",
    keyLooks: "sk-…",
    suggestModels: [
      {
        id: "deepseek-flash",
        label: "V4.1 Flash",
        tier: "small",
        context: 1_000_000,
        efforts: ["none", "low", "high", "xhigh"],
      },
      {
        id: "deepseek-v4-pro",
        label: "V4 Pro",
        tier: "large",
        context: 1_000_000,
        efforts: ["none", "low", "high", "xhigh"],
      },
    ],
  },
  /** Open-weight models served fast. Production ids only: a preview id is withdrawn without notice. */
  groq: {
    label: "Groq",
    apiKeyName: "GROQ_API_KEY",
    keysAt: "https://console.groq.com/keys",
    keyLooks: "gsk_…",
    suggestModels: [
      {
        id: "openai/gpt-oss-20b",
        label: "GPT OSS 20B",
        tier: "small",
        context: 131_072,
        efforts: ["low", "medium", "high"],
      },
      {
        id: "openai/gpt-oss-120b",
        label: "GPT OSS 120B",
        tier: "mid",
        context: 131_072,
        efforts: ["low", "medium", "high"],
      },
      {
        id: "llama-3.3-70b-versatile",
        label: "Llama 3.3 70B",
        tier: "mid",
        context: 131_072,
        efforts: [],
      },
    ],
  },
  /** Windows are the free tier's; a paid key takes twice as much, and a run compacts early rather than overflowing. */
  cerebras: {
    label: "Cerebras",
    apiKeyName: "CEREBRAS_API_KEY",
    keysAt: "https://cloud.cerebras.ai",
    keyLooks: "csk-…",
    suggestModels: [
      {
        id: "qwen-3.8-27b",
        label: "Qwen 3.8 27B",
        tier: "small",
        context: 64_000,
      },
      {
        id: "gpt-oss-120b",
        label: "GPT OSS 120B",
        tier: "mid",
        context: 65_536,
      },
    ],
  },
  togetherai: {
    label: "Together",
    apiKeyName: "TOGETHER_AI_API_KEY",
    keysAt: "https://api.together.ai/settings/api-keys",
    suggestModels: [
      {
        id: "Qwen/Qwen3.5-9B",
        label: "Qwen 3.5 9B",
        tier: "small",
        context: 262_144,
      },
      {
        id: "zai-org/GLM-5.3-Flash",
        label: "GLM 5.3 Flash",
        tier: "small",
        context: 1_048_575,
      },
      {
        id: "openai/gpt-oss-120b",
        label: "GPT OSS 120B",
        tier: "mid",
        context: 131_072,
      },
      {
        id: "deepseek-ai/DeepSeek-V4.1-Flash",
        label: "DeepSeek V4.1 Flash",
        tier: "mid",
        context: 1_000_000,
      },
      {
        id: "zai-org/GLM-5.3",
        label: "GLM 5.3",
        tier: "large",
        context: 1_048_575,
      },
      {
        id: "moonshotai/Kimi-K3",
        label: "Kimi K3",
        tier: "large",
        context: 1_048_576,
      },
    ],
  },
  fireworks: {
    label: "Fireworks",
    apiKeyName: "FIREWORKS_API_KEY",
    keysAt: "https://app.fireworks.ai/account/api-keys",
    keyLooks: "fw_…",
    suggestModels: [
      {
        id: "accounts/fireworks/models/glm-5p3-flash",
        label: "GLM 5.3 Flash",
        tier: "small",
        context: 1_048_576,
      },
      {
        id: "accounts/fireworks/models/deepseek-v4p1-flash",
        label: "DeepSeek V4.1 Flash",
        tier: "mid",
        context: 1_048_576,
      },
      {
        id: "accounts/fireworks/models/minimax-m3",
        label: "MiniMax M3",
        tier: "mid",
        context: 512_000,
      },
      {
        id: "accounts/fireworks/models/glm-5p3",
        label: "GLM 5.3",
        tier: "large",
        context: 1_048_576,
      },
      {
        id: "accounts/fireworks/models/kimi-k3",
        label: "Kimi K3",
        tier: "large",
        context: 1_048_576,
      },
    ],
  },
  deepinfra: {
    label: "DeepInfra",
    apiKeyName: "DEEPINFRA_API_KEY",
    keysAt: "https://deepinfra.com/dash/api_keys",
    suggestModels: [
      {
        id: "deepseek-ai/DeepSeek-V4-Flash-0731",
        label: "DeepSeek V4 Flash",
        tier: "small",
        context: 1_048_576,
      },
      {
        id: "deepseek-ai/DeepSeek-V4.1-Flash",
        label: "DeepSeek V4.1 Flash",
        tier: "mid",
        context: 1_048_576,
      },
      {
        id: "zai-org/GLM-5.2",
        label: "GLM 5.2",
        tier: "mid",
        context: 1_048_576,
      },
      {
        id: "zai-org/GLM-5.3",
        label: "GLM 5.3",
        tier: "large",
        context: 1_048_576,
      },
      {
        id: "moonshotai/Kimi-K3",
        label: "Kimi K3",
        tier: "large",
        context: 1_048_576,
      },
    ],
  },
  cohere: {
    label: "Cohere",
    apiKeyName: "COHERE_API_KEY",
    keysAt: "https://dashboard.cohere.com/api-keys",
    suggestModels: [
      {
        id: "command-r7b-12-2024",
        label: "Command R7B",
        tier: "small",
        context: 128_000,
      },
      {
        id: "command-a-03-2025",
        label: "Command A",
        tier: "mid",
        context: 256_000,
      },
      {
        id: "command-a-plus-05-2026",
        label: "Command A+",
        tier: "large",
        context: 128_000,
      },
    ],
  },
};

/**
 * A provider turning down the key or sign-in a call went out on (ai/model isKeyRefused), as
 * the screen says it: "OpenAI refused the key it runs on". Only Settings › API keys mends it.
 */
export const refusedWords = (provider: TextModelProviderId): string => {
  const { label, signIn } = TEXT_MODEL_PROVIDERS[provider];
  return `${label} refused the ${signIn ? "sign-in" : "key"} it runs on`;
};

/** A provider's model at one tier, or its first one when it has none at that size. */
const modelOfTier = (
  provider: { suggestModels: SuggestModel[] },
  tier: ModelTier,
): string | undefined =>
  (
    provider.suggestModels.find((model) => model.tier === tier) ??
    provider.suggestModels[0]
  )?.id;

/** What a provider runs when nobody picked: its `defaultTier`, else the middle of its row. */
export const defaultModelOf = (provider: {
  defaultTier?: ModelTier;
  suggestModels: SuggestModel[];
}) => modelOfTier(provider, provider.defaultTier ?? "mid");

/** The record above in a stable order — routes and pickers walk it. */
export const TEXT_MODEL_PROVIDER_LIST = (
  Object.keys(TEXT_MODEL_PROVIDERS) as TextModelProviderId[]
).map((id) => ({ id, ...TEXT_MODEL_PROVIDERS[id] }));

/**
 * A provider as the settings screen sees it: what it is called, whether a key
 * is set, and a few model names worth suggesting.
 */
/**
 * What a bot with no model of its own runs on now, as its run resolves it (ai/model
 * resolveDefaultModel), or why nothing can: one answer for the run and for the screen.
 */
export type AutomaticModel =
  | { ref: TextModelRef; problem: null }
  | { ref: null; problem: string };

export type AiProvider = {
  id: TextModelProviderId;
  label: string;
  apiKeyName: string;
  hasKey: boolean;
  /** Saved, but sealed under a key the data folder no longer has (config.query configState). */
  lostKey?: true;
  suggestModels: SuggestModel[];
  /** Signs in to an account instead of taking a key (TEXT_MODEL_PROVIDERS `signIn`). */
  signIn?: true;
  /** The plan the signed-in account is on, as the provider names it; sign-in providers only. */
  plan?: string | null;
};

/**
 * A plan as a screen names it: the backend's own word ("pro", "plus", "free"), capitalised,
 * so a plan it adds later reads as it names it; null when it does not say.
 */
export const planName = (plan: string | null | undefined): string | null =>
  plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : null;

/**
 * What a GPT Subscription sign-in has used (ai/chatgpt readChatGptUsage): the tightest window of
 * its plan and when it frees up, with `plan` as the backend names it now. `refused` is a sign-in
 * the plan turned away, in its own words.
 */
export type SubscriptionUsage =
  | {
      plan: string | null;
      usedPercent: number;
      /** ISO; null when the backend did not say. */
      resetsAt: string | null;
      /** The window is used up: jobs on it stop until it resets. */
      spent: boolean;
      /** Spent, or past `CHATGPT_USAGE_HIGH`: amber on its row. */
      high: boolean;
    }
  | { refused: string };

/**
 * What a catalog row can be picked as, in the gateway's words: text, one of the studio kinds, or
 * a word this app offers nowhere (embedding, reranking, realtime). OpenRouter's rows are put in
 * the same words when they are read (ai/openrouter).
 */
export const CATALOG_TEXT = "language";

/** The tag a text model must carry: a bot that cannot call a tool cannot do a job. */
export const CATALOG_TOOL_USE = "tool-use";

/**
 * The providers here that a catalog also carries, by the gateway's name for them — the first
 * segment of its ids, and its `owned_by` — which is not always theirs (xAI is `spacexai`).
 * OpenRouter's names are put in these words when its rows are read (ai/openrouter). What a
 * catalog model's provider can do, and its mark, are read through it.
 */
export const VENDOR_PROVIDERS: Partial<Record<string, TextModelProviderId>> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  spacexai: "xai",
  mistral: "mistral",
  deepseek: "deepseek",
  cohere: "cohere",
  // Its own routers (`openrouter/free`, `openrouter/auto`), which pick a model per request
  openrouter: "openrouter",
};

/**
 * How a catalog bills one model, flattened when it is read from the shapes each catalog's
 * pricing answers with. A null price is "the catalog did not say", never zero.
 */
export type CatalogPrice = {
  /** USD per 1M tokens; null when the model is not billed per token at all. */
  in: number | null;
  out: number | null;
  /** The unit when it is not tokens ("$0.2/s 720p"), or what qualifies the token price ("tiered"). */
  note: string | null;
  free: boolean;
};

/** One row of a catalog provider's live model list (`CATALOG_PROVIDERS`). */
export type CatalogModel = {
  /** The catalog's id, "<vendor>/<model>" — used as the model name. */
  id: string;
  label: string;
  /** Who makes it, in the gateway's words (`VENDOR_PROVIDERS`); what its mark is drawn from. */
  owner: string;
  /** What it makes, in the gateway's words (`CATALOG_TEXT`, a studio kind); null when the catalog did not say. */
  type?: string | null;
  /** What a model can do, in the gateway's words; only `tool-use` is read. */
  tags: string[];
  price: CatalogPrice;
  /** The catalog has dated its retirement. */
  retiring: boolean;
  /** Context window in tokens; null when the catalog did not say. What a run compacts against (bot.run). */
  contextWindow: number | null;
  /** The ladder the catalog lists for this model, narrowed to steps the app can set; null when it lists none. */
  efforts: Effort[] | null;
};

/**
 * What is left on a catalog provider's key (ai/model `readKeyCredits`). A key the provider turns
 * away is not a failed read: `refused` carries its words, drawn on the key's row and dialog.
 */
export type KeyCredits =
  | {
      /** USD. */
      balance: number;
      /** At or under `KEY_LOW_CREDIT` (config): amber, it waits on a top-up. */
      low: boolean;
    }
  | { refused: string };
