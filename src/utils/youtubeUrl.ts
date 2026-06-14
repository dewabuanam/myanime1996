const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

type ParsedYouTubeUrl = {
  videoId: string;
  startSeconds?: number;
  playlistId?: string;
};

function parseTimestampSeconds(rawValue: string | null) {
  if (!rawValue) return undefined;
  const value = rawValue.trim().toLowerCase();
  if (!value) return undefined;

  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  }

  let totalSeconds = 0;
  const matches = Array.from(value.matchAll(/(\d+)(h|m|s)/g));
  if (!matches.length) return undefined;

  for (const match of matches) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const unit = match[2];
    if (unit === 'h') totalSeconds += amount * 3600;
    if (unit === 'm') totalSeconds += amount * 60;
    if (unit === 's') totalSeconds += amount;
  }

  return totalSeconds >= 0 ? totalSeconds : undefined;
}

function sanitizeVideoId(value?: string | null) {
  const videoId = String(value ?? '').trim();
  if (!videoId) return '';
  return YOUTUBE_VIDEO_ID_RE.test(videoId) ? videoId : '';
}

export function parseYouTubeUrl(url?: string): ParsedYouTubeUrl | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    let videoId = '';

    if (hostname.includes('youtu.be')) {
      videoId = sanitizeVideoId(parsed.pathname.split('/').filter(Boolean)[0]);
    } else {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const embedIndex = pathParts.indexOf('embed');
      if (embedIndex >= 0) {
        videoId = sanitizeVideoId(pathParts[embedIndex + 1]);
      }

      if (!videoId) {
        videoId = sanitizeVideoId(parsed.searchParams.get('v'));
      }
    }

    if (!videoId) return null;

    const startSeconds = parseTimestampSeconds(parsed.searchParams.get('start') ?? parsed.searchParams.get('t'));
    const playlistId = String(parsed.searchParams.get('list') ?? '').trim() || undefined;

    return {
      videoId,
      startSeconds,
      playlistId,
    };
  } catch {
    return null;
  }
}

export function extractYouTubeVideoId(url?: string) {
  return parseYouTubeUrl(url)?.videoId ?? '';
}

export function toCanonicalYouTubeWatchUrl(url: string) {
  const parsed = parseYouTubeUrl(url);
  if (!parsed?.videoId) return url;

  const target = new URL('https://www.youtube.com/watch');
  target.searchParams.set('v', parsed.videoId);

  if (typeof parsed.startSeconds === 'number' && Number.isFinite(parsed.startSeconds) && parsed.startSeconds > 0) {
    target.searchParams.set('t', String(Math.floor(parsed.startSeconds)));
  }

  if (parsed.playlistId) {
    target.searchParams.set('list', parsed.playlistId);
  }

  return target.toString();
}