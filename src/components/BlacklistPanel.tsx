import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { debug } from '../../electron/utils/debug';
import { User } from '@supabase/supabase-js';
import { Tables, TablesInsert } from '../shared/supabase'; // Assuming these types are generated

type BlacklistCompanyRow = Tables<'blacklist_companies'>;
type BlacklistCompanyInsert = TablesInsert<'blacklist_companies'>;

export const BlacklistPanel: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [blacklist, setBlacklist] = useState<BlacklistCompanyRow[]>([]);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const toastId = `toast-blacklist-${Date.now()}`;
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

  const fetchBlacklist = useCallback(async (currentUserId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('blacklist_companies')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setBlacklist(data || []);
      debug('settings', 'Blacklist loaded:', data?.length);
    } catch (err: any) {
      debug('settings', 'Error fetching blacklist:', err);
      setError('Failed to load blacklist.');
      showToast('Error loading blacklist', 'error');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const fetchUserAndData = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        setUser(currentUser);
        fetchBlacklist(currentUser.id);
      } else {
        setIsLoading(false);
        setError('User not authenticated.');
        debug('settings', 'User not authenticated for Blacklist panel');
      }
    };
    fetchUserAndData();
  }, [fetchBlacklist]);

  const handleAddCompany = async () => {
    if (!user || !newCompanyName.trim()) {
      if(!user) showToast('User not authenticated', 'error');
      else showToast('Company name cannot be empty', 'error');
      return;
    }

    const companyToAdd: BlacklistCompanyInsert = {
      company_name: newCompanyName.trim(),
      user_id: user.id,
      // reason can be omitted if nullable and not collected
    };

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const optimisticEntry: BlacklistCompanyRow = {
      ...companyToAdd,
      id: tempId, // Temporary ID for UI
      created_at: new Date().toISOString(),
      reason: null, // Assuming reason is nullable
    };
    const originalBlacklist = [...blacklist];
    setBlacklist([optimisticEntry, ...blacklist]);
    setNewCompanyName('');
    debug('settings', 'Optimistically added company to blacklist', companyToAdd.company_name);

    try {
      const { data: insertedData, error: insertError } = await supabase
        .from('blacklist_companies')
        .insert(companyToAdd)
        .select()
        .single();
      
      if (insertError) {
        // Check for unique constraint violation (user_id, company_name)
        if (insertError.code === '23505') { // PostgreSQL unique violation code
            showToast(`Company "${companyToAdd.company_name}" is already in the blacklist.`, 'error');
            debug('settings', 'Duplicate company entry attempt:', companyToAdd.company_name);
            setBlacklist(originalBlacklist); // Revert: remove the temp entry
            return; 
        }
        throw insertError;
      }

      // Replace temp item with actual data from Supabase
      setBlacklist(currentList => 
        currentList.map(item => item.id === tempId ? insertedData! : item)
      );
      showToast('Company added to blacklist!');
      debug('settings', 'Company added to Supabase blacklist', insertedData);
    } catch (err: any) {
      debug('settings', 'Error adding company to Supabase blacklist:', err);
      showToast('Failed to add company', 'error');
      setBlacklist(originalBlacklist); // Revert optimistic update
      debug('settings', 'Reverted optimistic blacklist addition');
    }
  };

  const handleRemoveCompany = async (companyId: string, companyName: string) => {
    if (!user || !window.confirm(`Are you sure you want to remove "${companyName}" from the blacklist?`)) return;

    const originalBlacklist = [...blacklist];
    const optimisticBlacklist = blacklist.filter(item => item.id !== companyId);
    setBlacklist(optimisticBlacklist);
    debug('settings', 'Optimistically removed company from blacklist', companyId);

    try {
      const { error: deleteError } = await supabase
        .from('blacklist_companies')
        .delete()
        .eq('id', companyId);
      
      if (deleteError) throw deleteError;

      showToast('Company removed from blacklist!');
      debug('settings', 'Company removed from Supabase blacklist');
    } catch (err: any) {
      debug('settings', 'Error removing company from Supabase blacklist:', err);
      showToast('Failed to remove company', 'error');
      setBlacklist(originalBlacklist); // Revert optimistic update
      debug('settings', 'Reverted optimistic blacklist removal');
    }
  };

  if (isLoading) return <div className="text-center"><span className="loading loading-spinner"></span> Loading Blacklist...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Blacklisted Companies</h3>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Enter company name"
            className="input input-bordered w-full max-w-xs"
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddCompany()}
          />
          <button className="btn btn-primary" onClick={handleAddCompany}>Add to Blacklist</button>
        </div>
      </div>

      {blacklist.length === 0 && !isLoading && (
        <p>No companies are currently blacklisted.</p>
      )}

      {blacklist.length > 0 && (
        <div className="overflow-x-auto">
          <ul className="menu bg-base-100 w-full p-0 [&_li>*]:rounded-none">
            {blacklist.map(company => (
              <li key={company.id} className="hover:bg-base-200 flex flex-row justify-between items-center p-2 border-b border-base-300">
                <span className="flex-grow">{company.company_name}</span>
                <button 
                  className="btn btn-xs btn-error btn-outline"
                  onClick={() => handleRemoveCompany(company.id, company.company_name)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}; 