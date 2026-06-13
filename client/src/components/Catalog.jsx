import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Catalog.css';

const FINALIZED_TIERS = [
  {
    key: 'harmonic',
    matcher: /harmonic/i,
    displayName: 'BIG SYZ Harmonic System Access (111)',
    design: 'gold-amber',
    themeLabel: 'Gold / Amber Technical Theme',
    fallbackPrice: 1111,
    signal: '111',
  },
  {
    key: 'cosmic',
    matcher: /cosmic/i,
    displayName: 'BIG SYZ Cosmic System Access (222)',
    design: 'silver-platinum',
    themeLabel: 'Silver / Platinum Geometric Theme',
    fallbackPrice: 2222,
    signal: '222',
  },
  {
    key: 'guardian',
    matcher: /guardian/i,
    displayName: 'BIG SYZ Guardian Vector Access (444)',
    design: 'cobalt-crystalline',
    themeLabel: 'Deep Cobalt Blue Crystalline Theme',
    fallbackPrice: 4444,
    signal: '444',
  },
];

const currencyFormatter = (currency = 'usd') => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: String(currency || 'usd').toUpperCase(),
});

const formatPrice = (product) => {
  const amount = Number(product?.price || product?.fallbackPrice || 0);
  return currencyFormatter(product?.currency).format(amount);
};

const mergeFinalizedTier = (tier, products) => {
  const liveProduct = products.find((product) => tier.matcher.test(product.name || ''));
  return {
    ...tier,
    ...(liveProduct || {}),
    id: liveProduct?.id || tier.key,
    name: tier.displayName,
    description: liveProduct?.description || `${tier.themeLabel}. Direct access tier for the SYZMEKU engine.`,
    price: liveProduct?.price || tier.fallbackPrice,
    currency: liveProduct?.currency || 'usd',
    priceId: liveProduct?.priceId || '',
    interval: liveProduct?.interval || null,
    design: tier.design,
    signal: tier.signal,
    themeLabel: tier.themeLabel,
  };
};

export default function Catalog() {
  const navigate = useNavigate();
  const location = useLocation();
  const { ensureValidSession } = useAuth();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutPriceId, setCheckoutPriceId] = useState('');

  const finalizedProducts = useMemo(() => FINALIZED_TIERS.map((tier) => mergeFinalizedTier(tier, products)), [products]);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await axios.get('/api/products');
        const catalog = Array.isArray(response.data) ? response.data : [];
        if (!cancelled) setProducts(catalog.filter((product) => product.priceId));
      } catch (catalogError) {
        if (!cancelled) {
          const status = catalogError?.response?.status;
          const message = status === 503
            ? 'Catalog is deployed, but Stripe is not configured on the service yet.'
            : catalogError?.response?.data?.error || 'Catalog retrieval failed.';
          setError(message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const redirectToLogin = (message) => {
    localStorage.setItem('syz_checkout_intent', JSON.stringify({
      pathname: location.pathname,
      search: location.search,
      createdAt: new Date().toISOString(),
    }));
    navigate('/login', {
      state: {
        from: { pathname: location.pathname, search: location.search },
        message,
      },
    });
  };

  const handleCheckout = async (priceId) => {
    if (!priceId || checkoutPriceId) return;

    setCheckoutPriceId(priceId);
    setError('');

    try {
      const token = await ensureValidSession();
      if (!token) {
        redirectToLogin('Sign in to complete checkout.');
        return;
      }

      const response = await axios.post('/api/checkout/session', { priceId }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data?.url) {
        window.location.assign(response.data.url);
        return;
      }

      setError('Checkout session did not return a Stripe redirect URL.');
    } catch (checkoutError) {
      const status = checkoutError?.response?.status;
      if (status === 401) {
        redirectToLogin('Your session expired. Sign in to complete checkout.');
        return;
      }

      setError(checkoutError?.response?.data?.error || 'Checkout session initialization failed.');
    } finally {
      setCheckoutPriceId('');
    }
  };

  return (
    <main className="catalog-shell" aria-label="SYZMEKU public catalog">
      <div className="catalog-prism-field" />
      <section className="catalog-hero">
        <p className="catalog-eyebrow">T.O.I. Souljah Academy Catalog</p>
        <h1>Choose Your Engine Layer</h1>
        <p>
          Three finalized access vectors are embedded directly into the academy front-end,
          with live Stripe checkout staying synchronized behind the glass.
        </p>
      </section>

      {error && <div className="catalog-alert" role="status">{error}</div>}

      {isLoading ? (
        <section className="catalog-loading" aria-live="polite">
          <span />
          Synchronizing catalog...
        </section>
      ) : (
        <section className="catalog-grid" aria-label="Available SYZMEKU products">
          {finalizedProducts.map((product) => (
            <article className={`catalog-card catalog-card-${product.design}`} key={product.key}>
              <div className="catalog-card-shine" />
              <div className="catalog-card-header">
                <h2>{product.name}</h2>
                <span>{product.signal}</span>
              </div>
              <p className="catalog-theme-label">{product.themeLabel}</p>
              <p className="catalog-description">{product.description}</p>
              <div className="catalog-price-row">
                <strong>{formatPrice(product)}</strong>
                <small>{String(product.currency || 'usd').toUpperCase()}</small>
              </div>
              <button
                type="button"
                onClick={() => handleCheckout(product.priceId)}
                disabled={!product.priceId || checkoutPriceId === product.priceId}
                className="catalog-checkout-button"
              >
                {checkoutPriceId === product.priceId ? 'Opening Stripe...' : product.priceId ? 'Commit' : 'Awaiting Stripe Link'}
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
