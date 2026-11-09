import type { UniversalTracker } from '../../engines/universal/UniversalTracker.js';

export interface InteractionCollectorOptions {
  readonly trackClicks?: boolean;
  readonly trackForms?: boolean;
}

export class InteractionCollector {
  private readonly tracker: UniversalTracker;
  private readonly options: InteractionCollectorOptions;
  private clickHandler?: (event: MouseEvent) => void;
  private submitHandler?: (event: SubmitEvent) => void;
  private installed = false;

  constructor(tracker: UniversalTracker, options?: InteractionCollectorOptions) {
    this.tracker = tracker;
    this.options = {
      trackClicks: options?.trackClicks ?? true,
      trackForms: options?.trackForms ?? true,
    };
  }

  /**
   * Install click and form submission listeners.
   */
  install(): void {
    if (this.installed) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.tracker.logger.warn('InteractionCollector requires a DOM environment');
      return;
    }

    this.installed = true;

    // 1. Click Listener
    if (this.options.trackClicks) {
      this.clickHandler = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;

        // Check if button, link, or explicitly marked for tracking
        const clickable = target.closest('button, a, [data-track], [role="button"]');
        if (!clickable) return;

        const el = clickable as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const id = el.id || undefined;
        const text = (el.textContent || '').trim().slice(0, 50);
        const trackAction = el.getAttribute('data-track') || `${tag}.click`;

        this.tracker.activities.track(trackAction, {
          category: 'interaction',
          metadata: {
            elementTag: tag,
            elementId: id,
            elementText: text,
            href: tag === 'a' ? (el as HTMLAnchorElement).href : undefined,
          },
        });
      };

      document.addEventListener('click', this.clickHandler, true);
    }

    // 2. Form Submit Listener
    if (this.options.trackForms) {
      this.submitHandler = (event: SubmitEvent) => {
        const form = event.target as HTMLFormElement | null;
        if (!form) return;

        const formId = form.id || form.name || 'unnamed-form';
        const action = form.action || undefined;

        this.tracker.activities.track('form.submit', {
          category: 'interaction',
          metadata: {
            formId,
            action,
            // SECURITY: Never automatically capture form field values!
          },
        });
      };

      document.addEventListener('submit', this.submitHandler, true);
    }

    this.tracker.logger.info('InteractionCollector installed');
  }

  /**
   * Uninstall interaction event listeners.
   */
  uninstall(): void {
    if (!this.installed || typeof document === 'undefined') return;

    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
      this.clickHandler = undefined;
    }

    if (this.submitHandler) {
      document.removeEventListener('submit', this.submitHandler, true);
      this.submitHandler = undefined;
    }

    this.installed = false;
    this.tracker.logger.info('InteractionCollector uninstalled');
  }
}
