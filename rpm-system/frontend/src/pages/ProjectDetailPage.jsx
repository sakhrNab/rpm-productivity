import { useState, useEffect, useContext, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ChevronLeft, ChevronRight, Image, Plus, Star, MoreVertical, 
  Check, Clock, Hourglass, Calendar as CalendarIcon, Edit, Trash2, X,
  Copy, Move, Download, ChevronUp, ChevronDown, FolderOpen, ExternalLink, Target, FileUp, GanttChartSquare, Lock, Unlock,
  ListChecks, AlertTriangle, CalendarClock, Flag, Sparkles, Inbox, Layers, Lightbulb, CalendarDays, CalendarPlus
} from 'lucide-react';
import { AppContext, AuthContext } from '../App';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';
import CreateProjectModal from '../components/modals/CreateProjectModal';
import CreateKeyResultModal from '../components/modals/CreateKeyResultModal';
import CreateCaptureItemModal from '../components/modals/CreateCaptureItemModal';
import CreateBlockModal from '../components/modals/CreateBlockModal';
import CreateActionModal from '../components/modals/CreateActionModal';
import CreateInspirationModal from '../components/modals/CreateInspirationModal';
import InspirationPreviewModal from '../components/modals/InspirationPreviewModal';
import BlockPreviewModal from '../components/modals/BlockPreviewModal';
import { fileToCompressedDataURL } from '../utils/image';
import { playDone } from '../utils/sound';
import { useToast } from '../components/ToastProvider';
import CoachPanel from '../components/CoachPanel';
import ProjectTimeline from '../components/plan/ProjectTimeline';
import ErrorBoundary from '../components/ErrorBoundary';
import ProjectRiskBanner from '../components/ProjectRiskBanner';
import Picker from '../components/Picker';
import './ProjectDetailPage.css';

// Format an API date (a full ISO timestamp for a DATE column) as a friendly
// day, using only the date part so timezone never shifts it by a day.
const fmtDate = (d) => {
  if (!d) return '';
  const datePart = String(d).slice(0, 10);
  const parsed = new Date(`${datePart}T00:00:00`);
  return isNaN(parsed) ? datePart : format(parsed, 'MMM d, yyyy');
};

// ---- Presentational helpers (no data changes) ----
const dayKey = (d) => (d ? String(d).slice(0, 10) : '');

// Short day label: "Sep 29" this year, "Sep 29, 2027" otherwise.
const fmtShort = (d) => {
  const key = dayKey(d);
  if (!key) return '';
  const parsed = new Date(`${key}T00:00:00`);
  if (isNaN(parsed)) return key;
  return format(parsed, parsed.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy');
};

const fmtDuration = ({ hours = 0, minutes = 0 } = {}, empty = '0m') => {
  if (!hours && !minutes) return empty;
  return `${hours ? `${hours}h` : ''}${hours && minutes ? ' ' : ''}${minutes ? `${minutes}m` : ''}`;
};

// Same progress rules the key-result cards have always used.
const krProgress = (kr) => {
  const target = Number(kr.target_value);
  const current = Number(kr.current_value) || 0;
  const hasTarget = kr.target_value !== null && kr.target_value !== undefined && kr.target_value !== '' && !Number.isNaN(target) && target > 0;
  const pct = hasTarget ? Math.max(0, Math.min(100, Math.round((current / target) * 100))) : null;
  const done = Boolean(kr.is_completed) || (hasTarget && pct >= 100);
  return { target, current, hasTarget, pct, done };
};

const hostOf = (url) => {
  if (!url) return '';
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ''); } catch { return ''; }
};

// A stable accent for a text-only inspiration tile, picked from the app palette.
const TINTS = ['#4ecdc4', '#ff69b4', '#9575cd', '#ffb74d', '#6b8dd6'];
const tintFor = (seed) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
};

// The plan area's lenses. `?view=` selects one (the Roadmap links to ?view=timeline).
const PLAN_VIEWS = [
  { id: 'blocks', label: 'By block', Icon: Layers },
  { id: 'list', label: 'List', Icon: ListChecks },
  { id: 'timeline', label: 'Timeline', Icon: GanttChartSquare },
  { id: 'week', label: 'Week', Icon: CalendarDays },
];
const PLAN_VIEW_IDS = PLAN_VIEWS.map(v => v.id);

// Whole days from today to a YYYY-MM-DD key (negative = in the past), in local time.
const daysUntil = (key) => {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const now = new Date();
  return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
};

function ProgressRing({ pct, size = 68, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <svg className="pd-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <linearGradient id="pd-ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4ecdc4" />
          <stop offset="100%" stopColor="#ff69b4" />
        </linearGradient>
      </defs>
      <circle className="pd-ring-bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
      <circle
        className="pd-ring-fg"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped / 100)}
      />
    </svg>
  );
}

