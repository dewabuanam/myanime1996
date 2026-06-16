import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type VerticalPlacement = 'top' | 'bottom';
type HorizontalAlign = 'left' | 'center' | 'right';

type TooltipState = {
  visible: boolean;
  text: string;
  subText: string;
  placement: VerticalPlacement;
  align: HorizontalAlign;
  left: number;
  top: number;
  arrowX: number;
};

const VIEWPORT_MARGIN = 8;
const OFFSET = 10;
const EDGE_ARROW_OFFSET = 14;
const VIEWPORT_SIZE_TEXT_PATTERN = /^\d+\s*px\s*(?:x|×)\s*\d+\s*px$/i;

const initialState: TooltipState = {
  visible: false,
  text: '',
  subText: '',
  placement: 'top',
  align: 'center',
  left: 0,
  top: 0,
  arrowX: 20,
};

const getTooltipTarget = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof Element)) return null;
  const match = target.closest<HTMLElement>('[data-tooltip]');
  if (!match) return null;
  const tooltipText = match.getAttribute('data-tooltip')?.trim();
  if (!tooltipText || VIEWPORT_SIZE_TEXT_PATTERN.test(tooltipText)) return null;
  return match;
};

const getTooltipSubText = (target: HTMLElement) => target.getAttribute('data-tooltip-sub')?.trim() ?? '';

export default function GlobalTooltip() {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<TooltipState>(initialState);

  const updatePosition = () => {
    const target = activeTargetRef.current;
    const tooltip = tooltipRef.current;
    if (!target || !tooltip) return;

    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    const preferredPlacement: VerticalPlacement = target.classList.contains('tooltip-down') ? 'bottom' : 'top';
    const align: HorizontalAlign = target.classList.contains('tooltip-left')
      ? 'right'
      : target.classList.contains('tooltip-right')
        ? 'left'
        : 'center';

    let placement = preferredPlacement;
    let top =
      placement === 'top'
        ? rect.top - tooltipRect.height - OFFSET
        : rect.bottom + OFFSET;

    if (placement === 'top' && top < VIEWPORT_MARGIN) {
      placement = 'bottom';
      top = rect.bottom + OFFSET;
    } else if (placement === 'bottom' && top + tooltipRect.height > window.innerHeight - VIEWPORT_MARGIN) {
      placement = 'top';
      top = rect.top - tooltipRect.height - OFFSET;
    }

    let left = 0;
    if (align === 'left') {
      left = rect.left;
    } else if (align === 'right') {
      left = rect.right - tooltipRect.width;
    } else {
      left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    }

    left = Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN);
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN);

    const targetCenterX = rect.left + rect.width / 2;
    const arrowX = Math.min(
      Math.max(targetCenterX - left, EDGE_ARROW_OFFSET),
      tooltipRect.width - EDGE_ARROW_OFFSET,
    );

    setState((prev) => ({
      ...prev,
      placement,
      align,
      left,
      top,
      arrowX,
    }));
  };

  const showTooltip = (target: HTMLElement) => {
    activeTargetRef.current = target;
    setState((prev) => ({
      ...prev,
      visible: true,
      text: target.getAttribute('data-tooltip') ?? '',
      subText: getTooltipSubText(target),
    }));
  };

  const hideTooltip = () => {
    activeTargetRef.current = null;
    setState((prev) => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    const handlePointerOver = (event: PointerEvent) => {
      const target = getTooltipTarget(event.target);
      if (!target) return;
      if (activeTargetRef.current === target) return;
      showTooltip(target);
    };

    const handlePointerOut = (event: PointerEvent) => {
      const current = activeTargetRef.current;
      if (!current) return;
      const related = event.relatedTarget;
      if (related instanceof Node && current.contains(related)) return;
      hideTooltip();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = getTooltipTarget(event.target);
      if (!target) return;
      showTooltip(target);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const current = activeTargetRef.current;
      if (!current) return;
      const related = event.relatedTarget;
      if (related instanceof Node && current.contains(related)) return;
      hideTooltip();
    };

    const handleScrollOrResize = () => {
      if (!activeTargetRef.current) return;
      updatePosition();
    };

    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, []);

  useLayoutEffect(() => {
    if (!state.visible) return;
    updatePosition();
  }, [state.visible, state.text, state.subText]);

  useEffect(() => {
    if (!state.visible) return;
    const target = activeTargetRef.current;
    if (!target) return;

    const syncTooltipText = () => {
      const nextText = target.getAttribute('data-tooltip')?.trim() ?? '';
      if (!nextText || VIEWPORT_SIZE_TEXT_PATTERN.test(nextText)) {
        hideTooltip();
        return;
      }
      const nextSubText = getTooltipSubText(target);
      setState((prev) => {
        if (prev.text === nextText && prev.subText === nextSubText) return prev;
        return {
          ...prev,
          text: nextText,
          subText: nextSubText,
        };
      });
    };

    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.type === 'attributes')) return;
      syncTooltipText();
    });

    observer.observe(target, {
      attributes: true,
      attributeFilter: ['data-tooltip', 'data-tooltip-sub'],
    });

    return () => {
      observer.disconnect();
    };
  }, [state.visible]);

  if (!state.visible || !state.text) return null;

  return (
    <div
      ref={tooltipRef}
      className="global-retro-tooltip"
      data-placement={state.placement}
      data-align={state.align}
      style={{
        left: `${state.left}px`,
        top: `${state.top}px`,
        ['--tooltip-arrow-x' as string]: `${state.arrowX}px`,
      }}
      role="tooltip"
      aria-hidden="true"
    >
      <span className="global-retro-tooltip-main">{state.text}</span>
      {state.subText ? <span className="global-retro-tooltip-sub">{state.subText}</span> : null}
    </div>
  );
}
