import { Routes, Route } from 'react-router-dom';
import { useState, useEffect, createContext } from 'react';
import Navbar from './components/Navbar';
import CategoriesPage from './pages/CategoriesPage';
import CategoryDetailPage from './pages/CategoryDetailPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import CalendarPage from './pages/CalendarPage';
import PeoplePage from './pages/PeoplePage';
import MyWeekPage from './pages/MyWeekPage';
import MyDayPage from './pages/MyDayPage';

// API Configuration
const API_BASE = '/api';

// Context for global state
export const AppContext = createContext(null);

// API Helper Functions
export const api = {
  // Categories
  getCategories: () => fetch(`${API_BASE}/categories`).then(r => r.json()),
  getCategory: (id) => fetch(`${API_BASE}/categories/${id}`).then(r => r.json()),
  createCategory: (data) => fetch(`${API_BASE}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  updateCategory: (id, data) => fetch(`${API_BASE}/categories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  updateCategoryDetails: (id, data) => fetch(`${API_BASE}/categories/${id}/details`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteCategory: (id) => fetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Projects
  getProjects: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_BASE}/projects${query ? `?${query}` : ''}`).then(r => r.json());
  },
  getProject: (id) => fetch(`${API_BASE}/projects/${id}`).then(r => r.json()),
  createProject: (data) => fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  updateProject: (id, data) => fetch(`${API_BASE}/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteProject: (id) => fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Actions
  getActions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_BASE}/actions${query ? `?${query}` : ''}`).then(r => r.json());
  },
  getAction: (id) => fetch(`${API_BASE}/actions/${id}`).then(r => r.json()),
  createAction: (data) => fetch(`${API_BASE}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  updateAction: (id, data) => fetch(`${API_BASE}/actions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  duplicateAction: (id) => fetch(`${API_BASE}/actions/${id}/duplicate`, { method: 'POST' }).then(r => r.json()),
  deleteAction: (id) => fetch(`${API_BASE}/actions/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Blocks
  getBlocks: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_BASE}/blocks${query ? `?${query}` : ''}`).then(r => r.json());
  },
  getBlock: (id) => fetch(`${API_BASE}/blocks/${id}`).then(r => r.json()),
  createBlock: (data) => fetch(`${API_BASE}/blocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  updateBlock: (id, data) => fetch(`${API_BASE}/blocks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteBlock: (id) => fetch(`${API_BASE}/blocks/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Key Results
  getKeyResults: (projectId) => fetch(`${API_BASE}/projects/${projectId}/key-results`).then(r => r.json()),
  createKeyResult: (data) => fetch(`${API_BASE}/key-results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  updateKeyResult: (id, data) => fetch(`${API_BASE}/key-results/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteKeyResult: (id) => fetch(`${API_BASE}/key-results/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Capture Items
  getCaptureItems: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_BASE}/capture-items${query ? `?${query}` : ''}`).then(r => r.json());
  },
  createCaptureItem: (data) => fetch(`${API_BASE}/capture-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  updateCaptureItem: (id, data) => fetch(`${API_BASE}/capture-items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteCaptureItem: (id) => fetch(`${API_BASE}/capture-items/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Persons
  getPersons: () => fetch(`${API_BASE}/persons`).then(r => r.json()),
  createPerson: (data) => fetch(`${API_BASE}/persons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  updatePerson: (id, data) => fetch(`${API_BASE}/persons/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deletePerson: (id) => fetch(`${API_BASE}/persons/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Planner
  getPlanner: (startDate, endDate) => fetch(`${API_BASE}/planner?start_date=${startDate}&end_date=${endDate}`).then(r => r.json()),
};

function App() {
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [categoriesData, projectsData, personsData] = await Promise.all([
          api.getCategories(),
          api.getProjects(),
          api.getPersons()
        ]);
        setCategories(categoriesData);
        setProjects(projectsData);
        setPersons(personsData);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const refreshData = async () => {
    const [categoriesData, projectsData, personsData] = await Promise.all([
      api.getCategories(),
      api.getProjects(),
      api.getPersons()
    ]);
    setCategories(categoriesData);
    setProjects(projectsData);
    setPersons(personsData);
  };

  const contextValue = {
    categories,
    setCategories,
    projects,
    setProjects,
    persons,
    setPersons,
    refreshData,
    loading
  };

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={contextValue}>
      <div className="app-container">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<CategoriesPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/categories/:id" element={<CategoryDetailPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/my-week" element={<MyWeekPage />} />
            <Route path="/my-day" element={<MyDayPage />} />
            <Route path="/people" element={<PeoplePage />} />
          </Routes>
        </main>
      </div>
    </AppContext.Provider>
  );
}

export default App;
