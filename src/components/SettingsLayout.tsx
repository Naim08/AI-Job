import React, { useState, useEffect } from 'react';
import { FiltersPanel } from './FiltersPanel';
import { FaqPanel } from './FaqPanel';
import { BlacklistPanel } from './BlacklistPanel';
import { ResumePanel } from './ResumePanel';
import { ProfilePanel } from './ProfilePanel';
import { debug } from '../../electron/utils/debug';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../shared/types';

import { ModelPanel } from './ModelPanel';
type TabId = 'filters' | 'faq' | 'blacklist' | 'resume' | 'profile' | 'models';

export const SettingsLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserProfile['settings']>(null);


  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        debug('settings', 'Error fetching auth user:', authError.message);
        setUser(null);
        setUserId(null);
        return;
      }
      if (authUser) {
        setUserId(authUser.id);
        
        try {
          const result = await supabase
            .from('profiles')
            .select('user_id, full_name, email, resume_path, settings, created_at, updated_at, avatar_url')
            .eq('user_id', authUser.id)
            .single();
          
          if (result.error && result.error.message !== 'JSON object requested, multiple (or no) rows returned') {
            throw result.error;
          }

          const dbProfileData = result.data as any;

          if (dbProfileData) {
              const userProfile: UserProfile = {
                  id: dbProfileData.user_id || authUser.id,
                  name: dbProfileData.full_name || (authUser.user_metadata as {full_name?: string})?.full_name || authUser.email || 'User',
                  email: dbProfileData.email || authUser.email || 'N/A',
                  resume_path: dbProfileData.resume_path,
                  settings: dbProfileData.settings,
                  created_at: dbProfileData.created_at,
                  updated_at: dbProfileData.updated_at,
                  avatar_url: dbProfileData.avatar_url,
              };
              setUser(userProfile);
              setUserSettings(dbProfileData.settings);
          } else {
              debug('settings', 'No profile data found for user, using auth data minimally.');
              const fallbackName = (authUser.user_metadata as {full_name?: string})?.full_name || authUser.email || 'User';
              setUser({
                  id: authUser.id,
                  email: authUser.email || 'N/A',
                  name: fallbackName,
              });
          }
        } catch (profileError: any) {
            debug('settings', 'Failed to fetch or process user profile', profileError.message);
            const fallbackName = (authUser.user_metadata as {full_name?: string})?.full_name || authUser.email || 'User';
            setUser({
                id: authUser.id,
                email: authUser.email || 'N/A',
                name: fallbackName,
            });
        }
      } else {
        setUser(null);
        setUserId(null);
      }
    };
    fetchUser();
  }, []);

  const renderPanel = () => {
    if (!userId && (activeTab === 'resume' || activeTab === 'profile')) {
        return <p>Loading user information or user not found...</p>;
    }
    if (!user && activeTab !== 'resume' && activeTab !== 'profile') {
        return <p>Loading user information...</p>;
    }

    switch (activeTab) {
      case 'filters':
        return user ? <FiltersPanel /> : <p>Loading filters...</p>;
      case 'faq':
        return user ? <FaqPanel /> : <p>Loading FAQ...</p>;
      case 'blacklist':
        return user ? <BlacklistPanel /> : <p>Loading blacklist...</p>;
      case 'resume':
        return userId ? <ResumePanel userId={userId} /> : <p>User ID not available for resume.</p>;
      case 'profile':
        return userId ? <ProfilePanel userId={userId} /> : <p>User ID not available for profile.</p>;
      case 'models':
        return (
          <ModelPanel
            userSettings={userSettings || undefined}
            onSetActive={async (model) => {
              if (!userId) return;
              // Update Supabase and local state
              const { error } = await supabase
                .from('profiles')
                .update({ settings: { ...userSettings, active_model: model } })
                .eq('user_id', userId);
              if (!error) setUserSettings(s => ({ ...s, active_model: model }));
            }}
          />
        );
      default:
        return null;
    }
  };

  const handleTabClick = (tabId: TabId) => {
    setActiveTab(tabId);
  };

  return (
    <div className="flex flex-col h-full">
      <div role="tablist" className="tabs tabs-lifted">
        <a
          role="tab"
          className={`tab ${activeTab === 'profile' ? 'tab-active' : ''}`}
          onClick={() => handleTabClick('profile')}
        >
          Profile
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === 'filters' ? 'tab-active' : ''}`}
          onClick={() => handleTabClick('filters')}
        >
          Filters
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === 'faq' ? 'tab-active' : ''}`}
          onClick={() => handleTabClick('faq')}
        >
          FAQ
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === 'blacklist' ? 'tab-active' : ''}`}
          onClick={() => handleTabClick('blacklist')}
        >
          Company Blacklist
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === 'resume' ? 'tab-active' : ''}`}
          onClick={() => handleTabClick('resume')}
        >
          Résumé
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === 'models' ? 'tab-active' : ''}`}
          onClick={() => handleTabClick('models')}
        >
          AI Models
        </a>
      </div>
      <div className="flex-grow p-4 bg-base-100 rounded-b-box shadow">
        {renderPanel()}
      </div>
    </div>
  );
}; 