import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import './Catalog.css';

const currencyFormatter = (currency = 'usd') => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: String(currency || 'usd').toUpperCase(),
});

const getStoredToken = () => {
  try {
    const storedUser = JSON.parse(localStorage.getItem('user'));
    return storedUser?.token || localStorage.getItem('token') || '';
  } catch (_error) {
    return localStorage.getItem('token') || '';
  }
};

const formatPrice = (product) => {
  const amount = Number(product?.price || 0);
  return currencyFormatter(product?.currency).format(amount);
};

export default function Catalog() {
  const navigate = useNavigate();
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutPriceId, setCheckoutPriceId] = useState('');

  const sortedProducts = useMemo(() => [...products].sort((a, b) => {
    const left = Number(a.price || 0);
    const right = Number(b.price || 0);
    return left - right;
  }), [products]);

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

  const handleCheckout = async (priceId) => {
    if (!priceId || checkoutPriceId) return;

    const token = getStoredToken();
    if (!token) {
      localStorage.setItem('syz_checkout_intent', JSON.stringify({
        pathname: location.pathname,
        search: location.search,
        priceId,
        createdAt: new Date().toISOString(),
      }));
      navigate('/login', {
        state: {
          from: { pathname: location.pathname, search: location.search },
          message: 'Sign in to complete checkout.',
        },
      });
      return;
    }

    setCheckoutPriceId(priceId);
    setError('');

    try {
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
        navigate('/login', {
          state: {
            from: { pathname: location.pathname, search: location.search },
            message: 'Your session expired. Sign in to complete checkout.',
          },
        });
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
        <p className="catalog-eyebrow">SYZMEKU Public Catalog</p>
        <h1>Choose Your Engine Layer</h1>
        <p>
          Public access stays visible. Checkout opens only after identity verification,
          keeping the purchase flow clean while the private system remains sealed.
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
          {sortedProducts.length > 0 ? sortedProducts.map((product) => (
            <article className="catalog-card" key={product.id}>
              <div className="catalog-card-shine" />
              <div className="catalog-card-header">
                <h2>{product.name}</h2>
                {product.interval && <span>{product.interval}</span>}
              </div>
              <p className="catalog-description">{product.description || 'SYZMEKU access module'}</p>
              <div className="catalog-price-row">
                <strong>{formatPrice(product)}</strong>
                <small>{String(product.currency || 'usd').toUpperCase()}</small>
              </div>
              <button
                type="button"
                onClick={() => handleCheckout(product.priceId)}
                disabled={checkoutPriceId === product.priceId}
                className="catalog-checkout-button"
              >
                {checkoutPriceId === product.priceId ? 'Opening Stripe...' : 'Commit'}
              </button>
            </article>
          )) : (
            <div className="catalog-empty">
              <h2>No active products found</h2>
              <p>Once active Stripe products with default prices exist, they will appear here automatically.</p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
