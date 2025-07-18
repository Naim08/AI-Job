import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ThumbsUp, ThumbsDown, Target, Brain } from 'lucide-react';

interface JobFeedback {
  jobId: string;
  jobTitle: string;
  company: string;
  mlScore: number;
  userFeedback?: 'good' | 'bad' | null;
}

export const MLFeedbackPanel: React.FC = () => {
  const [feedbackItems, setFeedbackItems] = useState<JobFeedback[]>([]);
  const [stats, setStats] = useState({
    totalFeedback: 0,
    accuracy: 0,
    improving: true
  });

  useEffect(() => {
    fetchFeedbackItems();
    fetchMLStats();
  }, []);

  const fetchFeedbackItems = async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return;

    const { data } = await supabase
      .from('job_applications')
      .select('id, job_title, company_name, ml_score, user_feedback')
      .eq('user_id', user.user.id)
      .not('ml_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      setFeedbackItems(data.map(item => ({
        jobId: item.id,
        jobTitle: item.job_title,
        company: item.company_name,
        mlScore: item.ml_score || 0,
        userFeedback: item.user_feedback
      })));
    }
  };

  const fetchMLStats = async () => {
    // Mock data for now
    setStats({
      totalFeedback: 15,
      accuracy: 78,
      improving: true
    });
  };

  const provideFeedback = async (jobId: string, feedback: 'good' | 'bad') => {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return;

    await supabase
      .from('job_applications')
      .update({ user_feedback: feedback })
      .eq('id', jobId);

    setFeedbackItems(items => items.map(item =>
      item.jobId === jobId ? { ...item, userFeedback: feedback } : item
    ));

    fetchMLStats();
  };

  return (
    <div className="space-y-6">
      {/* ML Performance Stats */}
      <div className="bg-base-100 p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Brain className="text-primary" size={24} />
          ML Performance
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">
              {stats.accuracy}%
            </div>
            <div className="text-sm opacity-70">Accuracy</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-success">
              {stats.totalFeedback}
            </div>
            <div className="text-sm opacity-70">Feedback Given</div>
          </div>
          <div className="text-center">
            <div className={`text-3xl font-bold ${stats.improving ? 'text-success' : 'text-warning'}`}>
              {stats.improving ? '↑' : '→'}
            </div>
            <div className="text-sm opacity-70">Trend</div>
          </div>
        </div>
      </div>

      {/* Feedback Items */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold">Help Improve Job Matching</h3>
        <p className="text-sm opacity-70">
          Your feedback helps the AI learn your preferences and improve future job recommendations.
        </p>
        
        {feedbackItems.map((item) => (
          <div key={item.jobId} className="bg-base-100 p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-semibold">{item.jobTitle}</h4>
                <p className="text-sm opacity-70">{item.company}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Target size={16} className="text-primary" />
                  <span className="text-sm">
                    ML Score: <span className="font-bold">{Math.round(item.mlScore * 100)}%</span>
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                {item.userFeedback ? (
                  <div className={`badge ${item.userFeedback === 'good' ? 'badge-success' : 'badge-error'}`}>
                    {item.userFeedback === 'good' ? 'Good Match' : 'Poor Match'}
                  </div>
                ) : (
                  <>
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => provideFeedback(item.jobId, 'good')}
                      title="Good match"
                    >
                      <ThumbsUp size={16} />
                    </button>
                    <button
                      className="btn btn-sm btn-error"
                      onClick={() => provideFeedback(item.jobId, 'bad')}
                      title="Poor match"
                    >
                      <ThumbsDown size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};