import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ReviewModal } from '../components/ReviewModal';
import { useModal } from '../lib/useModal';
import type { ApplicationStatus, DecisionNode } from '../shared/types';
import { Search, Filter, ChevronDown, TrendingUp, Building2, MapPin, DollarSign } from 'lucide-react';
import { CoverLetterGenerator } from '../components/CoverLetterGenerator';
import { ResumeOptimizerModal } from '../components/ResumeOptimizerModal';

interface ApplicationRow {
  id: string;
  job_title: string;
  company_name: string;
  status: ApplicationStatus;
  ml_score?: number;
  filter_score?: number;
  combined_score?: number;
  created_at: string;
  job_url?: string;
  source_platform?: string;
  location?: string;
  salary_range?: string;
}

const EnhancedHistoryPage: React.FC = () => {
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [filteredApps, setFilteredApps] = useState<ApplicationRow[]>([]);
  const [selectedApp, setSelectedApp] = useState<ApplicationRow | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'score'>('date');
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const { open, openModal, closeModal } = useModal();
  const [showCoverLetterGen, setShowCoverLetterGen] = useState(false);
  const [showResumeOptimizer, setShowResumeOptimizer] = useState(false);
  const [selectedJobForGen, setSelectedJobForGen] = useState<ApplicationRow | null>(null);

  useEffect(() => {
    fetchApplications();
  }, []);

  useEffect(() => {
    filterAndSortApps();
  }, [apps, searchTerm, statusFilter, sortBy]);

  const fetchApplications = async () => {
    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching job applications:", error);
    } else {
      setApps(data || []);
    }
  };

  const filterAndSortApps = () => {
    let filtered = [...apps];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(app =>
        app.job_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.company_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(app => app.status === statusFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'score') {
        return (b.combined_score || 0) - (a.combined_score || 0);
      } else {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    setFilteredApps(filtered);
  };

  const getScoreColor = (score?: number) => {
    if (!score) return 'text-gray-400';
    if (score >= 0.8) return 'text-success';
    if (score >= 0.6) return 'text-warning';
    return 'text-error';
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    const statusConfig = {
      pending_review: { class: 'badge-warning', label: 'Review' },
      applied: { class: 'badge-info', label: 'Applied' },
      skipped: { class: 'badge-ghost', label: 'Skipped' },
      failed: { class: 'badge-error', label: 'Failed' },
      fresh: { class: 'badge-success', label: 'New' }
    };

    const config = statusConfig[status] || { class: 'badge-ghost', label: status };
    return <span className={`badge ${config.class}`}>{config.label}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="bg-base-100 p-4 rounded-lg shadow">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search jobs..."
                className="input input-bordered w-full pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <select
              className="select select-bordered"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | 'all')}
            >
              <option value="all">All Status</option>
              <option value="fresh">New</option>
              <option value="pending_review">Review</option>
              <option value="applied">Applied</option>
              <option value="skipped">Skipped</option>
              <option value="failed">Failed</option>
            </select>

            <select
              className="select select-bordered"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'score')}
            >
              <option value="date">Sort by Date</option>
              <option value="score">Sort by Score</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="stat bg-base-100 rounded-lg shadow">
          <div className="stat-title">Total</div>
          <div className="stat-value text-primary">{apps.length}</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow">
          <div className="stat-title">Applied</div>
          <div className="stat-value text-info">{apps.filter(a => a.status === 'applied').length}</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow">
          <div className="stat-title">Pending</div>
          <div className="stat-value text-warning">{apps.filter(a => a.status === 'pending_review').length}</div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow">
          <div className="stat-title">Success Rate</div>
          <div className="stat-value text-success">
            {apps.length > 0 ? Math.round((apps.filter(a => a.status === 'applied').length / apps.length) * 100) : 0}%
          </div>
        </div>
        <div className="stat bg-base-100 rounded-lg shadow">
          <div className="stat-title">Avg Score</div>
          <div className="stat-value">
            {apps.length > 0 
              ? (apps.reduce((acc, a) => acc + (a.combined_score || 0), 0) / apps.length * 100).toFixed(0)
              : 0}%
          </div>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-base-100 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Job Details</th>
                <th>ML Score</th>
                <th>Platform</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map(app => (
                <tr key={app.id} className="hover">
                  <td>
                    <div className="space-y-1">
                      <div className="font-bold">{app.job_title}</div>
                      <div className="text-sm opacity-70 flex items-center gap-2">
                        <Building2 size={14} />
                        {app.company_name}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className={`text-lg font-bold ${getScoreColor(app.combined_score)}`}>
                      {app.combined_score ? `${Math.round(app.combined_score * 100)}%` : '-'}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-ghost badge-sm">
                      {app.source_platform || 'LinkedIn'}
                    </span>
                  </td>
                  <td>{getStatusBadge(app.status)}</td>
                  <td>
                    <div className="text-sm">
                      {new Date(app.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <div className="dropdown dropdown-end">
                        <label tabIndex={0} className="btn btn-ghost btn-xs">
                          <ChevronDown size={16} />
                        </label>
                        <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
                          <li>
                            <a onClick={() => {
                              setSelectedJobForGen(app);
                              setShowCoverLetterGen(true);
                            }}>
                              Generate Cover Letter
                            </a>
                          </li>
                          <li>
                            <a onClick={() => {
                              setSelectedJobForGen(app);
                              setShowResumeOptimizer(true);
                            }}>
                              Optimize Resume
                            </a>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cover Letter Generator Modal */}
      {showCoverLetterGen && selectedJobForGen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-6xl">
            <button 
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" 
              onClick={() => setShowCoverLetterGen(false)}
            >
              ✕
            </button>
            <CoverLetterGenerator
              jobId={selectedJobForGen.id}
              jobTitle={selectedJobForGen.job_title}
              company={selectedJobForGen.company_name}
            />
          </div>
        </div>
      )}

      {/* Resume Optimizer Modal */}
      {showResumeOptimizer && selectedJobForGen && (
        <ResumeOptimizerModal
          isOpen={showResumeOptimizer}
          onClose={() => setShowResumeOptimizer(false)}
          jobId={selectedJobForGen.id}
          jobTitle={selectedJobForGen.job_title}
          company={selectedJobForGen.company_name}
        />
      )}
    </div>
  );
};

export default EnhancedHistoryPage;