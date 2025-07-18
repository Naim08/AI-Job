import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  TrendingUp, 
  Users, 
  Target, 
  BarChart3,
  ArrowRight,
  Briefcase,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface DashboardStats {
  totalApplications: number;
  appliedCount: number;
  pendingReview: number;
  successRate: number;
  avgMLScore: number;
  weeklyApplications: Array<{ date: string; count: number }>;
  platformDistribution: Array<{ platform: string; count: number }>;
  topCompanies: Array<{ company: string; score: number }>;
}

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalApplications: 0,
    appliedCount: 0,
    pendingReview: 0,
    successRate: 0,
    avgMLScore: 0,
    weeklyApplications: [],
    platformDistribution: [],
    topCompanies: []
  });
  const [loading, setLoading] = useState(true);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data: applications } = await supabase
        .from('job_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (applications) {
        const total = applications.length;
        const applied = applications.filter(a => a.status === 'applied').length;
        const pending = applications.filter(a => a.status === 'pending_review').length;
        const avgScore = applications.reduce((acc, a) => acc + (a.combined_score || 0), 0) / total;

        // Weekly applications (last 7 days)
        const weeklyData = [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          const count = applications.filter(a => 
            a.created_at.startsWith(dateStr)
          ).length;
          weeklyData.push({
            date: date.toLocaleDateString('en', { weekday: 'short' }),
            count
          });
        }

        setStats({
          totalApplications: total,
          appliedCount: applied,
          pendingReview: pending,
          successRate: total > 0 ? (applied / total) * 100 : 0,
          avgMLScore: avgScore,
          weeklyApplications: weeklyData,
          platformDistribution: [],
          topCompanies: []
        });

        setRecentJobs(
          applications
            .filter(a => a.combined_score >= 0.7)
            .slice(0, 5)
        );
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat bg-base-100 rounded-lg shadow">
          <div className="stat-figure text-primary">
            <Briefcase size={32} />
          </div>
          <div className="stat-title">Total Applications</div>
          <div className="stat-value text-primary">{stats.totalApplications}</div>
          <div className="stat-desc">↗︎ 12% from last week</div>
        </div>

        <div className="stat bg-base-100 rounded-lg shadow">
          <div className="stat-figure text-success">
            <CheckCircle size={32} />
          </div>
          <div className="stat-title">Applied</div>
          <div className="stat-value text-success">{stats.appliedCount}</div>
          <div className="stat-desc">{stats.successRate.toFixed(1)}% success rate</div>
        </div>

        <div className="stat bg-base-100 rounded-lg shadow">
          <div className="stat-figure text-warning">
            <AlertCircle size={32} />
          </div>
          <div className="stat-title">Pending Review</div>
          <div className="stat-value text-warning">{stats.pendingReview}</div>
          <div className="stat-desc">Needs your attention</div>
        </div>

        <div className="stat bg-base-100 rounded-lg shadow">
          <div className="stat-figure text-secondary">
            <Target size={32} />
          </div>
          <div className="stat-title">Avg Match Score</div>
          <div className="stat-value text-secondary">
            {(stats.avgMLScore * 100).toFixed(0)}%
          </div>
          <div className="stat-desc">ML confidence</div>
        </div>
      </div>

      {/* Recent High-Scoring Jobs */}
      <div className="bg-base-100 p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp size={20} />
            High Match Jobs
          </span>
          <button className="btn btn-ghost btn-sm">View All</button>
        </h3>
        <div className="space-y-3">
          {recentJobs.map((job, i) => (
            <div key={job.id} className="flex items-center justify-between p-3 bg-base-200 rounded-lg">
              <div className="flex-1">
                <p className="font-medium">{job.job_title}</p>
                <p className="text-sm opacity-70">{job.company_name}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-lg font-bold text-success">
                    {Math.round(job.combined_score * 100)}%
                  </p>
                  <p className="text-xs opacity-70">match</p>
                </div>
                <button className="btn btn-ghost btn-sm">
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-base-100 p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="btn btn-primary">
            <Target size={20} />
            Start Job Scan
          </button>
          <button className="btn btn-secondary">
            <Briefcase size={20} />
            Review Pending
          </button>
          <button className="btn btn-accent">
            <TrendingUp size={20} />
            Optimize Resume
          </button>
          <button className="btn btn-ghost">
            <BarChart3 size={20} />
            View Analytics
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;