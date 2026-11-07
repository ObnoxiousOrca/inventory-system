const API_URL = (
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '')
).replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || `Request failed (${response.status})`);
  }
  return result;
}

export const inventoryApi = {
  getProducts: () => request('/api/products').then((result) => result.items),
  getDashboard: () => request('/api/dashboard'),
  createProduct: (product) =>
    request('/api/products', { method: 'POST', body: JSON.stringify(product) }),
  updateProduct: (id, product) =>
    request(`/api/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(product),
    }),
  deleteProduct: (id) =>
    request(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adjustStock: (id, operation, amount) =>
    request(`/api/products/${encodeURIComponent(id)}/stock`, {
      method: 'POST',
      body: JSON.stringify({ operation, amount }),
    }),
};
