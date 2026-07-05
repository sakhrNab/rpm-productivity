import { useContext, useState, useEffect, useRef } from 'react';
import { Plus, Mail, Phone, MoreVertical, User, Pencil, Trash2 } from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import CreatePersonModal from '../components/modals/CreatePersonModal';

function PeoplePage() {
  const { persons, refreshData } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const [showModal, setShowModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    if (openMenuId) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const handleDelete = async (id) => {
    setOpenMenuId(null);
    if (window.confirm('Are you sure you want to delete this person?')) {
      try {
        await api.deletePerson(id);
        refreshData();
      } catch (error) {
        console.error('Failed to delete person:', error);
      }
    }
  };

  const handleEdit = (person) => {
    setOpenMenuId(null);
    setEditingPerson(person);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPerson(null);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">People</h1>
        <button className="btn btn-primary" onClick={() => { setEditingPerson(null); setShowModal(true); }}>
          <Plus size={16} />
          Add Person
        </button>
      </div>

      <div className="people-grid">
        {persons.length === 0 ? (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            <User size={48} />
            <p>No people added yet</p>
            <button className="btn btn-primary" onClick={() => { setEditingPerson(null); setShowModal(true); }}>
              Add Your First Person
            </button>
          </div>
        ) : (
          persons.map(person => (
            <div key={person.id} className={`card ${openMenuId === person.id ? 'menu-open' : ''}`}>
              <div className="card-body">
                <div className="person-header">
                  <div className="person-avatar">
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="person-info">
                    <h3 className="person-name">{person.name}</h3>
                    {person.notes && <p className="person-note">{person.notes}</p>}
                  </div>
                  <div
                    className="dropdown"
                    style={{ position: 'relative' }}
                    ref={openMenuId === person.id ? menuRef : null}
                  >
                    <button
                      className="btn btn-icon btn-ghost"
                      aria-label="Person options"
                      onClick={() => setOpenMenuId(openMenuId === person.id ? null : person.id)}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openMenuId === person.id && (
                      <div className="dropdown-menu" style={{ left: 'auto', right: 0, minWidth: 140 }}>
                        <div className="dropdown-item" onClick={() => handleEdit(person)}>
                          <Pencil size={14} />
                          Edit
                        </div>
                        <div
                          className="dropdown-item"
                          style={{ color: 'var(--accent-red)' }}
                          onClick={() => handleDelete(person.id)}
                        >
                          <Trash2 size={14} />
                          Delete
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="person-contacts">
                  {person.email && (
                    <a href={`mailto:${person.email}`} className="person-contact">
                      <Mail size={14} />
                      {person.email}
                    </a>
                  )}
                  {person.phone && (
                    <a href={`tel:${person.phone}`} className="person-contact">
                      <Phone size={14} />
                      {person.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <CreatePersonModal
          initialData={editingPerson}
          onClose={closeModal}
          onSuccess={() => {
            closeModal();
            refreshData();
          }}
        />
      )}
    </div>
  );
}

export default PeoplePage;
