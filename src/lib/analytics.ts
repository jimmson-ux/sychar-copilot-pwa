import posthog from "posthog-js";

export function initAnalytics() {
  if (typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: "https://app.posthog.com",
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") ph.opt_out_capturing();
    },
  });
}

export function initClarity(clarityId: string) {
  if (!clarityId || typeof window === "undefined") return;
  const s = document.createElement("script");
  s.src = `https://www.clarity.ms/tag/${clarityId}`;
  s.async = true;
  document.head.appendChild(s);
}

export function initFormbricks(workspaceId: string) {
  if (!workspaceId || typeof window === "undefined") return;
  import("@formbricks/js").then((mod) => {
    const fb = (mod as any).default ?? (mod as any).formbricks;
    fb.setup({ workspaceId, appUrl: "https://app.formbricks.com" });
  }).catch(() => {});
}
