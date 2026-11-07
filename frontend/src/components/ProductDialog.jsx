import React, { useState } from 'react';

const emptyProduct = {
  productId: '',
  name: '',
  category: '',
  quantity: '',
  lowStockThreshold: '',
  price: '',
  description: '',
};

export default function ProductDialog({ product, mode, onClose, onSave }) {
  const [form, setForm] = useState(product ? { ...product } : { ...emptyProduct });
  const [operation, setOperation] = useState('increase');
  const [amount, setAmount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isStock = mode === 'stock';
  const isEditing = mode === 'edit';
  const title = isStock ? 'Adjust stock' : isEditing ? 'Edit product' : 'Add product';

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (isStock) {
        await onSave({ operation, amount: Number(amount) });
      } else {
        const values = {
          name: form.name.trim(),
          category: form.category.trim(),
          lowStockThreshold: Number(form.lowStockThreshold),
          price: Number(form.price),
          description: form.description.trim(),
        };
        if (!isEditing) {
          values.productId = form.productId.trim();
          values.quantity = Number(form.quantity);
        }
        await onSave(values);
      }
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{isStock ? 'STOCK CONTROL' : 'PRODUCT DETAILS'}</p>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>

        {isStock ? (
          <form onSubmit={submit}>
            <p className="dialog-product">{product.name} <span>· {product.productId}</span></p>
            <label>
              Operation
              <select value={operation} onChange={(event) => setOperation(event.target.value)}>
                <option value="increase">Add stock</option>
                <option value="reduce">Remove stock</option>
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                max="1000000"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
              <button className="button button-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Update stock'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submit}>
            <div className="form-grid">
              {!isEditing && (
                <label>
                  SKU / Product ID
                  <input name="productId" value={form.productId} onChange={updateField} maxLength="64" required />
                </label>
              )}
              <label className={isEditing ? '' : 'field-wide'}>
                Product name
                <input name="name" value={form.name} onChange={updateField} maxLength="120" required />
              </label>
              <label>
                Category
                <input name="category" value={form.category} onChange={updateField} maxLength="60" required />
              </label>
              {!isEditing && (
                <label>
                  Starting quantity
                  <input name="quantity" type="number" min="0" step="1" value={form.quantity} onChange={updateField} required />
                </label>
              )}
              <label>
                Low-stock threshold
                <input name="lowStockThreshold" type="number" min="0" step="1" value={form.lowStockThreshold} onChange={updateField} required />
              </label>
              <label>
                Price
                <input name="price" type="number" min="0" step="0.01" value={form.price} onChange={updateField} required />
              </label>
              <label className="field-wide">
                Description <span className="optional-label">Optional</span>
                <textarea name="description" rows="3" maxLength="500" value={form.description || ''} onChange={updateField} />
              </label>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
              <button className="button button-primary" disabled={saving}>
                {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Add product'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
