/**
 * Backend YouTube and Video URL Validation Utility
 */

export const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export interface ParsedYouTube {
  isValid: boolean;
  isYouTube: boolean;
  videoId?: string;
  embedUrl?: string;
  error?: string;
}

export function isYouTubeHost(urlOrHost: string): boolean {
  if (!urlOrHost) return false;
  let normalized = urlOrHost.trim().toLowerCase();

  try {
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "https://" + normalized;
    }
    const parsed = new URL(normalized);
    return YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(urlOrHost);
  }
}

export function parseYouTubeUrl(rawUrl: string): ParsedYouTube {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: false, isYouTube: false, error: "URL is required." };
  }

  let trimmed = rawUrl.trim();
  if (!trimmed) {
    return { isValid: false, isYouTube: false, error: "URL cannot be empty." };
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = "https://" + trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, isYouTube: false, error: "Malformed URL format." };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isYt = YOUTUBE_HOSTS.has(hostname);

  if (!isYt) {
    return { isValid: false, isYouTube: false, error: "Not a YouTube URL." };
  }

  let videoId: string | null = null;
  const pathname = parsed.pathname;

  if (hostname === "youtu.be" || hostname === "www.youtu.be") {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) videoId = segments[0];
  } else if (pathname === "/watch" || pathname === "/watch/") {
    videoId = parsed.searchParams.get("v");
  } else if (pathname.startsWith("/embed/")) {
    const segments = pathname.replace("/embed/", "").split("/").filter(Boolean);
    if (segments.length > 0) videoId = segments[0];
  } else if (pathname.startsWith("/shorts/")) {
    const segments = pathname.replace("/shorts/", "").split("/").filter(Boolean);
    if (segments.length > 0) videoId = segments[0];
  } else if (pathname.startsWith("/live/")) {
    const segments = pathname.replace("/live/", "").split("/").filter(Boolean);
    if (segments.length > 0) videoId = segments[0];
  } else if (pathname.startsWith("/v/")) {
    const segments = pathname.replace("/v/", "").split("/").filter(Boolean);
    if (segments.length > 0) videoId = segments[0];
  }

  if (!videoId) {
    return {
      isValid: false,
      isYouTube: true,
      error: "Could not find YouTube video ID in the provided link.",
    };
  }

  if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
    return {
      isValid: false,
      isYouTube: true,
      error: `Invalid YouTube video ID "${videoId}". Video IDs must be exactly 11 characters.`,
    };
  }

  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
  return {
    isValid: true,
    isYouTube: true,
    videoId,
    embedUrl,
  };
}

export function validateVideoUrl(rawUrl: string | undefined): { isValid: boolean; error?: string } {
  if (!rawUrl || !rawUrl.trim()) return { isValid: true };
  const trimmed = rawUrl.trim();

  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return { isValid: false, error: "Unsafe URI scheme detected." };
  }

  if (isYouTubeHost(trimmed)) {
    const yt = parseYouTubeUrl(trimmed);
    if (!yt.isValid) {
      return { isValid: false, error: yt.error || "Invalid YouTube URL." };
    }
    return { isValid: true };
  }

  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { isValid: false, error: "Only HTTP and HTTPS video links are supported." };
    }
    return { isValid: true };
  } catch {
    return { isValid: false, error: "Invalid video URL format." };
  }
}
