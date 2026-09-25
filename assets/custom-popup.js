/**
 * Gift Guide — <product-popup> custom element
 * ---------------------------------------------------------------------------
 * Wraps the product grid section (sections/custom-product-grid.liquid) and owns
 * the single quick-view dialog rendered by snippets/product-popup.liquid.
 *
 * Responsibilities
 *  - open the dialog for the clicked hotspot and populate it with product data
 *  - render variant options dynamically (any number of options / values)
 *  - keep the selected variant, price, image and button state in sync
 *  - add to cart via fetch POST /cart/add.js (+ the upsell business rule)
 *  - update Dawn's header cart-count bubble via the Section Rendering API
 *  - accessibility: focus management, focus trap, ESC / overlay close, scroll lock
 *
 * Product data strategy — fetch `/products/{handle}.js` on first click
 *  Chosen over embedding `{{ product | json }}` per block because:
 *   1. the HTML stays small (6 embedded products with images/variants/description
 *      can easily be 50–100 KB of inline JSON that most visitors never use);
 *   2. inventory / availability is read at click time instead of page-render
 *      time (cached pages would otherwise show stale "Sold out" states);
 *   3. responses are cached in memory (`productCache`) so every product is
 *      fetched at most once per page view — no repeated requests.
 *
 * Cart bubble strategy — Section Rendering API (`sections` param on /cart/add.js)
 *  The add request itself returns the freshly rendered `cart-icon-bubble`
 *  section, so the bubble is updated with Dawn's own markup and no second
 *  request (`/cart.js`) is needed.
 *
 * No globals: everything lives inside this IIFE; the only shared state is the
 * module-level product cache.
 */
