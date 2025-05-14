import React from 'react';

interface CaptchaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: () => void;
}

export const CaptchaModal: React.FC<CaptchaModalProps> = ({ isOpen, onClose, onResume }) => {
  if (!isOpen) return null;

  const handleOpenLinkedIn = () => {
    window.electronAPI.openCaptcha();
  };

  const handleResume = () => {
    window.electronAPI.resumeAgent()
      .then(() => {
        console.log('Agent resumed successfully');
        onResume();
      })
      .catch((error: Error) => {
        console.error('Failed to resume agent:', error);
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md p-6 bg-base-300 rounded-lg shadow-xl">
        <div className="alert alert-warning mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h3 className="font-bold">LinkedIn Security Checkpoint Detected</h3>
            <div className="text-sm">
              Authentication is required to continue with automation.
            </div>
          </div>
        </div>

        <p className="mb-4">
          LinkedIn has detected automated activity and requires manual verification.
          Please follow these steps:
        </p>

        <ol className="list-decimal list-inside mb-6 space-y-2">
          <li>Click the button below to open LinkedIn in your browser</li>
          <li>Complete any security challenges or CAPTCHAs</li>
          <li>Ensure you're fully logged in to LinkedIn</li>
          <li>Return here and click "Resume" to continue</li>
        </ol>

        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <button 
            className="btn btn-primary"
            onClick={handleOpenLinkedIn}
          >
            Open LinkedIn
          </button>
          <button 
            className="btn btn-success"
            onClick={handleResume}
          >
            Resume
          </button>
          <button 
            className="btn btn-ghost"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CaptchaModal;
