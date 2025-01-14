import React, { useState, useEffect } from 'react';
import { FileSelectDialog } from './FileSelectDialog';
import LoginForm from '../components/Login';

interface TikTokVideo {
  id: string;
  desc: string;
  create_time: number;
  video_url: string;
  author: string;
}

interface DownloadProgress {
  total: number;
  current: number;
  current_file: string;
}

declare global {
  interface Window {
    __TAURI__: {
      event: any;
      invoke: (cmd: string, args?: any) => Promise<any>;
    };
  }
}

export default function App() {
  const [sessionId, setSessionId] = useState('');
  const [maxCount, setMaxCount] = useState(100);
  const [videos, setVideos] = useState<TikTokVideo[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloadPath, setDownloadPath] = useState('');
  const [batchSize, setBatchSize] = useState(10);
  const [delayMs, setDelayMs] = useState(1000);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchVideos = async () => {
    try {
      setError('');
      const result = await window.__TAURI__.invoke('fetch_liked_videos', {
        sessionId,
        maxCount
      });
      setVideos(result);
    } catch (err) {
      setError(err as string);
    }
  };

  const handlePathSelect = (path: string) => {
    setDownloadPath(path);
  };

  const startDownload = async () => {
    if (!downloadPath) {
      setError('Please select a download path first');
      return;
    }

    try {
      setError('');
      setDownloading(true);
      await window.__TAURI__.invoke('download_videos', {
        videos,
        downloadPath,
        batchSize,
        delayMs
      });
    } catch (err) {
      setError(err as string);
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto bg-black">
        <script src="https://cdn.tailwindcss.com"></script>

      <h1 className="text-3xl font-bold mb-6">TikTok Content Downloader</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4 mb-6">
        {!sessionId ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-lg">Please login to TikTok to continue</p>
            <LoginForm />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="text-green-600">✓ Logged in</div>
            <button
              onClick={() => setSessionId('')}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              (Logout)
            </button>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">
            Max Videos to Fetch
            <input
              type="number"
              value={maxCount}
              onChange={(e) => setMaxCount(parseInt(e.target.value))}
              className="mt-1 block w-full rounded border-gray-300 shadow-sm"
              min="1"
            />
          </label>
        </div>

        <button
          onClick={fetchVideos}
          disabled={!sessionId || downloading}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Fetch Videos
        </button>
      </div>

      {videos.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            Found {videos.length} unique videos
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Download Location
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={downloadPath}
                    readOnly
                    className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                    placeholder="Select download location"
                  />
                  <button
                    onClick={() => setDialogOpen(true)}
                    disabled={downloading}
                    className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 disabled:opacity-50"
                  >
                    Browse
                  </button>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Batch Size
                  <input
                    type="number"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value))}
                    className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                    min="1"
                  />
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Delay Between Batches (ms)
                  <input
                    type="number"
                    value={delayMs}
                    onChange={(e) => setDelayMs(parseInt(e.target.value))}
                    className="mt-1 block w-full rounded border-gray-300 shadow-sm"
                    min="0"
                  />
                </label>
              </div>
            </div>

            <button
              onClick={startDownload}
              disabled={downloading || !downloadPath}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
            >
              {downloading ? 'Downloading...' : 'Start Download'}
            </button>

            {progress && (
              <div className="space-y-2">
                <div className="h-2 bg-gray-200 rounded">
                  <div
                    className="h-full bg-blue-500 rounded"
                    style={{
                      width: `${(progress.current / progress.total) * 100}%`
                    }}
                  />
                </div>
                <div className="text-sm text-gray-600">
                  Downloading: {progress.current_file}
                  <br />
                  Progress: {progress.current} / {progress.total}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <FileSelectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelect={handlePathSelect}
      />
    </div>
  );
}