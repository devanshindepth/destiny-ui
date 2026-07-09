/**
 * Component tests for <ErrorPanel> and <ErrorRow>
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorPanel, ErrorRow } from '../ErrorPanel.js';
import { useTokenStore } from '../../stores/tokenStore.js';
import type { TokenError } from '@destiny-ui/core';

// Reset Zustand store and testing-library DOM between each test
afterEach(() => {
  cleanup();
  useTokenStore.setState({ errors: [], selectedTokenId: null });
});

// ─── Test fixtures ────────────────────────────────────────────────────────────

const validationError: TokenError = {
  kind: 'validation',
  tokenId: 'color.brand.primary',
  field: 'value',
  message: 'Invalid hex color format',
};

const unresolvedRefError: TokenError = {
  kind: 'unresolved-reference',
  tokenId: 'color.semantic.text',
  referencedId: 'color.brand.nonexistent',
};

const cycleError: TokenError = {
  kind: 'cycle',
  cycle: ['spacing.md', 'spacing.lg', 'spacing.md'],
};

const parseError: TokenError = {
  kind: 'parse',
  filePath: 'tokens/colors.json',
  line: 10,
  message: 'Unexpected token',
};

const fileWriteError: TokenError = {
  kind: 'file-write',
  path: 'tokens/colors.json',
  reason: 'Permission denied',
};

// ─── ErrorPanel: empty state ──────────────────────────────────────────────────

describe('ErrorPanel — empty state', () => {
  it('shows "No errors" when errors list is empty (Req 13.4)', () => {
    useTokenStore.setState({ errors: [] });
    render(<ErrorPanel />);
    expect(screen.getByTestId('error-panel-empty')).toBeInTheDocument();
    expect(screen.getByTestId('error-panel-empty').textContent).toBe('No errors');
  });

  it('does not render any error rows when there are no errors', () => {
    useTokenStore.setState({ errors: [] });
    render(<ErrorPanel />);
    expect(screen.queryAllByTestId('error-row')).toHaveLength(0);
  });
});

// ─── ErrorPanel: error rows render correct badges ─────────────────────────────

describe('ErrorPanel — error row badges (Req 13.2)', () => {
  it('renders a "validation" badge for validation errors', () => {
    useTokenStore.setState({ errors: [validationError] });
    render(<ErrorPanel />);
    const badges = screen.getAllByTestId('error-badge');
    expect(badges[0].textContent).toBe('validation');
  });

  it('renders an "unresolved" badge for unresolved-reference errors', () => {
    useTokenStore.setState({ errors: [unresolvedRefError] });
    render(<ErrorPanel />);
    const badges = screen.getAllByTestId('error-badge');
    expect(badges[0].textContent).toBe('unresolved');
  });

  it('renders a "cycle" badge for cycle errors', () => {
    useTokenStore.setState({ errors: [cycleError] });
    render(<ErrorPanel />);
    const badges = screen.getAllByTestId('error-badge');
    expect(badges[0].textContent).toBe('cycle');
  });

  it('renders a "parse" badge for parse errors', () => {
    useTokenStore.setState({ errors: [parseError] });
    render(<ErrorPanel />);
    const badges = screen.getAllByTestId('error-badge');
    expect(badges[0].textContent).toBe('parse');
  });

  it('renders a "file-write" badge for file-write errors', () => {
    useTokenStore.setState({ errors: [fileWriteError] });
    render(<ErrorPanel />);
    const badges = screen.getAllByTestId('error-badge');
    expect(badges[0].textContent).toBe('file-write');
  });

  it('renders one row per error (Req 13.1)', () => {
    useTokenStore.setState({
      errors: [validationError, unresolvedRefError, cycleError],
    });
    render(<ErrorPanel />);
    expect(screen.getAllByTestId('error-row')).toHaveLength(3);
  });
});

// ─── ErrorPanel: human-readable descriptions (Req 13.2) ──────────────────────

describe('ErrorPanel — human-readable descriptions', () => {
  it('shows the message for validation errors', () => {
    useTokenStore.setState({ errors: [validationError] });
    render(<ErrorPanel />);
    expect(screen.getByTestId('error-description').textContent).toBe(
      'Invalid hex color format',
    );
  });

  it('shows the referenced ID for unresolved-reference errors', () => {
    useTokenStore.setState({ errors: [unresolvedRefError] });
    render(<ErrorPanel />);
    expect(screen.getByTestId('error-description').textContent).toContain(
      'color.brand.nonexistent',
    );
  });

  it('shows the cycle chain for cycle errors', () => {
    useTokenStore.setState({ errors: [cycleError] });
    render(<ErrorPanel />);
    expect(screen.getByTestId('error-description').textContent).toContain('→');
    expect(screen.getByTestId('error-description').textContent).toContain('spacing.md');
  });

  it('shows the file path and message for parse errors', () => {
    useTokenStore.setState({ errors: [parseError] });
    render(<ErrorPanel />);
    expect(screen.getByTestId('error-description').textContent).toContain('tokens/colors.json');
    expect(screen.getByTestId('error-description').textContent).toContain('Unexpected token');
  });

  it('shows the reason for file-write errors', () => {
    useTokenStore.setState({ errors: [fileWriteError] });
    render(<ErrorPanel />);
    expect(screen.getByTestId('error-description').textContent).toContain('Permission denied');
  });
});

// ─── ErrorPanel: clicking dispatches selectToken (Req 13.3) ──────────────────

describe('ErrorPanel — clicking row selects token', () => {
  it('calls selectToken with tokenId for validation errors', () => {
    const selectToken = vi.fn();
    useTokenStore.setState({ errors: [validationError], selectToken });
    render(<ErrorPanel />);
    fireEvent.click(screen.getByTestId('error-row'));
    expect(selectToken).toHaveBeenCalledWith('color.brand.primary');
  });

  it('calls selectToken with tokenId for unresolved-reference errors', () => {
    const selectToken = vi.fn();
    useTokenStore.setState({ errors: [unresolvedRefError], selectToken });
    render(<ErrorPanel />);
    fireEvent.click(screen.getByTestId('error-row'));
    expect(selectToken).toHaveBeenCalledWith('color.semantic.text');
  });

  it('calls selectToken with first cycle participant for cycle errors', () => {
    const selectToken = vi.fn();
    useTokenStore.setState({ errors: [cycleError], selectToken });
    render(<ErrorPanel />);
    fireEvent.click(screen.getByTestId('error-row'));
    expect(selectToken).toHaveBeenCalledWith('spacing.md');
  });

  it('does not dispatch selectToken for parse errors (no tokenId)', () => {
    const selectToken = vi.fn();
    useTokenStore.setState({ errors: [parseError], selectToken });
    render(<ErrorPanel />);
    fireEvent.click(screen.getByTestId('error-row'));
    expect(selectToken).not.toHaveBeenCalled();
  });

  it('does not dispatch selectToken for file-write errors (no tokenId)', () => {
    const selectToken = vi.fn();
    useTokenStore.setState({ errors: [fileWriteError], selectToken });
    render(<ErrorPanel />);
    fireEvent.click(screen.getByTestId('error-row'));
    expect(selectToken).not.toHaveBeenCalled();
  });
});

// ─── ErrorPanel: collapsible panel (Req 13.1) ────────────────────────────────

describe('ErrorPanel — collapsible behavior', () => {
  it('is expanded by default and shows errors', () => {
    useTokenStore.setState({ errors: [validationError] });
    render(<ErrorPanel />);
    expect(screen.getByTestId('error-panel-body')).toBeInTheDocument();
  });

  it('hides the error list when toggled collapsed', () => {
    useTokenStore.setState({ errors: [validationError] });
    render(<ErrorPanel />);
    fireEvent.click(screen.getByTestId('error-panel-toggle'));
    expect(screen.queryByTestId('error-panel-body')).not.toBeInTheDocument();
  });

  it('shows the error count badge when collapsed with errors', () => {
    useTokenStore.setState({ errors: [validationError, unresolvedRefError] });
    render(<ErrorPanel />);
    fireEvent.click(screen.getByTestId('error-panel-toggle'));
    expect(screen.getByTestId('error-count-badge').textContent).toBe('2');
  });

  it('expands again after a second toggle', () => {
    useTokenStore.setState({ errors: [validationError] });
    render(<ErrorPanel />);
    const toggle = screen.getByTestId('error-panel-toggle');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByTestId('error-panel-body')).toBeInTheDocument();
  });
});

// ─── ErrorRow: standalone unit tests ─────────────────────────────────────────

describe('ErrorRow — standalone', () => {
  it('renders badge, token name, and description', () => {
    const onSelect = vi.fn();
    render(<ErrorRow error={validationError} onSelect={onSelect} />);
    expect(screen.getByTestId('error-badge').textContent).toBe('validation');
    expect(screen.getByTestId('error-token-name').textContent).toBe('color.brand.primary');
    expect(screen.getByTestId('error-description').textContent).toBe('Invalid hex color format');
  });

  it('calls onSelect with tokenId when clicked on selectable row', () => {
    const onSelect = vi.fn();
    render(<ErrorRow error={validationError} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('error-row'));
    expect(onSelect).toHaveBeenCalledWith('color.brand.primary');
  });

  it('does not call onSelect when clicked on non-selectable row (parse)', () => {
    const onSelect = vi.fn();
    render(<ErrorRow error={parseError} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('error-row'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
