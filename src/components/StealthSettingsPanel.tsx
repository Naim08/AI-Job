import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  Shield, 
  Mouse, 
  Keyboard, 
  Clock, 
  Fingerprint,
  Eye,
  Shuffle,
  Save,
  AlertCircle
} from 'lucide-react';

interface StealthSettings {
  enabled: boolean;
  humanBehavior: {
    mouseMovements: boolean;
    randomDelays: boolean;
    naturalScrolling: boolean;
    idleMovements: boolean;
  };
  typingBehavior: {
    enabled: boolean;
    minWPM: number;
    maxWPM: number;
    typoFrequency: number;
    pauseBetweenFields: boolean;
  };
  browserFingerprint: {
    rotateUserAgents: boolean;
    hideWebdriver: boolean;
    mockPlugins: boolean;
    randomizeCanvas: boolean;
    spoofTimezone: boolean;
  };
  timing: {
    minActionDelay: number;
    maxActionDelay: number;
    pageLoadDelay: number;
    formSubmitDelay: number;
  };
}

export const StealthSettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<StealthSettings>({
    enabled: true,
    humanBehavior: {
      mouseMovements: true,
      randomDelays: true,
      naturalScrolling: true,
      idleMovements: true
    },
    typingBehavior: {
      enabled: true,
      minWPM: 40,
      maxWPM: 80,
      typoFrequency: 0.02,
      pauseBetweenFields: true
    },
    browserFingerprint: {
      rotateUserAgents: true,
      hideWebdriver: true,
      mockPlugins: true,
      randomizeCanvas: false,
      spoofTimezone: false
    },
    timing: {
      minActionDelay: 500,
      maxActionDelay: 3000,
      pageLoadDelay: 2000,
      formSubmitDelay: 1500
    }
  });

  const [saving, setSaving] = useState(false);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return;

      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.user.id,
          stealth_settings: settings,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error saving stealth settings:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Toggle */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="text-primary" size={24} />
              <div>
                <h3 className="text-lg font-bold">Stealth Mode</h3>
                <p className="text-sm opacity-70">Enable anti-detection measures</p>
              </div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-lg"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
          </div>
        </div>
      </div>

      {/* Human Behavior */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Mouse className="text-primary" size={20} />
            Human Behavior Simulation
          </h3>
          
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span>Natural Mouse Movements</span>
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={settings.humanBehavior.mouseMovements}
                onChange={(e) => setSettings({
                  ...settings,
                  humanBehavior: { ...settings.humanBehavior, mouseMovements: e.target.checked }
                })}
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Random Action Delays</span>
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={settings.humanBehavior.randomDelays}
                onChange={(e) => setSettings({
                  ...settings,
                  humanBehavior: { ...settings.humanBehavior, randomDelays: e.target.checked }
                })}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Typing Behavior */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Keyboard className="text-primary" size={20} />
            Typing Behavior
          </h3>

          <div className="space-y-4">
            <div>
              <label className="label">
                <span className="label-text">Typing Speed Range (WPM)</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  className="input input-bordered w-24"
                  value={settings.typingBehavior.minWPM}
                  onChange={(e) => setSettings({
                    ...settings,
                    typingBehavior: { ...settings.typingBehavior, minWPM: parseInt(e.target.value) }
                  })}
                />
                <span>to</span>
                <input
                  type="number"
                  className="input input-bordered w-24"
                  value={settings.typingBehavior.maxWPM}
                  onChange={(e) => setSettings({
                    ...settings,
                    typingBehavior: { ...settings.typingBehavior, maxWPM: parseInt(e.target.value) }
                  })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          className={`btn btn-primary flex-1 ${saving ? 'loading' : ''}`}
          onClick={saveSettings}
          disabled={saving}
        >
          {!saving && <Save size={20} />}
          Save Settings
        </button>
      </div>
    </div>
  );
};