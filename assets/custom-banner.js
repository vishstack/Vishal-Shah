/**
 * Gift Guide — <gift-topbar> custom element (sections/custom-banner.liquid)
 * ---------------------------------------------------------------------------
 * The mobile hamburger is a native <details> element, so open/close and
 * keyboard support work without JavaScript. This tiny element only adds the
 * niceties a disclosure lacks: close on ESC, close on outside click, and close
 * automatically when the viewport grows into the desktop layout.
 * Scoped to the element instance — no globals.
 */
(() => {
  if (customElements.get('gift-topbar')) return;

  const DESKTOP = window.matchMedia('(min-width: 768px)');

  class GiftTopbar extends HTMLElement {
    constructor() {
      super();
      this.onKeydown = this.onKeydown.bind(this);
      this.onDocumentClick = this.onDocumentClick.bind(this);
      this.close = this.close.bind(this);
    }

    connectedCallback() {
      this.nav = this.querySelector('.gg-topbar__nav');
      if (!this.nav) return;

      this.addEventListener('keydown', this.onKeydown);
      document.addEventListener('click', this.onDocumentClick);
      DESKTOP.addEventListener('change', this.close);
    }

    disconnectedCallback() {
      this.removeEventListener('keydown', this.onKeydown);
      document.removeEventListener('click', this.onDocumentClick);
      DESKTOP.removeEventListener('change', this.close);
    }

    /** ESC closes the panel and returns focus to the toggle. @param {KeyboardEvent} event */
    onKeydown(event) {
      if (event.key === 'Escape' && this.nav.open) {
        this.close();
        this.nav.querySelector('summary').focus();
      }
    }

    /** Click anywhere outside the disclosure closes it. @param {MouseEvent} event */
    onDocumentClick(event) {
      if (this.nav.open && !this.nav.contains(event.target)) this.close();
    }

    close() {
      this.nav.open = false;
    }
  }

  customElements.define('gift-topbar', GiftTopbar);
})();