function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categories, refreshData } = useContext(AppContext);
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  // The URL is the single source of truth for the plan view, so ?view= deep links and back/forward work.
  const view = PLAN_VIEW_IDS.includes(searchParams.get('view')) ? searchParams.get('view') : 'blocks';
  const setView = (next) => setSearchParams(prev => {
    const p = new URLSearchParams(prev);
    if (next === 'blocks') p.delete('view'); else p.set('view', next);
    return p;
  }, { replace: true });
  const [starredOnly, setStarredOnly] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState({ start: '', end: '' });
  const [savingDeadline, setSavingDeadline] = useState(false);
  const skipBlurSaveRef = useRef(false);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showKeyResultModal, setShowKeyResultModal] = useState(false);
  const [showCaptureItemModal, setShowCaptureItemModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingKeyResult, setEditingKeyResult] = useState(null);
  const [editingCaptureItem, setEditingCaptureItem] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const [openKeyResultMenu, setOpenKeyResultMenu] = useState(null);
  const [openCaptureItemMenu, setOpenCaptureItemMenu] = useState(null);
  const [openBlockMenu, setOpenBlockMenu] = useState(null); // { blockId, top, right } or null
  const [openBlockActionMenu, setOpenBlockActionMenu] = useState(null);
  const [expandedCompleted, setExpandedCompleted] = useState({});
  const [expandedCancelled, setExpandedCancelled] = useState({});
  const [showActionModal, setShowActionModal] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [dragOverBlock, setDragOverBlock] = useState(null);
  const coverInputRef = useRef(null);
  const [showInspirationModal, setShowInspirationModal] = useState(false);
  const [editingInspiration, setEditingInspiration] = useState(null);
  const [previewInspiration, setPreviewInspiration] = useState(null);
  const [previewBlock, setPreviewBlock] = useState(null);
  const [dragActionId, setDragActionId] = useState(null);
  const [dropDay, setDropDay] = useState(null);

  useEffect(() => {
    loadProject();
  }, [id]);

  const [coverUploading, setCoverUploading] = useState(false);
  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCoverUploading(true);
    try {
      const dataUrl = await fileToCompressedDataURL(file);
      await api.updateProject(id, { cover_image: dataUrl });
      await loadProject();
      if (refreshData) refreshData();
      showToast('Cover image updated.', 'success');
    } catch (error) {
      console.error('Failed to upload cover image:', error);
      showToast(error?.message || 'Failed to update the cover image. Please try again.', 'error');
    } finally {
      setCoverUploading(false);
    }
  };

  const handleAddInspiration = () => {
    setEditingInspiration(null);
    setShowInspirationModal(true);
  };

  const handleEditInspiration = (item) => {
    setPreviewInspiration(null);
    setEditingInspiration(item);
    setShowInspirationModal(true);
  };

  const handleInspirationSuccess = () => {
    setShowInspirationModal(false);
    setEditingInspiration(null);
    loadProject();
  };

  const handleDeleteInspiration = async (item) => {
    if (!window.confirm('Delete this inspiration item?')) return;
    setPreviewInspiration(null);
    try {
      await api.deleteInspirationItem(item.id);
      await loadProject();
    } catch (error) {
      console.error('Failed to delete inspiration item:', error);
    }
  };

  const loadProject = async () => {
    try {
      const data = await api.getProject(id);
      setProject(data);
    } catch (error) {
      console.error('Failed to load project:', error);
    } finally {
      setLoading(false);
    }
  };

  // Optimistic helpers: update the item in local state immediately (an action
  // can live both in project.actions and inside a block's actions), persist in
  // the background, and reload to resync if the request fails.
  const patchActionEverywhere = (id, patch) =>
    setProject(prev => {
      if (!prev) return prev;
      // Completing/reopening also updates the lock chips of tasks linked to this one.
      const link = l => (l.id === id && 'is_completed' in patch ? { ...l, is_completed: patch.is_completed } : l);
      const upd = a => {
        const next = a.id === id ? { ...a, ...patch } : a;
        return 'is_completed' in patch && (next.blocked_by || next.blocks)
          ? { ...next, blocked_by: (next.blocked_by || []).map(link), blocks: (next.blocks || []).map(link) }
          : next;
      };
      let rpm_blocks = (prev.rpm_blocks || []).map(b => ({ ...b, actions: (b.actions || []).map(upd) }));
      // Moving between blocks: take the task out of whichever block holds it and
      // append it to the target block, so it shows up there without a reload.
      if ('block_id' in patch) {
        const src = (prev.actions || []).find(a => a.id === id)
          || (prev.rpm_blocks || []).flatMap(b => b.actions || []).find(a => a.id === id);
        const moved = src ? upd(src) : null;
        rpm_blocks = rpm_blocks.map(b => {
          const rest = b.actions.filter(a => a.id !== id);
          if (moved && b.id === patch.block_id) return { ...b, actions: [...rest, moved] };
          return rest.length === b.actions.length ? b : { ...b, actions: rest };
        });
      }
      return { ...prev, actions: (prev.actions || []).map(upd), rpm_blocks };
    });

  const optimisticAction = async (action, patch) => {
    patchActionEverywhere(action.id, patch);
    try {
      await api.updateAction(action.id, patch);
      return true;
    } catch (error) {
      console.error('Failed to update action:', error);
      await loadProject();
      return false;
    }
  };

  const toggleActionComplete = (action) => {
    const next = !action.is_completed;
    if (next) playDone();
    return optimisticAction(action, { is_completed: next });
  };

  const toggleActionStar = (action) =>
    optimisticAction(action, { is_starred: !(action.is_starred === true) });

  const toggleThisWeek = (action) =>
    optimisticAction(action, { is_this_week: !action.is_this_week });

  const handleEditAction = (action) => {
    setEditingAction(action);
    setShowActionModal(true);
    setOpenBlockActionMenu(null);
  };

  const handleDuplicateAction = async (action) => {
    if (action.is_completed) return;
    try {
      await api.duplicateAction(action.id);
      await loadProject();
      setOpenBlockActionMenu(null);
    } catch (error) {
      console.error('Failed to duplicate action:', error);
    }
  };

  // Put a task into a block (or back into "Unsorted" with null), optimistically.
  const assignToBlock = async (action, blockId) => {
    const ok = await optimisticAction(action, { block_id: blockId || null });
    if (!ok) { showToast('Could not move that task. Please try again.', 'error'); return; }
    const block = blockId && (project?.rpm_blocks || []).find(b => b.id === blockId);
    showToast(block ? `Moved into “${block.result_title}”.` : 'Moved back to Unsorted.', 'success');
  };

  const handleRemoveFromBlock = (action) => {
    setOpenBlockActionMenu(null);
    return assignToBlock(action, null);
  };

  const handleCancelAction = async (action) => {
    try {
      await api.updateAction(action.id, { is_cancelled: true });
      await loadProject();
      setOpenBlockActionMenu(null);
    } catch (error) {
      console.error('Failed to cancel action:', error);
    }
  };

  const handleDeleteAction = async (action) => {
    if (window.confirm('Are you sure you want to delete this action?')) {
      try {
        await api.deleteAction(action.id);
        await loadProject();
        setOpenBlockActionMenu(null);
      } catch (error) {
        console.error('Failed to delete action:', error);
      }
    }
  };

  const handleEditBlock = (block) => {
    setEditingBlock(block);
    setShowBlockModal(true);
    setOpenBlockMenu(null);
  };

  const handleDuplicateBlock = async (block) => {
    try {
      const blockData = {
        category_id: block.category_id,
        project_id: block.project_id,
        result_title: block.result_title + ' (copy)',
        result_description: block.result_description,
        purpose: block.purpose,
        target_date: block.target_date,
        action_ids: block.actions?.map(a => a.id) || []
      };
      await api.createBlock(blockData);
      await loadProject();
      setOpenBlockMenu(null);
    } catch (error) {
      console.error('Failed to duplicate block:', error);
    }
  };

  const handleCompleteBlock = async (block) => {
    try {
      await api.updateBlock(block.id, { is_completed: true });
      await loadProject();
      setOpenBlockMenu(null);
    } catch (error) {
      console.error('Failed to complete block:', error);
    }
  };

  // Calculate block stats
  const calculateBlockStats = (block) => {
    if (!block.actions || block.actions.length === 0) {
      return { 
        totalDuration: { hours: 0, minutes: 0 }, 
        remainingDuration: { hours: 0, minutes: 0 },
        completedCount: 0, 
        cancelledCount: 0 
      };
    }
    
    const totalMinutes = block.actions.reduce((sum, a) => 
      sum + (a.duration_hours || 0) * 60 + (a.duration_minutes || 0), 0
    );
    const totalHours = Math.floor(totalMinutes / 60);
    const totalMins = totalMinutes % 60;
    
    // Calculate remaining duration (only for non-completed actions)
    const remainingActions = block.actions.filter(a => !a.is_completed && !a.is_cancelled);
    const remainingMinutes = remainingActions.reduce((sum, a) => 
      sum + (a.duration_hours || 0) * 60 + (a.duration_minutes || 0), 0
    );
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingMins = remainingMinutes % 60;
    
    const completedCount = block.actions.filter(a => a.is_completed && !a.is_cancelled).length;
    const cancelledCount = block.actions.filter(a => a.is_cancelled).length;
    
    return {
      totalDuration: { hours: totalHours, minutes: totalMins },
      remainingDuration: { hours: remainingHours, minutes: remainingMins },
      completedCount,
      cancelledCount
    };
  };

  const handleFieldEdit = (field, value) => {
    skipBlurSaveRef.current = false;
    setEditingField(field);
    setEditValue(value || '');
  };

  const handleFieldSave = async (field) => {
    if (!project) return;
    try {
      await api.updateProject(project.id, { [field]: editValue });
      await loadProject();
      if (refreshData) refreshData();
    } catch (error) {
      console.error('Failed to update project:', error);
    }
    setEditingField(null);
    setEditValue('');
  };

  // Hero result/purpose: Escape cancels without the unmount blur saving the draft,
  // and an unchanged value doesn't round-trip to the server.
  const cancelFieldEdit = () => { skipBlurSaveRef.current = true; setEditingField(null); setEditValue(''); };
  const commitFieldEdit = (field) => {
    if (skipBlurSaveRef.current) { skipBlurSaveRef.current = false; return; }
    if ((editValue || '') === (project?.[field] || '')) { setEditingField(null); setEditValue(''); return; }
    handleFieldSave(field);
  };

  const openDeadlineEditor = () => {
    setDeadlineDraft({ start: dayKey(project?.start_date), end: dayKey(project?.end_date) });
    setEditingDeadline(true);
    requestAnimationFrame(() => document.getElementById('pd-deadline')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const saveDeadline = async () => {
    if (!project || !deadlineDraft.end) return;
    if (deadlineDraft.start && deadlineDraft.start > deadlineDraft.end) {
      showToast('The start date must be on or before the deadline.', 'error');
      return;
    }
    setSavingDeadline(true);
    try {
      await api.updateProject(project.id, { end_date: deadlineDraft.end, ...(deadlineDraft.start ? { start_date: deadlineDraft.start } : {}) });
      await loadProject();
      if (refreshData) refreshData();
      setEditingDeadline(false);
      showToast('Deadline saved.', 'success');
    } catch (error) {
      console.error('Failed to save deadline:', error);
      showToast(error?.message || 'Could not save the deadline. Please try again.', 'error');
    } finally {
      setSavingDeadline(false);
    }
  };

  const scrollToId = (elId) =>
    requestAnimationFrame(() => document.getElementById(elId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  // Switch the plan area to a lens and bring it (or an element inside it) into view.
  const showPlan = (next, elId = 'pd-plan') => {
    setView(next);
    setTimeout(() => document.getElementById(elId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const openNewAction = () => {
    setEditingAction({ project_id: project.id, category_id: project.category_id });
    setShowActionModal(true);
  };

  const handleProjectEdit = () => {
    setShowEditModal(true);
  };

  const handleProjectUpdate = () => {
    setShowEditModal(false);
    loadProject();
    if (refreshData) refreshData();
  };

  const handleKeyResultSuccess = () => {
    setShowKeyResultModal(false);
    setEditingKeyResult(null);
    loadProject();
  };

  const handleCaptureItemSuccess = () => {
    setShowCaptureItemModal(false);
    setEditingCaptureItem(null);
    loadProject();
  };

  const handleBlockSuccess = () => {
    setShowBlockModal(false);
    setEditingBlock(null);
    loadProject();
    if (refreshData) refreshData();
  };

  const handleActionSuccess = () => {
    setShowActionModal(false);
    setEditingAction(null);
    loadProject();
    if (refreshData) refreshData();
  };

  const handleDragStart = (e, block) => {
    setDraggedBlock(block);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', block.id);
  };

  const handleDragOver = (e, block) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedBlock && draggedBlock.id !== block.id) {
      setDragOverBlock(block.id);
    }
  };

  const handleDragLeave = () => {
    setDragOverBlock(null);
  };

  const handleDrop = async (e, targetBlock) => {
    e.preventDefault();
    setDragOverBlock(null);
    
    if (!draggedBlock || !targetBlock || draggedBlock.id === targetBlock.id) {
      setDraggedBlock(null);
      return;
    }

    try {
      const blocks = [...(project.rpm_blocks || [])];
      const draggedIndex = blocks.findIndex(b => b.id === draggedBlock.id);
      const targetIndex = blocks.findIndex(b => b.id === targetBlock.id);
      
      if (draggedIndex === -1 || targetIndex === -1) {
        setDraggedBlock(null);
        return;
      }

      // Remove dragged block and insert at new position
      const [removed] = blocks.splice(draggedIndex, 1);
      blocks.splice(targetIndex, 0, removed);

      // Update sort_order for all affected blocks
      const updatePromises = blocks.map((block, index) => 
        api.updateBlock(block.id, { sort_order: index })
      );
      
      await Promise.all(updatePromises);
      await loadProject();
      setDraggedBlock(null);
    } catch (error) {
      console.error('Failed to reorder blocks:', error);
      setDraggedBlock(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedBlock(null);
    setDragOverBlock(null);
  };

  const patchListItem = (listKey, id, patch) =>
    setProject(prev => (prev ? { ...prev, [listKey]: (prev[listKey] || []).map(x => (x.id === id ? { ...x, ...patch } : x)) } : prev));

  const toggleKeyResultStar = async (keyResult) => {
    const next = !keyResult.is_starred;
    patchListItem('key_results', keyResult.id, { is_starred: next });
    try {
      await api.updateKeyResult(keyResult.id, { is_starred: next });
    } catch (error) {
      console.error('Failed to update key result:', error);
      await loadProject();
    }
  };

  const handleUpdateKeyResultProgress = async (keyResult, rawValue) => {
    let value = rawValue === '' || rawValue === null ? 0 : Number(rawValue);
    if (Number.isNaN(value)) return;
    value = Math.max(0, value);
    if (value === (Number(keyResult.current_value) || 0)) return; // no change
    const target = Number(keyResult.target_value);
    const hasTarget = !Number.isNaN(target) && target > 0;
    // When there's a target, completion tracks the target both ways (so reducing
    // below target clears the checkmark instead of leaving it stuck on).
    const patch = { current_value: value, ...(hasTarget ? { is_completed: value >= target } : {}) };
    patchListItem('key_results', keyResult.id, patch);
    try {
      await api.updateKeyResult(keyResult.id, patch);
    } catch (error) {
      console.error('Failed to update progress:', error);
      showToast('Could not update progress. Please try again.', 'error');
      await loadProject();
    }
  };

  const handleEditKeyResult = (keyResult) => {
    setEditingKeyResult(keyResult);
    setShowKeyResultModal(true);
    setOpenKeyResultMenu(null);
  };

  const handleDeleteKeyResult = async (keyResult) => {
    if (window.confirm('Are you sure you want to delete this key result?')) {
      try {
        await api.deleteKeyResult(keyResult.id);
        await loadProject();
        setOpenKeyResultMenu(null);
      } catch (error) {
        console.error('Failed to delete key result:', error);
      }
    }
  };

  const toggleCaptureItemStar = async (captureItem) => {
    const next = !captureItem.is_starred;
    patchListItem('capture_items', captureItem.id, { is_starred: next });
    try {
      await api.updateCaptureItem(captureItem.id, { is_starred: next });
    } catch (error) {
      console.error('Failed to update capture item:', error);
      await loadProject();
    }
  };

  const handleEditCaptureItem = (captureItem) => {
    setEditingCaptureItem(captureItem);
    setShowCaptureItemModal(true);
    setOpenCaptureItemMenu(null);
  };

  const handleDeleteCaptureItem = async (captureItem) => {
    if (window.confirm('Are you sure you want to delete this capture item?')) {
      try {
        await api.deleteCaptureItem(captureItem.id);
        await loadProject();
        setOpenCaptureItemMenu(null);
      } catch (error) {
        console.error('Failed to delete capture item:', error);
      }
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openKeyResultMenu && !event.target.closest('.key-result-actions')) {
        setOpenKeyResultMenu(null);
      }
      if (openCaptureItemMenu && !event.target.closest('.capture-actions')) {
        setOpenCaptureItemMenu(null);
      }
      if (openBlockMenu && !event.target.closest('.rpm-block-header') && !event.target.closest('.dropdown-menu')) {
        setOpenBlockMenu(null);
      }
      if (openBlockActionMenu && !event.target.closest('.rpm-block-action') && !event.target.closest('.dropdown-menu')) {
        setOpenBlockActionMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openKeyResultMenu, openCaptureItemMenu, openBlockMenu, openBlockActionMenu]);

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  const category = categories.find(c => c.id === project.category_id);
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const starredActions = project.actions?.filter(a => a.is_starred && !a.is_completed) || [];
  const allActions = project.actions || [];

  // Get actions for a specific day (scheduled_date may be an ISO timestamp)
  const getActionsForDay = (day) => {
    if (!project.actions) return [];
    const dayStr = format(day, 'yyyy-MM-dd');
    return project.actions.filter(a => a.scheduled_date && String(a.scheduled_date).slice(0, 10) === dayStr);
  };

  // Actions with no date yet — shown in the planner's "Unscheduled" strip
  const unscheduledActions = (project.actions || []).filter(a => !a.scheduled_date && !a.is_completed && !a.is_cancelled);

  const handleScheduleAction = async (actionId, dateStr) => {
    const action = (project.actions || []).find(a => a.id === actionId);
    if (!action || String(action.scheduled_date || '').slice(0, 10) === dateStr) return;
    patchListItem('actions', actionId, { scheduled_date: dateStr });
    try {
      await api.updateAction(actionId, { scheduled_date: dateStr });
      showToast(`Scheduled for ${format(new Date(dateStr + 'T00:00:00'), 'MMM d')}.`, 'success');
    } catch (error) {
      console.error('Failed to schedule action:', error);
      showToast('Could not schedule that action. Please try again.', 'error');
      await loadProject();
    }
  };

  // ---- Presentational summary for the hero (derived only from data already loaded) ----
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const activeAll = allActions.filter(a => !a.is_cancelled);
  const doneCount = activeAll.filter(a => a.is_completed).length;
  const donePct = activeAll.length ? Math.round((doneCount / activeAll.length) * 100) : 0;
  const overdueCount = activeAll.filter(a => !a.is_completed && dayKey(a.scheduled_date) && dayKey(a.scheduled_date) < todayStr).length;
  const krList = project.key_results || [];
  const krStats = krList.map(krProgress);
  const krDone = krStats.filter(k => k.done).length;
  const krMeasured = krStats.filter(k => k.hasTarget || k.done);
  const krAvg = krMeasured.length ? Math.round(krMeasured.reduce((s, k) => s + (k.done ? 100 : k.pct), 0) / krMeasured.length) : null;
  const nextDue = activeAll
    .filter(a => !a.is_completed && dayKey(a.scheduled_date) >= todayStr)
    .map(a => dayKey(a.scheduled_date))
    .sort()[0];
  const endDate = dayKey(project.end_date);
  const catStyle = category?.color ? { '--cat': category.color } : undefined;

  // Deadline countdown for the hero.
  const daysLeft = daysUntil(endDate);
  const deadlineTone = !endDate ? '' : project.is_completed ? 'good' : daysLeft < 0 ? 'bad' : daysLeft <= 7 ? 'warn' : 'info';
  const deadlineLabel = !endDate ? '' : project.is_completed ? `Completed · target ${fmtShort(endDate)}`
    : daysLeft === 0 ? 'Ends today'
    : daysLeft === 1 ? 'Ends tomorrow'
    : daysLeft > 1 ? `Ends in ${daysLeft} days`
    : daysLeft === -1 ? 'Ended yesterday'
    : `Ended ${-daysLeft} days ago`;

  // Plan area: blocks and the tasks that sit outside every block.
  const blocks = project.rpm_blocks || [];
  const blockCount = blocks.length;
  const blockOptions = blocks.map(b => ({
    value: b.id,
    label: b.result_title || 'Untitled block',
    hint: b.is_completed ? 'done' : undefined,
  }));
  const unsortedActions = allActions.filter(a => !a.block_id && !a.is_completed && !a.is_cancelled);

  return (
    <div className="pd-page">
      {/* ================= Hero ================= */}
      <section className={`pd-hero-card ${project.cover_image ? 'has-cover' : ''}`} style={catStyle}>
        {project.cover_image && (
          <div className="pd-hero-cover" style={{ backgroundImage: `url(${project.cover_image})` }} aria-hidden="true" />
        )}
        <div className="pd-hero-inner">
          <div className="pd-hero-top">
            <nav className="pd-crumbs" aria-label="Breadcrumb">
              <Link to="/categories">Categories</Link>
              <ChevronRight size={13} aria-hidden="true" />
              {category && (
                <>
                  <Link to={`/categories/${category.id}`}>{category.name}</Link>
                  <ChevronRight size={13} aria-hidden="true" />
                </>
              )}
              <span aria-current="page">{project.name}</span>
            </nav>
            <div className="pd-hero-actions">
              <Link
                to={`/import?project=${project.id}`}
                className="btn btn-secondary pd-hero-btn pd-hero-btn--ai"
                title="Upload a brief, notes or a spreadsheet and turn it into scheduled tasks here"
              >
                <FileUp size={15} /> <span>Plan from a file</span>
              </Link>
              <button type="button" className="btn btn-secondary pd-hero-btn" onClick={handleProjectEdit}>
                <Edit size={15} /> <span>Edit<span className="pd-lg"> project</span></span>
              </button>
              <button
                type="button"
                className="btn btn-secondary pd-hero-btn"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                title="Change cover image"
              >
                <Image size={15} /> <span>{coverUploading ? 'Uploading…' : <><span className="pd-lg">Change cover</span><span className="pd-sm">Cover</span></>}</span>
              </button>
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="pd-hidden"
              onChange={handleCoverUpload}
            />
          </div>

          {category && (
            <span className="pd-cat-chip"><span className="pd-cat-dot" />{category.name}</span>
          )}

          <h1 className="pd-hero-title">
            {editingField === 'name' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => handleFieldSave('name')}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleFieldSave('name');
                  if (e.key === 'Escape') setEditingField(null);
                }}
                autoFocus
                className="pd-title-input"
              />
            ) : (
              <span
                onClick={() => handleFieldEdit('name', project.name)}
                className="pd-clickable ui-title-grad"
                title="Click to rename"
              >
                {project.name}
              </span>
            )}
          </h1>

          {/* Result → Purpose: the "R" and "P" of RPM, click to edit */}
          <div className="pd-rp">
            {[
              { field: 'ultimate_result', label: 'Result', Icon: Target, empty: 'Add the ultimate result — what exactly will be true when this is done?' },
              { field: 'ultimate_purpose', label: 'Purpose', Icon: Sparkles, empty: 'Add the purpose — why does this result matter to you?' },
            ].map(({ field, label, Icon, empty }) => (
              <div key={field} className={`pd-rp-item pd-rp-item--${label.toLowerCase()}`}>
                <span className="pd-rp-label"><Icon size={13} aria-hidden="true" /> {label}</span>
                {editingField === field ? (
                  <textarea
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => commitFieldEdit(field)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { e.preventDefault(); cancelFieldEdit(); }
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.blur(); }
                    }}
                    autoFocus
                    rows={3}
                    aria-label={`Ultimate ${label.toLowerCase()}`}
                    className="pd-field-textarea"
                  />
                ) : (
                  <button
                    type="button"
                    className={`pd-rp-text ${project[field] ? '' : 'is-empty'}`}
                    onClick={() => handleFieldEdit(field, project[field])}
                    title={`Click to edit the ${label.toLowerCase()}`}
                  >
                    <span>{project[field] || empty}</span>
                    <Edit size={13} className="pd-field-hint" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Deadline: countdown when set, a one-step editor when not */}
          <div className="pd-deadline" id="pd-deadline">
            {editingDeadline ? (
              <form
                className="pd-deadline-form"
                onSubmit={(e) => { e.preventDefault(); saveDeadline(); }}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setEditingDeadline(false); } }}
              >
                <label className="pd-date-field">
                  <span>Start <em>optional</em></span>
                  <input
                    type="date"
                    value={deadlineDraft.start}
                    max={deadlineDraft.end || undefined}
                    onChange={e => setDeadlineDraft(d => ({ ...d, start: e.target.value }))}
                  />
                </label>
                <label className="pd-date-field">
                  <span>Deadline</span>
                  <input
                    type="date"
                    value={deadlineDraft.end}
                    min={deadlineDraft.start || undefined}
                    onChange={e => setDeadlineDraft(d => ({ ...d, end: e.target.value }))}
                    autoFocus
                    required
                  />
                </label>
                <div className="pd-deadline-btns">
                  <button type="submit" className="btn btn-primary pd-btn-sm" disabled={!deadlineDraft.end || savingDeadline}>
                    <Check size={14} /> {savingDeadline ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="btn btn-secondary pd-btn-sm" onClick={() => setEditingDeadline(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : endDate ? (
              <button
                type="button"
                className={`ui-chip ui-chip--${deadlineTone} pd-deadline-chip`}
                onClick={openDeadlineEditor}
                title={`${project.start_date ? `${fmtDate(project.start_date)} → ` : 'Deadline '}${fmtDate(endDate)} — click to change`}
              >
                <Flag size={13} /> <span>{deadlineLabel}</span> <b>{fmtShort(endDate)}</b>
              </button>
            ) : (
              <button type="button" className="pd-deadline-set" onClick={openDeadlineEditor}>
                <CalendarPlus size={14} /> <span>Set deadline</span>
              </button>
            )}
          </div>

          <div className="pd-hero-stats">
            <div className="pd-ring-stat" title={`${doneCount} of ${activeAll.length} tasks done`}>
              <ProgressRing pct={donePct} />
              <div className="pd-ring-copy">
                <b>{donePct}%</b>
                <span>complete</span>
              </div>
            </div>
            <div className="pd-stat-row">
              <div className="ui-stat">
                <ListChecks size={18} />
                <b>{doneCount}<small>/{activeAll.length}</small></b>
                <span>tasks done</span>
              </div>
              {overdueCount > 0 && (
                <div className="ui-stat pd-stat--bad">
                  <AlertTriangle size={18} />
                  <b>{overdueCount}</b>
                  <span>overdue</span>
                </div>
              )}
              {krList.length > 0 && (
                <div className="ui-stat pd-stat--kr" title={`${krDone} of ${krList.length} key results met`}>
                  <Target size={18} />
                  <b>{krAvg !== null ? `${krAvg}%` : `${krDone}/${krList.length}`}</b>
                  <span>key results<span className="pd-lg"> · {krDone}/{krList.length} met</span></span>
                  {krAvg !== null && <div className="ui-meter"><i style={{ '--pct': `${krAvg}%` }} /></div>}
                </div>
              )}
              {nextDue && (
                <div className="ui-stat">
                  <CalendarClock size={18} />
                  <b>{nextDue === todayStr ? 'Today' : fmtShort(nextDue)}</b>
                  <span>next due</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <ProjectRiskBanner
        project={project}
        onOpenTimeline={() => showPlan('timeline')}
        onEditAction={handleEditAction}
        onShowKeyResults={() => scrollToId('pd-krs')}
        onShowBlocks={() => showPlan('blocks')}
        onShowUnsorted={() => showPlan('blocks', 'pd-unsorted')}
        onEditDeadline={openDeadlineEditor}
      />

      {/* ================= Key results (measures) ================= */}
      <section className="ui-card pd-panel pd-krs" id="pd-krs">
          <header className="pd-panel-head">
            <h2 className="ui-kicker">
              <Target size={15} /> Key results
              {krList.length > 0 && <span className="ui-count">{krDone}/{krList.length}</span>}
            </h2>
            <button
              type="button"
              className="pd-icon-btn pd-add"
              aria-label="Add key result"
              title="Add key result"
              onClick={(e) => {
                e.stopPropagation();
                setEditingKeyResult(null);
                setShowKeyResultModal(true);
              }}
            >
              <Plus size={16} />
            </button>
          </header>

          {krList.length === 0 ? (
            <div className="ui-empty">
              <Target size={22} />
              <span>No key results yet — define how you'll measure the result.</span>
              <button type="button" className="btn btn-secondary pd-btn-sm" onClick={() => { setEditingKeyResult(null); setShowKeyResultModal(true); }}>
                <Plus size={14} /> Add key result
              </button>
            </div>
          ) : (
            <div className="kr-list">
              {krList.map((kr, idx) => {
                const { target, current, hasTarget, pct, done } = krProgress(kr);
                return (
                  <div
                    key={kr.id}
                    className={`kr-card pd-clickable ${done ? 'kr-card-done' : ''}`}
                    onClick={() => handleEditKeyResult(kr)}
                    title="Open key result"
                  >
                    <div className="kr-card-head">
                      <div className="kr-num">{done ? <Check size={13} strokeWidth={3} /> : idx + 1}</div>
                      <div className="kr-title">{kr.title}</div>
                      <div className="key-result-actions pd-item-actions">
                        <button
                          type="button"
                          className={`pd-icon-btn pd-star ${kr.is_starred ? 'is-on' : ''}`}
                          aria-label={kr.is_starred ? 'Unstar key result' : 'Star key result'}
                          onClick={(e) => { e.stopPropagation(); toggleKeyResultStar(kr); }}
                        >
                          <Star size={13} fill={kr.is_starred ? 'currentColor' : 'none'} />
                        </button>
                        <div className="pd-relative">
                          <button
                            type="button"
                            className="pd-icon-btn"
                            aria-label="Key result menu"
                            onClick={(e) => { e.stopPropagation(); setOpenKeyResultMenu(openKeyResultMenu === kr.id ? null : kr.id); }}
                          >
                            <MoreVertical size={14} />
                          </button>
                          {openKeyResultMenu === kr.id && (
                            <div className="dropdown-menu pd-dropdown-abs" onClick={(e) => e.stopPropagation()}>
                              <div className="dropdown-item" onClick={() => handleEditKeyResult(kr)}>
                                <Edit size={14} /><span>Edit Key Result</span>
                              </div>
                              <div className="dropdown-item pd-text-red" onClick={() => handleDeleteKeyResult(kr)}>
                                <Trash2 size={14} /><span>Delete Key Result</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {hasTarget && (
                      <div className="kr-progress" onClick={(e) => e.stopPropagation()}>
                        <div className="ui-meter kr-meter"><i style={{ '--pct': `${pct}%` }} /></div>
                        <div className="kr-progress-meta">
                          <div className="kr-editor" title="Update progress">
                            <button
                              type="button"
                              className="kr-step"
                              aria-label="Decrease progress"
                              onClick={() => handleUpdateKeyResultProgress(kr, current - 1)}
                            >−</button>
                            <input
                              type="number"
                              key={`kr-cur-${kr.id}-${current}`}
                              className="kr-current-input"
                              aria-label="Current progress"
                              defaultValue={current}
                              min={0}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                              onBlur={(e) => handleUpdateKeyResultProgress(kr, e.target.value)}
                            />
                            <span className="kr-sep">/</span>
                            <span className="kr-target-val">{target}{kr.unit ? ` ${kr.unit}` : ''}</span>
                            <button
                              type="button"
                              className="kr-step"
                              aria-label="Increase progress"
                              onClick={() => handleUpdateKeyResultProgress(kr, current + 1)}
                            >+</button>
                          </div>
                          <span className="kr-pct">{pct}%</span>
                        </div>
                      </div>
                    )}

                    {kr.target_date && (
                      <div className="kr-foot"><CalendarIcon size={12} /> {fmtDate(kr.target_date)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </section>

      {/* ================= The plan: one area, four lenses ================= */}
      <section className="pd-plan" id="pd-plan" aria-label="Plan">
        <div className="pd-plan-bar">
          <h2 className="ui-kicker"><Layers size={15} /> The plan</h2>
          <div className="ui-seg pd-tabs" role="tablist" aria-label="Plan view">
            {PLAN_VIEWS.map(v => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                className={view === v.id ? 'on' : ''}
                onClick={() => setView(v.id)}
              >
                <v.Icon size={14} />
                <span>{v.label}</span>
                {v.id === 'blocks' && blockCount > 0 && <span className="pd-tab-count">{blockCount}</span>}
                {v.id === 'list' && <span className="pd-tab-count">{activeAll.length}</span>}
              </button>
            ))}
          </div>
        </div>

        {view === 'blocks' && (
          <div className="ui-card pd-panel pd-blocks-panel">
            <header className="pd-panel-head">
              <h3 className="ui-kicker">
                <Layers size={15} /> RPM blocks
                {blockCount > 0 && <span className="ui-count">{blockCount}</span>}
              </h3>
              <button
                type="button"
                className="pd-icon-btn pd-add"
                aria-label="Add RPM block"
                title="Add RPM block"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingBlock(null);
                  setShowBlockModal(true);
                }}
              >
                <Plus size={16} />
              </button>
            </header>

            {blockCount === 0 && (
              <div className="ui-empty">
                <Layers size={22} />
                <span>No blocks yet — group related actions under one result and purpose.</span>
                <button type="button" className="btn btn-secondary pd-btn-sm" onClick={() => { setEditingBlock(null); setShowBlockModal(true); }}>
                  <Plus size={14} /> Add a block
                </button>
              </div>
            )}

            <div className="pd-blocks-grid">
          {project.rpm_blocks?.map(block => {
            // Fallback: if block.actions is not populated, filter from project.actions
            const blockActions = block.actions && block.actions.length > 0
              ? block.actions
              : (project.actions || []).filter(a => a.block_id === block.id);

            const stats = calculateBlockStats({ ...block, actions: blockActions });
            const completedActions = blockActions.filter(a => a.is_completed && !a.is_cancelled);
            const cancelledActions = blockActions.filter(a => a.is_cancelled);
            const activeActions = blockActions.filter(a => !a.is_completed && !a.is_cancelled);
            const total = blockActions.length;
            const denom = total - cancelledActions.length;
            const blockPct = denom > 0 ? Math.round((completedActions.length / denom) * 100) : 0;
            const blockLate = block.target_date && dayKey(block.target_date) < todayStr && activeActions.length > 0;

            return (
              <article
                key={block.id}
                className={`rpm-block pd-block ${draggedBlock?.id === block.id ? 'is-dragging' : ''} ${dragOverBlock === block.id ? 'is-drop-target' : ''} ${total > 0 && blockPct >= 100 ? 'is-complete' : ''}`}
                style={catStyle}
                draggable
                onDragStart={(e) => handleDragStart(e, block)}
                onDragOver={(e) => handleDragOver(e, block)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, block)}
                onDragEnd={handleDragEnd}
              >
                <div className="rpm-block-header pd-block-head" title="Drag to reorder">
                  <span className="pd-cat-chip pd-cat-chip--sm"><span className="pd-cat-dot" />{category?.name || 'Category'}</span>
                  <div className="pd-block-meta">
                    {(stats.totalDuration.hours > 0 || stats.totalDuration.minutes > 0) && (
                      <>
                        <span className="pd-meta" title="Time remaining">
                          <Clock size={13} />{fmtDuration(stats.remainingDuration)}
                        </span>
                        <span className="pd-meta pd-meta--muted" title="Total planned time">
                          <Hourglass size={13} />{fmtDuration(stats.totalDuration)}
                        </span>
                      </>
                    )}
                    {block.target_date && (
                      <span className={`pd-meta pd-meta--date ${blockLate ? 'is-late' : ''}`} title="Block deadline">
                        <CalendarIcon size={13} />{fmtShort(block.target_date)}
                      </span>
                    )}
                    {/* Block Menu */}
                    <div className="pd-relative-z1000">
                      <button
                        type="button"
                        className="pd-icon-btn"
                        aria-label="Block menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setOpenBlockMenu(openBlockMenu === block.id ? null : {
                            blockId: block.id,
                            top: rect.bottom + 4,
                            right: window.innerWidth - rect.right
                          });
                        }}
                      >
                        <MoreVertical size={15} />
                      </button>

                      {openBlockMenu && openBlockMenu.blockId === block.id && (
                        <div
                          className="dropdown-menu"
                          style={{
                            position: 'fixed',
                            right: `${openBlockMenu.right}px`,
                            top: `${openBlockMenu.top}px`,
                            minWidth: '180px',
                            zIndex: 10000,
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            className="dropdown-item"
                            onClick={() => {
                              handleEditBlock(block);
                              setOpenBlockMenu(null);
                            }}
                          >
                            <Edit size={14} />
                            <span>Edit Block</span>
                          </div>
                          <div
                            className="dropdown-item"
                            onClick={() => {
                              handleDuplicateBlock(block);
                              setOpenBlockMenu(null);
                            }}
                          >
                            <Copy size={14} />
                            <span>Duplicate Block</span>
                          </div>
                          <div
                            className="dropdown-item"
                            onClick={() => {
                              /* TODO: Implement move */
                              setOpenBlockMenu(null);
                            }}
                          >
                            <Move size={14} />
                            <span>Move Block</span>
                          </div>
                          <div
                            className="dropdown-item"
                            onClick={() => {
                              /* TODO: Implement export */
                              setOpenBlockMenu(null);
                            }}
                          >
                            <Download size={14} />
                            <span>Export Block</span>
                          </div>
                          <div
                            className="dropdown-item"
                            onClick={() => {
                              handleCompleteBlock(block);
                              setOpenBlockMenu(null);
                            }}
                          >
                            <Check size={14} />
                            <span>Complete Block</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {total > 0 && (
                  <div className={`pd-block-progress ${blockPct >= 100 ? 'is-done' : ''}`}>
                    <div className="ui-meter"><i style={{ '--pct': `${blockPct}%` }} /></div>
                    <div className="pd-block-progress-meta">
                      <span>{completedActions.length}/{denom} done{cancelledActions.length ? ` · ${cancelledActions.length} cancelled` : ''}</span>
                      <b>{blockPct}%</b>
                    </div>
                  </div>
                )}

                <div className="pd-block-body">
                  <div className="pd-block-section">
                    <div className="pd-block-label">Result</div>
                    <div
                      className="pd-block-title pd-clickable"
                      onClick={() => setPreviewBlock({ ...block, actions: blockActions })}
                      title="Preview this block"
                    >{block.result_title}</div>
                    {block.key_result_id && (() => {
                      const kr = (project.key_results || []).find(k => k.id === block.key_result_id);
                      return kr ? (
                        <div className="rpm-block-kr" title="This block drives toward a key result">
                          <Target size={11} /> <span>Key result: <strong>{kr.title}</strong></span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  {block.purpose && (
                    <div className="pd-block-section">
                      <div className="pd-block-label">Purpose</div>
                      <div className="pd-block-purpose">{block.purpose}</div>
                    </div>
                  )}

                  {/* Massive Action Plan */}
                  <div className="pd-block-map">
                    <button
                      type="button"
                      className="pd-block-label pd-block-label--btn"
                      onClick={() => setPreviewBlock({ ...block, actions: blockActions })}
                      title="Preview this block"
                    >
                      Massive action plan
                      {activeActions.length > 0 && <span className="ui-count">{activeActions.length}</span>}
                    </button>
                    {activeActions.length > 0 && (
                      <ol className="pd-map-list">
                        {activeActions.map((action, idx) => (
                          <li key={action.id} className={`rpm-block-action pd-map-row p${action.priority || 0}`}>
                            <span className="pd-map-index">{idx + 1}</span>
                            <button
                              type="button"
                              className={`pd-map-check ${action.is_completed ? 'checked' : ''}`}
                              onClick={() => toggleActionComplete(action)}
                              aria-label="Mark done"
                              title="Mark done"
                            >
                              {action.is_completed && <Check size={10} />}
                            </button>
                            <span className="pd-map-title" title={action.title}>{action.title}</span>
                            <div className="pd-map-tools">
                              {/* Project Icon */}
                              {action.project_name && (
                                <button
                                  type="button"
                                  className="pd-icon-btn pd-icon-btn--sm pd-quiet"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (action.project_id) {
                                      navigate(`/projects/${action.project_id}`);
                                    }
                                  }}
                                  title={action.project_name}
                                  aria-label={`Open project ${action.project_name}`}
                                >
                                  <FolderOpen size={13} />
                                </button>
                              )}

                              {/* Duration */}
                              <button
                                type="button"
                                className="pd-map-dur"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditAction(action);
                                }}
                                title={`${action.duration_hours}h ${action.duration_minutes}m`}
                                aria-label={`Duration ${action.duration_hours || 0}h ${action.duration_minutes || 0}m — edit action`}
                              >
                                <Clock size={12} />
                                {fmtDuration({ hours: action.duration_hours || 0, minutes: action.duration_minutes || 0 }, '—')}
                              </button>

                              {/* Star */}
                              <button
                                type="button"
                                className={`pd-icon-btn pd-icon-btn--sm pd-star ${action.is_starred === true ? 'is-on' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleActionStar(action);
                                }}
                                aria-label={action.is_starred === true ? 'Unstar' : 'Star'}
                              >
                                <Star size={13} fill={action.is_starred === true ? 'currentColor' : 'none'} />
                              </button>

                              {/* Action Menu */}
                              <div className="pd-relative-z1000">
                                <button
                                  type="button"
                                  className="pd-icon-btn pd-icon-btn--sm"
                                  aria-label="Action menu"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setOpenBlockActionMenu(openBlockActionMenu === action.id ? null : {
                                      actionId: action.id,
                                      top: rect.bottom + 4,
                                      right: window.innerWidth - rect.right
                                    });
                                  }}
                                >
                                  <MoreVertical size={13} />
                                </button>

                                {openBlockActionMenu && openBlockActionMenu.actionId === action.id && (
                                  <div
                                    className="dropdown-menu"
                                    style={{
                                      position: 'fixed',
                                      right: `${openBlockActionMenu.right}px`,
                                      top: `${openBlockActionMenu.top}px`,
                                      minWidth: '180px',
                                      zIndex: 10000,
                                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div
                                      className="dropdown-item"
                                      onClick={() => handleEditAction(action)}
                                    >
                                      <Edit size={14} />
                                      <span>Edit Action</span>
                                    </div>
                                    <div
                                      className="dropdown-item"
                                      onClick={() => !action.is_completed && handleDuplicateAction(action)}
                                      style={{
                                        opacity: action.is_completed ? 0.5 : 1,
                                        cursor: action.is_completed ? 'not-allowed' : 'pointer',
                                        pointerEvents: action.is_completed ? 'none' : 'auto'
                                      }}
                                    >
                                      <Copy size={14} />
                                      <span>Duplicate Action</span>
                                    </div>
                                    <div
                                      className="dropdown-item"
                                      onClick={() => handleRemoveFromBlock(action)}
                                    >
                                      <Trash2 size={14} />
                                      <span>Remove From Block</span>
                                    </div>
                                    <div
                                      className="dropdown-item"
                                      onClick={() => handleCancelAction(action)}
                                    >
                                      <X size={14} />
                                      <span>Cancel Action</span>
                                    </div>
                                    <div
                                      className="dropdown-item pd-text-red"
                                      onClick={() => handleDeleteAction(action)}
                                    >
                                      <Trash2 size={14} />
                                      <span>Delete Action</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}

                    {/* Add Action Button */}
                    <button
                      type="button"
                      className="pd-add-map"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingAction({
                          block_id: block.id,
                          category_id: block.category_id || project.category_id,
                          project_id: project.id
                        });
                        setShowActionModal(true);
                      }}
                    >
                      <Plus size={14} />
                      Add Massive Action Plan
                    </button>
                  </div>

                  {/* Completed / cancelled — only shown when there is something in them */}
                  {(completedActions.length > 0 || cancelledActions.length > 0) && (
                    <div className="pd-folds">
                      <div className="pd-fold-bar">
                        {completedActions.length > 0 && (
                          <button
                            type="button"
                            className={`pd-fold-btn ${expandedCompleted[block.id] ? 'is-open' : ''}`}
                            aria-expanded={!!expandedCompleted[block.id]}
                            onClick={() => setExpandedCompleted(prev => ({ ...prev, [block.id]: !prev[block.id] }))}
                          >
                            <Check size={13} /> {stats.completedCount} completed
                            {expandedCompleted[block.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                        {cancelledActions.length > 0 && (
                          <button
                            type="button"
                            className={`pd-fold-btn ${expandedCancelled[block.id] ? 'is-open' : ''}`}
                            aria-expanded={!!expandedCancelled[block.id]}
                            onClick={() => setExpandedCancelled(prev => ({ ...prev, [block.id]: !prev[block.id] }))}
                          >
                            <X size={13} /> {stats.cancelledCount} canceled
                            {expandedCancelled[block.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>
                      {expandedCompleted[block.id] && completedActions.length > 0 && (
                        <ol className="pd-map-list pd-map-list--done">
                          {completedActions.map((action, idx) => (
                            <li key={action.id} className="pd-map-row is-done">
                              <span className="pd-map-index">{idx + 1}</span>
                              <span className="pd-map-check checked" aria-hidden="true"><Check size={10} strokeWidth={3} /></span>
                              <span className="pd-map-title">{action.title}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                      {expandedCancelled[block.id] && cancelledActions.length > 0 && (
                        <ol className="pd-map-list pd-map-list--done">
                          {cancelledActions.map((action, idx) => (
                            <li key={action.id} className="pd-map-row is-done is-cancelled">
                              <span className="pd-map-index">{idx + 1}</span>
                              <X size={14} className="pd-text-red" />
                              <span className="pd-map-title">{action.title}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
            </div>

            {unsortedActions.length > 0 && (
              <div className="pd-unsorted" id="pd-unsorted">
                <div className="pd-unsorted-head">
                  <h4 className="ui-kicker"><Inbox size={14} /> Unsorted <span className="ui-count">{unsortedActions.length}</span></h4>
                  <span className="pd-unsorted-hint">
                    {blockCount > 0 ? 'Tasks outside any block — give each one a home.' : 'Add a block to give these tasks a home.'}
                  </span>
                </div>
                <ul className="pd-actions-list pd-unsorted-list">
                  {unsortedActions.map(action => {
                    const d = dayKey(action.scheduled_date);
                    const tone = d ? (d < todayStr ? 'is-late' : d === todayStr ? 'is-today' : '') : '';
                    return (
                      <li key={action.id} className={`pd-action-row pd-unsorted-row p${action.priority || 0}`}>
                        <button
                          type="button"
                          className="pd-action-check"
                          onClick={() => toggleActionComplete(action)}
                          title="Mark done"
                          aria-label="Mark done"
                          aria-pressed={false}
                        />
                        <div className="pd-action-main">
                          <button type="button" className="pd-action-title" onClick={() => handleEditAction(action)} title="Edit action">
                            {action.title}
                          </button>
                          {d && (
                            <div className="pd-action-meta">
                              <span className={`pd-date ${tone}`} title={fmtDate(action.scheduled_date)}>
                                <CalendarIcon size={11} /> {d === todayStr ? 'Today' : fmtShort(d)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="pd-assign">
                          <Picker
                            value={null}
                            options={blockOptions}
                            onChange={(blockId) => assignToBlock(action, blockId)}
                            placeholder="Assign to block"
                            header="Move into block"
                            title={blockCount ? 'Assign this task to a block' : 'Add a block first'}
                            disabled={blockCount === 0}
                            className="pd-assign-trigger"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {view === 'list' && (() => {
          const list = starredOnly ? starredActions : activeAll;
          return (
            <div className="ui-card pd-panel pd-actions-panel">
              <header className="pd-panel-head">
                <h3 className="ui-kicker">
                  <ListChecks size={15} /> {starredOnly ? 'Starred actions' : 'All actions'}
                  <span className="ui-count">{list.length}</span>
                </h3>
                <button
                  type="button"
                  className={`pd-toggle-chip ${starredOnly ? 'is-on' : ''}`}
                  aria-pressed={starredOnly}
                  onClick={() => setStarredOnly(s => !s)}
                  title="Show only starred, open actions"
                >
                  <Star size={13} fill={starredOnly ? 'currentColor' : 'none'} />
                  <span>Starred<span className="pd-lg"> only</span></span>
                  <b>{starredActions.length}</b>
                </button>
                <button type="button" className="btn btn-primary pd-btn-sm" onClick={openNewAction}>
                  <Plus size={15} /> <span>Add<span className="pd-lg"> action</span></span>
                </button>
              </header>

              {list.length === 0 ? (
                <div className="ui-empty">
                  {activeAll.length === 0 ? (
                    <>
                      <ListChecks size={24} />
                      <span>No actions yet — break the result into the first concrete step.</span>
                      <button type="button" className="btn btn-secondary pd-btn-sm" onClick={openNewAction}><Plus size={14} /> Add your first action</button>
                    </>
                  ) : (
                    <>
                      <Star size={24} />
                      <span>Nothing starred. Star the few actions that matter most this week.</span>
                      <button type="button" className="btn btn-secondary pd-btn-sm" onClick={() => setStarredOnly(false)}>View all {activeAll.length}</button>
                    </>
                  )}
                </div>
              ) : (
              <ul className="pd-actions-list">
                {list.map(action => {
                  const waiting = (action.blocked_by || []).filter(b => !b.is_completed);
                  const freeing = (action.blocks || []).filter(b => !b.is_completed);
                  const d = dayKey(action.scheduled_date);
                  const tone = !action.is_completed && d ? (d < todayStr ? 'is-late' : d === todayStr ? 'is-today' : '') : '';
                  const showWaiting = !action.is_completed && waiting.length > 0;
                  const showFreeing = !action.is_completed && !showWaiting && freeing.length > 0;
                  return (
                    <li key={action.id} className={`pd-action-row p${action.priority || 0} ${action.is_completed ? 'is-done' : ''}`}>
                      <button
                        type="button"
                        className={`pd-action-check ${action.is_completed ? 'checked' : ''}`}
                        onClick={() => toggleActionComplete(action)}
                        title={action.is_completed ? 'Mark as not done' : 'Mark done'}
                        aria-label={action.is_completed ? 'Mark as not done' : 'Mark done'}
                        aria-pressed={!!action.is_completed}
                      >
                        {action.is_completed && <Check size={13} strokeWidth={3} />}
                      </button>
                      <div className="pd-action-main">
                        <button type="button" className="pd-action-title" onClick={() => handleEditAction(action)} title="Edit action">
                          {action.title}
                        </button>
                        {(showWaiting || showFreeing || d) && (
                          <div className="pd-action-meta">
                            {showWaiting && (() => {
                              const first = allActions.find(a => a.id === waiting[0].id);
                              return (
                                <button
                                  type="button"
                                  className="pd-dep is-waiting"
                                  title={`Waiting on:\n${waiting.map(w => w.title).join('\n')}`}
                                  aria-label={`Waiting on ${waiting.length} task${waiting.length > 1 ? 's' : ''}: ${waiting.map(w => w.title).join(', ')}`}
                                  onClick={() => first && handleEditAction(first)}
                                >
                                  <Lock size={11} /> {waiting.length}
                                </button>
                              );
                            })()}
                            {showFreeing && (
                              <span
                                className="pd-dep is-frees"
                                title={`Finishing this unblocks:\n${freeing.map(w => w.title).join('\n')}`}
                                aria-label={`Unblocks ${freeing.length} task${freeing.length > 1 ? 's' : ''}`}
                              >
                                <Unlock size={11} /> {freeing.length}
                              </span>
                            )}
                            {d && (
                              <span className={`pd-date ${tone}`} title={fmtDate(action.scheduled_date)}>
                                <CalendarIcon size={11} /> {d === todayStr ? 'Today' : fmtShort(d)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="pd-action-tools">
                        <button
                          type="button"
                          className={`pd-icon-btn pd-star ${action.is_starred ? 'is-on' : ''}`}
                          onClick={() => toggleActionStar(action)}
                          title={action.is_starred ? 'Unstar' : 'Star'}
                          aria-label={action.is_starred ? 'Unstar' : 'Star'}
                          aria-pressed={!!action.is_starred}
                        >
                          <Star size={14} fill={action.is_starred ? 'currentColor' : 'none'} />
                        </button>
                        <button type="button" className="pd-icon-btn pd-quiet" onClick={() => handleEditAction(action)} title="Edit" aria-label="Edit action">
                          <Edit size={14} />
                        </button>
                        <button type="button" className="pd-icon-btn pd-quiet pd-danger" onClick={() => handleDeleteAction(action)} title="Delete" aria-label="Delete action">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
          );
        })()}

        {view === 'timeline' && (
          <ErrorBoundary name="project-timeline" resetKey={project} message="The timeline couldn't be drawn.">
            <ProjectTimeline
              projectId={project.id}
              refreshKey={project}
              onEdit={(id) => { const a = allActions.find(x => x.id === id); if (a) handleEditAction(a); }}
              onChanged={() => loadProject()}
            />
          </ErrorBoundary>
        )}

        {view === 'week' && (
          <section className="project-planner pd-planner">
        <div className="planner-header">
          <h3 className="ui-kicker"><CalendarDays size={15} /> Week</h3>
          <div className="planner-nav">
            <button
              type="button"
              className="btn btn-icon btn-secondary"
              aria-label="Previous week"
              onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="planner-date-range">
              {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
            </div>
            <button
              type="button"
              className="btn btn-icon btn-secondary"
              aria-label="Next week"
              onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-secondary"
              onClick={() => setCurrentWeek(new Date())}
              title="Go to current week"
              aria-label="Go to current week"
            >
              <CalendarIcon size={16} />
            </button>
          </div>
        </div>

        {unscheduledActions.length > 0 && (
          <div className="planner-unscheduled">
            <div className="planner-unscheduled-label">
              <span><b>{unscheduledActions.length}</b> unscheduled</span>
              <em>drag onto a day, or click to edit</em>
            </div>
            <div className="planner-unscheduled-list">
              {unscheduledActions.map(a => (
                <div
                  key={a.id}
                  className={`planner-chip${dragActionId === a.id ? ' is-dragging' : ''}`}
                  draggable
                  onDragStart={(e) => { setDragActionId(a.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragActionId(null); setDropDay(null); }}
                  onClick={() => handleEditAction(a)}
                  title={a.title}
                >
                  {a.title}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="planner-grid planner-week">
          {weekDays.map(day => {
            const dayActions = getActionsForDay(day);
            const dayStr = format(day, 'yyyy-MM-dd');
            const isToday = dayStr === todayStr;
            const isPast = dayStr < todayStr;
            const isDropTarget = dropDay === dayStr;

            return (
              <div
                key={day.toISOString() + '-cell'}
                className={`planner-day${isToday ? ' is-today' : ''}${isPast ? ' is-past' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
                onDragOver={(e) => { if (dragActionId) { e.preventDefault(); setDropDay(dayStr); } }}
                onDragLeave={() => setDropDay(d => (d === dayStr ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragActionId) handleScheduleAction(dragActionId, dayStr);
                  setDragActionId(null); setDropDay(null);
                }}
                onClick={() => {
                  setEditingAction({
                    scheduled_date: dayStr,
                    project_id: project.id,
                    category_id: project.category_id
                  });
                  setShowActionModal(true);
                }}
                title={`Add an action on ${format(day, 'EEE, MMM d')}`}
              >
                <div className="planner-day-head">
                  <span className="planner-dow">{format(day, 'EEE')}</span>
                  <span className="planner-day-number">{format(day, 'd')}</span>
                  {dayActions.length > 0 && <span className="planner-day-count">{dayActions.length}</span>}
                </div>
                {dayActions.length > 0 && (
                  <div className="planner-pills">
                    {dayActions.slice(0, 3).map(action => (
                      <div
                        key={action.id}
                        className={`planner-pill${action.is_completed ? ' is-done' : ''}${dragActionId === action.id ? ' is-dragging' : ''}`}
                        style={{ '--c': action.category_color || 'var(--accent-pink)' }}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); setDragActionId(action.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => { setDragActionId(null); setDropDay(null); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditAction(action);
                        }}
                        title={`${action.title} — drag to another day`}
                      >
                        {action.title}
                      </div>
                    ))}
                    {dayActions.length > 3 && (
                      <div className="planner-more">
                        +{dayActions.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
          </section>
        )}
      </section>

      {/* ================= Capture list + Inspiration (slim when empty) ================= */}
      <div className="pd-extras">
        {project.capture_items?.length ? (
          <section className="ui-card pd-panel pd-extra-card">
            <header className="pd-panel-head">
              <h2 className="ui-kicker">
                <Inbox size={15} /> Capture list
                <span className="ui-count">{project.capture_items.length}</span>
              </h2>
              <button
                type="button"
                className="pd-icon-btn pd-add"
                aria-label="Add capture item"
                title="Add capture item"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingCaptureItem(null);
                  setShowCaptureItemModal(true);
                }}
              >
                <Plus size={16} />
              </button>
            </header>
            <ul className="pd-capture-list">
              {project.capture_items.map((item, idx) => (
                <li key={item.id} className="pd-capture">
                  <span className="pd-capture-num">{idx + 1}</span>
                  <span className="pd-capture-title">{item.title}</span>
                  <div className="capture-actions pd-item-actions">
                    <button
                      type="button"
                      className={`pd-icon-btn pd-star ${item.is_starred ? 'is-on' : ''}`}
                      aria-label={item.is_starred ? 'Unstar capture item' : 'Star capture item'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCaptureItemStar(item);
                      }}
                    >
                      <Star size={13} fill={item.is_starred ? 'currentColor' : 'none'} />
                    </button>
                    <div className="pd-relative">
                      <button
                        type="button"
                        className="pd-icon-btn"
                        aria-label="Capture item menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenCaptureItemMenu(openCaptureItemMenu === item.id ? null : item.id);
                        }}
                      >
                        <MoreVertical size={14} />
                      </button>

                      {openCaptureItemMenu === item.id && (
                        <div
                          className="dropdown-menu pd-dropdown-abs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            className="dropdown-item"
                            onClick={() => handleEditCaptureItem(item)}
                          >
                            <Edit size={14} />
                            <span>Edit Capture Item</span>
                          </div>
                          <div
                            className="dropdown-item pd-text-red"
                            onClick={() => handleDeleteCaptureItem(item)}
                          >
                            <Trash2 size={14} />
                            <span>Delete Capture Item</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <button type="button" className="pd-slim-add" onClick={() => { setEditingCaptureItem(null); setShowCaptureItemModal(true); }}>
            <Plus size={15} /> <span>Add to capture list</span> <em>park loose ideas</em>
          </button>
        )}

        {project.inspiration_items?.length ? (
          <section className="ui-card pd-panel pd-extra-card">
            <header className="pd-panel-head">
              <h2 className="ui-kicker">
                <Lightbulb size={15} /> Inspiration board
                <span className="ui-count">{project.inspiration_items.length}</span>
              </h2>
              <button
                type="button"
                className="pd-icon-btn pd-add"
                aria-label="Add inspiration"
                title="Add inspiration"
                onClick={handleAddInspiration}
              >
                <Plus size={16} />
              </button>
            </header>
        <div className="pd-mood-grid">
          {project.inspiration_items?.map(item => {
            const host = hostOf(item.link_url);
            const initial = ((host || item.title || '?').replace(/^www\./, '')[0] || '?').toUpperCase();
            return (
              <button
                key={item.id}
                type="button"
                className={`pd-mood-card ${item.image_url ? 'has-img' : 'is-text'}`}
                onClick={() => setPreviewInspiration(item)}
                title={item.title || 'Open'}
                style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : { '--tint': tintFor(host || item.title || '') }}
              >
                {!item.image_url && (
                  <span className="pd-mood-text">
                    <span className="pd-mood-mono" aria-hidden="true">{initial}</span>
                    {item.description && <span className="pd-mood-desc">{item.description}</span>}
                  </span>
                )}
                <span className="pd-mood-overlay">
                  <span className="pd-mood-title">{item.title || 'Untitled'}</span>
                  {host && <span className="pd-mood-host"><ExternalLink size={11} /> {host}</span>}
                </span>
                <span
                  className="pd-mood-del"
                  role="button"
                  aria-label="Delete inspiration item"
                  onClick={(e) => { e.stopPropagation(); handleDeleteInspiration(item); }}
                >
                  <Trash2 size={13} />
                </span>
              </button>
            );
          })}

          {/* Add tile */}
          <button type="button" className="pd-mood-add" onClick={handleAddInspiration}>
            <Plus size={22} />
            <span>Add inspiration</span>
          </button>
        </div>
          </section>
        ) : (
          <button type="button" className="pd-slim-add" onClick={handleAddInspiration}>
            <Plus size={15} /> <span>Add inspiration</span> <em>images, links, references</em>
          </button>
        )}
      </div>

      {/* This project's optional AI coach */}
      {project?.id && <CoachPanel scope="project" projectId={project.id} />}

      {/* Edit Project Modal */}
      {showEditModal && categories && project && (
        <CreateProjectModal 
          onClose={() => setShowEditModal(false)}
          onSuccess={handleProjectUpdate}
          categories={categories}
          initialData={project}
          onCategoriesRefresh={refreshData}
        />
      )}

      {/* Key Result Modal */}
      {showKeyResultModal && project && (
        <CreateKeyResultModal 
          onClose={() => {
            setShowKeyResultModal(false);
            setEditingKeyResult(null);
          }}
          onSuccess={handleKeyResultSuccess}
          projectId={project.id}
          initialData={editingKeyResult || {}}
        />
      )}

      {/* Capture Item Modal */}
      {showCaptureItemModal && project && (
        <CreateCaptureItemModal 
          onClose={() => {
            setShowCaptureItemModal(false);
            setEditingCaptureItem(null);
          }}
          onSuccess={handleCaptureItemSuccess}
          projectId={project.id}
          initialData={editingCaptureItem || {}}
        />
      )}

      {/* Block Modal */}
      {showBlockModal && categories && project && (
        <CreateBlockModal 
          onClose={() => {
            setShowBlockModal(false);
            setEditingBlock(null);
          }}
          onSuccess={handleBlockSuccess}
          categories={categories}
          initialData={editingBlock ? {
            ...editingBlock,
            category_id: editingBlock.category_id || project.category_id
          } : { 
            category_id: project.category_id,
            project_id: project.id
          }}
        />
      )}

      {/* Action Modal */}
      {showActionModal && categories && project && (
        <CreateActionModal 
          onClose={() => {
            setShowActionModal(false);
            setEditingAction(null);
          }}
          onSuccess={handleActionSuccess}
          categories={categories}
          initialData={editingAction ? {
            ...editingAction,
            category_id: editingAction.category_id || project.category_id
          } : { 
            category_id: project.category_id,
            project_id: project.id
          }}
        />
      )}

      {/* Inspiration create / edit */}
      {showInspirationModal && project && (
        <CreateInspirationModal
          projectId={project.id}
          initialData={editingInspiration || {}}
          onClose={() => { setShowInspirationModal(false); setEditingInspiration(null); }}
          onSuccess={handleInspirationSuccess}
        />
      )}

      {/* Inspiration preview / lightbox */}
      {previewInspiration && (
        <InspirationPreviewModal
          item={previewInspiration}
          onClose={() => setPreviewInspiration(null)}
          onEdit={handleEditInspiration}
          onDelete={handleDeleteInspiration}
        />
      )}

      {previewBlock && (
        <BlockPreviewModal
          block={previewBlock}
          onClose={() => setPreviewBlock(null)}
          onEdit={(b) => { setPreviewBlock(null); handleEditBlock(b); }}
        />
      )}
    </div>
  );
}

export default ProjectDetailPage;
