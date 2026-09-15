(function () {
  'use strict';

  if (window.EyequipmentRuntime?.version) return;

  const mutationSubscribers = new Map();
  const scheduledJobs = new Map();
  const frameTasks = new Map();
  const resizeCallbacks = new WeakMap();
  const intersectionGroups = new Map();

  let mutationObserver = null;
  let resizeObserver = null;
  let frameRequest = 0;
  let lastFrameTime = 0;
  let subscriberId = 0;
  const diagnostics = {
    startedAt: Date.now(),
    frames: 0,
    scheduledJobs: 0,
    mutationBatches: 0,
    mutationRecords: 0,
    errors: 0
  };

  function reportError(area, error) {
    diagnostics.errors += 1;
    console.error(`[Eyequipment Runtime] Fehler in ${area}:`, error);
  }

  function nextId(prefix) {
    subscriberId += 1;
    return `${prefix}-${subscriberId}`;
  }

  function whenReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function startMutationObserver() {
    if (mutationObserver || !document.body) return;

    mutationObserver = new MutationObserver(function (mutations) {
      diagnostics.mutationBatches += 1;
      diagnostics.mutationRecords += mutations.length;

      mutationSubscribers.forEach(function (subscriber, key) {
        const filtered = filterMutations(mutations, subscriber.options);
        if (!filtered.length) return;
        try {
          subscriber.callback(filtered);
        } catch (error) {
          reportError(`Mutation-Subscriber „${key}“`, error);
        }
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: false
    });
  }

  function filterMutations(mutations, options) {
    if (!options) return mutations;
    const root = options.root;
    const attributes = Array.isArray(options.attributes)
      ? new Set(options.attributes)
      : null;

    return mutations.filter(function (mutation) {
      if (
        root instanceof Element &&
        mutation.target !== root &&
        !root.contains(mutation.target)
      ) return false;
      if (mutation.type === 'attributes') {
        if (options.attributes === false) return false;
        if (attributes && !attributes.has(mutation.attributeName)) return false;
      }
      if (mutation.type === 'childList' && options.childList === false) return false;
      return mutation.type !== 'characterData';
    });
  }

  function observeMutations(key, callback, options) {
    if (typeof key === 'function') {
      callback = key;
      key = nextId('mutation');
    }

    if (typeof callback !== 'function') return function () {};

    mutationSubscribers.set(key, { callback, options: options || null });
    whenReady(startMutationObserver);

    return function () {
      mutationSubscribers.delete(key);
    };
  }

  function schedule(key, callback) {
    if (typeof key === 'function') {
      callback = key;
      key = nextId('job');
    }

    if (typeof callback !== 'function') return;
    scheduledJobs.set(key, callback);
    diagnostics.scheduledJobs += 1;
    requestNextFrame();
  }

  function requestNextFrame() {
    if (frameRequest) return;
    frameRequest = requestAnimationFrame(runFrame);
  }

  function runFrame(time) {
    frameRequest = 0;
    diagnostics.frames += 1;

    const jobs = Array.from(scheduledJobs.entries());
    scheduledJobs.clear();

    jobs.forEach(function (entry) {
      try {
        entry[1](time);
      } catch (error) {
        reportError(`Frame-Job „${entry[0]}“`, error);
      }
    });

    let hasActiveTasks = false;
    frameTasks.forEach(function (task, key) {
      if (!task.active) return;
      hasActiveTasks = true;
      const interval = task.fps > 0 ? 1000 / task.fps : 0;
      if (interval && task.lastRun && time - task.lastRun < interval) return;
      const delta = task.lastRun ? Math.min(100, time - task.lastRun) : 16.67;
      task.lastRun = time;
      try {
        task.callback(time, delta);
      } catch (error) {
        reportError(`Animation „${key}“`, error);
      }
    });

    lastFrameTime = hasActiveTasks ? time : 0;
    if (hasActiveTasks || scheduledJobs.size) requestNextFrame();
  }

  function addFrameTask(key, callback, options) {
    if (typeof key === 'function') {
      callback = key;
      key = nextId('animation');
    }

    if (typeof callback !== 'function') return function () {};

    const settings = options || {};
    const task = {
      callback,
      active: settings.active !== false,
      fps: Math.max(0, Number(settings.fps) || 0),
      lastRun: 0
    };
    frameTasks.set(key, task);
    if (task.active) requestNextFrame();

    function remove() {
      frameTasks.delete(key);
    }
    remove.pause = function () {
      task.active = false;
      task.lastRun = 0;
    };
    remove.resume = function () {
      if (!frameTasks.has(key)) return;
      task.active = true;
      task.lastRun = 0;
      requestNextFrame();
    };
    remove.setFps = function (fps) {
      task.fps = Math.max(0, Number(fps) || 0);
      task.lastRun = 0;
    };
    remove.isActive = function () { return task.active; };
    return remove;
  }

  function getDiagnostics() {
    let activeFrameTasks = 0;
    frameTasks.forEach(function (task) {
      if (task.active) activeFrameTasks += 1;
    });
    return {
      version: '1.2.0',
      uptimeMs: Date.now() - diagnostics.startedAt,
      mutationSubscribers: mutationSubscribers.size,
      resizeObserverActive: Boolean(resizeObserver),
      intersectionGroups: intersectionGroups.size,
      frameTasks: frameTasks.size,
      activeFrameTasks,
      pendingJobs: scheduledJobs.size,
      frames: diagnostics.frames,
      scheduledJobsTotal: diagnostics.scheduledJobs,
      mutationBatches: diagnostics.mutationBatches,
      mutationRecords: diagnostics.mutationRecords,
      errors: diagnostics.errors
    };
  }

  function getResizeObserver() {
    if (resizeObserver || !('ResizeObserver' in window)) return resizeObserver;

    resizeObserver = new ResizeObserver(function (entries) {
      entries.forEach(function (entry) {
        const callbacks = resizeCallbacks.get(entry.target);
        if (!callbacks) return;

        callbacks.forEach(function (callback) {
          try {
            callback(entry);
          } catch (error) {
            reportError('Resize-Subscriber', error);
          }
        });
      });
    });

    return resizeObserver;
  }

  function observeResize(element, callback) {
    if (!(element instanceof Element) || typeof callback !== 'function') {
      return function () {};
    }

    const observer = getResizeObserver();
    if (!observer) return function () {};

    let callbacks = resizeCallbacks.get(element);
    if (!callbacks) {
      callbacks = new Set();
      resizeCallbacks.set(element, callbacks);
      observer.observe(element);
    }

    callbacks.add(callback);

    return function () {
      const currentCallbacks = resizeCallbacks.get(element);
      if (!currentCallbacks) return;

      currentCallbacks.delete(callback);
      if (currentCallbacks.size) return;

      observer.unobserve(element);
      resizeCallbacks.delete(element);
    };
  }

  function intersectionKey(options) {
    const threshold = Array.isArray(options.threshold)
      ? options.threshold.join(',')
      : String(options.threshold ?? 0);

    return `${options.rootMargin || '0px'}|${threshold}`;
  }

  function getIntersectionGroup(options) {
    if (!('IntersectionObserver' in window)) return null;

    const normalizedOptions = {
      root: options.root || null,
      rootMargin: options.rootMargin || '0px',
      threshold: options.threshold ?? 0
    };

    /* Unterschiedliche root-Elemente dürfen nie denselben Observer teilen. */
    if (normalizedOptions.root) return null;

    const key = intersectionKey(normalizedOptions);
    if (intersectionGroups.has(key)) return intersectionGroups.get(key);

    const callbacks = new WeakMap();
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        const elementCallbacks = callbacks.get(entry.target);
        if (!elementCallbacks) return;

        elementCallbacks.forEach(function (callback) {
          try {
            callback(entry);
          } catch (error) {
            reportError('Intersection-Subscriber', error);
          }
        });
      });
    }, normalizedOptions);

    const group = { observer, callbacks };
    intersectionGroups.set(key, group);
    return group;
  }

  function observeIntersection(element, callback, options) {
    if (!(element instanceof Element) || typeof callback !== 'function') {
      return function () {};
    }

    const settings = options || {};
    const group = getIntersectionGroup(settings);

    if (!group) {
      const individualObserver = new IntersectionObserver(function (entries) {
        entries.forEach(callback);
      }, settings);
      individualObserver.observe(element);
      return function () { individualObserver.disconnect(); };
    }

    let callbacks = group.callbacks.get(element);
    if (!callbacks) {
      callbacks = new Set();
      group.callbacks.set(element, callbacks);
      group.observer.observe(element);
    }

    callbacks.add(callback);

    return function () {
      const currentCallbacks = group.callbacks.get(element);
      if (!currentCallbacks) return;

      currentCallbacks.delete(callback);
      if (currentCallbacks.size) return;

      group.observer.unobserve(element);
      group.callbacks.delete(element);
    };
  }

  window.EyequipmentRuntime = Object.freeze({
    version: '1.2.0',
    whenReady,
    observeMutations,
    observeResize,
    observeIntersection,
    schedule,
    addFrameTask,
    getDiagnostics
  });
})();
(() => {
  if (window.EyequipmentNativeB2B?.initialized) return;

  const Runtime = window.EyequipmentRuntime;
  if (!Runtime) {
    console.warn('[Eyequipment B2B] Zentrale Runtime wurde nicht geladen.');
    return;
  }

  const API_VERSION = '2026-07';
  const B2B_MINIMUM_ORDER = 100;
  const TOKEN_KEYS = ['_sf-customer-token', '_sf_customer_token', '_sf_oauth_tokens', '_sf-oauth-tokens'];
  const CACHE_KEY = '_eyequipment_b2b_cache';
  
  const modules = new Map();
  const contextualizedCarts = new Set();
  const variantRules = new Map();
  const originalTaxText = new WeakMap();
  const priceProbeQueue = new Map();
  let capturedCustomerToken = '';
  let exchangedCustomerToken = '';
  let exchangedCustomerTokenSource = '';
  let exchangedCustomerTokenPromise = null;
  let priceProbeTimer = null;
  let cartContextQueue = Promise.resolve();
  const LOCATION_KEY = '_eyequipment_b2b_location';

  function getCachedB2BState() {
    try {
      const stored = sessionStorage.getItem(CACHE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  function setCachedB2BState(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {}
  }

  function clearCachedB2BState() {
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {}
  }

  const state = {
    initialized: true,
    registered: false,
    isB2B: false,
    companyLocationId: null,
    companyName: '',
    statusPromise: null,
    locations: [],
    customerId: null,
    switching: false,
    cartContextError: false,
    statusError: false,
  };

  window.EyequipmentNativeB2B = state;

  const pendingStyle = document.createElement('style');
  pendingStyle.id = 'eyequipment-native-b2b-pending';
  pendingStyle.textContent = `
    html.native-b2b-pending [sf-show-price],
    html.native-b2b-pending [sf-show-compare-price],
    html.native-b2b-pending [sf-cart-subtotal],
    html.native-b2b-pending [sf-cart-total] {
      visibility: hidden !important;
    }
    .native-b2b-quantity-rule {
      display: block;
      margin-top: .35rem;
      font-size: .75rem;
      font-weight: 600;
      line-height: 1.25;
      opacity: .85;
    }
    .native-b2b-cart-quantity-rule {
      display: block;
      width: fit-content;
      margin-top: .35rem;
      padding: .25rem .55rem;
      border: 1px solid currentColor;
      border-radius: 999px;
      font-size: .72rem;
      line-height: 1.2;
    }
  `;
  document.head.appendChild(pendingStyle);

  // ⚡ FEHLERBEHEBUNG: CACHE WIRD AUF DEM SEITENSTART NICHT MEHR VOREILIG GELÖSCHT
  const cached = getCachedB2BState();

  if (cached?.isB2B === true) {
    state.isB2B = true;
    state.companyLocationId = cached.companyLocationId;
    state.companyName = cached.companyName || '';
    document.documentElement.dataset.nativeB2b = 'true';
  } else if (cached?.isB2B === false) {
    document.documentElement.dataset.nativeB2b = 'false';
  } else {
    document.documentElement.dataset.nativeB2b = 'pending';
    document.documentElement.classList.add('native-b2b-pending');
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function eyequipmentB2BFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    let newTokenCaptured = false;

    if (url.includes('/account/customer/api/')) {
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
      const authorization = headers.get('Authorization') || '';
      const token = authorization.replace(/^Bearer\s+/i, '');

      if (token.startsWith('shcat_') && token !== capturedCustomerToken) {
        capturedCustomerToken = token;
        exchangedCustomerToken = '';
        exchangedCustomerTokenSource = '';
        exchangedCustomerTokenPromise = null;
        state.statusPromise = null;
        newTokenCaptured = true;
      }
    }

    const request = originalFetch(input, init);

    if (newTokenCaptured) {
      request.then(async (response) => {
        if (!response.ok) return;
        await ensureStatus();
        await scanAndPrepareModules();
        finishPricePending();
      }).catch(() => {});
    }

    return request;
  };

  const CUSTOMER_QUERY = `
    query NativeB2BStatus($contactCursor: String, $locationCursor: String) {
      customer {
        id
        companyContacts(first: 1, after: $contactCursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            company { id name }
            locations(first: 50, after: $locationCursor) {
              pageInfo { hasNextPage endCursor }
              nodes { id name shippingAddress { formattedAddress(withName: true) } billingAddress { formattedAddress(withName: true) } }
            }
          }
        }
      }
    }
  `;

  const NODE_QUERY = `
    query NativeB2BNode(
      $id: ID!
      $buyer: BuyerInput!
      $country: CountryCode!
    )
    @inContext(country: $country, buyer: $buyer) {
      node(id: $id) {
        __typename
        ... on Product {
          id
          variants(first: 50) {
            nodes {
              id
              price { amount currencyCode }
              compareAtPrice { amount currencyCode }
              quantityRule { minimum maximum increment }
            }
          }
        }
        ... on ProductVariant {
          id
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          quantityRule { minimum maximum increment }
          product {
            id
            variants(first: 50) {
              nodes {
                id
                price { amount currencyCode }
                compareAtPrice { amount currencyCode }
                quantityRule { minimum maximum increment }
              }
            }
          }
        }
      }
    }
  `;

  const CART_BUYER_IDENTITY_MUTATION = `
    mutation NativeB2BCartBuyer(
      $cartId: ID!
      $buyerIdentity: CartBuyerIdentityInput!
    ) {
      cartBuyerIdentityUpdate(
        cartId: $cartId
        buyerIdentity: $buyerIdentity
      ) {
        cart {
          id
          buyerIdentity { purchasingCompany { location { id } } }
          cost {
            subtotalAmount { amount currencyCode }
            totalAmount { amount currencyCode }
          }
          lines(first: 250) {
            nodes {
              id
              quantity
              cost {
                amountPerQuantity { amount currencyCode }
                totalAmount { amount currencyCode }
              }
              merchandise {
                ... on ProductVariant {
                  id
                  quantityRule { minimum maximum increment }
                }
              }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const STOREFRONT_CUSTOMER_TOKEN_MUTATION = `
    mutation NativeB2BStorefrontCustomerToken {
      storefrontCustomerAccessTokenCreate {
        customerAccessToken
        userErrors { field message }
      }
    }
  `;

  const CART_CONTEXT_QUERY = `
    query NativeB2BCartContext($cartId: ID!) {
      cart(id: $cartId) {
        id
        buyerIdentity { purchasingCompany { location { id } } }
        cost {
          subtotalAmount { amount currencyCode }
          totalAmount { amount currencyCode }
        }
        lines(first: 250) {
          nodes {
            id
            quantity
            attributes { key value }
            cost {
              amountPerQuantity { amount currencyCode }
              totalAmount { amount currencyCode }
            }
            merchandise {
              ... on ProductVariant {
                id
                quantityRule { minimum maximum increment }
              }
            }
          }
        }
      }
    }
  `;

  const CART_CREATE_CONTEXT_MUTATION = `
    mutation NativeB2BCreateCart($input: CartInput!) {
      cartCreate(input: $input) {
        cart { id }
        userErrors { field message }
      }
    }
  `;

  const PRICE_PROBE_MUTATION = `
    mutation NativeB2BPriceProbe(
      $input: CartInput!
      $country: CountryCode!
    )
    @inContext(country: $country) {
      cartCreate(input: $input) {
        cart {
          lines(first: 250) {
            nodes {
              cost {
                amountPerQuantity { amount currencyCode }
              }
              merchandise {
                ... on ProductVariant {
                  id
                  quantityRule { minimum maximum increment }
                }
              }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  function customerToken() {
    if (capturedCustomerToken) return capturedCustomerToken;

    let stored = '';
    for (const key of TOKEN_KEYS) {
      stored = sessionStorage.getItem(key) || localStorage.getItem(key) || '';
      if (stored) break;
    }

    if (!stored) return '';

    try {
      const parsed = JSON.parse(stored);
      if (parsed?.expiresAt && Number(parsed.expiresAt) <= Date.now() + 5000) return '';
      return String(
        parsed?.tokens?.access_token ||
        parsed?.accessToken ||
        parsed?.customerAccessToken ||
        parsed?.access_token ||
        parsed?.token ||
        '',
      ).replace(/^Bearer\s+/i, '');
    } catch {
      return stored.replace(/^Bearer\s+/i, '');
    }
  }

  function shopDomain() {
    return window.shopyflowConfig?.['sf-domain'] || '';
  }

  function storefrontToken() {
    return window.shopyflowConfig?.['sf-token'] || '';
  }

  async function cartCustomerToken() {
    const sourceToken = customerToken();
    if (!sourceToken) return '';
    if (!sourceToken.startsWith('shcat_')) return sourceToken;
    if (exchangedCustomerToken && exchangedCustomerTokenSource === sourceToken) {
      return exchangedCustomerToken;
    }
    if (exchangedCustomerTokenPromise && exchangedCustomerTokenSource === sourceToken) {
      return exchangedCustomerTokenPromise;
    }

    exchangedCustomerTokenSource = sourceToken;
    exchangedCustomerTokenPromise = (async () => {
      const domain = shopDomain();
      if (!domain) throw new Error('Shop-Domain fehlt.');
      const discoveryResponse = await originalFetch(
        `https://${domain}/.well-known/customer-account-api`,
        { signal: AbortSignal.timeout(15000) },
      );
      const discovery = await discoveryResponse.json();
      if (!discovery.graphql_api) throw new Error('Customer Account API fehlt.');
      const data = await graphql(
        discovery.graphql_api,
        STOREFRONT_CUSTOMER_TOKEN_MUTATION,
        {},
        { Authorization: sourceToken },
      );
      const payload = data?.storefrontCustomerAccessTokenCreate;
      if (!payload?.customerAccessToken || payload.userErrors?.length) {
        throw new Error(payload?.userErrors?.map(error => error.message).join('; ') ||
          'Storefront-Kundentoken konnte nicht erstellt werden.');
      }
      exchangedCustomerToken = payload.customerAccessToken;
      return exchangedCustomerToken;
    })();

    try {
      return await exchangedCustomerTokenPromise;
    } catch (error) {
      exchangedCustomerToken = '';
      exchangedCustomerTokenSource = '';
      throw error;
    } finally {
      exchangedCustomerTokenPromise = null;
    }
  }

  function currentCartId(cart) {
    const direct = typeof cart?.id === 'string' ? cart.id.trim() : '';
    if (direct) return direct;
    let stored = '';
    try { stored = localStorage.getItem('_sf-cart-id') || ''; } catch {}
    if (!stored) return '';
    try {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'string') return parsed.trim();
      if (typeof parsed?.id === 'string') return parsed.id.trim();
      if (typeof parsed?.cartId === 'string') return parsed.cartId.trim();
    } catch {}
    return stored.trim();
  }

  function storeCartId(cartId) {
    let stored = '';
    try { stored = localStorage.getItem('_sf-cart-id') || ''; } catch {}
    try {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'string') {
        localStorage.setItem('_sf-cart-id', JSON.stringify(cartId));
      } else if (parsed && typeof parsed === 'object') {
        if ('cartId' in parsed) parsed.cartId = cartId;
        else parsed.id = cartId;
        localStorage.setItem('_sf-cart-id', JSON.stringify(parsed));
      } else {
        localStorage.setItem('_sf-cart-id', cartId);
      }
    } catch {
      localStorage.setItem('_sf-cart-id', cartId);
    }
  }

  function idNumber(value) {
    return String(value || '').split('/').pop();
  }

  function finishPricePending() {
    document.documentElement.classList.remove('native-b2b-pending');
  }

  let stopMainObserver = null;

  function setNativeState(isB2B, companyLocationId = null, locations = [], companyName = '') {
    state.isB2B = isB2B;
    state.companyLocationId = companyLocationId;
    state.companyName = companyName;
    state.locations = locations;

    if (isB2B) {
      setCachedB2BState({ isB2B: true, companyLocationId, companyName });
      initObserver();
    } else {
      clearCachedB2BState();
      if (stopMainObserver) {
        stopMainObserver();
        stopMainObserver = null;
      }
    }

    if (document.body) {
      document.body.classList.toggle('is-b2b-user', isB2B);
    }
    document.documentElement.dataset.nativeB2b = isB2B ? 'true' : 'false';
    
    if (companyName) {
      document.querySelectorAll('[data-b2b-company-name]').forEach(el => {
        if (el.textContent !== companyName) el.textContent = companyName;
      });
    }

    updateTaxLabels();

    window.dispatchEvent(new CustomEvent('eyequipment:native-b2b-ready', {
      detail: { isB2B, companyLocationId, locations, companyName },
    }));
  }

  async function graphql(url, query, variables, headers = {}) {
    const response = await originalFetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();

    if (!response.ok || result.errors?.length) {
      throw new Error(
        result.errors?.map((error) => error.message).join('; ') ||
        `Shopify request failed (${response.status})`,
      );
    }

    return result.data;
  }

  async function detectNativeB2B() {
    const token = customerToken();
    const domain = shopDomain();

    if (!token || !domain) {
      setNativeState(false);
      return false;
    }

    try {
      const discoveryResponse = await fetch(
        `https://${domain}/.well-known/customer-account-api`,
        { signal: AbortSignal.timeout(15000) },
      );
      const discovery = await discoveryResponse.json();

      const contacts = [];
      let contactCursor = null, locationCursor = null, customerId = null;
      const seenCursors = new Set();
      for (;;) {
        const cursorKey = JSON.stringify([contactCursor, locationCursor]);
        if (seenCursors.has(cursorKey) || seenCursors.size >= 200) throw new Error('Standortliste unvollständig.');
        seenCursors.add(cursorKey);
        const data = await graphql(discovery.graphql_api, CUSTOMER_QUERY,
          { contactCursor, locationCursor }, { Authorization: token });
        if (!data.customer?.id || (customerId && customerId !== data.customer.id)) throw new Error('Bitte erneut anmelden.');
        customerId = data.customer.id;
        const connection = data.customer.companyContacts;
        const contact = connection?.nodes?.[0];
        if (contact) contacts.push(contact);
        if (contact?.locations?.pageInfo?.hasNextPage) {
          locationCursor = contact.locations.pageInfo.endCursor;
          if (!locationCursor) throw new Error('Standortliste unvollständig.');
        } else if (connection?.pageInfo?.hasNextPage) {
          contactCursor = connection.pageInfo.endCursor;
          locationCursor = null;
          if (!contactCursor) throw new Error('Standortliste unvollständig.');
        } else break;
      }
      state.customerId = customerId;
      state.statusError = false;
      const locations = [...new Map(contacts.flatMap(contact =>
        (contact.locations?.nodes || []).map(location => ({
          ...location, companyName: contact.company?.name || ''
        }))).map(location => [location.id, location])).values()];
      let saved;
      try { saved = JSON.parse(sessionStorage.getItem(LOCATION_KEY) || 'null'); } catch {}
      const selected = locations.find(location => saved?.customerId === state.customerId &&
        location.id === saved.locationId) || locations[0];
      setNativeState(locations.length > 0, selected?.id || null, locations, selected?.companyName || '');

      if (state.isB2B) {
        await contextualizeCart(window.Shopyflow?._cart);
      }

      return state.isB2B;
    } catch (error) {
      state.statusError = true;
      console.error('[Eyequipment B2B] Status konnte nicht geladen werden:', error);
      setNativeState(false);
      return false;
    }
  }

  function ensureStatus() {
    if (!state.statusPromise) {
      state.statusPromise = detectNativeB2B();
    }
    return state.statusPromise;
  }

  async function fetchContextualNode(id) {
    if (!(await ensureStatus())) return null;

    const token = await cartCustomerToken();
    const domain = shopDomain();
    const sfToken = storefrontToken();

    if (!token || !domain || !sfToken || !state.companyLocationId) {
      return null;
    }

    let gid = String(id);
    if (!gid.startsWith('gid://')) {
      gid = `gid://shopify/Product/${gid}`;
    }

    const data = await graphql(
      `https://${domain}/api/${API_VERSION}/graphql.json`,
      NODE_QUERY,
      {
        id: gid,
        country: 'DE',
        buyer: {
          customerAccessToken: token,
          companyLocationId: state.companyLocationId,
        },
      },
      { 'X-Shopify-Storefront-Access-Token': sfToken },
    );

    return data?.node || null;
  }

  async function flushPriceProbeQueue() {
    priceProbeTimer = null;
    const entries = [...priceProbeQueue.entries()];
    priceProbeQueue.clear();
    if (!entries.length) return;

    const token = await cartCustomerToken();
    const domain = shopDomain();
    const sfToken = storefrontToken();
    const locationId = state.companyLocationId;
    const resolveAll = (variantId, result) => {
      entries
        .find(([id]) => id === variantId)?.[1]
        .resolvers.forEach((resolve) => resolve(result));
    };

    if (!token || !domain || !sfToken || !locationId) {
      entries.forEach(([variantId]) => resolveAll(variantId, null));
      return;
    }

    try {
      const results = new Map(await Promise.all(entries.map(async ([variantId]) => {
        const variant = await fetchContextualNode(variantId);
        return [variantId, variant ? {
          price: variant.price,
          quantityRule: variant.quantityRule,
        } : null];
      })));

      entries.forEach(([variantId]) => {
        resolveAll(variantId, results.get(variantId) || null);
      });
    } catch (error) {
      console.error('[Eyequipment B2B] Katalogpreise konnten nicht geladen werden:', error);
      entries.forEach(([variantId]) => resolveAll(variantId, null));
    }
  }

  function probeVariantPrice(variant) {
    if (!variant?.id) return Promise.resolve(null);

    return new Promise((resolve) => {
      const queued = priceProbeQueue.get(variant.id);
      if (queued) {
        queued.resolvers.push(resolve);
      } else {
        priceProbeQueue.set(variant.id, {
          minimum: variant.quantityRule?.minimum || 1,
          resolvers: [resolve],
        });
      }

      clearTimeout(priceProbeTimer);
      priceProbeTimer = setTimeout(flushPriceProbeQueue, 100);
    });
  }

  async function fetchCartContext(cartId) {
    const domain = shopDomain(), sfToken = storefrontToken();
    if (!cartId || !domain || !sfToken) return null;
    const data = await graphql(`https://${domain}/api/${API_VERSION}/graphql.json`,
      CART_CONTEXT_QUERY, { cartId },
      { 'X-Shopify-Storefront-Access-Token': sfToken });
    return data?.cart || null;
  }

  async function verifyCartContext(cartId, locationId, attempts = 4) {
    let cart = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      cart = await fetchCartContext(cartId);
      if (!locationId || cart?.buyerIdentity?.purchasingCompany?.location?.id === locationId) {
        return cart;
      }
      if (attempt < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 120 * (attempt + 1)));
      }
    }
    throw new Error('Der Firmenstandort konnte im Warenkorb nicht bestätigt werden.');
  }

  function updateCartContext(cartId, locationId) {
    const run = cartContextQueue.catch(() => {}).then(async () => {
      const token = await cartCustomerToken(), domain = shopDomain(), sfToken = storefrontToken();
      if (!token || !domain || !sfToken) throw new Error('Bitte erneut anmelden.');
      const data = await graphql(`https://${domain}/api/${API_VERSION}/graphql.json`,
        CART_BUYER_IDENTITY_MUTATION, {
          cartId, buyerIdentity: { customerAccessToken: token,
            ...(locationId ? { companyLocationId: locationId } : {}) }
        }, { 'X-Shopify-Storefront-Access-Token': sfToken });
      const payload = data?.cartBuyerIdentityUpdate;
      if (!payload?.cart || payload.userErrors?.length) {
        throw new Error('Der Firmenstandort konnte im Warenkorb nicht bestätigt werden.');
      }
      const verifiedCart = await verifyCartContext(cartId, locationId);
      state.cartContextError = false;
      return verifiedCart;
    });
    cartContextQueue = run;
    return run;
  }

  async function contextualizeCart(cart) {
    if (state.switching) return;
    const cartId = currentCartId(cart);
    const locationId = state.companyLocationId;
    if (!cartId || !customerToken() || !shopDomain() || !storefrontToken()) return;
    const key = `${cartId}:${locationId || 'customer'}`;
    if (contextualizedCarts.has(key)) return;
    contextualizedCarts.add(key);
    try {
      const updated = await updateCartContext(cartId, locationId);
      if (state.switching) return;
      applyCartRules(updated);
      await window.Shopyflow?.refetchCart?.();
    } catch (error) {
      contextualizedCarts.delete(key);
      state.cartContextError = true;
      console.error('[Eyequipment B2B] Warenkorb konnte nicht kontextualisiert werden:', error);
    }
  }

  async function replaceCartWithContext(cart, locationId) {
    const token = await cartCustomerToken(), domain = shopDomain(), sfToken = storefrontToken();
    if (!token || !domain || !sfToken) throw new Error('Bitte erneut anmelden.');

    let sourceCart = cart;
    const sourceCartId = currentCartId(cart);
    const sourceLines = sourceCart?.lines?.nodes || sourceCart?.lines || [];
    if (sourceCartId && !sourceLines.length) {
      sourceCart = await fetchCartContext(sourceCartId);
    }
    const lines = (sourceCart?.lines?.nodes || sourceCart?.lines || []).map(line => ({
      merchandiseId: line?.merchandise?.id || line?.variant?.id || line?.variantId,
      quantity: Math.max(1, Number(line?.quantity) || 1),
      ...(Array.isArray(line?.attributes) && line.attributes.length ? { attributes: line.attributes } : {}),
    })).filter(line => line.merchandiseId);

    const data = await graphql(`https://${domain}/api/${API_VERSION}/graphql.json`,
      CART_CREATE_CONTEXT_MUTATION, {
        input: {
          buyerIdentity: {
            customerAccessToken: token,
            companyLocationId: locationId,
            countryCode: 'DE',
          },
          ...(lines.length ? { lines } : {}),
        },
      }, { 'X-Shopify-Storefront-Access-Token': sfToken });
    const payload = data?.cartCreate;
    if (!payload?.cart?.id || payload.userErrors?.length) {
      throw new Error(payload?.userErrors?.map(error => error.message).join('; ') ||
        'Der neue Warenkorb konnte nicht erstellt werden.');
    }
    const verifiedCart = await verifyCartContext(payload.cart.id, locationId);
    storeCartId(payload.cart.id);
    if (window.Shopyflow) window.Shopyflow._cart = verifiedCart;
    state.cartContextError = false;
    return verifiedCart;
  }

  state.ensureStatus = ensureStatus;
  state.selectCompanyLocation = async function(locationId) {
    if (state.switching) throw new Error('Der Standortwechsel läuft bereits.');
    await ensureStatus();
    const selected = state.locations.find(location => location.id === locationId);
    if (!state.isB2B || !selected || !state.customerId) {
      throw new Error('Dieser Standort ist für dein Konto nicht freigegeben.');
    }
    if (locationId === state.companyLocationId && !state.cartContextError) return;
    const customerId = state.customerId;
    // Verify storage before changing any existing cart; only save the choice after confirmation.
    sessionStorage.setItem(LOCATION_KEY + '_check', '1');
    sessionStorage.removeItem(LOCATION_KEY + '_check');
    state.switching = true;
    try {
      await cartContextQueue.catch(() => {});
      if (state.customerId !== customerId) throw new Error('Die Anmeldung hat sich geändert.');
      const replacementCart = await replaceCartWithContext(window.Shopyflow?._cart, locationId);
      if (state.customerId !== customerId) throw new Error('Die Anmeldung hat sich geändert.');
      sessionStorage.setItem(LOCATION_KEY, JSON.stringify({
        customerId: state.customerId, locationId
      }));
      contextualizedCarts.clear();
      variantRules.clear();
      modules.clear();
      setNativeState(true, locationId, state.locations, selected.companyName);
      applyCartRules(replacementCart);
      await window.Shopyflow?.refetchCart?.();
      // A fresh page prevents old in-flight product prices/rules from surviving the switch.
      window.location.reload();
    } catch (error) {
      state.switching = false;
      state.cartContextError = true;
      throw error;
    }
  };

  document.addEventListener('click', event => {
    if (!(state.switching || state.cartContextError)) return;
    if (event.target.closest?.('[sf-add-to-cart], [sf-checkout], [sf-checkout-button], .checkout-button, a[href*="/checkout"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.alert('Bitte den Standortwechsel abschließen oder die Seite neu laden, bevor du weiterbestellst.');
    }
  }, true);

  function formatMoney(money) {
    if (!money) return '';
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: money.currencyCode,
    }).format(Number(money.amount));
  }

  function quantityRuleText(rule) {
    if (!rule) return '';
    const parts = [`Mindestmenge: ${rule.minimum} Stück`];
    if (rule.increment > 1) parts.push(`Schritte: ${rule.increment}`);
    return parts.join(' · ');
  }

  function storeQuantityRule(variantId, rule) {
    const normalizedId = idNumber(variantId);
    if (!normalizedId || !rule) return null;

    const existing = variantRules.get(normalizedId);
    if (existing && Number(existing.minimum) > Number(rule.minimum || 1)) {
      return existing;
    }

    variantRules.set(normalizedId, rule);
    return rule;
  }

  function ensureQuantityMessage(container, rule, cart = false) {
    if (!container || !rule) return;
    const className = cart
      ? 'native-b2b-cart-quantity-rule'
      : 'native-b2b-quantity-rule';

    const orphans = container.querySelectorAll(`.native-b2b-quantity-rule:not(.mindestmenge-wrapper *), .native-b2b-cart-quantity-rule:not(.mindestmenge-wrapper *)`);
    orphans.forEach(el => el.remove());

    const wrappers = container.querySelectorAll('.mindestmenge-wrapper');
    if (wrappers.length === 0) return;

    const targetText = quantityRuleText(rule);

    wrappers.forEach(wrapper => {
      if (wrapper.style.display !== 'flex') wrapper.style.display = 'flex';
      if (wrapper.style.visibility !== 'visible') wrapper.style.visibility = 'visible';
      if (wrapper.hasAttribute('sf-hide')) wrapper.removeAttribute('sf-hide');
      if (wrapper.hidden) wrapper.hidden = false;

      wrapper.querySelectorAll('[sf-show-metafield]').forEach(mf => {
        if (mf.style.display !== 'none') mf.style.display = 'none';
        mf.setAttribute('sf-hide', '1');
      });

      let message = wrapper.querySelector(`.${className}`);
      if (!message) {
        message = document.createElement('div');
        message.classList.add(className);
        wrapper.appendChild(message);
      }
      if (message.style.display !== 'block') message.style.display = 'block';
      if (message.textContent !== targetText) message.textContent = targetText;
    });
  }

  function enforceB2BRulesForContainer(container) {
    if (!state.isB2B || !container) return;

    let variantId = null;
    const cartVariant = container.getAttribute('sf-data-variant') || 
                        container.querySelector('[sf-data-variant]')?.getAttribute('sf-data-variant');
    
    if (cartVariant) {
      variantId = idNumber(cartVariant);
    } else {
      const addToCartBtn = container.querySelector('[sf-add-to-cart]');
      if (addToCartBtn) {
        variantId = idNumber(addToCartBtn.getAttribute('sf-add-to-cart'));
      }
    }

    if (!variantId) return;

    const input = container.querySelector('input[sf-change-quantity]');
    const currentQty = input ? input.value : '0';
    const stateKey = `${variantId}_${currentQty}`;

    if (container.dataset.nativeB2bApplied === stateKey) return;

    let rule = variantRules.get(variantId);

    if (!rule) {
      const probeGid = `gid://shopify/ProductVariant/${variantId}`;
      if (!priceProbeQueue.has(probeGid)) {
        probeVariantPrice({ id: probeGid }).then(result => {
          if (result?.quantityRule) {
            storeQuantityRule(variantId, result.quantityRule);
            enforceB2BRulesForContainer(container);
          }
        });
      }
      return;
    }

    container.dataset.nativeB2bApplied = stateKey;
    const isCartItem = container.hasAttribute('sf-cart-item') || container.classList.contains('cart-item');

    const decBtn = container.querySelector('[sf-change-quantity-dec]');
    const incBtn = container.querySelector('[sf-change-quantity-inc]');

    if (input) {
      const minStr = String(rule.minimum);
      const stepStr = String(rule.increment);

      if (input.min !== minStr) input.min = minStr;
      if (input.step !== stepStr) input.step = stepStr;
      if (input.placeholder !== minStr) input.placeholder = minStr;
      if (input.dataset.nativeB2bMinimum !== minStr) input.dataset.nativeB2bMinimum = minStr;
      if (input.dataset.nativeB2bIncrement !== stepStr) input.dataset.nativeB2bIncrement = stepStr;

      let currentVal = Number(input.value) || 0;
      if (currentVal < rule.minimum) {
        currentVal = rule.minimum;
        input.value = minStr;
      }

      const isAtMin = currentVal <= rule.minimum;
      if (decBtn) {
        const op = isAtMin ? '0.3' : '1';
        const cur = isAtMin ? 'not-allowed' : 'pointer';
        const dis = isAtMin ? 'true' : 'false';
        if (decBtn.style.opacity !== op) decBtn.style.opacity = op;
        if (decBtn.style.cursor !== cur) decBtn.style.cursor = cur;
        if (decBtn.dataset.disabled !== dis) decBtn.dataset.disabled = dis;
      }
      if (incBtn) {
        const isAtMax = rule.maximum !== null && currentVal >= rule.maximum;
        const op = isAtMax ? '0.3' : '1';
        const cur = isAtMax ? 'not-allowed' : 'pointer';
        const dis = isAtMax ? 'true' : 'false';
        if (incBtn.style.opacity !== op) incBtn.style.opacity = op;
        if (incBtn.style.cursor !== cur) incBtn.style.cursor = cur;
        if (incBtn.dataset.disabled !== dis) incBtn.dataset.disabled = dis;
      }
    }

    container.querySelectorAll('[sf-add-to-cart]').forEach(btn => {
      let val = input ? (Number(input.value) || rule.minimum) : rule.minimum;
      const valStr = String(val);
      if (btn.getAttribute('sf-current-_qty_') !== valStr) {
        btn.setAttribute('sf-current-_qty_', valStr);
      }
    });

    ensureQuantityMessage(container, rule, isCartItem);
  }

  function applyQuantityRule(container, rule, cart = false) {
    if (!container || !rule) return;
    const cartVariant = container.getAttribute('sf-data-variant');
    const addToCart = container.querySelector('[sf-add-to-cart]');
    const variantId = idNumber(cartVariant || addToCart?.getAttribute('sf-add-to-cart'));
    if (variantId) {
      storeQuantityRule(variantId, rule);
    }
    enforceB2BRulesForContainer(container);
  }

  function getProductIdFromElement(el) {
    if (!el) return null;
    let raw = el.getAttribute('sf-product') ||
              el.getAttribute('sf-product-id') ||
              el.getAttribute('sf-data-product') ||
              el.querySelector('[sf-add-to-cart]')?.getAttribute('sf-add-to-cart') ||
              el.querySelector('[sf-show-price]')?.getAttribute('sf-show-price');

    if (!raw || raw === "1" || raw === "true") {
      if (window.Shopyflow?.currentProducts) {
        for (const [id, prod] of window.Shopyflow.currentProducts.entries()) {
          if (prod.handle && el.querySelector(`[sf-show-title="${prod.handle}"]`)) {
            return prod.id;
          }
        }
      }
      return null;
    }

    return raw;
  }

  function cartItemForLine(line, index) {
    const items = [...document.querySelectorAll('[sf-cart-item]')];
    const variantId = idNumber(line.merchandise?.id);
    const matched = items.find((item) => {
      const itemVariant =
        item.getAttribute('sf-data-variant') ||
        item.querySelector('[sf-data-variant]')?.getAttribute('sf-data-variant') ||
        item.querySelector('[sf-add-to-cart]')?.getAttribute('sf-add-to-cart');
      return idNumber(itemVariant) === variantId;
    });
    return matched || items[index] || null;
  }

  function updateCheckoutMinimum(cart) {
    document.querySelectorAll('.native-b2b-checkout-message').forEach(
      (message) => message.remove(),
    );
    if (!state.isB2B || !cart) {
      document.querySelectorAll('[data-native-b2b-checkout-blocked]').forEach(
        (button) => {
          delete button.dataset.nativeB2bCheckoutBlocked;
          button.removeAttribute('aria-disabled');
          button.style.pointerEvents = '';
          button.style.opacity = '';
        },
      );
      return;
    }
    const subtotal = Number(cart.cost?.subtotalAmount?.amount || 0);
    const blocked = subtotal < B2B_MINIMUM_ORDER;

    document.querySelectorAll(
      '[sf-checkout], [sf-checkout-button], .checkout-button, a[href*="/checkout"]',
    ).forEach((button) => {
      const blockedStr = blocked ? 'true' : 'false';
      if (button.dataset.nativeB2bCheckoutBlocked !== blockedStr) {
        button.dataset.nativeB2bCheckoutBlocked = blockedStr;
        button.setAttribute('aria-disabled', blockedStr);
        button.style.pointerEvents = blocked ? 'none' : '';
        button.style.opacity = blocked ? '.45' : '';
      }
    });
  }

  function applyCartRules(cart) {
    const rawLines = cart?.lines?.nodes || cart?.lines?.edges || cart?.lines || cart?.items || cart?.lineItems || [];
    const lines = rawLines.map((line) => line?.node || line);
    lines.forEach((line, index) => {
      const item = cartItemForLine(line, index);
      const variantId = idNumber(
        line.merchandise?.id ||
        line.variant?.id ||
        line.variantId ||
        line.id
      );
      const currentRule = line.merchandise?.quantityRule;
      if (variantId && currentRule) storeQuantityRule(variantId, currentRule);
      applyQuantityRule(
        item,
        currentRule || variantRules.get(variantId),
        true,
      );
    });
    updateCheckoutMinimum(cart);
    updateTaxLabels();
  }

  function updateTaxLabels() {
    const b2b = state.isB2B;
    document.querySelectorAll(
      '.product-shipping-info .text-size-tiny, [data-native-tax-label]',
    ).forEach((element) => {
      if (!originalTaxText.has(element)) {
        originalTaxText.set(element, element.textContent);
      }
      const targetText = b2b 
        ? originalTaxText.get(element).replace(/Enthält\s*19%\s*MwSt\./i, 'zzgl. 19% MwSt.')
        : originalTaxText.get(element);
      if (element.textContent !== targetText) {
        element.textContent = targetText;
      }
    });
  }

  function getProductContainer(el) {
    if (!el) return null;
    return el.closest('[sf-product], .product-card, .product-info-wrapper, [sf-cart-item]') || el.parentElement;
  }

  document.addEventListener('click', (event) => {
    if (!state.isB2B) return;

    const decBtn = event.target.closest('[sf-change-quantity-dec]');
    const incBtn = event.target.closest('[sf-change-quantity-inc]');
    const addToCartBtn = event.target.closest('[sf-add-to-cart]');

    if (decBtn || incBtn) {
      const btn = decBtn || incBtn;
      const container = getProductContainer(btn);
      const input = container?.querySelector('input[sf-change-quantity]');

      if (input) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const min = Number(input.dataset.nativeB2bMinimum || input.min || 1);
        const step = Number(input.dataset.nativeB2bIncrement || input.step || 1);
        const max = input.max ? Number(input.max) : null;
        let currentVal = Number(input.value) || min;

        if (decBtn) {
          if (currentVal <= min) {
            delete container.dataset.nativeB2bApplied;
            enforceB2BRulesForContainer(container);
            return;
          }
          currentVal = Math.max(min, currentVal - step);
        } else if (incBtn) {
          if (currentVal < min) {
            currentVal = min;
          } else {
            currentVal = currentVal + step;
          }
          if (max !== null && currentVal > max) {
            currentVal = max;
          }
        }

        input.value = String(currentVal);
        delete container.dataset.nativeB2bApplied;
        enforceB2BRulesForContainer(container);

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    if (addToCartBtn) {
      const container = getProductContainer(addToCartBtn);
      const input = container?.querySelector('input[sf-change-quantity]');
      const variantGid = addToCartBtn.getAttribute('sf-add-to-cart');
      const variantId = idNumber(variantGid);
      const rule = variantRules.get(variantId);

      const min = rule ? rule.minimum : (input ? Number(input.dataset.nativeB2bMinimum || input.min || 1) : 1);
      let val = input ? (Number(input.value) || min) : min;

      if (val < min) {
        val = min;
        if (input) input.value = String(min);
      }

      addToCartBtn.setAttribute('sf-current-_qty_', String(val));
    }
  }, true);

  window.addEventListener('eyequipment:b2b-update', () => {
    if (!state.isB2B) return;
    document.querySelectorAll('.product-card, .product-info-wrapper, [sf-product], [sf-cart-item]').forEach(container => {
      delete container.dataset.nativeB2bApplied;
      enforceB2BRulesForContainer(container);
    });
  });

  function initObserver() {
    if (stopMainObserver || !document.body) return;

    stopMainObserver = Runtime.observeMutations('native-b2b', (mutations) => {
      if (!state.isB2B) return;
      if (!mutations.some(mutation => mutation.type === 'childList')) return;

      Runtime.schedule('native-b2b-dom-update', () => {
        document.querySelectorAll('.product-card, .product-info-wrapper, [sf-product], [sf-cart-item]').forEach(container => {
          enforceB2BRulesForContainer(container);
        });
      });
    });
  }

  function renderVariant(el, variant) {
    if (!el || !variant) return;
    const isCartItem = el.matches?.('[sf-cart-item]') ||
      Boolean(el.closest?.('[sf-cart-item]'));

    if (!isCartItem && variant.price) {
      const formatted = formatMoney(variant.price);
      el.querySelectorAll('[sf-show-price]').forEach((price) => {
        if (price.textContent !== formatted) price.textContent = formatted;
        price.dataset.b2bPriceLoaded = 'true';
      });
    }

    if (!isCartItem && variant.compareAtPrice) {
      const formattedCompare = formatMoney(variant.compareAtPrice);
      el.querySelectorAll('[sf-show-compare-price]').forEach((price) => {
        if (price.textContent !== formattedCompare) price.textContent = formattedCompare;
        price.hidden = false;
      });
    }

    if (!isCartItem) el.querySelectorAll('[sf-add-to-cart]').forEach((button) => {
      if (variant.price?.amount) {
        const amtStr = String(variant.price.amount);
        if (button.getAttribute('sf-current-_prc_') !== amtStr) {
          button.setAttribute('sf-current-_prc_', amtStr);
        }
      }
    });

    const rule = variant.quantityRule;
    if (rule) {
      const variantId = idNumber(variant.id);
      if (variantId) storeQuantityRule(variantId, rule);
      delete el.dataset.nativeB2bApplied;
      applyQuantityRule(el, rule, isCartItem);
    }
  }

  async function prepareModule(el, product) {
    if (!el) return;

    const targetId = product?.id || getProductIdFromElement(el);
    if (!targetId) return;

    try {
      const node = await fetchContextualNode(targetId);
      if (!node) return;

      let variantsList = [];
      if (node.__typename === 'Product') {
        variantsList = node.variants?.nodes || [];
      } else if (node.__typename === 'ProductVariant') {
        variantsList = node.product?.variants?.nodes || [node];
      }

      if (variantsList.length > 0) {
        const variantMap = new Map(variantsList.map(v => [v.id, v]));
        const selectedVariant = variantMap.get(targetId) || variantsList[0];

        renderVariant(el, selectedVariant);
        modules.set(el, { productId: targetId, variants: variantMap });
      }
    } catch (error) {
      console.error('[Eyequipment B2B] Produkt konnte nicht geladen werden:', error);
    }
  }

  async function scanAndPrepareModules() {
    const isB2B = await ensureStatus();
    if (!isB2B) return;

    const elements = document.querySelectorAll('[sf-product], .product-card, .product-info-wrapper, [sf-cart-item]');
    const processed = new Set();

    elements.forEach(async (rawEl) => {
      const el = getProductContainer(rawEl) || rawEl;
      if (processed.has(el)) return;
      processed.add(el);

      await prepareModule(el, null);
    });
  }

  function registerStoresynkEvents() {
    if (state.registered || !window.Shopyflow?.on) return;
    state.registered = true;

    Shopyflow.on('buyModuleReady', ({ el, product }) => {
      prepareModule(el, product);
    });

    Shopyflow.on('optionChange', ({ el, variant }) => {
      renderVariant(el, modules.get(el)?.variants.get(variant?.id));
    });

    Shopyflow.on('cartLoad', ({ cart }) => {
      applyCartRules(cart);
      contextualizeCart(cart);
    });

    Shopyflow.on('cartUpdate', ({ cart }) => {
      applyCartRules(cart);
      contextualizeCart(cart);
    });

    Shopyflow.on('customerLogin', () => {
      state.statusPromise = null;
      setTimeout(async () => {
        await ensureStatus();
        await scanAndPrepareModules();
        finishPricePending();
      }, 0);
    });

    Shopyflow.on('customerLogout', () => {
      capturedCustomerToken = '';
      exchangedCustomerToken = '';
      exchangedCustomerTokenSource = '';
      exchangedCustomerTokenPromise = null;
      state.customerId = null;
      state.statusError = false;
      state.cartContextError = false;
      try { sessionStorage.removeItem(LOCATION_KEY); } catch {}
      contextualizedCarts.clear();
      state.statusPromise = null;
      clearCachedB2BState();
      setNativeState(false);
      finishPricePending();
    });
  }

  window.addEventListener('ShopyflowReady', registerStoresynkEvents);
  registerStoresynkEvents();

  const initRunner = async () => {
    await ensureStatus();
    await scanAndPrepareModules();
    finishPricePending();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRunner, { once: true });
  } else {
    initRunner();
  }
})();