(() => {
  if (customElements.get('product-popup')) return;

  /** @type {Map<string, Promise<object>>} handle → product JSON promise */
  const productCache = new Map();

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /** Option names rendered as pills with a colour strip; everything else is a <select>. */
  const COLOR_OPTION = /^colou?r$/i;

  class ProductPopup extends HTMLElement {
    constructor() {
      super();

      /** @type {object|null} product JSON currently shown */
      this.product = null;
      /** @type {Array<string|null>} chosen value per option index (null = not chosen yet) */
      this.selection = [];
      /** @type {object|null} variant matching the full selection */
      this.selectedVariant = null;
      /** @type {HTMLElement|null} hotspot that opened the dialog (focus returns here) */
      this.trigger = null;

      this.onClick = this.onClick.bind(this);
      this.onKeydown = this.onKeydown.bind(this);
      this.onOptionChange = this.onOptionChange.bind(this);
      this.addToCart = this.addToCart.bind(this);
    }

    connectedCallback() {
      const q = (selector) => this.querySelector(selector);

      this.popup = q('[data-popup]');
      this.dialog = q('[role="dialog"]');
      this.refs = {
        overlay: q('[data-overlay]'),
        image: q('[data-image]'),
        title: q('[data-title]'),
        price: q('[data-price]'),
        description: q('[data-description]'),
        options: q('[data-options]'),
        add: q('[data-add]'),
        addLabel: q('[data-add-label]'),
        feedback: q('[data-feedback]'),
      };

      this.text = {
        add: this.dataset.textAdd,
        soldOut: this.dataset.textSoldOut,
        unavailable: this.dataset.textUnavailable,
        adding: this.dataset.textAdding,
        addedOne: this.dataset.textAddedOne,
        addedOther: this.dataset.textAddedOther,
        viewCart: this.dataset.textViewCart,
        error: this.dataset.textError,
        choose: this.dataset.textChoose,
        loadError: this.dataset.textLoadError,
      };

      // Event delegation: one click listener for hotspots, close button and overlay.
      this.addEventListener('click', this.onClick);
      this.popup.addEventListener('keydown', this.onKeydown);
      this.refs.options.addEventListener('change', this.onOptionChange);
      this.refs.add.addEventListener('click', this.addToCart);
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
      this.popup.removeEventListener('keydown', this.onKeydown);
      this.refs.options.removeEventListener('change', this.onOptionChange);
      this.refs.add.removeEventListener('click', this.addToCart);
      document.body.classList.remove('gg-popup-open');
    }

    /* ------------------------------------------------------------------ */
    /* Events                                                              */
    /* ------------------------------------------------------------------ */

    /** @param {MouseEvent} event */
    onClick(event) {
      const hotspot = event.target.closest('.gg-hotspot');
      if (hotspot) {
        this.open(hotspot);
        return;
      }
      if (event.target.closest('[data-close]') || event.target === this.refs.overlay) {
        this.close();
      }
    }

    /** ESC closes; Tab is trapped inside the dialog. @param {KeyboardEvent} event */
    onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = [...this.dialog.querySelectorAll(FOCUSABLE)];
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === this.dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    /** A pill or select changed → store the value and refresh the variant state. @param {Event} event */
    onOptionChange(event) {
      const field = event.target;
      const index = Number(field.dataset.optionIndex);
      if (Number.isNaN(index)) return;

      this.selection[index] = field.value === '' ? null : field.value;
      this.updateSelectedVariant();
    }

    /* ------------------------------------------------------------------ */
    /* Open / close                                                        */
    /* ------------------------------------------------------------------ */

    /**
     * Load the product behind the hotspot, populate and show the dialog.
     * @param {HTMLButtonElement} trigger hotspot button (data-product-handle)
     */
    async open(trigger) {
      const handle = trigger.dataset.productHandle;
      if (!handle || trigger.getAttribute('aria-busy') === 'true') return;

      this.trigger = trigger;
      trigger.setAttribute('aria-busy', 'true');

      try {
        const product = await this.loadProduct(handle);
        this.renderProduct(product);
      } catch (error) {
        // Still open so the user gets feedback instead of a dead click.
        this.renderError();
      } finally {
        trigger.removeAttribute('aria-busy');
      }

      this.popup.hidden = false;
      document.body.classList.add('gg-popup-open');
      this.dialog.scrollTop = 0;
      // Focus the dialog container first so screen readers announce it, then the close button.
      this.dialog.focus();
      this.querySelector('[data-close]').focus();
    }

    /** Hide the dialog, unlock scrolling and return focus to the hotspot. */
    close() {
      if (this.popup.hidden) return;

      this.popup.hidden = true;
      document.body.classList.remove('gg-popup-open');
      this.setFeedback('');

      if (this.trigger) {
        this.trigger.focus();
        this.trigger = null;
      }
    }

    /* ------------------------------------------------------------------ */
    /* Data                                                                */
    /* ------------------------------------------------------------------ */

    /**
     * Fetch `/products/{handle}.js` once and cache the promise.
     * @param {string} handle
     * @returns {Promise<object>} Shopify product JSON
     */
    loadProduct(handle) {
      if (!productCache.has(handle)) {
        const request = fetch(`/products/${encodeURIComponent(handle)}.js`, {
          headers: { Accept: 'application/json' },
        }).then((response) => {
          if (!response.ok) throw new Error(`Product ${handle} returned ${response.status}`);
          return response.json();
        });

        // Drop failed requests from the cache so a retry is possible.
        request.catch(() => productCache.delete(handle));
        productCache.set(handle, request);
      }
      return productCache.get(handle);
    }

    /* ------------------------------------------------------------------ */
    /* Rendering                                                           */
    /* ------------------------------------------------------------------ */

    /** Fill the static shell with a product and build its option controls. @param {object} product */
    renderProduct(product) {
      this.product = product;
      this.setFeedback('');

      this.refs.title.textContent = product.title;
      // `description` from the .js endpoint is the merchant's rich text (HTML).
      this.refs.description.innerHTML = product.description || '';
      this.setImage(product.featured_image, product.title);

      this.renderVariants();
      this.updateSelectedVariant();
    }

    /** Shown when the product JSON could not be fetched. */
    renderError() {
      this.product = null;
      this.selectedVariant = null;
      this.refs.title.textContent = '';
      this.refs.description.textContent = '';
      this.refs.price.textContent = '';
      this.refs.options.innerHTML = '';
      this.setImage(null, '');
      this.setAddState({ disabled: true, label: this.text.unavailable });
      this.setFeedback(this.text.loadError, true);
    }

    /**
     * Build one control per product option from the product JSON.
     *  - "Color"/"Colour" → radio pills with a swatch strip (first available value preselected)
     *  - any other option → <select> with a "Choose your {option}" placeholder
     * Products with the single "Default Title" option render no controls.
     */
    renderVariants() {
      const { product } = this;
      const container = this.refs.options;
      container.innerHTML = '';

      const isDefaultOnly =
        product.options.length === 1 && product.variants.length === 1 && product.variants[0].title === 'Default Title';

      this.selection = product.options.map(() => null);
      if (isDefaultOnly) return;

      const firstAvailable = product.variants.find((variant) => variant.available) || product.variants[0];
      const fragment = document.createDocumentFragment();

      product.options.forEach((option, index) => {
        const isColor = COLOR_OPTION.test(option.name);
        const group = document.createElement(isColor ? 'fieldset' : 'div');
        group.className = 'gg-popup__group';

        const label = document.createElement(isColor ? 'legend' : 'label');
        label.className = 'gg-popup__label';
        label.textContent = option.name;
        group.appendChild(label);

        if (isColor) {
          // Preselect the first available variant's colour so the price shows immediately.
          this.selection[index] = firstAvailable.options[index];
          group.appendChild(this.buildPills(option, index));
        } else {
          const selectId = `gg-popup-option-${this.dataset.sectionId}-${index}`;
          label.setAttribute('for', selectId);
          group.appendChild(this.buildSelect(option, index, selectId));
        }

        fragment.appendChild(group);
      });

      container.appendChild(fragment);
    }

    /** Radio pills for a colour-type option. @returns {HTMLElement} */
    buildPills(option, index) {
      const list = document.createElement('div');
      list.className = 'gg-popup__pills';
      const name = `gg-popup-option-${this.dataset.sectionId}-${index}`;

      option.values.forEach((value, valueIndex) => {
        const id = `${name}-${valueIndex}`;
        const pill = document.createElement('div');
        pill.className = 'gg-popup__pill';
        pill.dataset.value = value;

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.id = id;
        input.value = value;
        input.dataset.optionIndex = String(index);
        input.checked = this.selection[index] === value;

        const label = document.createElement('label');
        label.className = 'gg-popup__pill-label';
        label.htmlFor = id;
        label.textContent = value;
        // CSS colour keyword from the value ("Blue", "Red"…); unknown names fall back to transparent.
        label.style.setProperty('--gg-swatch', value.toLowerCase().replace(/\s+/g, ''));

        pill.append(input, label);
        list.appendChild(pill);
      });

      return list;
    }

    /** Select element for a non-colour option with a placeholder. @returns {HTMLElement} */
    buildSelect(option, index, id) {
      const wrap = document.createElement('div');
      wrap.className = 'gg-popup__select-wrap';

      const select = document.createElement('select');
      select.className = 'gg-popup__select';
      select.id = id;
      select.dataset.optionIndex = String(index);

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = this.text.choose.replace('[option]', option.name.toLowerCase());
      placeholder.selected = true;
      select.appendChild(placeholder);

      option.values.forEach((value) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        select.appendChild(opt);
      });

      wrap.appendChild(select);
      return wrap;
    }

    /**
     * Resolve the variant for the current selection, then sync price, image,
     * availability indicators and the add-to-cart button.
     */
    updateSelectedVariant() {
      const { product, selection } = this;
      if (!product) return;

      const complete = selection.every((value) => value !== null);
      this.selectedVariant = complete ? this.findVariant(selection) : null;

      // Price: selected variant, otherwise the product's lowest price.
      const price = this.selectedVariant ? this.selectedVariant.price : product.price;
      this.refs.price.textContent = this.formatMoney(price);

      // Variant image when it has one.
      if (this.selectedVariant && this.selectedVariant.featured_image) {
        this.setImage(this.selectedVariant.featured_image.src, product.title);
      }

      this.markAvailability();

      if (!this.selectedVariant) {
        // Either options are still incomplete (button stays clickable and prompts
        // the user on click) or the combination does not exist at all.
        this.setAddState({ disabled: complete, label: complete ? this.text.unavailable : this.text.add });
      } else if (!this.selectedVariant.available) {
        this.setAddState({ disabled: true, label: this.text.soldOut });
      } else {
        this.setAddState({ disabled: false, label: this.text.add });
      }
    }

    /**
     * Flag values that cannot be bought given the OTHER chosen values:
     * a value is "unavailable" when no available variant contains it together
     * with the rest of the current selection. Controls stay selectable so the
     * button can show "Sold out" for that exact combination.
     */
    markAvailability() {
      const { product, selection } = this;

      const isValueAvailable = (index, value) =>
        product.variants.some(
          (variant) =>
            variant.available &&
            variant.options[index] === value &&
            variant.options.every((opt, i) => i === index || selection[i] === null || opt === selection[i])
        );

      this.refs.options.querySelectorAll('.gg-popup__pill').forEach((pill) => {
        const index = Number(pill.querySelector('input').dataset.optionIndex);
        pill.classList.toggle('gg-popup__pill--unavailable', !isValueAvailable(index, pill.dataset.value));
      });

      this.refs.options.querySelectorAll('.gg-popup__select').forEach((select) => {
        const index = Number(select.dataset.optionIndex);
        [...select.options].forEach((opt) => {
          if (opt.value === '') return;
          const available = isValueAvailable(index, opt.value);
          opt.classList.toggle('gg-popup__option--unavailable', !available);
          opt.textContent = available ? opt.value : `${opt.value} — ${this.text.soldOut}`;
        });
      });
    }

    /** @param {Array<string>} selection @returns {object|undefined} */
    findVariant(selection) {
      return this.product.variants.find((variant) => variant.options.every((value, i) => value === selection[i]));
    }

    /* ------------------------------------------------------------------ */
    /* Cart                                                                */
    /* ------------------------------------------------------------------ */

    /**
     * Business rule: when the variant's option values include BOTH "Black" and
     * "Medium" (case-insensitive, regardless of option name/order) the upsell
     * product configured in the section (Soft Winter Jacket) is added as well —
     * unless the product being added IS the upsell product.
     * @param {object} variant
     * @param {object} product
     * @returns {boolean}
     */
    shouldAddUpsell(variant, product) {
      const { upsellHandle, upsellId } = this.dataset;
      if (!upsellHandle || !upsellId) return false;
      if (String(product.id) === String(upsellId)) return false;

      const values = variant.options.map((value) => String(value).trim().toLowerCase());
      return values.includes('black') && values.includes('medium');
    }

    /**
     * Resolve the upsell line item from live product data.
     * @returns {Promise<{id:number, quantity:number}|null>} null when unset / sold out / unreachable
     */
    async getUpsellItem() {
      try {
        const upsell = await this.loadProduct(this.dataset.upsellHandle);
        const variant = upsell.variants.find((v) => v.available);
        return variant ? { id: variant.id, quantity: 1 } : null;
      } catch (error) {
        return null;
      }
    }

    /**
     * POST the selected variant (plus the upsell when the rule applies) to
     * /cart/add.js in ONE request, then refresh the header cart bubble.
     */
    async addToCart() {
      const { product, selectedVariant, selection } = this;
      if (!product) return;

      // Incomplete selection → prompt and focus the first empty control.
      const missingIndex = selection.findIndex((value) => value === null);
      if (missingIndex !== -1) {
        const optionName = product.options[missingIndex].name.toLowerCase();
        this.setFeedback(this.text.choose.replace('[option]', optionName), true);
        const control = this.refs.options.querySelector(`[data-option-index="${missingIndex}"]`);
        if (control) control.focus();
        return;
      }
      if (!selectedVariant || !selectedVariant.available) return;

      this.setLoading(true);
      this.setFeedback('');

      let items = [{ id: selectedVariant.id, quantity: 1 }];
      let upsellItem = null;

      if (this.shouldAddUpsell(selectedVariant, product)) {
        upsellItem = await this.getUpsellItem();
        if (upsellItem) items.push(upsellItem);
      }

      try {
        let response = await this.postCart(items);

        // Whole request is rejected if ANY line fails (e.g. upsell went out of
        // stock a moment ago) → retry with the main product only.
        if (!response.ok && upsellItem) {
          items = [items[0]];
          response = await this.postCart(items);
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.description || data.message || 'Cart error');

        this.updateCartBubble(data);

        const count = items.length;
        const added = (count === 1 ? this.text.addedOne : this.text.addedOther).replace('[quantity]', String(count));
        this.setFeedback(`${added} · <a href="${this.dataset.cartUrl}">${this.text.viewCart}</a>`, false, true);
      } catch (error) {
        this.setFeedback(this.text.error, true);
      } finally {
        this.setLoading(false);
      }
    }

    /**
     * Single POST to /cart/add.js. `sections` asks Shopify to render the header
     * bubble section in the same response (Section Rendering API).
     * @param {Array<{id:number, quantity:number}>} items
     * @returns {Promise<Response>}
     */
    postCart(items) {
      return fetch(this.dataset.cartAddUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items,
          sections: 'cart-icon-bubble',
          sections_url: window.location.pathname,
        }),
      });
    }

    /**
     * Replace Dawn's `#cart-icon-bubble` contents with the freshly rendered
     * section returned by /cart/add.js, and notify Dawn's pub/sub (if present)
     * so the cart drawer / notification stay in sync. Guarded: nothing here
     * assumes the header exists (it is hidden on the gift-guide template).
     * @param {object} data /cart/add.js response
     */
    updateCartBubble(data) {
      const html = data.sections && data.sections['cart-icon-bubble'];
      const bubble = document.getElementById('cart-icon-bubble');

      if (html && bubble) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const section = doc.querySelector('.shopify-section') || doc.body;
        bubble.innerHTML = section.innerHTML;
      }

      // Dawn declares these with top-level `function` / `const` (global lexical
      // scope, not window properties) → probe with typeof, never assume.
      /* global publish, PUB_SUB_EVENTS */
      if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'product-popup', cartData: data });
      }
    }

    /* ------------------------------------------------------------------ */
    /* Small UI helpers                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * Format cents with the store's `shop.money_format` (e.g. "€{{amount}}",
     * "{{amount_with_comma_separator}} €") so prices match the rest of the
     * storefront without depending on Dawn's global `Shopify.formatMoney`.
     * @param {number} cents
     * @returns {string}
     */
    formatMoney(cents) {
      const format = this.dataset.moneyFormat || '{{amount}}';
      const match = format.match(/\{\{\s*(\w+)\s*\}\}/);
      const key = match ? match[1] : 'amount';
      const value = cents / 100;

      const render = (decimals, thousands, decimal) => {
        const [whole, fraction] = value.toFixed(decimals).split('.');
        const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
        return fraction ? `${grouped}${decimal}${fraction}` : grouped;
      };

      const amounts = {
        amount: () => render(2, ',', '.'),
        amount_no_decimals: () => render(0, ',', '.'),
        amount_with_comma_separator: () => render(2, '.', ','),
        amount_no_decimals_with_comma_separator: () => render(0, '.', ','),
        amount_with_space_separator: () => render(2, ' ', ','),
        amount_no_decimals_with_space_separator: () => render(0, ' ', ','),
        amount_with_apostrophe_separator: () => render(2, "'", '.'),
      };

      const amount = (amounts[key] || amounts.amount)();
      return format.replace(/\{\{\s*\w+\s*\}\}/, amount).replace(/<[^>]+>/g, '');
    }

    /** @param {string|null} src @param {string} alt */
    setImage(src, alt) {
      const { image } = this.refs;
      if (src) {
        image.src = src;
        image.alt = alt;
        image.hidden = false;
      } else {
        image.removeAttribute('src');
        image.alt = '';
        image.hidden = true;
      }
    }

    /** @param {{disabled:boolean, label:string}} state */
    setAddState({ disabled, label }) {
      this.refs.add.disabled = disabled;
      this.refs.addLabel.textContent = label;
    }

    /** Loading state during the cart request. @param {boolean} loading */
    setLoading(loading) {
      const { add, addLabel } = this.refs;
      add.setAttribute('aria-busy', String(loading));
      add.disabled = loading;
      if (loading) {
        this.previousLabel = addLabel.textContent;
        addLabel.textContent = this.text.adding;
      } else {
        addLabel.textContent = this.previousLabel || this.text.add;
      }
    }

    /**
     * @param {string} message
     * @param {boolean} [isError=false]
     * @param {boolean} [isHtml=false] only for trusted, self-built markup
     */
    setFeedback(message, isError = false, isHtml = false) {
      const { feedback } = this.refs;
      feedback.classList.toggle('gg-popup__feedback--error', isError);
      if (isHtml) {
        feedback.innerHTML = message;
      } else {
        feedback.textContent = message;
      }
    }
  }

  customElements.define('product-popup', ProductPopup);
})();
