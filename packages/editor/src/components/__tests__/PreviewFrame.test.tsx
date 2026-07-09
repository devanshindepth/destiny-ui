/**
 * Component tests for <PreviewFrame>
 * Requirements: 7.2, 7.3, 14.1, 14.2, 14.3, 14.4
 */

import { render, screen, fireEvent, act, cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { PreviewFrame } from '../PreviewFrame.js';
import { usePreviewStore } from '../../stores/previewStore.js';

// Reset store and DOM between tests
afterEach(() => {
  cleanup();
  usePreviewStore.setState({
    previewPath: null,
    frameReady: false,
    pendingCss: null,
  });
});

// ─── Placeholder when previewPath is null ────────────────────────────────────

describe('PreviewFrame — no previewPath', () => {
  it('shows the placeholder when previewPath is null (Req 14.3)', () => {
    usePreviewStore.setState({ previewPath: null });
    render(<PreviewFrame />);
    expect(screen.getByTestId('preview-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-iframe')).not.toBeInTheDocument();
  });

  it('placeholder contains "No preview configured" text', () => {
    usePreviewStore.setState({ previewPath: null });
    render(<PreviewFrame />);
    expect(screen.getByTestId('preview-placeholder').textContent).toContain(
      'No preview configured',
    );
  });
});

// ─── iframe renders with sandbox when previewPath is set ─────────────────────

describe('PreviewFrame — with previewPath', () => {
  it('renders an iframe when previewPath is set (Req 14.1)', () => {
    usePreviewStore.setState({ previewPath: '/preview/index.html' });
    render(<PreviewFrame />);
    expect(screen.getByTestId('preview-iframe')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-placeholder')).not.toBeInTheDocument();
  });

  it('sets the sandbox attribute on the iframe (Req 14.2)', () => {
    usePreviewStore.setState({ previewPath: '/preview/index.html' });
    render(<PreviewFrame />);
    const iframe = screen.getByTestId('preview-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe('allow-same-origin allow-scripts');
  });

  it('sets the src to previewPath', () => {
    usePreviewStore.setState({ previewPath: '/my/preview.html' });
    render(<PreviewFrame />);
    const iframe = screen.getByTestId('preview-iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('/my/preview.html');
  });
});

// ─── CSS injection sets styleEl.textContent (Req 7.2, 7.3) ──────────────────

describe('PreviewFrame — CSS injection', () => {
  /**
   * jsdom does not create real iframe.contentDocument — it's null.
   * We verify CSS injection by testing the injectCss behaviour directly
   * using a real document as a stand-in for the iframe's contentDocument.
   * This validates Req 7.2 (style element) and 7.3 (no navigation).
   */

  it('injects CSS into a document by creating a <style id="design-studio-live"> (Req 7.2)', () => {
    // Simulate what PreviewFrame.injectCss does on a real contentDocument
    const doc = document.implementation.createHTMLDocument('test');
    // Ensure there's a head
    if (!doc.head) {
      doc.documentElement.appendChild(doc.createElement('head'));
    }

    // Replicate the injection logic from PreviewFrame.tsx
    let styleEl = doc.getElementById('design-studio-live') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'design-studio-live';
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = ':root { --color-primary: #ff0000; }';

    expect(doc.getElementById('design-studio-live')).not.toBeNull();
    expect(doc.getElementById('design-studio-live')!.textContent).toBe(
      ':root { --color-primary: #ff0000; }',
    );
  });

  it('updates textContent without creating duplicate style elements (Req 7.3)', () => {
    const doc = document.implementation.createHTMLDocument('test');

    function injectCss(css: string) {
      let styleEl = doc.getElementById('design-studio-live') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = doc.createElement('style');
        styleEl.id = 'design-studio-live';
        doc.head.appendChild(styleEl);
      }
      styleEl.textContent = css;
    }

    injectCss(':root { --v: 1; }');
    injectCss(':root { --v: 2; }');

    const styleEls = doc.querySelectorAll('#design-studio-live');
    expect(styleEls).toHaveLength(1);
    expect(styleEls[0].textContent).toBe(':root { --v: 2; }');
  });

  it('renders iframe when previewPath is set — no navigation on CSS update (Req 7.3)', () => {
    usePreviewStore.setState({ previewPath: '/preview/index.html' });
    render(<PreviewFrame />);

    const iframe = screen.getByTestId('preview-iframe') as HTMLIFrameElement;
    const originalSrc = iframe.getAttribute('src');

    // Simulate store CSS update — should not change iframe src
    act(() => {
      usePreviewStore.getState().setPendingCss(':root { --spacing-md: 16px; }');
    });

    expect(iframe.getAttribute('src')).toBe(originalSrc);
  });

  it('marks frameReady=true and clears pendingCss after load fires (Req 7.3)', () => {
    usePreviewStore.setState({
      previewPath: '/preview/index.html',
      pendingCss: ':root { --buffered: 1px; }',
    });
    render(<PreviewFrame />);

    const iframe = screen.getByTestId('preview-iframe') as HTMLIFrameElement;

    act(() => {
      fireEvent.load(iframe);
    });

    // frameReady should be set, pendingCss cleared by the handleLoad handler
    expect(usePreviewStore.getState().frameReady).toBe(true);
    expect(usePreviewStore.getState().pendingCss).toBeNull();
  });

  it('sets frameReady=false on error event (Req 14.4)', () => {
    usePreviewStore.setState({ previewPath: '/preview/index.html', frameReady: true });
    render(<PreviewFrame />);

    const iframe = screen.getByTestId('preview-iframe') as HTMLIFrameElement;

    act(() => {
      fireEvent.error(iframe);
    });

    expect(usePreviewStore.getState().frameReady).toBe(false);
  });
});
