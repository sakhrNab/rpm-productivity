import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import Navbar from './components/Navbar';
import CategoryDetailPage from './pages/CategoryDetailPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import PeoplePage from './pages/PeoplePage';
import RemindersPage from './pages/RemindersPage';
import TodayPage from './pages/TodayPage';
import WeekPage from './pages/WeekPage';
import PlanPage from './pages/PlanPage';
import CoachHubPage from './pages/CoachHubPage';
import PlanImportPage from './pages/PlanImportPage';
import BusinessPage from './pages/BusinessPage';
import VoiceOrb from './components/VoiceOrb';
import GlobalFileDrop from './components/GlobalFileDrop';
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
    // Header bell: unread coach messages, reminders due in 24h, carried-over count.
    getInbox: () => authFetch(`${API_BASE}/inbox?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`).then(r => r.json()),
    markInboxRead: () => authFetch(`${API_BASE}/inbox/read-all`, { method: 'POST' }).then(r => r.json()),
    getOverdueActions: (today) => authFetch(`${API_BASE}/actions/overdue?today=${today}`).then(r => r.json()),
    triageOverdue: (body) => authFetch(`${API_BASE}/actions/triage`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
    // Coaches
    getCoaches: () => authFetch(`${API_BASE}/coaches`).then(r => r.json()),
    getCategoryCoach: (id) => authFetch(`${API_BASE}/categories/${id}/coach`).then(r => r.json()),
    getProjectCoach: (id) => authFetch(`${API_BASE}/projects/${id}/coach`).then(r => r.json()),
    draftCoach: (body) => authFetch(`${API_BASE}/coaches/draft`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
    createCoach: (body) => authFetch(`${API_BASE}/coaches`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
    getCoach: (id) => authFetch(`${API_BASE}/coaches/${id}`).then(r => r.json()),
    getCoachSnapshot: (id, today) => authFetch(`${API_BASE}/coaches/${id}/snapshot?today=${today}`).then(r => r.json()),
    updateCoach: (id, body) => authFetch(`${API_BASE}/coaches/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then(r => r.json()),
    deleteCoach: (id) => authFetch(`${API_BASE}/coaches/${id}`, { method: 'DELETE' }).then(r => r.json()),
    coachChatStream: (id, body, signal) => authFetch(`${API_BASE}/coaches/${id}/chat`, { method: 'POST', body: JSON.stringify({ modelKey: localStorage.getItem('ai.modelKey') || undefined, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...body }), signal }),
    coachRemember: (id, transcript) => authFetch(`${API_BASE}/coaches/${id}/remember`, { method: 'POST', body: JSON.stringify({ transcript, modelKey: localStorage.getItem('ai.modelKey') || undefined }) }).then(r => r.json()),
    getCoachMessages: (id, limit = 60) => authFetch(`${API_BASE}/coaches/${id}/messages?limit=${limit}`).then(r => r.json()),
    markCoachRead: (id) => authFetch(`${API_BASE}/coaches/${id}/read`, { method: 'POST' }).then(r => r.json()),
    coachCheckinNow: (id) => authFetch(`${API_BASE}/coaches/${id}/checkin`, { method: 'POST', body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) }).then(r => r.json()),
    coachFollowup: (id, actionId, op) => authFetch(`${API_BASE}/coaches/${id}/followup`, { method: 'POST', body: JSON.stringify({ actionId, op, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) }).then(r => r.json()),
    saveCoachMessageTools: (msgId, tools) => authFetch(`${API_BASE}/coaches/messages/${msgId}/tools`, { method: 'PUT', body: JSON.stringify({ tools }) }).then(r => r.json()),
    saveDefaultModel: (modelKey) => authFetch(`${API_BASE}/settings/ai-model`, { method: 'PUT', body: JSON.stringify({ modelKey: modelKey || null }) }).then(r => r.json()),
    listCoachMemory: (id) => authFetch(`${API_BASE}/coaches/${id}/memory`).then(r => r.json()),
    deleteCoachMemory: (memId) => authFetch(`${API_BASE}/coaches/memory/${memId}`, { method: 'DELETE' }).then(r => r.json()),
    pinCoachMemory: (memId, pinned) => authFetch(`${API_BASE}/coaches/memory/${memId}`, { method: 'PUT', body: JSON.stringify({ pinned }) }).then(r => r.json()),
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
    // Returns the raw streaming Response for SSE reading in the page. `signal` aborts it.
    aiChatStream: (body, signal) => authFetch(`${API_BASE}/ai/chat`, { method: 'POST', body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...body }), signal }),
    getAiMemory: () => authFetch(`${API_BASE}/ai/memory`).then(r => r.json()),
    addAiMemory: (body) => authFetch(`${API_BASE}/ai/memory`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
    updateAiMemory: (id, body) => authFetch(`${API_BASE}/ai/memory/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then(r => r.json()),
    deleteAiMemory: (id) => authFetch(`${API_BASE}/ai/memory/${id}`, { method: 'DELETE' }).then(r => r.json()),
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
    }).then(r => r.json()).then(r => {
      // Completing a task can free the ones waiting on it — let the app announce them.
      if (r?.unblocked?.length) window.dispatchEvent(new CustomEvent('rpm:unblocked', { detail: r.unblocked }));
      return r;
    }),
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

    // File → Plan: multipart upload answered with an SSE stream (returns the raw Response).
    // Not authFetch (it forces a JSON content-type); handles token refresh itself.
    importPlanStream: async (file, fields = {}, signal) => {
      const send = (token) => {
        const fd = new FormData();
        fd.append('file', file);
        for (const [k, v] of Object.entries(fields)) if (v != null && v !== '') fd.append(k, v);
        return fetch(`${API_BASE}/ai/import`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd, signal });
      };
      let res = await send(getToken());
      if (res.status === 401) {
        const newToken = await refreshTokenFn();
        if (!newToken) { logout(); throw new Error('Session expired'); }
        res = await send(newToken);
      }
      return res;
    },
    // Read a file's text for the Assistant ("Ask about it"). Same multipart + token-refresh path as the import.
    extractFile: async (file, modelKey) => {
      const send = (token) => {
        const fd = new FormData();
        fd.append('file', file);
        if (modelKey) fd.append('modelKey', modelKey);
        return fetch(`${API_BASE}/ai/extract`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      };
      let res = await send(getToken());
      if (res.status === 401) {
        const newToken = await refreshTokenFn();
        if (!newToken) { logout(); throw new Error('Session expired'); }
        res = await send(newToken);
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not read that file.');
      return body;
    },
    applyImportPlan: (body) => authFetch(`${API_BASE}/ai/import/apply`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
    listImports: () => authFetch(`${API_BASE}/ai/imports`).then(r => r.json()),
    getImport: (id) => authFetch(`${API_BASE}/ai/imports/${id}`).then(r => r.json()),
    saveImportDraft: (id, draft) => authFetch(`${API_BASE}/ai/imports/${id}`, { method: 'PUT', body: JSON.stringify({ draft }) }).then(r => r.json()),
    deleteImport: (id) => authFetch(`${API_BASE}/ai/imports/${id}`, { method: 'DELETE' }).then(r => r.json()),
    getProjectTimeline: (id) => authFetch(`${API_BASE}/projects/${id}/timeline?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`).then(r => r.json()),
    getRoadmap: () => authFetch(`${API_BASE}/roadmap?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`).then(r => r.json()),
    getCapacity: (start, end) => authFetch(`${API_BASE}/capacity?start=${start}&end=${end}`).then(r => r.json()),
    saveCapacitySettings: (data) => authFetch(`${API_BASE}/settings/capacity`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
    rescheduleActions: (changes) => authFetch(`${API_BASE}/actions/reschedule`, { method: 'PUT', body: JSON.stringify({ changes }) }).then(r => r.json()),

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

    // Business module (/api/business). Unlike most helpers these throw on an error status,
    // so pages can show the server's validation message.
    biz: (() => {
      const call = (path, method = 'GET', body) => authFetch(`${API_BASE}/business${path}`, {
        method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }).then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
        return data;
      });
      return {
        summary: () => call('/summary'),
        settings: () => call('/settings'),
        saveSettings: (data) => call('/settings', 'PUT', data),
        template: (section = 'all') => call('/template', 'POST', { section }),
        list: (section) => call(`/${section}`),
        create: (section, data) => call(`/${section}`, 'POST', data),
        update: (section, id, data) => call(`/${section}/${id}`, 'PUT', data),
        remove: (section, id) => call(`/${section}/${id}`, 'DELETE'),
        followUp: (leadId, data = {}) => call(`/leads/${leadId}/follow-up`, 'POST', data),
        fixToAction: (fixId, data = {}) => call(`/fixes/${fixId}/action`, 'POST', data),
      };
    })(),

    // Planner
    getPlanner: (startDate, endDate) => authFetch(`${API_BASE}/planner?start_date=${startDate}&end_date=${endDate}`).then(r => r.json()),
  };
};

// App Context for data
export const AppContext = createContext(null);

// Old list routes → the four tabs. Query params from the old URL are kept and win over
// the defaults (so /projects?view=roadmap lands on /plan?view=roadmap, not ?view=projects).
function RedirectTo({ to, params = {} }) {
  const location = useLocation();
  const merged = new URLSearchParams(params);
  new URLSearchParams(location.search).forEach((v, k) => merged.set(k, v));
  const qs = merged.toString();
  return <Navigate to={`${to}${qs ? `?${qs}` : ''}${location.hash}`} replace />;
}

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
          {/* The four tabs */}
          <Route path="/" element={<Navigate to="/plan" replace />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/week" element={<WeekPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/coach" element={<CoachHubPage />} />
          {/* Detail + secondary pages */}
          <Route path="/categories/:id" element={<CategoryDetailPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/import" element={<PlanImportPage />} />
          <Route path="/business" element={<BusinessPage />} />
          <Route path="/business/:view" element={<BusinessPage />} />
          {/* Old routes (bookmarks, emails, push links) */}
          <Route path="/my-day" element={<RedirectTo to="/today" />} />
          <Route path="/compass" element={<RedirectTo to="/today" />} />
          <Route path="/my-week" element={<RedirectTo to="/week" />} />
          <Route path="/calendar" element={<RedirectTo to="/week" params={{ view: 'month' }} />} />
          <Route path="/categories" element={<RedirectTo to="/plan" />} />
          <Route path="/projects" element={<RedirectTo to="/plan" params={{ view: 'projects' }} />} />
          <Route path="/assistant" element={<RedirectTo to="/coach" />} />
          <Route path="/coaches" element={<RedirectTo to="/coach" params={{ tab: 'coaches' }} />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <VoiceOrb />
      <GlobalFileDrop />
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
