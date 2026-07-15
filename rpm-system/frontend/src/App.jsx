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
import CompassPage from './pages/CompassPage';
import RemindersPage from './pages/RemindersPage';
import AssistantPage from './pages/AssistantPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AuthCallbackPage from './pages/AuthCallbackPage';

// API Configuration
// In Coolify, use the backend URL from environment variable (should include /api)
// In local dev, use /api which proxies to backend
const API_BASE = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL
  : '/api';
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
    reorderCategories: (ids) => authFetch(`${API_BASE}/categories/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ ids })
    }).then(r => r.json()),
    reorderProjects: (ids) => authFetch(`${API_BASE}/projects/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ ids })
    }).then(r => r.json()),
    reorderActions: (ids) => authFetch(`${API_BASE}/actions/reorder`, {
      method: 'PUT', body: JSON.stringify({ ids })
    }).then(r => r.json()),
    getActionDependencies: (id) => authFetch(`${API_BASE}/actions/${id}/dependencies`).then(r => r.json()),
    addActionDependency: (id, depends_on_action_id) => authFetch(`${API_BASE}/actions/${id}/dependencies`, {
      method: 'POST', body: JSON.stringify({ depends_on_action_id })
    }).then(r => r.json()),
    removeActionDependency: (id, depId) => authFetch(`${API_BASE}/actions/${id}/dependencies/${depId}`, {
      method: 'DELETE'
    }).then(r => r.json()),

    // ---- AI layer ----
    getAiModels: () => authFetch(`${API_BASE}/ai/models`).then(r => r.json()),
    getAiKeys: () => authFetch(`${API_BASE}/ai/keys`).then(r => r.json()),
    saveAiKey: (provider, key) => authFetch(`${API_BASE}/ai/keys/${provider}`, {
      method: 'PUT', body: JSON.stringify({ key })
    }).then(r => r.json()),
    deleteAiKey: (provider) => authFetch(`${API_BASE}/ai/keys/${provider}`, { method: 'DELETE' }).then(r => r.json()),
    getAiConversations: () => authFetch(`${API_BASE}/ai/conversations`).then(r => r.json()),
    getAiConversation: (id) => authFetch(`${API_BASE}/ai/conversations/${id}`).then(r => r.json()),
    deleteAiConversation: (id) => authFetch(`${API_BASE}/ai/conversations/${id}`, { method: 'DELETE' }).then(r => r.json()),
    aiCoachCompass: (body) => authFetch(`${API_BASE}/ai/coach/compass`, {
      method: 'POST', body: JSON.stringify(body)
    }).then(r => r.json()),
    aiSuggestPlan: (body) => authFetch(`${API_BASE}/ai/suggest-plan`, {
      method: 'POST', body: JSON.stringify(body)
    }).then(r => r.json()),
    aiBrainDump: (body) => authFetch(`${API_BASE}/ai/braindump`, {
      method: 'POST', body: JSON.stringify(body)
    }).then(r => r.json()),
    aiBrainDumpApply: (body) => authFetch(`${API_BASE}/ai/braindump/apply`, {
      method: 'POST', body: JSON.stringify(body)
    }).then(r => r.json()),
    getAiUsage: (days = 30) => authFetch(`${API_BASE}/ai/usage?days=${days}`).then(r => r.json()),
    getForecast: () => authFetch(`${API_BASE}/forecast`).then(r => r.json()),
    forecastFix: (body) => authFetch(`${API_BASE}/forecast/fix`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
    getNotifPrefs: () => authFetch(`${API_BASE}/notifications/prefs`).then(r => r.json()),
    saveNotifPrefs: (patch) => authFetch(`${API_BASE}/notifications/prefs`, {
      method: 'PUT', body: JSON.stringify(patch)
    }).then(r => r.json()),
    sendTestDigest: () => authFetch(`${API_BASE}/notifications/test-digest`, { method: 'POST' }).then(r => r.json()),
    sendTestChief: () => authFetch(`${API_BASE}/notifications/test-chief`, { method: 'POST' }).then(r => r.json()),
    telegramStatus: () => authFetch(`${API_BASE}/telegram/status`).then(r => r.json()),
    setTelegramBot: (token) => authFetch(`${API_BASE}/telegram/bot`, { method: 'PUT', body: JSON.stringify({ token }) }).then(r => r.json()),
    removeTelegramBot: () => authFetch(`${API_BASE}/telegram/bot`, { method: 'DELETE' }).then(r => r.json()),
    telegramConnect: () => authFetch(`${API_BASE}/telegram/connect`, { method: 'POST' }).then(r => r.json()),
    telegramDisconnect: () => authFetch(`${API_BASE}/telegram/disconnect`, { method: 'POST' }).then(r => r.json()),
    pushPublicKey: () => authFetch(`${API_BASE}/push/public-key`).then(r => r.json()),
    pushSubscribe: (subscription) => authFetch(`${API_BASE}/push/subscribe`, { method: 'POST', body: JSON.stringify({ subscription }) }).then(r => r.json()),
    pushUnsubscribe: (endpoint) => authFetch(`${API_BASE}/push/unsubscribe`, { method: 'POST', body: JSON.stringify({ endpoint }) }).then(r => r.json()),
    getReminders: () => authFetch(`${API_BASE}/reminders`).then(r => r.json()),
    createReminder: (data) => authFetch(`${API_BASE}/reminders`, { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
    updateReminder: (id, data) => authFetch(`${API_BASE}/reminders/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
    deleteReminder: (id) => authFetch(`${API_BASE}/reminders/${id}`, { method: 'DELETE' }).then(r => r.json()),
    aiApplyProposal: (body) => authFetch(`${API_BASE}/ai/apply`, {
      method: 'POST', body: JSON.stringify(body)
    }).then(r => r.json()),
    aiSaveMessageTools: (id, tools) => authFetch(`${API_BASE}/ai/messages/${id}/tools`, {
      method: 'PUT', body: JSON.stringify({ tools })
    }).then(r => r.json()),
    // Returns the raw streaming Response for SSE reading in the page.
    aiChatStream: (body) => authFetch(`${API_BASE}/ai/chat`, { method: 'POST', body: JSON.stringify(body) }),
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

    // Inspiration Items
    getInspirationItems: (projectId) => authFetch(`${API_BASE}/inspiration-items?project_id=${projectId}`).then(r => r.json()),
    createInspirationItem: (data) => authFetch(`${API_BASE}/inspiration-items`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updateInspirationItem: (id, data) => authFetch(`${API_BASE}/inspiration-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    deleteInspirationItem: (id) => authFetch(`${API_BASE}/inspiration-items/${id}`, { method: 'DELETE' }).then(r => r.json()),

    // Leverage Requests
    getLeverageRequests: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return authFetch(`${API_BASE}/leverage-requests${query ? `?${query}` : ''}`).then(r => r.json());
    },
    createLeverageRequest: (data) => authFetch(`${API_BASE}/leverage-requests`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    updateLeverageRequest: (id, data) => authFetch(`${API_BASE}/leverage-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.json()),
    deleteLeverageRequest: (id) => authFetch(`${API_BASE}/leverage-requests/${id}`, { method: 'DELETE' }).then(r => r.json()),

    // Upload (multipart — do NOT use authFetch, which forces JSON content-type)
    uploadImage: async (file) => {
      const token = getToken();
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });
      return res.json();
    },

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
          <Route path="/compass" element={<CompassPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/settings" element={<SettingsPage />} />
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
