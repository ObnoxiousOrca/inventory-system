import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ProductDialog from './components/ProductDialog.jsx';
import { inventoryApi } from './api.js';

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'products', label: 'Products', icon: '▤' },
  { id: 'notifications', label: 'Notifications', icon: '♧' },
];

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
const dateTime = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function StockBadge({ low }) {
  return <span className={`status-badge ${low ? 'status-low' : 'status-good'}`}>{low ? 'Low stock' : 'In stock'}</span>;
}

function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">▤</span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

function App() {
  const [page, setPage] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [nextProducts, nextDashboard] = await Promise.all([
        inventoryApi.getProducts(),
        inventoryApi.getDashboard(),
      ]);
      setProducts(nextProducts);
      setDashboard(nextDashboard);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const lowStock = useMemo(() => products.filter((product) => product.isLowStock), [products]);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      [product.name, product.productId, product.category].some((value) => value.toLowerCase().includes(query))
    );
  }, [products, search]);

  async function saveProduct(values) {
    if (dialog.mode === 'new') {
      await inventoryApi.createProduct(values);
      setNotice('Product added successfully');
    } else if (dialog.mode === 'edit') {
      await inventoryApi.updateProduct(dialog.product.productId, values);
      setNotice('Product updated successfully');
    } else {
      await inventoryApi.adjustStock(dialog.product.productId, values.operation, values.amount);
      setNotice('Stock updated successfully');
    }
    await refresh();
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Delete ${product.name} (${product.productId})? This cannot be undone.`)) return;
    try {
      await inventoryApi.deleteProduct(product.productId);
      setNotice('Product deleted');
      await refresh();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  const title = navigation.find((item) => item.id === page)?.label || 'Dashboard';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage('dashboard'); }}>
          <span className="brand-mark">S</span>
          <span>stockroom<small>INVENTORY</small></span>
        </a>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'nav-active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'notifications' && lowStock.length > 0 && (
                <span className="nav-count">{lowStock.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="connection-dot" />
          <span>Inventory workspace</span>
          <small>LOCAL ENVIRONMENT</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>{title}</strong></div>
          <div className="topbar-right">
            <span className="live-indicator"><i /> Live data</span>
            <span className="avatar">S</span>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">INVENTORY OVERVIEW</p>
              <h1>{page === 'dashboard' ? 'Good to see you.' : title}</h1>
              <p className="page-subtitle">
                {page === 'dashboard' && 'Here’s what’s happening with your inventory today.'}
                {page === 'products' && 'Keep your products and stock details up to date.'}
                {page === 'notifications' && 'Products that need a little attention.'}
              </p>
            </div>
            {page !== 'notifications' && (
              <button className="button button-primary add-button" onClick={() => setDialog({ mode: 'new' })}>
                <span>＋</span> Add product
              </button>
            )}
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button className="text-button" onClick={refresh}>Try again</button>
            </div>
          )}

          {loading ? (
            <div className="loading-state"><span className="spinner" /> Loading inventory…</div>
          ) : page === 'dashboard' ? (
            <Dashboard dashboard={dashboard} products={products} onNavigate={setPage} />
          ) : page === 'products' ? (
            <Products
              products={filteredProducts}
              search={search}
              onSearch={setSearch}
              onEdit={(product) => setDialog({ mode: 'edit', product })}
              onStock={(product) => setDialog({ mode: 'stock', product })}
              onDelete={deleteProduct}
            />
          ) : (
            <Notifications products={lowStock} onViewProducts={() => setPage('products')} />
          )}
        </div>
      </main>

      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
      {dialog && (
        <ProductDialog
          key={`${dialog.mode}-${dialog.product?.productId || 'new'}`}
          mode={dialog.mode}
          product={dialog.product}
          onClose={() => setDialog(null)}
          onSave={saveProduct}
        />
      )}
    </div>
  );
}

function Dashboard({ dashboard, products, onNavigate }) {
  const maxCategory = Math.max(1, ...(dashboard?.stockByCategory || []).map((item) => item.quantity));
  return (
    <>
      <section className="summary-grid" aria-label="Inventory summary">
        <SummaryCard label="Total products" value={dashboard?.totalProducts ?? 0} icon="▤" tone="green" foot="Active product listings" />
        <SummaryCard label="Units in stock" value={(dashboard?.totalQuantity ?? 0).toLocaleString()} icon="◫" tone="blue" foot="Across all products" />
        <SummaryCard label="Low stock items" value={dashboard?.lowStockCount ?? 0} icon="!" tone="amber" foot="Products at or below threshold" />
      </section>

      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div><h2>Recently updated</h2><p>Your latest inventory changes</p></div>
            <button className="text-button" onClick={() => onNavigate('products')}>View all <span>→</span></button>
          </div>
          {dashboard?.recentlyUpdated?.length ? (
            <div className="recent-list">
              {dashboard.recentlyUpdated.map((product) => (
                <div className="recent-row" key={product.productId}>
                  <span className={`product-avatar ${product.isLowStock ? 'avatar-warn' : ''}`}>{product.name.charAt(0).toUpperCase()}</span>
                  <div className="recent-name"><strong>{product.name}</strong><span>{product.category} · {product.productId}</span></div>
                  <div className="recent-quantity"><strong>{product.quantity}</strong><span>units</span></div>
                  <StockBadge low={product.isLowStock} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No products yet" detail="Add your first product to see inventory activity." />
          )}
        </section>

        <section className="panel category-panel">
          <div className="panel-heading">
            <div><h2>Stock by category</h2><p>Units available by category</p></div>
            <span className="panel-icon">◫</span>
          </div>
          {dashboard?.stockByCategory?.length ? (
            <div className="category-list">
              {dashboard.stockByCategory.map((item) => (
                <div className="category-item" key={item.category}>
                  <div className="category-label"><span>{item.category}</span><strong>{item.quantity.toLocaleString()}</strong></div>
                  <div className="progress-track"><span style={{ width: `${(item.quantity / maxCategory) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No category data" detail="Stock levels will appear here once products are added." />
          )}
          <div className="category-foot"><span>Inventory distribution</span><strong>{products.length} products</strong></div>
        </section>
      </div>
      <div className="dashboard-note"><span className="note-icon">i</span> Low-stock alerts are monitored automatically. Email notifications are managed by the backend.</div>
    </>
  );
}

