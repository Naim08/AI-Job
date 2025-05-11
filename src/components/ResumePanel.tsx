/// <reference path="../types/electron.d.ts" />

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../shared/types'; // Ensure this path is correct
import path from 'path-browserify';

// Ensure src/types/electron.d.ts is created and included in tsconfig
// import '../types/electron'; // Sometimes explicit import is needed if not globally picked up

interface ResumePanelProps {
  userId: string;
}

// Placeholder for a proper toast notification system
const showToast = (message: string, type: 'success' | 'error' = 'success') => { // Changed default to 'success'
  console.log(`Toast (${type}): ${message}`);
  alert(message); // Replace with actual toast call
};

export const ResumePanel: React.FC<ResumePanelProps> = ({ userId }) => {
  const [currentResumePath, setCurrentResumePath] = useState<string | null | undefined>(undefined);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!userId) {
        setCurrentResumePath(null);
        return;
      }
      try {
        // Fetch the entire result object first
        const result = await supabase
          .from('profiles')
          .select('resume_path')
          .eq('user_id', userId)
          .single();

        // Explicitly check for significant errors
        if (result.error && result.error.message !== 'JSON object requested, multiple (or no) rows returned') {
          throw result.error;
        }

        // At this point, result.error is either null, or the "no rows" error.
        // result.data will be the profile data or null.
        // We can now safely access result.data and cast if necessary for resume_path.
        const profileData = result.data as ({ resume_path?: string | null } | null);
        setCurrentResumePath(profileData?.resume_path || null);

      } catch (error: any) {
        console.error('Error fetching resume path:', error.message);
        showToast('Failed to load resume information: ' + error.message, 'error');
        setCurrentResumePath(null);
      }
    };
    fetchProfile();
  }, [userId]);

  const handleUploadResume = async () => {
    if (!window.electronAPI) {
      showToast('Electron API not available. Are you running in Electron?', 'error');
      return;
    }
    setIsUploading(true);
    try {
      const fileChoiceResult = await window.electronAPI.chooseFile();
      if (fileChoiceResult.error) {
        throw new Error(fileChoiceResult.error);
      }

      if (fileChoiceResult.path) {
        const newPath = fileChoiceResult.path;
        console.log('File chosen:', newPath);

        const { error: dbError } = await supabase
          .from('profiles')
          .update({ resume_path: newPath, updated_at: new Date().toISOString() })
          .eq('user_id', userId);

        if (dbError) {
          console.error('Error updating profile with resume path:', dbError);
          showToast('Failed to save resume path to profile: ' + dbError.message, 'error');
        } else {
          setCurrentResumePath(newPath);
          showToast('Résumé updated successfully!', 'success');

          setIsSyncing(true);
          try {
            const syncResult = await window.electronAPI.triggerSyncEmbeddings(userId);
            if (syncResult.error) {
              throw new Error(syncResult.error);
            }
            showToast('Résumé sent for processing. This may take a moment.', 'success');
          } catch (syncError: any) {
            console.error('Error triggering embeddings sync:', syncError.message);
            showToast('Failed to start resume processing: ' + syncError.message, 'error');
          }
          setIsSyncing(false);
        }
      } else {
        console.log('No file selected or path was null.');
      }
    } catch (error: any) {
      console.error('Error during resume upload process:', error.message);
      if (error.message.includes('copy')) {
        showToast('Failed to copy file: ' + error.message, 'error');
      } else {
        showToast('Error uploading resume: ' + error.message, 'error');
      }
    }
    setIsUploading(false);
  };

  const handleViewResume = async () => {
    if (currentResumePath) {
      if (!window.electronAPI) {
        showToast('Electron API not available.', 'error');
        return;
      }
      try {
        const openResult = await window.electronAPI.openFile(currentResumePath);
        if (openResult.error) {
          throw new Error(openResult.error);
        }
      } catch (error: any) {
        console.error('Error opening resume:', error.message);
        showToast('Failed to open resume: ' + error.message, 'error');
      }
    } else {
      showToast('No resume path available to view.', 'error');
    }
  };

  const getFileName = (filePath: string | null | undefined) => {
    if (!filePath) return 'No résumé uploaded.';
    try {
      return path.basename(filePath);
    } catch (e) {
      // This catch might not be necessary if filePath is guaranteed to be a string here
      console.error('Error getting basename:', e);
      return 'Invalid file path';
    }
  };

  if (currentResumePath === undefined) {
    return <div className="p-4">Loading resume information...</div>;
  }

  return (
    <div className="p-4 border rounded-md shadow-sm bg-white">
      <h3 className="text-lg font-semibold mb-3 text-gray-700">Résumé Management</h3>
      <div className="mb-4">
        <p className="text-sm text-gray-600">Current résumé: {
          currentResumePath 
            ? <span className="font-medium text-gray-800 break-all">{getFileName(currentResumePath)}</span> 
            : <span className="italic text-gray-500">No résumé uploaded.</span>
        }</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleUploadResume}
          disabled={isUploading || isSyncing}
          className="btn btn-primary"
        >
          {isUploading ? 'Uploading...' : (isSyncing ? 'Processing...' : 'Upload New Résumé')}
        </button>
        {currentResumePath && (
          <button
            onClick={handleViewResume}
            className="btn btn-secondary"
            disabled={isUploading || isSyncing}
          >
            View Résumé
          </button>
        )}
      </div>
      {isSyncing && <p className='text-sm text-blue-600 mt-2'>Processing new résumé, this may take a few moments...</p>}
      <p className="text-xs text-gray-500 mt-4">
        Upload your résumé in PDF format. This will be used to help tailor job matching and application suggestions.
      </p>
    </div>
  );
};
