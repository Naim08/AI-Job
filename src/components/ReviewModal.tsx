import React, { useEffect, useState } from 'react';
import { DecisionTree } from './DecisionTree';
import { useModal } from '../lib/useModal';
import { supabase } from '../lib/supabaseClient';
import type { Answer } from '../shared/types';

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  selectedApp: any; // Strict type if available
  onStatusChange?: (status: string) => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({ open, onClose, selectedApp, onStatusChange }) => {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && selectedApp?.id) {
      setLoading(true);
      supabase
        .from('application_answers')
        .select('*')
        .eq('application_id', selectedApp.id)
        .then(({ data, error }) => {
          setLoading(false);
          if (error) {
            setError(error.message);
            setAnswers([]);
          } else {
            setAnswers((data || []).map(item => {
              const rawItem = item as any;
              return {
                id: rawItem.id as string,
                question: rawItem.question as string,
                answer: (rawItem.answer ?? '') as string,
                needs_review: typeof rawItem.needs_review === 'boolean' 
                                ? rawItem.needs_review 
                                : ((rawItem.answer ?? '') as string).trim().length === 0,
                refs: (rawItem.refs || []) as readonly string[],
              } as Answer;
            }));
          }
        });
    }
  }, [open, selectedApp]);

  const handleEdit = (idx: number, value: string) => {
    setAnswers(ans =>
      ans.map((a, i) =>
        i === idx
          ? { ...a, answer: value.slice(0, 500), needs_review: value.trim().length === 0 }
          : a
      )
    );
  };

  const persistAnswers = async (status: string) => {
    setSaving(true);
    for (const ans of answers) {
      await supabase
        .from('application_answers')
        .update({ answer: ans.answer, needs_review: ans.needs_review })
        .eq('id', ans.id as string);
    }
    await supabase
      .from('job_applications')
      .update({ status })
      .eq('id', selectedApp.id);
    setSaving(false);
    onStatusChange?.(status);
  };

  const handleApprove = async () => {
    await persistAnswers('queued');
    window.electronAPI.applyQueued(selectedApp.id);
    onClose();
  };
  const handleSave = async () => {
    await persistAnswers('pending_review');
    onClose();
  };
  const handleSkip = async () => {
    await persistAnswers('skipped');
    onClose();
  };

  return open ? (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-2">Review Application</h3>
        {loading ? (
          <span className="loading loading-spinner" />
        ) : error ? (
          <div className="text-error">{error}</div>
        ) : (
          <>
            {answers.map((ans, idx) => {
              const borderClass = ans.needs_review ? 'border-error' : 'border-base-300';
              return (
                <div key={ans.id} className="mb-4">
                  <label className="block font-semibold mb-1">Q: {ans.question}</label>
                  <textarea
                    className={`textarea textarea-bordered w-full ${borderClass}`}
                    value={ans.answer ?? ''}
                    maxLength={500}
                    rows={3}
                    onChange={e => handleEdit(idx, e.target.value)}
                  />
                </div>
              );
            })}
            {selectedApp && selectedApp.filter_trace && <DecisionTree data={selectedApp.filter_trace} />}
          </>
        )}
        <div className="modal-action flex gap-2">
          <button 
            className="btn btn-success" 
            disabled={saving || answers.some(a => a.needs_review && (a.answer ?? '').trim().length === 0)} 
            onClick={handleApprove}
          >
            Approve & Apply
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>Save for Later</button>
          <button className="btn btn-error" disabled={saving} onClick={handleSkip}>Skip</button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  ) : null;
};
