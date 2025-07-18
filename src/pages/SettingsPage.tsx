import React, { useState } from 'react';
import { 
  Settings, 
  Brain, 
  Shield, 
  Globe, 
  Bell, 
  Calendar,
  Database,
  Key,
  User
} from 'lucide-react';
import { ProfilePanel } from '../components/ProfilePanel';
import { FiltersPanel } from '../components/FiltersPanel';
import { FaqPanel } from '../components/FaqPanel';
import { BlacklistPanel } from '../components/BlacklistPanel';
import { ModelPanel } from '../components/ModelPanel';
import { StealthSettingsPanel } from '../components/StealthSettingsPanel';
import { MLFeedbackPanel } from '../components/MLFeedbackPanel';

type SettingsTab = 'profile' | 'filters' | 'faq' | 'blacklist' | 'model' | 'stealth' | 'ml' | 'jobboards' | 'notifications' | 'schedule';

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; component: React.ReactNode }[] = [
    {
      id: 'profile',
      label: 'Profile',
      icon: <User size={20} />,
      component: <ProfilePanel />
    },
    {
      id: 'filters',
      label: 'Job Filters',
      icon: <Settings size={20} />,
      component: <FiltersPanel />
    },
    {
      id: 'faq',
      label: 'FAQs',
      icon: <Database size={20} />,
      component: <FaqPanel />
    },
    {
      id: 'blacklist',
      label: 'Blacklist',
      icon: <Shield size={20} />,
      component: <BlacklistPanel />
    },
    {
      id: 'model',
      label: 'AI Model',
      icon: <Brain size={20} />,
      component: <ModelPanel />
    },
    {
      id: 'stealth',
      label: 'Stealth',
      icon: <Shield size={20} />,
      component: <StealthSettingsPanel />
    },
    {
      id: 'ml',
      label: 'ML Training',
      icon: <Brain size={20} />,
      component: <MLFeedbackPanel />
    },
    {
      id: 'jobboards',
      label: 'Job Boards',
      icon: <Globe size={20} />,
      component: <JobBoardsSettings />
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell size={20} />,
      component: <NotificationSettings />
    },
    {
      id: 'schedule',
      label: 'Schedule',
      icon: <Calendar size={20} />,
      component: <ScheduleSettings />
    }
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="bg-base-100 shadow-sm border-b border-base-300 overflow-x-auto">
        <div className="flex space-x-1 p-2 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-content'
                  : 'hover:bg-base-200'
              }`}
            >
              {tab.icon}
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {tabs.find(tab => tab.id === activeTab)?.component}
        </div>
      </div>
    </div>
  );
};

// Job Boards Settings Component
const JobBoardsSettings: React.FC = () => {
  const [jobBoards, setJobBoards] = useState([
    { id: 'linkedin', name: 'LinkedIn', enabled: true, apiKey: '' },
    { id: 'indeed', name: 'Indeed', enabled: true, apiKey: '' },
    { id: 'glassdoor', name: 'Glassdoor', enabled: false, apiKey: '' },
    { id: 'monster', name: 'Monster', enabled: false, apiKey: '' }
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Job Board Integrations</h2>
        <p className="text-sm opacity-70">Configure which job boards to search and their API settings.</p>
      </div>

      <div className="space-y-4">
        {jobBoards.map((board) => (
          <div key={board.id} className="card bg-base-100 shadow-lg">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{board.name}</h3>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={board.enabled}
                  onChange={(e) => {
                    setJobBoards(boards => boards.map(b =>
                      b.id === board.id ? { ...b, enabled: e.target.checked } : b
                    ));
                  }}
                />
              </div>
              
              {board.enabled && (
                <div>
                  <label className="label">
                    <span className="label-text">API Key</span>
                  </label>
                  <input
                    type="password"
                    placeholder={`Enter ${board.name} API key`}
                    className="input input-bordered w-full"
                    value={board.apiKey}
                    onChange={(e) => {
                      setJobBoards(boards => boards.map(b =>
                        b.id === board.id ? { ...b, apiKey: e.target.value } : b
                      ));
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Notification Settings Component
const NotificationSettings: React.FC = () => {
  const [settings, setSettings] = useState({
    desktop: true,
    sound: true,
    email: false,
    jobFound: true,
    applicationSubmitted: true,
    statusUpdate: true,
    errors: true,
    weeklyReport: false
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Notification Preferences</h2>
        <p className="text-sm opacity-70">Choose how and when you want to be notified.</p>
      </div>

      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h3 className="text-lg font-semibold mb-4">Notification Channels</h3>
          
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span>Desktop Notifications</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={settings.desktop}
                onChange={(e) => setSettings({ ...settings, desktop: e.target.checked })}
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Sound Alerts</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={settings.sound}
                onChange={(e) => setSettings({ ...settings, sound: e.target.checked })}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

// Schedule Settings Component
const ScheduleSettings: React.FC = () => {
  const [schedule, setSchedule] = useState({
    enabled: true,
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    startTime: '09:00',
    endTime: '17:00',
    scanInterval: 30,
    maxApplicationsPerDay: 50,
    pauseOnWeekends: true
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Schedule Configuration</h2>
        <p className="text-sm opacity-70">Set when the job scanner should run automatically.</p>
      </div>

      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">Automated Scanning</h3>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-lg"
              checked={schedule.enabled}
              onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
            />
          </div>

          {schedule.enabled && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">
                    <span className="label-text">Start Time</span>
                  </label>
                  <input
                    type="time"
                    className="input input-bordered w-full"
                    value={schedule.startTime}
                    onChange={(e) => setSchedule({ ...schedule, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">
                    <span className="label-text">End Time</span>
                  </label>
                  <input
                    type="time"
                    className="input input-bordered w-full"
                    value={schedule.endTime}
                    onChange={(e) => setSchedule({ ...schedule, endTime: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage; 