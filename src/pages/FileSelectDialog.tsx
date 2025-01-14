import React, { useState, useEffect } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
}

// Modal Backdrop
const Backdrop = ({ onClick }: { onClick: () => void }) => (
  <div 
    className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" 
    onClick={onClick}
  />
);

export function FileSelectDialog({ open, onOpenChange, onSelect }: Props) {
  const [currentPath, setCurrentPath] = useState('/');
  const [error, setError] = useState('');

  // Close on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onOpenChange]);

  const handleSubmit = () => {
    if (!currentPath) {
      setError('Please enter a valid path');
      return;
    }
    onSelect(currentPath);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <>
      <Backdrop onClick={() => onOpenChange(false)} />
      <div 
        className="fixed inset-0 flex items-center justify-center pointer-events-none"
        aria-modal="true"
        role="dialog"
      >
        <div 
          className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-4">Select Download Location</h2>
            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Download Path
              </label>
              <input
                type="text"
                value={currentPath}
                onChange={(e) => {
                  setCurrentPath(e.target.value);
                  setError('');
                }}
                className="w-full p-2 border rounded"
                placeholder="/path/to/downloads"
              />
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </>
  );
}