/**
 * PreviewFrame — renders the preview <iframe> and handles live CSS injection.
 *
 * Requirements: 7.2, 7.3, 14.1, 14.2, 14.3, 14.4
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { usePreviewStore } from '../stores/previewStore.js';

// ─── CSS injection helper ──────────────────────────────────────────────────────

function injectCss(iframe: HTMLIFrameElement, css: string): void {
  const doc = iframe.contentDocument;
  if (!doc) return;
  let styleEl = doc.getElementById('design-studio-live') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.id = 'design-studio-live';
    doc.head?.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function PreviewFrame() {
  const previewPath = usePreviewStore((s) => s.previewPath);
  const frameReady = usePreviewStore((s) => s.frameReady);
  const pendingCss = usePreviewStore((s) => s.pendingCss);
  const setFrameReady = usePreviewStore((s) => s.setFrameReady);
  const setPendingCss = usePreviewStore((s) => s.setPendingCss);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadError, setLoadError] = useState(false);

  // Reset frame state when previewPath changes (Req 14.2)
  useEffect(() => {
    setFrameReady(false);
    setLoadError(false);
  }, [previewPath, setFrameReady]);

  // Flush pending CSS once the frame becomes ready (Req 7.3)
  useEffect(() => {
    if (frameReady && pendingCss !== null && iframeRef.current) {
      injectCss(iframeRef.current, pendingCss);
      setPendingCss(null);
    }
  }, [frameReady, pendingCss, setPendingCss]);

  // ── iframe event handlers ──────────────────────────────────────────────────

  function handleLoad() {
    setLoadError(false);
    setFrameReady(true);
    // Flush any buffered CSS that arrived while the frame was loading (Req 7.3)
    const css = usePreviewStore.getState().pendingCss;
    if (css !== null && iframeRef.current) {
      injectCss(iframeRef.current, css);
      setPendingCss(null);
    }
  }

  function handleError() {
    setLoadError(true);
    setFrameReady(false);
  }

  // ── Render: no previewPath configured (Req 14.3) ──────────────────────────

  if (!previewPath) {
    return (
      <div class="preview-placeholder" data-testid="preview-placeholder">
        <p class="preview-placeholder__title">No preview configured</p>
        <p class="preview-placeholder__text">
          Set <code>previewPath</code> in your{' '}
          <code>design-studio.config.json</code> to enable live preview.
        </p>
        <a
          class="preview-placeholder__link"
          href="https://github.com/destiny-ui/design-studio#preview"
          target="_blank"
          rel="noopener noreferrer"
        >
          View documentation →
        </a>
      </div>
    );
  }

  // ── Render: iframe load error (Req 14.4) ──────────────────────────────────

  if (loadError) {
    return (
      <div class="preview-placeholder" data-testid="preview-error">
        <p class="preview-placeholder__title">Preview failed to load</p>
        <p class="preview-placeholder__text">
          The path <code>{previewPath}</code> could not be loaded in the preview
          frame.
        </p>
        <a
          class="preview-placeholder__link"
          href="https://github.com/destiny-ui/design-studio#preview"
          target="_blank"
          rel="noopener noreferrer"
        >
          Troubleshooting guide →
        </a>
      </div>
    );
  }

  // ── Render: live preview iframe (Req 14.1, 14.2) ──────────────────────────

  return (
    <iframe
      ref={iframeRef}
      class="preview-frame"
      src={previewPath}
      sandbox="allow-same-origin allow-scripts"
      onLoad={handleLoad}
      onError={handleError}
      title="Design Studio Preview"
      data-testid="preview-iframe"
    />
  );
}
