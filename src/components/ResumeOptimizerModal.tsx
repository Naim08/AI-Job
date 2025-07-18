import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { FileText, Sparkles, Copy, Download } from 'lucide-react';

interface ResumeOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  company: string;
}

export const ResumeOptimizerModal: React.FC<ResumeOptimizerModalProps> = ({
  isOpen,
  onClose,
  jobId,
  jobTitle,
  company
}) => {
  const [loading, setLoading] = useState(false);
  const [originalResume, setOriginalResume] = useState('');
  const [optimizedResume, setOptimizedResume] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [relevanceScore, setRelevanceScore] = useState(0);
  const [viewMode, setViewMode] = useState<'split' | 'original' | 'optimized'>('split');

  useEffect(() => {
    if (isOpen && jobId) {
      loadResumeData();
    }
  }, [isOpen, jobId]);

  const loadResumeData = async () => {
    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return;

      // Load original resume
      const { data: profile } = await supabase
        .from('profiles')
        .select('resume_text')
        .eq('user_id', user.user.id)
        .single();

      if (profile?.resume_text) {
        setOriginalResume(profile.resume_text);
      }

      // Simulate optimization
      setOptimizedResume(`OPTIMIZED RESUME FOR ${jobTitle} at ${company}\n\n` + profile?.resume_text);
      setKeywords(['React', 'TypeScript', 'Node.js', 'AWS']);
      setRelevanceScore(0.85);
    } catch (error) {
      console.error('Error loading resume data:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadResume = () => {
    const blob = new Blob([optimizedResume], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resume_${company}_${jobTitle.replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Sparkles className="text-primary" size={24} />
              Resume Optimizer
            </h3>
            <p className="text-sm opacity-70">
              Optimized for: {jobTitle} at {company}
            </p>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>

        {/* Stats Bar */}
        <div className="bg-base-200 p-4 rounded-lg mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-sm opacity-70">Relevance Score</span>
                <div className="text-2xl font-bold text-success">
                  {Math.round(relevanceScore * 100)}%
                </div>
              </div>
              <div className="divider divider-horizontal"></div>
              <div>
                <span className="text-sm opacity-70">Keywords Matched</span>
                <div className="text-2xl font-bold text-primary">
                  {keywords.length}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-primary" onClick={() => navigator.clipboard.writeText(optimizedResume)}>
                <Copy size={16} />
                Copy
              </button>
              <button className="btn btn-sm btn-secondary" onClick={downloadResume}>
                <Download size={16} />
                Download
              </button>
            </div>
          </div>
        </div>

        {/* Keywords */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold mb-2">Matched Keywords</h4>
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword, i) => (
              <span key={i} className="badge badge-primary">{keyword}</span>
            ))}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="tabs tabs-boxed mb-4">
          <a 
            className={`tab ${viewMode === 'split' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            Split View
          </a>
          <a 
            className={`tab ${viewMode === 'original' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('original')}
          >
            Original
          </a>
          <a 
            className={`tab ${viewMode === 'optimized' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('optimized')}
          >
            Optimized
          </a>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <span className="loading loading-spinner loading-lg"></span>
            </div>
          ) : (
            <div className="h-full flex gap-4">
              {/* Original Resume */}
              {(viewMode === 'split' || viewMode === 'original') && (
                <div className={`${viewMode === 'split' ? 'flex-1' : 'w-full'} flex flex-col`}>
                  <h4 className="font-semibold mb-2">Original Resume</h4>
                  <div className="flex-1 bg-base-200 p-4 rounded-lg overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm">{originalResume}</pre>
                  </div>
                </div>
              )}

              {/* Optimized Resume */}
              {(viewMode === 'split' || viewMode === 'optimized') && (
                <div className={`${viewMode === 'split' ? 'flex-1' : 'w-full'} flex flex-col`}>
                  <h4 className="font-semibold mb-2 text-primary">Optimized Resume</h4>
                  <div className="flex-1 bg-primary/10 p-4 rounded-lg overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm">{optimizedResume}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">
            Use This Resume
          </button>
        </div>
      </div>
    </div>
  );
};