function SummaryCard({ label, value, icon, tone, foot }) {
  return (
    <article className="summary-card">
      <div className="summary-top"><span>{label}</span><span className={`summary-icon icon-${tone}`}>{icon}</span></div>
      <strong className="summary-value">{value}</strong>
      <span className="summary-foot">{foot}</span>
    </article>
  );
}

function Products({ products, search, onSearch, onEdit, onStock, onDelete }) {
  return (
    <section className="panel products-panel">
      <div className="panel-heading products-heading">
        <div><h2>All products <span className="subtle-count">{products.length}</span></h2><p>Manage your catalog and stock levels</p></div>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search products..." aria-label="Search products" />
        </label>
      </div>
      {products.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Product</th><th>Category</th><th>SKU</th><th>Quantity</th><th>Threshold</th><th>Price</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr className={product.isLowStock ? 'low-stock-row' : ''} key={product.productId}>
                    <td><div className="table-product"><span className={`product-avatar ${product.isLowStock ? 'avatar-warn' : ''}`}>{product.name.charAt(0).toUpperCase()}</span><strong>{product.name}</strong></div></td>
                    <td>{product.category}</td>
                    <td><span className="sku">{product.productId}</span></td>
                    <td><strong className={product.isLowStock ? 'quantity-low' : ''}>{product.quantity}</strong><span className="unit-label"> units</span></td>
                    <td>{product.lowStockThreshold}</td>
                    <td>{money.format(product.price)}</td>
                    <td><StockBadge low={product.isLowStock} /></td>
                    <td>
                      <div className="row-actions">
                        <button className="action-button" onClick={() => onStock(product)}>Stock</button>
                        <button className="action-button" onClick={() => onEdit(product)}>Edit</button>
                        <button className="action-button action-delete" onClick={() => onDelete(product)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">Showing <strong>{products.length}</strong> {products.length === 1 ? 'product' : 'products'}</div>
        </>
      ) : (
        <EmptyState
          title={search ? 'No matching products' : 'Your inventory is empty'}
          detail={search ? 'Try another name, category, or SKU.' : 'Add a product to get your inventory started.'}
        />
      )}
    </section>
  );
}

function Notifications({ products, onViewProducts }) {
  return (
    <section className="panel notifications-panel">
      <div className="panel-heading">
        <div><h2>Low-stock alerts <span className="subtle-count">{products.length}</span></h2><p>Products at or below their low-stock threshold</p></div>
        <span className="alert-summary">{products.length} {products.length === 1 ? 'product needs' : 'products need'} attention</span>
      </div>
      {products.length ? (
        <div className="alert-list">
          {products.map((product) => (
            <article className="alert-card" key={product.productId}>
              <span className="alert-icon">!</span>
              <div className="alert-copy">
                <strong>{product.name}</strong>
                <span>{product.category} · SKU {product.productId}</span>
              </div>
              <div className="alert-quantity"><strong>{product.quantity}</strong><span>in stock</span></div>
              <div className="alert-threshold">Threshold <strong>{product.lowStockThreshold}</strong></div>
              <StockBadge low />
              <button className="button button-secondary alert-action" onClick={onViewProducts}>Manage</button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="All stocked up" detail="There are no products at or below their low-stock threshold." />
      )}
      <div className="notification-foot"><span className="note-icon">i</span> Low-stock email alerts are sent by the backend when SNS is configured.</div>
    </section>
  );
}

export default App;
