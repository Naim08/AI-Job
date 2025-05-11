import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../shared/types'; // Adjust path if needed

// Placeholder for a proper toast notification system
const showToast = (message: string, type: 'success' | 'error' = 'success') => {
  console.log(`Toast (${type}): ${message}`);
  alert(message); // Replace with actual toast call if you have a system like react-toastify
};

interface ProfilePanelProps {
  userId: string;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({ userId }) => {
  const [email, setEmail] = useState<string>('');
  const [name, setName] = useState<string>(''); // For full_name
  const [initialEmail, setInitialEmail] = useState<string>('');
  const [initialName, setInitialName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const fetchProfileDetails = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const result = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('user_id', userId)
        .single();

      if (result.error && result.error.message !== 'JSON object requested, multiple (or no) rows returned') {
        throw result.error;
      }

      const profileRow = result.data as any;

      if (profileRow) {
        const currentEmail = profileRow.email || '';
        const currentName = profileRow.full_name || '';
        setEmail(currentEmail);
        setName(currentName);
        setInitialEmail(currentEmail);
        setInitialName(currentName);
      } else {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const authEmail = authUser?.email || '';
        const authName = (authUser?.user_metadata as {full_name?: string})?.full_name || '';
        setEmail(authEmail);
        setName(authName);
        setInitialEmail(authEmail);
        setInitialName(authName);
      }
    } catch (error: any) {
      console.error('Error fetching profile details:', error.message);
      showToast('Failed to load profile details: ' + error.message, 'error');
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchProfileDetails();
  }, [fetchProfileDetails]);

  const handleSaveChanges = async () => {
    if (!userId) {
      showToast('User ID is missing, cannot save profile.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      // Check if profile exists to decide on upsert or insert if we were to create one.
      // For simplicity, we assume a profile row initiated by auth exists or an update is fine.
      // An upsert is generally safer if a profile might not exist yet.
      const { error } = await supabase
        .from('profiles')
        .update({
          email: email.trim(),
          full_name: name.trim(), // Assuming your DB column is full_name
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      // If you wanted to ensure a profile row is created if it doesn't exist:
      // const { error } = await supabase
      //   .from('profiles')
      //   .upsert({
      //     user_id: userId,
      //     email: email.trim(),
      //     full_name: name.trim(),
      //     updated_at: new Date().toISOString(),
      //     // id: would need to be handled if it's a UUID you generate client-side for new rows, or let DB generate
      //   }, { onConflict: 'user_id' });

      if (error) {
        throw error;
      }
      showToast('Profile updated successfully!', 'success');
      setInitialEmail(email.trim());
      setInitialName(name.trim());
      // Optionally, you might want to inform SettingsLayout to refetch the user object
      // if other parts of the app depend on the top-level user state being fresh.
    } catch (error: any) {
      console.error('Error saving profile details:', error.message);
      showToast('Failed to save profile: ' + error.message, 'error');
    }
    setIsSaving(false);
  };

  const hasChanges = email.trim() !== initialEmail.trim() || name.trim() !== initialName.trim();

  if (isLoading) {
    return <div className="p-4">Loading profile information...</div>;
  }

  return (
    <div className="p-4 border rounded-md shadow-sm bg-white max-w-md">
      <h3 className="text-lg font-semibold mb-4 text-gray-700">Your Profile</h3>
      
      <div className="mb-4">
        <label htmlFor="profileName" className="block text-sm font-medium text-gray-700 mb-1">
          Full Name
        </label>
        <input
          type="text"
          id="profileName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input input-bordered w-full"
          placeholder="Enter your full name"
        />
      </div>

      <div className="mb-6">
        <label htmlFor="profileEmail" className="block text-sm font-medium text-gray-700 mb-1">
          Email Address
        </label>
        <input
          type="email"
          id="profileEmail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input input-bordered w-full"
          placeholder="Enter your email address"
        />
        <p className="text-xs text-gray-500 mt-1">
          This email is used for application-related communications and profile identification.
        </p>
      </div>

      <button
        onClick={handleSaveChanges}
        disabled={isSaving || !hasChanges || !userId}
        className="btn btn-primary w-full"
      >
        {isSaving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}; 