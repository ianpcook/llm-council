import React, { useState, useEffect } from 'react';
import { api } from '../api';
import './PersonalityManager.css';

function PersonalityManager({ onClose }) {
  const [personalities, setPersonalities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingPersonality, setEditingPersonality] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    type: 'detailed',
    category: 'custom',
    expertise: '',
    perspective: '',
    communication_style: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadCategories();
    loadPersonalities();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await api.getPersonalityCategories();
      setCategories(data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadPersonalities = async (category = null) => {
    try {
      setLoading(true);
      const data = await api.listPersonalities(category);
      setPersonalities(data);
      setError(null);
    } catch (err) {
      setError('Failed to load personalities');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryFilter = (categoryId) => {
    setSelectedCategory(categoryId);
    loadPersonalities(categoryId);
  };

  // Group personalities by category for display
  const groupedPersonalities = personalities.reduce((acc, p) => {
    const cat = p.category || 'custom';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const getCategoryDisplayName = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId);
    return cat ? cat.display_name : categoryId;
  };

  const handleCreate = () => {
    setEditingPersonality(null);
    setFormData({
      name: '',
      role: '',
      type: 'detailed',
      category: 'custom',
      expertise: '',
      perspective: '',
      communication_style: ''
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleEdit = (personality) => {
    setEditingPersonality(personality);
    setFormData({
      name: personality.name,
      role: personality.role,
      type: personality.type,
      category: personality.category || 'custom',
      expertise: personality.expertise.join(', '),
      perspective: personality.perspective || '',
      communication_style: personality.communication_style || ''
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleDelete = (personality) => {
    setDeleteTarget(personality);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await api.deletePersonality(deleteTarget.id);
      setDeleteTarget(null);
      loadPersonalities();
    } catch (err) {
      console.error('Failed to delete personality:', err);
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.role.trim()) errors.role = 'Role is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const data = {
        name: formData.name,
        role: formData.role,
        type: formData.type,
        category: formData.category,
        expertise: formData.expertise.split(',').map(s => s.trim()).filter(s => s),
        perspective: formData.perspective,
        communication_style: formData.communication_style
      };

      if (editingPersonality) {
        await api.updatePersonality(editingPersonality.id, data);
      } else {
        await api.createPersonality(data);
      }

      setShowModal(false);
      loadPersonalities(selectedCategory);
    } catch (err) {
      console.error('Failed to save personality:', err);
      setFormErrors({ submit: 'Failed to save personality' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="personality-manager">
        <div className="loading">Loading personalities...</div>
      </div>
    );
  }

  return (
    <div className="personality-manager">
      <div className="personality-manager-header">
        <h2>Manage Personalities</h2>
        <div className="personality-manager-actions">
          <button className="btn btn-primary" onClick={handleCreate}>
            Create New
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* Category filter tabs */}
      <div className="category-filter">
        <button
          className={`category-tab ${selectedCategory === null ? 'active' : ''}`}
          onClick={() => handleCategoryFilter(null)}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`category-tab ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => handleCategoryFilter(cat.id)}
          >
            {cat.display_name}
          </button>
        ))}
      </div>

      {personalities.length === 0 ? (
        <div className="empty-state">
          <p>No personalities {selectedCategory ? 'in this category' : 'yet'}.</p>
          <button className="btn btn-primary" onClick={handleCreate}>
            Create your first personality
          </button>
        </div>
      ) : (
        <div className="personality-groups">
          {selectedCategory === null ? (
            // Grouped view when showing all
            Object.entries(groupedPersonalities).map(([categoryId, categoryPersonalities]) => (
              <div key={categoryId} className="personality-group">
                <h3 className="personality-group-title">{getCategoryDisplayName(categoryId)}</h3>
                <div className="personality-list">
                  {categoryPersonalities.map((personality) => (
                    <div key={personality.id} className="personality-card">
                      <div className="personality-card-header">
                        <h3 className="personality-card-name">{personality.name}</h3>
                        <span className="personality-card-type">{personality.type}</span>
                      </div>
                      <p className="personality-card-role">{personality.role}</p>
                      <div className="personality-card-actions">
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => handleEdit(personality)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleDelete(personality)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            // Flat list when filtered by category
            <div className="personality-list">
              {personalities.map((personality) => (
                <div key={personality.id} className="personality-card">
                  <div className="personality-card-header">
                    <h3 className="personality-card-name">{personality.name}</h3>
                    <span className="personality-card-type">{personality.type}</span>
                  </div>
                  <p className="personality-card-role">{personality.role}</p>
                  <div className="personality-card-actions">
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => handleEdit(personality)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => handleDelete(personality)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingPersonality ? 'Edit Personality' : 'Create Personality'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Systems Architect"
              />
              {formErrors.name && <div className="form-error">{formErrors.name}</div>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Type</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value})}
                >
                  <option value="detailed">Detailed</option>
                  <option value="simple">Simple</option>
                </select>
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.display_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Role *</label>
              <textarea
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value})}
                placeholder="Describe the personality's role and background..."
              />
              {formErrors.role && <div className="form-error">{formErrors.role}</div>}
            </div>

            {formData.type === 'detailed' && (
              <>
                <div className="form-group">
                  <label>Expertise (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.expertise}
                    onChange={e => setFormData({...formData, expertise: e.target.value})}
                    placeholder="e.g., distributed systems, scalability"
                  />
                </div>

                <div className="form-group">
                  <label>Perspective</label>
                  <textarea
                    value={formData.perspective}
                    onChange={e => setFormData({...formData, perspective: e.target.value})}
                    placeholder="How this personality evaluates responses..."
                  />
                </div>

                <div className="form-group">
                  <label>Communication Style</label>
                  <input
                    type="text"
                    value={formData.communication_style}
                    onChange={e => setFormData({...formData, communication_style: e.target.value})}
                    placeholder="e.g., Technical but accessible"
                  />
                </div>
              </>
            )}

            {formErrors.submit && <div className="form-error">{formErrors.submit}</div>}

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-content delete-confirmation" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Personality</h3>
              <button className="modal-close" onClick={cancelDelete}>×</button>
            </div>
            <p>
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
            </p>
            <p style={{fontSize: '14px', color: '#666'}}>
              This action cannot be undone.
            </p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={cancelDelete} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PersonalityManager;
