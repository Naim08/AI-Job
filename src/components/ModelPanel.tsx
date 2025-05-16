import React, { useEffect, useState } from 'react';
import { UserProfileSettings } from '../shared/types';


const MODELS = [
  'llama3:latest',
  'gemma3:4b',
  'llama3.2:latest',
  'nomic-embed-text:latest',
];

type ModelStatus = 'installed' | 'not_installed' | 'installing' | 'removing';

interface ModelRow {
  name: string;
  status: ModelStatus;
  percent: number;
  installed: boolean;
  sizeMB: number;
}

export const ModelPanel: React.FC<{ userSettings?: UserProfileSettings; onSetActive?: (model: string) => void }> = ({ userSettings, onSetActive }) => {
  const [checking, setChecking] = useState(true);
  const [hasCli, setHasCli] = useState(false);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [activeModel, setActiveModel] = useState(userSettings?.active_model);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    let mounted = true;
    window.electronAPI.hasOllama().then(result => {
      if (!mounted) return;
      setHasCli(result);
      setChecking(false);
      if (result) refreshModels();
    });
    return () => { mounted = false; };
    // eslint-disable-next-line
  }, []);

  function refreshModels() {
    window.electronAPI.listOllama().then(list => {
      setModels(MODELS.map(name => {
        const found = list.find(m => m.name === name);
        return {
          name,
          status: found?.installed ? 'installed' : 'not_installed',
          percent: 0,
          installed: !!found?.installed,
          sizeMB: found?.sizeMB || 0,
        };
      }));
    });
  }

  useEffect(() => {
    window.electronAPI.onOllamaProgress((model, percent) => {
      setProgress(prev => ({ ...prev, [model]: percent }));
      setModels(ms => ms.map(m => m.name === model ? { ...m, percent, status: percent < 100 ? 'installing' : 'installed' } : m));
      if (percent >= 100) {
        setBusy(prev => ({ ...prev, [model]: false }));
      }
    });
    // eslint-disable-next-line
  }, []);

  const handleInstall = async (model: string) => {
    setBusy(prev => ({ ...prev, [model]: true }));
    setModels(ms => ms.map(m => m.name === model ? { ...m, status: 'installing', percent: 0 } : m));
    await window.electronAPI.installOllama(model);
    setBusy(prev => ({ ...prev, [model]: false }));
    refreshModels();
  };

  const handleUninstall = async (model: string) => {
    setBusy(prev => ({ ...prev, [model]: true }));
    setModels(ms => ms.map(m => m.name === model ? { ...m, status: 'removing', percent: 0 } : m));
    await window.electronAPI.uninstallOllama(model);
    setBusy(prev => ({ ...prev, [model]: false }));
    refreshModels();
  };

  const handleSetActive = async (model: string) => {
    setActiveModel(model);
    onSetActive?.(model);
  };

  if (checking) {
    return (
      <div className="flex flex-col items-center justify-center h-40">
        <span className="loading loading-spinner" />
        <span className="mt-2">Checking for Ollama…</span>
      </div>
    );
  }

  if (!hasCli) {
    return (
      <div className="flex flex-col items-center justify-center h-40">
        <span className="text-lg mb-2">Ollama CLI not found.</span>
        <button className="btn btn-primary" onClick={() => window.Electron?.shell?.openExternal?.('https://ollama.ai') || window.open('https://ollama.ai', '_blank')}>Download Ollama CLI</button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table w-full">
        <thead>
          <tr>
            <th>Model</th>
            <th>Status</th>
            <th>Actions</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {models.map(model => (
            <tr key={model.name} className={activeModel === model.name ? 'bg-base-200' : ''}>
              <td>{model.name}</td>
              <td>
                {model.status === 'installed' && <span className="text-success">Installed</span>}
                {model.status === 'not_installed' && <span className="text-warning">Not installed</span>}
                {(model.status === 'installing' || model.status === 'removing') && (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin"><i className="lucide lucide-loader" /></span>
                    {model.status === 'installing' ? `Installing… ${model.percent}%` : 'Removing…'}
                  </span>
                )}
                {model.status === 'installing' && (
                  <progress className="progress w-full" value={model.percent} max={100} />
                )}
              </td>
              <td>
                {model.status === 'not_installed' && (
                  <button className="btn btn-success btn-sm" disabled={!!busy[model.name]} onClick={() => handleInstall(model.name)}>Install</button>
                )}
                {model.status === 'installed' && (
                  <button className="btn btn-error btn-sm" disabled={!!busy[model.name]} onClick={() => handleUninstall(model.name)}>Uninstall</button>
                )}
              </td>
              <td>
                <button className="btn btn-ghost btn-sm" disabled={activeModel === model.name} onClick={() => handleSetActive(model.name)}>
                  {activeModel === model.name ? (
                    <i className="lucide lucide-star fill-current" />
                  ) : (
                    <i className="lucide lucide-star" />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
