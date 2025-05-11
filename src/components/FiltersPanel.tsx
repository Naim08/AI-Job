import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { debug } from '../../electron/utils/debug';
import { User } from '@supabase/supabase-js';
import { Json } from '../shared/supabase';

// Assuming profiles.settings is a JSONB column structured like this:
interface ProfileSettings {
  jobSearchKeywords?: string[];
  jobSearchLocations?: string[];
}

// This should align with your src/shared/supabase.ts after adding the 'settings' column
interface ProfileRow {
  id: string;
  user_id: string;
  avatar_url?: string | null;
  full_name?: string | null;
  resume_text?: string | null;
  settings?: ProfileSettings | null; // Added settings field
  created_at: string;
  updated_at: string;
}

// For the update payload, we'll ensure settings conforms to what Supabase expects (Json)
interface ProfileUpdateForSupabase {
  avatar_url?: string | null;
  full_name?: string | null;
  resume_text?: string | null;
  settings?: Json; // Use the Json type for the payload
  updated_at?: string;
  // user_id is used in .eq(), not typically in the update payload itself unless changing it.
}

export const FiltersPanel: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const toastId = `toast-${Date.now()}`;
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

  const fetchUserProfile = useCallback(async (currentUser: User) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id, settings') // Ensure settings is selected
        .eq('user_id', currentUser.id)
        .single<ProfileRow>(); // Use the ProfileRow interface

      if (profileError) throw profileError;

      if (data && data.settings) {
        const settings = data.settings as ProfileSettings; // Cast is okay if ProfileRow defines it as potentially null
        setKeywords(settings.jobSearchKeywords || []);
        setLocations(settings.jobSearchLocations || []);
        debug('settings', 'Filters loaded:', settings);
      } else {
        // No settings found, initialize with empty arrays
        setKeywords([]);
        setLocations([]);
        debug('settings', 'No existing filters found, initialized empty.');
      }
    } catch (err: any) {
      debug('settings', 'Error fetching profile settings:', err);
      setError('Failed to load filter settings.');
      showToast('Error loading settings', 'error');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const fetchUserAndProfile = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        setUser(currentUser);
        fetchUserProfile(currentUser);
      } else {
        setIsLoading(false);
        setError('User not authenticated.');
        debug('settings', 'User not authenticated');
      }
    };
    fetchUserAndProfile();
  }, [fetchUserProfile]);

  const saveSettings = async (newKeywords: string[], newLocations: string[]) => {
    if (!user) {
      showToast('User not authenticated', 'error');
      return;
    }

    const newSettings: ProfileSettings = {
      jobSearchKeywords: newKeywords,
      jobSearchLocations: newLocations,
    };

    // Optimistic update
    const oldKeywords = [...keywords];
    const oldLocations = [...locations];
    // Also capture old full settings object for potential revert
    const oldProfileSettings = user ? (await supabase.from('profiles').select('settings').eq('user_id', user.id).single<{settings: ProfileSettings | null}>()).data?.settings : null;

    setKeywords(newKeywords);
    setLocations(newLocations);
    debug('settings', 'Optimistically updated filters', newSettings);

    try {
      // Cast newSettings (ProfileSettings) to Json for the payload
      const updatePayload: ProfileUpdateForSupabase = { settings: newSettings as Json };
      const { error: updateError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      showToast('Settings saved successfully!', 'success');
      debug('settings', 'Filter settings saved to Supabase');
    } catch (err: any) {
      debug('settings', 'Error saving settings to Supabase:', err);
      showToast('Failed to save settings', 'error');
      // Revert optimistic update
      setKeywords(oldKeywords);
      setLocations(oldLocations);
      // Potentially revert the settings object in DB if needed, though current logic just updates UI.
      // For full revert, would need to re-fetch or use oldProfileSettings
      debug('settings', 'Reverted optimistic filter update to UI values:', {oldKeywords, oldLocations});
      if (oldProfileSettings) {
        debug('settings', 'Previous full settings object was:', oldProfileSettings);
      }
    }
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      const updatedKeywords = [...keywords, newKeyword.trim()];
      saveSettings(updatedKeywords, locations);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    const updatedKeywords = keywords.filter(kw => kw !== keywordToRemove);
    saveSettings(updatedKeywords, locations);
  };

  const handleAddLocation = () => {
    if (newLocation.trim() && !locations.includes(newLocation.trim())) {
      const updatedLocations = [...locations, newLocation.trim()];
      saveSettings(keywords, updatedLocations);
      setNewLocation('');
    }
  };

  const handleRemoveLocation = (locationToRemove: string) => {
    const updatedLocations = locations.filter(loc => loc !== locationToRemove);
    saveSettings(keywords, updatedLocations);
  };

  if (isLoading) return <div className="text-center"><span className="loading loading-spinner"></span> Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Job Search Keywords</h3>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Enter keyword"
            className="input input-bordered w-full max-w-xs"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
          />
          <button className="btn btn-primary" onClick={handleAddKeyword}>Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {keywords.map(kw => (
            <div key={kw} className="badge badge-lg badge-outline gap-2">
              {kw}
              <button onClick={() => handleRemoveKeyword(kw)} className="btn btn-xs btn-circle btn-ghost">✕</button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-2">Job Search Locations</h3>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Enter location"
            className="input input-bordered w-full max-w-xs"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddLocation()}
          />
          <button className="btn btn-primary" onClick={handleAddLocation}>Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {locations.map(loc => (
            <div key={loc} className="badge badge-lg badge-outline gap-2">
              {loc}
              <button onClick={() => handleRemoveLocation(loc)} className="btn btn-xs btn-circle btn-ghost">✕</button>
            </div>
          ))}
        </div>
      </div>
      
      {/* Save button - might be redundant if each add/remove saves, but good for explicit save all action */}
      {/* <button 
        className="btn btn-primary mt-4"
        onClick={() => saveSettings(keywords, locations)}
      >
        Save All Filters
      </button> */}
    </div>
  );
}; 