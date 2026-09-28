import { useContext, useState } from 'react';
import { format } from 'date-fns';
import { AuthContext } from '../App';
import { useToast } from './ToastProvider';
import BrainDumpModal from './BrainDumpModal';

// "Draft a fix" for a slipping key result: the AI drafts catch-up tasks scheduled from today
// to the deadline → preview → you approve. Shared by the Roadmap diamonds and Today's
// catch-up rows. Render `modal` somewhere in the tree.
export default function useGoalFix({ onApplied } = {}) {
  const { api } = useContext(AuthContext);
  const { showToast } = useToast();
  const [fixingId, setFixingId] = useState(null);
  const [plan, setPlan] = useState(null);   // { ...draft, kr }

  const draft = async (kr) => {
    if (!kr?.id || fixingId) return;
    setFixingId(kr.id);
    const body = { keyResultId: kr.id, today: format(new Date(), 'yyyy-MM-dd') };
    try {
      // The server falls back to your saved default model when this browser has none.
      let res = await api.forecastFix({ ...body, modelKey: localStorage.getItem('ai.modelKey') || undefined });
      if (res?.error && /no longer available|unknown model/i.test(res.error) && localStorage.getItem('ai.modelKey')) {
        localStorage.removeItem('ai.modelKey');
        res = await api.forecastFix(body);
      }
      if (!res || res.error) throw new Error(res?.error || 'Could not draft a catch-up plan');
      if (!res.operations?.length) { showToast('No catch-up tasks came back — try again.', 'info'); return; }
      setPlan({ ...res, kr });
    } catch (e) {
      showToast(e.message || 'Could not draft a catch-up plan', 'error');
    } finally { setFixingId(null); }
  };

  const modal = plan && (
    <BrainDumpModal
      initialPlan={plan}
      title={`Catch-up plan · ${plan.kr.title}`}
      onClose={() => setPlan(null)}
      onApplied={() => { const kr = plan.kr; setPlan(null); onApplied && onApplied(kr); }}
    />
  );
  return { draft, fixingId, modal };
}
