import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { debug } from '../../electron/utils/debug';
import { User } from '@supabase/supabase-js';
import { Tables, TablesInsert, TablesUpdate } from '../shared/supabase'; // Assuming these types are generated

type FaqRow = Tables<'faq'>;
type FaqInsert = TablesInsert<'faq'>;
type FaqUpdate = TablesUpdate<'faq'>;

interface FaqModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (faq: FaqInsert | FaqUpdate) => Promise<void>;
  initialData?: FaqRow | null;
}

const FaqModal: React.FC<FaqModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setQuestion(initialData.question);
      setAnswer(initialData.answer);
    } else {
      setQuestion('');
      setAnswer('');
    }
  }, [initialData, isOpen]);

  const handleSubmit = async () => {
    if (!question.trim() || !answer.trim()) {
      alert('Question and Answer cannot be empty.'); // Simple validation
      return;
    }
    setIsSaving(true);
    const faqData = {
      ...initialData, // Keeps id if editing
      question,
      answer,
      // user_id will be set by RLS or server-side if not provided by client, ensure your policies handle this
    };
    // Remove id if it's a new entry and id was part of initialData somehow (e.g. null)
    if (!initialData?.id) {
      delete faqData.id;
    }

    await onSave(faqData as FaqInsert | FaqUpdate);
    setIsSaving(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={`modal ${isOpen ? 'modal-open' : ''}`}>
      <div className="modal-box">
        <h3 className="font-bold text-lg">{initialData ? 'Edit FAQ' : 'Add FAQ'}</h3>
        <div className="py-4 space-y-4">
          <div>
            <label className="label">
              <span className="label-text">Question</span>
            </label>
            <input
              type="text"
              placeholder="Enter question"
              className="input input-bordered w-full"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div>
            <label className="label">
              <span className="label-text">Answer</span>
            </label>
            <textarea
              className="textarea textarea-bordered w-full h-32"
              placeholder="Enter answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            ></textarea>
          </div>
        </div>
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? <span className="loading loading-spinner loading-xs"></span> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const FaqPanel: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqRow | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const toastId = `toast-faq-${Date.now()}`;
    const toastElement = document.createElement('div');
    toastElement.id = toastId;
    toastElement.className = `toast toast-end`;
    toastElement.innerHTML = `
      <div class="alert ${type === 'error' ? 'alert-error' : 'alert-success'}">
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(toastElement);
    setTimeout(() => {
      toastElement.remove();
    }, 3000);
  };

  const fetchFaqs = useCallback(async (currentUserId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // Assuming RLS is set up for user_id or it's public, adjust query as needed
      const { data, error: fetchError } = await supabase
        .from('faq')
        .select('*')
        // .eq('user_id', currentUserId) // Uncomment if FAQs are user-specific and RLS needs this
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setFaqs(data || []);
      debug('settings', 'FAQs loaded:', data?.length);
    } catch (err: any) {
      debug('settings', 'Error fetching FAQs:', err);
      setError('Failed to load FAQs.');
      showToast('Error loading FAQs', 'error');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const fetchUserAndData = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        setUser(currentUser);
        fetchFaqs(currentUser.id);
      } else {
        setIsLoading(false);
        setError('User not authenticated.');
        debug('settings', 'User not authenticated for FAQ panel');
      }
    };
    fetchUserAndData();
  }, [fetchFaqs]);

  const handleSaveFaq = async (faqData: FaqInsert | FaqUpdate) => {
    if (!user) {
      showToast('User not authenticated', 'error');
      return;
    }

    const isEditing = 'id' in faqData && !!faqData.id;
    let optimisticFaqs = [...faqs];
    const originalFaqs = [...faqs];

    if (isEditing) {
      optimisticFaqs = faqs.map(f => f.id === (faqData as FaqUpdate).id ? { ...f, ...faqData } as FaqRow : f);
    } else {
      // For new items, generate a temporary ID for UI rendering, Supabase will assign a real one.
      const tempId = `temp-${Date.now()}`;
      const newFaqEntry = { ...faqData, id: tempId, created_at: new Date().toISOString(), user_id: user.id } as FaqRow;
      optimisticFaqs = [newFaqEntry, ...faqs];
    }
    setFaqs(optimisticFaqs);
    debug('settings', `Optimistically ${isEditing ? 'updated' : 'added'} FAQ`, faqData);

    try {
      if (isEditing) {
        const { id, question: newQuestion, answer: newAnswer } = faqData as FaqUpdate & {id: string}; // Ensure id is present, get new Q/A
        
        const updatePayload: FaqUpdate = {
          // id: id, // id is used in .eq(), not in payload typically
          question: newQuestion, 
          answer: newAnswer,
          // Supabase types might make other fields optional in Update, or required if they don't have defaults
          // We are only explicitly updating question and answer here.
        };

        // Remove undefined fields from payload as Supabase client might not like them
        Object.keys(updatePayload).forEach(key => updatePayload[key as keyof FaqUpdate] === undefined && delete updatePayload[key as keyof FaqUpdate]);

        const { data: updatedData, error: updateError } = await supabase
          .from('faq')
          .update(updatePayload)
          .eq('id', id)
          .select()
          .single();
        if (updateError) throw updateError;
        // Update local state with the response from Supabase to get any server-generated fields (e.g., updated_at)
        setFaqs(faqs.map(f => f.id === updatedData!.id ? updatedData! : f));
        showToast('FAQ updated successfully!');
        debug('settings', 'FAQ updated in Supabase', updatedData);
      } else {
        // For inserts, question and answer come from faqData. We trust modal validation.
        // user_id is also set if applicable.
        const insertPayload: FaqInsert = { 
          question: (faqData as FaqInsert).question, // Cast to FaqInsert to satisfy type
          answer: (faqData as FaqInsert).answer,     // Cast to FaqInsert to satisfy type
          user_id: user.id    // Add user_id if applicable
        };
        const { data: insertedData, error: insertError } = await supabase
          .from('faq')
          .insert(insertPayload)
          .select()
          .single();
        if (insertError) throw insertError;
        // Replace temp item with actual data from Supabase
        setFaqs(currentFaqs => currentFaqs.map(f => f.id.startsWith('temp-') ? insertedData! : f));
        showToast('FAQ added successfully!');
        debug('settings', 'FAQ added to Supabase', insertedData);
      }
    } catch (err: any) {
      debug('settings', `Error ${isEditing ? 'updating' : 'adding'} FAQ in Supabase:`, err);
      showToast(`Failed to ${isEditing ? 'update' : 'add'} FAQ`, 'error');
      setFaqs(originalFaqs); // Revert optimistic update
      debug('settings', 'Reverted optimistic FAQ update');
    }
  };

  const handleDeleteFaq = async (faqId: string) => {
    if (!user || !window.confirm('Are you sure you want to delete this FAQ?')) return;

    const originalFaqs = [...faqs];
    const optimisticFaqs = faqs.filter(f => f.id !== faqId);
    setFaqs(optimisticFaqs);
    debug('settings', 'Optimistically deleted FAQ', faqId);

    try {
      const { error: deleteError } = await supabase
        .from('faq')
        .delete()
        .eq('id', faqId);
      if (deleteError) throw deleteError;
      showToast('FAQ deleted successfully!');
      debug('settings', 'FAQ deleted from Supabase');
    } catch (err: any) {
      debug('settings', 'Error deleting FAQ from Supabase:', err);
      showToast('Failed to delete FAQ', 'error');
      setFaqs(originalFaqs); // Revert optimistic update
      debug('settings', 'Reverted optimistic FAQ deletion');
    }
  };

  const openAddModal = () => {
    setEditingFaq(null);
    setIsModalOpen(true);
    debug('settings', 'Opening Add FAQ modal');
  };

  const openEditModal = (faq: FaqRow) => {
    setEditingFaq(faq);
    setIsModalOpen(true);
    debug('settings', 'Opening Edit FAQ modal for:', faq.id);
  };

  if (isLoading) return <div className="text-center"><span className="loading loading-spinner"></span> Loading FAQs...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Manage FAQs</h3>
        <button className="btn btn-primary" onClick={openAddModal}>Add FAQ</button>
      </div>

      {faqs.length === 0 && !isLoading && (
        <p>No FAQs found. Click "Add FAQ" to create one.</p>
      )}

      {faqs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Question</th>
                <th>Answer</th>
                <th className="w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {faqs.map(faq => (
                <tr key={faq.id} className="hover">
                  <td>{faq.question}</td>
                  <td>{faq.answer.substring(0, 100)}{faq.answer.length > 100 ? '...' : ''}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-outline btn-info" onClick={() => openEditModal(faq)}>Edit</button>
                      <button className="btn btn-sm btn-outline btn-error" onClick={() => handleDeleteFaq(faq.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FaqModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveFaq}
        initialData={editingFaq}
      />
    </div>
  );
}; 