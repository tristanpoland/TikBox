import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';

interface Props {
  onLogin: (tokenData: any) => void;
}

const LoginForm = ({ onLogin }: Props) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const setupListener = async () => {
      try {
        const unlisten = await listen('oauth-success', (event: any) => {
          console.log('OAuth success:', event);
          setLoading(false);
          onLogin(event.payload);
        });

        return unlisten;
      } catch (err) {
        console.error('Error setting up OAuth listener:', err);
        setError('Failed to initialize OAuth. Please try again.');
        return () => {};
      }
    };

    const unsubscribe = setupListener();

    // Setup protocol handler for OAuth callback
    const handleCallback = async (url: string) => {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        const state = urlObj.searchParams.get('state');

        if (code && state) {
          await invoke('handle_oauth_callback', { code, state });
        }
      } catch (err) {
        console.error('Error handling OAuth callback:', err);
        setError('Failed to complete OAuth. Please try again.');
        setLoading(false);
      }
    };

    // Listen for deep link events
    const deepLinkUnsubscribe = listen('tauri://deep-link', (event: any) => {
      handleCallback(event.payload);
    });

    return () => {
      unsubscribe.then(unlisten => unlisten());
      deepLinkUnsubscribe.then(unlisten => unlisten());
    };
  }, [onLogin]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      await invoke('initiate_oauth');
    } catch (err) {
      console.error('Error initiating OAuth:', err);
      setError('Failed to start OAuth process. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Login with TikTok</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded">
          <p className="font-medium">About TikTok Authorization:</p>
          <ul className="list-disc ml-4 mt-2 space-y-1">
            <li>You'll be redirected to TikTok's official login page</li>
            <li>You'll be asked to authorize this application</li>
            <li>Your credentials are handled securely by TikTok</li>
            <li>You can revoke access at any time in your TikTok settings</li>
          </ul>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-black text-white px-4 py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <>
              <Loader className="h-4 w-4 animate-spin" />
              <span>Connecting to TikTok...</span>
            </>
          ) : (
            <>
              <img 
                src="https://cliply.co/wp-content/uploads/2021/02/372102690_TIKTOK_LOGO_1080.png" 
                alt="" 
                className="w-10 h-10"
                onError={(e) => e.currentTarget.style.display = 'none'}
              />
              <span>Continue with TikTok</span>
            </>
          )}
        </button>

        <p className="text-xs text-gray-500 text-center">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default LoginForm;