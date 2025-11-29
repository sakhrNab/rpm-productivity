import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import Navbar from './components/Navbar';
import CategoriesPage from './pages/CategoriesPage';
import CategoryDetailPage from './pages/CategoryDetailPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import CalendarPage from './pages/CalendarPage';
import PeoplePage from './pages/PeoplePage';
import MyWeekPage from './pages/MyWeekPage';
import MyDayPage from './pages/MyDayPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AuthCallbackPage from './pages/AuthCallbackPage';

// API Configuration
const API_BASE = '/api';

// Auth Context
export const AuthContext = createContext(null);

// Get stored tokens
const getStoredTokens = () => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken')
});

// Store tokens
const storeTokens = (accessToken, refreshToken) => {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
};

// Clear tokens
const clearTokens = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

// API Helper with Auth
const createApi = (getToken, refreshTokenFn, logout) => {
  const authFetch = async (url, options = {}) => {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    };

    let response = await fetch(url, { ...options, headers });

    // If token expired, try to refresh
    if (response.status === 401) {
      const data = await response.json();
      if (data.code === 'TOKEN_EXPIRED') {
        const newToken = await refreshTokenFn();
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
          response = await fetch(url, { ...options, headers });
        } else {
          logout();
          throw new Error('Session expired');
        }
      }
    }

    return response;
  };

  return {
    // Auth
    register: (data) => fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),

    login: (data) => fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),

    refreshToken: (token) => fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token })
    }).then(r => r.json()),

    getMe: () => authFetch(`${API_BASE}/auth/me`).then(r => r.json()),

    logout: (refreshToken) => authFetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      body: JSON.stringify({ refreshToken })
    }).then(r => r.json()),

    // Categories
    getCategories: () => authFetch(`${API_BASE}/categories`).then(r => r.json()),
    getCategory: (id) => authFetch(`${API_BASE}/categories/${id}`).then(r => r.json()),
    createCategory: (data) => authFetch(`${API_BASE}/categories`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updateCategory: (id, data) => authFetch(`${API_BASE}/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updateCategoryDetails: (id, data) => authFetch(`${API_BASE}/categories/${id}/details`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    deleteCategory: (id) => authFetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' }).then(r => r.json()),

    // Projects
    getProjects: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return authFetch(`${API_BASE}/projects${query ? `?${query}` : ''}`).then(r => r.json());
    },
    getProject: (id) => authFetch(`${API_BASE}/projects/${id}`).then(r => r.json()),
    createProject: (data) => authFetch(`${API_BASE}/projects`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updateProject: (id, data) => authFetch(`${API_BASE}/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    deleteProject: (id) => authFetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' }).then(r => r.json()),

    // Actions
    getActions: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return authFetch(`${API_BASE}/actions${query ? `?${query}` : ''}`).then(r => r.json());
    },
    getAction: (id) => authFetch(`${API_BASE}/actions/${id}`).then(r => r.json()),
    createAction: (data) => authFetch(`${API_BASE}/actions`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updateAction: (id, data) => authFetch(`${API_BASE}/actions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    duplicateAction: (id) => authFetch(`${API_BASE}/actions/${id}/duplicate`, { method: 'POST' }).then(r => r.json()),
    deleteAction: (id) => authFetch(`${API_BASE}/actions/${id}`, { method: 'DELETE' }).then(r => r.json()),

    // Blocks
    getBlocks: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return authFetch(`${API_BASE}/blocks${query ? `?${query}` : ''}`).then(r => r.json());
    },
    getBlock: (id) => authFetch(`${API_BASE}/blocks/${id}`).then(r => r.json()),
    createBlock: (data) => authFetch(`${API_BASE}/blocks`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updateBlock: (id, data) => authFetch(`${API_BASE}/blocks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    deleteBlock: (id) => authFetch(`${API_BASE}/blocks/${id}`, { method: 'DELETE' }).then(r => r.json()),

    // Key Results
    getKeyResults: (projectId) => authFetch(`${API_BASE}/projects/${projectId}/key-results`).then(r => r.json()),
    createKeyResult: (data) => authFetch(`${API_BASE}/key-results`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updateKeyResult: (id, data) => authFetch(`${API_BASE}/key-results/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    deleteKeyResult: (id) => authFetch(`${API_BASE}/key-results/${id}`, { method: 'DELETE' }).then(r => r.json()),

    // Capture Items
    getCaptureItems: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return authFetch(`${API_BASE}/capture-items${query ? `?${query}` : ''}`).then(r => r.json());
    },
    createCaptureItem: (data) => authFetch(`${API_BASE}/capture-items`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updateCaptureItem: (id, data) => authFetch(`${API_BASE}/capture-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    deleteCaptureItem: (id) => authFetch(`${API_BASE}/capture-items/${id}`, { method: 'DELETE' }).then(r => r.json()),

    // Persons
    getPersons: () => authFetch(`${API_BASE}/persons`).then(r => r.json()),
    createPerson: (data) => authFetch(`${API_BASE}/persons`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updatePerson: (id, data) => authFetch(`${API_BASE}/persons/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    deletePerson: (id) => authFetch(`${API_BASE}/persons/${id}`, { method: 'DELETE' }).then(r => r.json()),

    // Planner
    getPlanner: (startDate, endDate) => authFetch(`${API_BASE}/planner?start_date=${startDate}&end_date=${endDate}`).then(r => r.json()),
  };
};

// App Context for data
export const AppContext = createContext(null);

// Protected Route Component
function ProtectedRoute({ children }) {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// Auth Provider Component
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(getStoredTokens().accessToken);

  const getToken = () => accessToken;

  const refreshTokenFn = async () => {
    const { refreshToken } = getStoredTokens();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) return null;

      const data = await response.json();
      storeTokens(data.accessToken, data.refreshToken);
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    }
  };

  const logout = async () => {
    const { refreshToken } = getStoredTokens();
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ refreshToken })
      });
    } catch (e) {
      // Ignore logout errors
    }
    clearTokens();
    setAccessToken(null);
    setUser(null);
  };

  const api = createApi(getToken, refreshTokenFn, logout);

  const login = async (email, password) => {
    const result = await api.login({ email, password });
    if (result.error) throw new Error(result.error);
    storeTokens(result.accessToken, result.refreshToken);
    setAccessToken(result.accessToken);
    setUser(result.user);
    return result.user;
  };

  const register = async (email, password, name) => {
    const result = await api.register({ email, password, name });
    if (result.error) throw new Error(result.error);
    storeTokens(result.accessToken, result.refreshToken);
    setAccessToken(result.accessToken);
    setUser(result.user);
    return result.user;
  };

  const handleOAuthCallback = (tokens) => {
    storeTokens(tokens.accessToken, tokens.refreshToken);
    setAccessToken(tokens.accessToken);
  };

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { accessToken: token } = getStoredTokens();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else if (response.status === 401) {
          // Try to refresh
          const newToken = await refreshTokenFn();
          if (newToken) {
            const retryResponse = await fetch(`${API_BASE}/auth/me`, {
              headers: { 'Authorization': `Bearer ${newToken}` }
            });
            if (retryResponse.ok) {
              const userData = await retryResponse.json();
              setUser(userData);
            } else {
              clearTokens();
            }
          } else {
            clearTokens();
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        clearTokens();
      }

      setLoading(false);
    };

    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, handleOAuthCallback, api }}>
      {children}
    </AuthContext.Provider>
  );
}

// Main App Content (authenticated)
function AppContent() {
  const { api } = useContext(AuthContext);
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [categoriesData, projectsData, personsData] = await Promise.all([
          api.getCategories(),
          api.getProjects(),
          api.getPersons()
        ]);
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        setProjects(Array.isArray(projectsData) ? projectsData : []);
        setPersons(Array.isArray(personsData) ? personsData : []);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [api]);

  const refreshData = async () => {
    const [categoriesData, projectsData, personsData] = await Promise.all([
      api.getCategories(),
      api.getProjects(),
      api.getPersons()
    ]);
    setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    setProjects(Array.isArray(projectsData) ? projectsData : []);
    setPersons(Array.isArray(personsData) ? personsData : []);
  };

  const contextValue = {
    categories,
    setCategories,
    projects,
    setProjects,
    persons,
    setPersons,
    refreshData,
    loading,
    api
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={contextValue}>
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
    </AppContext.Provider>
  );
}

function App() {
  return (
    <AuthProvider>
      <div className="app-container">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppContent />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </AuthProvider>
  );
}

export default App;
