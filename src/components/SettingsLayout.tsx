import React, { useState } from 'react';
import { FiltersPanel } from './FiltersPanel';
import { FaqPanel } from './FaqPanel';
import { BlacklistPanel } from './BlacklistPanel';
import { debug } from '../../electron/utils/debug'; // Assuming debug is here

type TabId = 'filters' | 'faq' | 'blacklist';

export const SettingsLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('filters');

  debug('settings', `Active tab set to: ${activeTab}`);

  const renderPanel = () => {
    switch (activeTab) {
      case 'filters':
        return <FiltersPanel />;
      case 'faq':
        return <FaqPanel />;
      case 'blacklist':
        return <BlacklistPanel />;
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
      </div>
      <div className="flex-grow p-4 bg-base-100 rounded-b-box shadow">
        {renderPanel()}
      </div>
    </div>
  );
}; 