let youtubeApiReadyPromise: Promise<void> | null = null;

export function ensureYouTubeApiReady() {
  const ytPlayer = (window as { YT?: { Player?: unknown } }).YT?.Player;
  if (ytPlayer) return Promise.resolve();
  if (youtubeApiReadyPromise) return youtubeApiReadyPromise;

  youtubeApiReadyPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-youtube-api="true"]');
    if (existingScript) {
      const waitUntilReady = () => {
        const player = (window as { YT?: { Player?: unknown } }).YT?.Player;
        if (player) {
          resolve();
          return;
        }
        window.setTimeout(waitUntilReady, 50);
      };
      waitUntilReady();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.youtubeApi = 'true';
    script.onerror = () => reject(new Error('Failed to load YouTube iframe API.'));

    const previousReadyHandler = (window as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady;
    (window as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      resolve();
    };

    document.head.appendChild(script);
  });

  return youtubeApiReadyPromise;
}
