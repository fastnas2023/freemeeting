import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Cloud, Settings, LogOut, Video, Plus, Monitor, MonitorOff, PhoneOff, User, Check, AlertCircle, Wifi, Mic, Volume2 } from 'lucide-react';
import { Loader } from './UI';

const APP_ID_KEY = 'agora_appId';

// 推荐使用 Agora (声网) 免费版
// 请前往 https://console.agora.io/ 注册并获取 App ID
// 如果没有 App ID，无法连接 Agora 服务

const AgoraMeeting = ({ onBack, username, addToast }) => {
  const { t } = useTranslation();
  const [appId, setAppId] = useState('');
  const [channel, setChannel] = useState('');
  const [token, setToken] = useState('');
  
  const [joined, setJoined] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [networkQuality, setNetworkQuality] = useState(0); // 0: unknown, 1: excellent, 2: good, 3: poor, 4: bad, 5: very bad, 6: down
  
  // UI State: 'welcome', 'config', 'meeting'
  const [uiState, setUiState] = useState('welcome');
  const [joinChannelName, setJoinChannelName] = useState('');

  // Device Check State
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicId, setSelectedMicId] = useState('');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [localCameraTrack, setLocalCameraTrack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [meetingPassword, setMeetingPassword] = useState('');

  const clientRef = useRef(null);
  const localScreenTrackRef = useRef(null);
  const localCameraTrackRef = useRef(null);
  const localMicTrackRef = useRef(null);
  const volumeIntervalRef = useRef(null);

  useEffect(() => {
    // Load config from localStorage
    const savedAppId = localStorage.getItem('agora_appId');
    const savedToken = localStorage.getItem('agora_token');
    
    if (savedAppId) setAppId(savedAppId);
    if (savedToken) setToken(savedToken);

    // Dynamic API Host
    const apiHost = window.location.hostname;
    
    // Check if server requires password (not possible to check directly, but we assume no password initially)
    // We will handle password prompt on join failure

    // Try to fetch token from server automatically
    const tokenUrl = `http://${apiHost}:5002/rtctoken?channel=test`;
    
    fetch(tokenUrl)
        .then(res => {
            if (res.status === 401) {
                // Password required
                throw new Error('Password required');
            }
            if (res.ok) return res.json();
            throw new Error('Server token not configured');
        })
        .then(data => {
            if (data.appId) {
                console.log('Auto-configured Agora from server');
                setAppId(data.appId);
                // We don't set token here because token depends on channel name
                // We will fetch the real token when joining a specific channel
                setUiState('welcome'); 
            }
        })
        .catch(err => {
            // If server config fails and no local config, show config screen
            if (!savedAppId) {
                setUiState('config');
            }
            if (err.message === 'Password required') {
                // We might need a way to indicate password is required globally, 
                // but usually we just ask for it when joining.
            }
        });
  }, []);

  useEffect(() => {
    try {
        // 初始化 Agora Client
        clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

        // 监听远端用户发布流
        clientRef.current.on('user-published', async (user, mediaType) => {
          await clientRef.current.subscribe(user, mediaType);
          
          if (mediaType === 'video') {
            setRemoteUsers((prev) => [...prev.filter((u) => u.uid !== user.uid), user]);
          }
        });

        // 监听远端用户取消发布
        clientRef.current.on('user-unpublished', (user) => {
          setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        });
        
        // 监听用户离开
        clientRef.current.on('user-left', (user) => {
            setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        });

        // 监听网络质量
        clientRef.current.on("network-quality", (stats) => {
            // stats.uplinkNetworkQuality: 0-6
            // stats.downlinkNetworkQuality: 0-6
            // Take the worse of the two
            const quality = Math.max(stats.uplinkNetworkQuality, stats.downlinkNetworkQuality);
            setNetworkQuality(quality);
        });
    } catch (err) {
        console.error("Failed to initialize Agora Client", err);
    }

    return () => {
      leaveChannel();
    };
  }, []);

  // Device Check Logic
  useEffect(() => {
      if (uiState !== 'deviceCheck') return;
      
      let mounted = true;
      let cameraTrack = null;
      let micTrack = null;
      let volumeInterval = null;

      const initDevices = async () => {
          setLoading(true);
          try {
              // Get Devices
              const devices = await AgoraRTC.getDevices();
              if (!mounted) return;
              
              const audioDevices = devices.filter(d => d.kind === 'audioinput');
              const videoDevices = devices.filter(d => d.kind === 'videoinput');
              
              setMics(audioDevices);
              setCameras(videoDevices);
              
              // Set default selection if not set
              const camId = selectedCameraId || (videoDevices.length > 0 ? videoDevices[0].deviceId : '');
              const micId = selectedMicId || (audioDevices.length > 0 ? audioDevices[0].deviceId : '');
              
              if (camId && camId !== selectedCameraId) setSelectedCameraId(camId);
              if (micId && micId !== selectedMicId) setSelectedMicId(micId);

              // Create and play camera track
              if (camId) {
                  cameraTrack = await AgoraRTC.createCameraVideoTrack({ cameraId: camId });
                  if (!mounted) { cameraTrack.close(); return; }
                  localCameraTrackRef.current = cameraTrack;
                  cameraTrack.play('device-preview-player');
              }

              // Create mic track for volume level
              if (micId) {
                  micTrack = await AgoraRTC.createMicrophoneAudioTrack({ microphoneId: micId });
                  if (!mounted) { micTrack.close(); return; }
                  localMicTrackRef.current = micTrack;
                  
                  volumeInterval = setInterval(() => {
                      if (micTrack) {
                          const level = micTrack.getVolumeLevel();
                          setVolumeLevel(level * 100);
                      }
                  }, 100);
                  volumeIntervalRef.current = volumeInterval;
              }

          } catch (e) {
              console.error("Device check error", e);
              addToast(t('device_init_error'), "error");
          } finally {
              setLoading(false);
          }
      };

      initDevices();

      return () => {
          mounted = false;
          if (cameraTrack) {
              cameraTrack.stop();
              cameraTrack.close();
          }
          if (micTrack) {
              micTrack.stop();
              micTrack.close();
          }
          if (volumeInterval) {
              clearInterval(volumeInterval);
          }
          localCameraTrackRef.current = null;
          localMicTrackRef.current = null;
          volumeIntervalRef.current = null;
          setVolumeLevel(0);
      };
  }, [uiState, selectedCameraId, selectedMicId]);

  const saveConfig = () => {
      localStorage.setItem('agora_appId', appId);
      localStorage.setItem('agora_token', token);
      setUiState('welcome');
  };

  const createMeeting = () => {
      // Generate a random 6-digit channel name
      const randomChannel = Math.floor(100000 + Math.random() * 900000).toString();
      setChannel(randomChannel);
      joinChannel(randomChannel, true);
  };

  const joinExistingMeeting = () => {
      if (!joinChannelName) {
          addToast(t('enter_meeting_id_error'), "error");
          return;
      }
      setChannel(joinChannelName);
      joinChannel(joinChannelName, false);
  };

  const joinChannel = async (channelName, autoShare = false) => {
    setLoading(true);
    // 1. Try to get token from server first
    let currentToken = token;
    let currentAppId = appId;
    const apiHost = window.location.hostname;

    try {
        const res = await fetch(`http://${apiHost}:5002/rtctoken?channel=${channelName}&password=${meetingPassword}`);
        
        if (res.status === 401) {
            addToast(t('meeting_password_error'), 'error');
            setLoading(false);
            return;
        }

        if (res.ok) {
            const data = await res.json();
            if (data.rtcToken) {
                console.log('Got token from server');
                currentToken = data.rtcToken;
                currentAppId = data.appId; // Ensure we use the server's App ID
                setAppId(currentAppId);
            }
        }
    } catch (e) {
        console.warn('Failed to fetch token from server, falling back to manual input', e);
    }

    if (!currentAppId) {
      addToast(t('configure_app_id_first'), 'info');
      setUiState('config');
      setLoading(false);
      return;
    }

    try {
      // Join using the App ID. Token is optional but recommended for security.
      // If your project is in "Secure Mode", token is REQUIRED.
      // If "Testing Mode", token can be null.
      await clientRef.current.join(currentAppId, channelName, currentToken || null, null);
      setJoined(true);
      setUiState('meeting');
      
      // Publish Local Tracks
      const tracks = [];
      try {
          const cameraConfig = selectedCameraId ? { cameraId: selectedCameraId } : undefined;
          const cameraTrack = await AgoraRTC.createCameraVideoTrack(cameraConfig);
          localCameraTrackRef.current = cameraTrack;
          setLocalCameraTrack(cameraTrack);
          tracks.push(cameraTrack);
      } catch (e) { console.warn("Failed to create camera track", e); }

      try {
          const micConfig = selectedMicId ? { microphoneId: selectedMicId } : undefined;
          const micTrack = await AgoraRTC.createMicrophoneAudioTrack(micConfig);
          localMicTrackRef.current = micTrack;
          tracks.push(micTrack);
      } catch (e) { console.warn("Failed to create mic track", e); }

      if (tracks.length > 0) {
          await clientRef.current.publish(tracks);
      }

      if (autoShare) {
          await startScreenShare();
      }
    } catch (error) {
      console.error('Failed to join channel:', error);
      addToast(t('join_failed', { error: error.message }), 'error');
    } finally {
        setLoading(false);
    }
  };

  const startScreenShare = async () => {
    try {
      // Create screen track
      const screenTrack = await AgoraRTC.createScreenVideoTrack({
        encoderConfig: '1080p_1',
      }, 'auto');
      
      // Handle track ended (user clicks stop sharing in browser UI)
      if (Array.isArray(screenTrack)) {
           // With audio
           localScreenTrackRef.current = screenTrack[0];
      } else {
           localScreenTrackRef.current = screenTrack;
      }
      
      localScreenTrackRef.current.on('track-ended', () => {
          stopScreenShare();
      });

      await clientRef.current.publish(localScreenTrackRef.current);
      setIsSharing(true);
    } catch (error) {
      console.error('Failed to start screen share:', error);
      // If user cancelled screen share dialog, we might want to stop sharing state if it was set
      setIsSharing(false);
    }
  };

  const stopScreenShare = async () => {
    if (localScreenTrackRef.current) {
      localScreenTrackRef.current.close();
      await clientRef.current.unpublish(localScreenTrackRef.current);
      localScreenTrackRef.current = null;
      setIsSharing(false);
    }
  };

  const leaveChannel = async () => {
    stopScreenShare();
    
    if (localCameraTrackRef.current) {
        localCameraTrackRef.current.close();
        localCameraTrackRef.current = null;
        setLocalCameraTrack(null);
    }
    if (localMicTrackRef.current) {
        localMicTrackRef.current.close();
        localMicTrackRef.current = null;
    }

    if (clientRef.current) {
      await clientRef.current.leave();
      setJoined(false);
      setRemoteUsers([]);
      setUiState('welcome');
      setChannel('');
    }
  };

  const getSignalColor = (quality) => {
    switch (quality) {
      case 1:
      case 2:
        return 'text-green-500'; // Good
      case 3:
        return 'text-yellow-500'; // Poor
      case 4:
      case 5:
        return 'text-red-500'; // Bad
      case 6:
        return 'text-gray-500'; // Disconnected
      default:
        return 'text-gray-500'; // Unknown
    }
  };

  // Render Logic
  return (
    <div className="w-full h-screen flex flex-col bg-gray-950 text-white font-sans overflow-hidden">
        {loading && <Loader text={t('connecting_agora')} />}
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-900 z-10">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Cloud className="text-blue-500" size={24} />
                {uiState !== 'meeting' && (
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">{t('agora_title')}</span>
                )}
            </h2>
            <div className="flex items-center gap-4">
                 {/* Network Quality Indicator (Only in meeting) */}
                 {uiState === 'meeting' && (
                   <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-full border border-gray-700" 
                        title={`${t('network_quality_label')}: ${t(['net_unknown', 'net_excellent', 'net_good', 'net_poor', 'net_bad', 'net_very_bad', 'net_down'][networkQuality] || 'net_unknown')}`}>
                      <Wifi size={16} className={getSignalColor(networkQuality)} />
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        {t(['net_unknown', 'net_good', 'net_good', 'net_poor', 'net_bad', 'net_bad', 'net_lost'][networkQuality] || 'net_unknown')}
                      </span>
                   </div>
                 )}
                 
                 {uiState === 'welcome' && (
                     <div className="flex gap-2">
                        <button 
                            onClick={() => setUiState('deviceCheck')} 
                            className="text-gray-400 hover:text-white flex items-center gap-2 transition-colors px-3 py-2 rounded hover:bg-gray-800" 
                            title={t('test_btn')}
                        >
                             <Mic size={18} />
                             <span className="hidden sm:inline">{t('test_btn')}</span>
                        </button>
                        <button 
                            onClick={() => setUiState('config')} 
                            className="text-gray-400 hover:text-white flex items-center gap-2 transition-colors px-3 py-2 rounded hover:bg-gray-800" 
                            title={t('settings_btn')}
                        >
                             <Settings size={18} />
                             <span className="hidden sm:inline">{t('settings_btn')}</span>
                        </button>
                     </div>
                 )}
                 <button 
                    onClick={onBack} 
                    className="text-gray-400 hover:text-white flex items-center gap-2 transition-colors px-3 py-2 rounded hover:bg-gray-800"
                 >
                     <LogOut size={18} />
                     <span className="hidden sm:inline">{t('exit_btn')}</span>
                 </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex items-center justify-center p-4 bg-[#0a0a0a]">
            
            {/* Welcome Screen */}
            {uiState === 'welcome' && (
                <div className="flex flex-col gap-8 items-center w-full max-w-4xl animate-in fade-in duration-500">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold mb-2">{t('welcome_back_title')}</h1>
                        <p className="text-gray-400">{t('agora_welcome_desc')}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                        {/* New Meeting Card */}
                        <div 
                            onClick={createMeeting}
                            className="group bg-gradient-to-br from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 transition cursor-pointer rounded-2xl p-8 flex flex-col items-center justify-center gap-4 h-64 shadow-xl hover:shadow-orange-900/20 hover:scale-[1.02] transform duration-200"
                        >
                            <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                <Video className="text-white" size={40} />
                            </div>
                            <div className="text-2xl font-bold">{t('new_meeting_card_title')}</div>
                            <p className="text-orange-100 text-center opacity-80">{t('new_meeting_card_desc')}</p>
                        </div>

                        {/* Join Meeting Card */}
                        <div className="group bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition rounded-2xl p-8 flex flex-col items-center justify-center gap-4 h-64 shadow-xl hover:shadow-blue-900/20">
                            <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                <Plus className="text-white" size={40} />
                            </div>
                            <div className="text-2xl font-bold mb-2">{t('join_meeting_title')}</div>
                            <div className="flex flex-col gap-2 w-full max-w-xs">
                                <input 
                                    type="text" 
                                    placeholder={t('enter_meeting_id_placeholder')} 
                                    value={joinChannelName}
                                    onChange={(e) => setJoinChannelName(e.target.value)}
                                    className="w-full p-3 rounded-lg bg-black/20 text-white placeholder-blue-200/50 border border-transparent focus:border-white/50 outline-none text-center font-mono"
                                />
                                <input 
                                    type="password" 
                                    placeholder={t('password_optional_placeholder')} 
                                    value={meetingPassword}
                                    onChange={(e) => setMeetingPassword(e.target.value)}
                                    className="w-full p-3 rounded-lg bg-black/20 text-white placeholder-blue-200/50 border border-transparent focus:border-white/50 outline-none text-center font-mono"
                                />
                                <button 
                                    onClick={joinExistingMeeting}
                                    className="w-full bg-white text-blue-600 font-bold p-3 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                    {t('go_btn')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Device Check Screen */}
            {uiState === 'deviceCheck' && (
                <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-5xl border border-gray-800 animate-in zoom-in-95 duration-300 flex flex-col md:flex-row gap-8">
                    {/* Preview Area */}
                    <div className="flex-1 min-h-[300px] flex flex-col">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Video size={20} className="text-blue-500" />
                            {t('camera_preview_label')}
                        </h3>
                        <div className="flex-1 aspect-video bg-black rounded-xl overflow-hidden border border-gray-700 relative shadow-lg">
                            <div id="device-preview-player" className="w-full h-full"></div>
                            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-white border border-white/10">
                                {cameras.find(c => c.deviceId === selectedCameraId)?.label || t('camera_label')}
                            </div>
                        </div>
                    </div>

                    {/* Controls Area */}
                    <div className="w-full md:w-80 flex flex-col gap-6">
                        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                            <Settings size={20} className="text-blue-500" />
                            {t('device_settings_title')}
                        </h3>

                        {/* Camera Select */}
                        <div>
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{t('camera_label')}</label>
                            <select 
                                value={selectedCameraId}
                                onChange={(e) => setSelectedCameraId(e.target.value)}
                                className="w-full p-3 rounded-xl bg-black border border-gray-700 focus:border-blue-500 outline-none text-sm text-gray-300"
                            >
                                {cameras.map(cam => (
                                    <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `${t('camera_label')} ${cam.deviceId.slice(0, 5)}...`}</option>
                                ))}
                            </select>
                        </div>

                        {/* Mic Select */}
                        <div>
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{t('microphone_label')}</label>
                            <select 
                                value={selectedMicId}
                                onChange={(e) => setSelectedMicId(e.target.value)}
                                className="w-full p-3 rounded-xl bg-black border border-gray-700 focus:border-blue-500 outline-none text-sm text-gray-300"
                            >
                                {mics.map(mic => (
                                    <option key={mic.deviceId} value={mic.deviceId}>{mic.label || `${t('microphone_label')} ${mic.deviceId.slice(0, 5)}...`}</option>
                                ))}
                            </select>
                            
                            {/* Volume Meter */}
                            <div className="mt-4 bg-gray-800 rounded-lg p-3 border border-gray-700">
                                <div className="flex justify-between text-xs text-gray-400 mb-1">
                                    <span className="flex items-center gap-1"><Mic size={12} /> {t('input_level_label')}</span>
                                    <span>{Math.round(volumeLevel)}%</span>
                                </div>
                                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-green-500 transition-all duration-75 ease-out"
                                        style={{ width: `${Math.min(100, volumeLevel)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1"></div>

                        <button 
                            onClick={() => setUiState('welcome')}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                        >
                            <Check size={20} />
                            {t('done_btn')}
                        </button>
                    </div>
                </div>
            )}

            {/* Config Screen */}
            {uiState === 'config' && (
                <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-800 animate-in zoom-in-95 duration-300">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-gray-800 rounded-xl">
                            <Settings className="text-blue-500" size={24} />
                        </div>
                        <h3 className="text-2xl font-bold">{t('settings_btn')}</h3>
                    </div>
                    
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{t('agora_app_id_label')}</label>
                            <input 
                                type="text" 
                                value={appId} 
                                onChange={(e) => setAppId(e.target.value)}
                                className="w-full p-4 rounded-xl bg-black border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
                                placeholder={t('enter_app_id_placeholder')}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{t('temp_token_label')}</label>
                            <input 
                                type="text" 
                                value={token} 
                                onChange={(e) => setToken(e.target.value)}
                                className="w-full p-4 rounded-xl bg-black border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
                                placeholder={t('enter_token_placeholder')}
                            />
                            <div className="flex items-start gap-2 mt-2 text-xs text-gray-500 bg-gray-800/50 p-2 rounded">
                                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                                <p>{t('token_hint')}</p>
                            </div>
                        </div>
                        <button 
                            onClick={saveConfig}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl mt-2 transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                        >
                            <Check size={20} />
                            {t('save_continue_btn')}
                        </button>
                    </div>
                </div>
            )}

            {/* Meeting Screen */}
            {uiState === 'meeting' && (
                <div className="w-full h-full flex flex-col gap-4 max-w-[1920px]">
                    {/* Toolbar */}
                    <div className="bg-gray-900 p-4 rounded-xl flex justify-between items-center border border-gray-800">
                        <div className="flex items-center gap-4">
                            <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700">
                                <span className="text-gray-400 text-xs font-medium uppercase mr-2">{t('meeting_id_label')}</span>
                                <span className="text-white font-mono font-bold text-lg select-all text-blue-400">{channel}</span>
                            </div>
                            <span className="text-green-500 text-xs font-bold uppercase tracking-wider flex items-center gap-2 bg-green-500/10 px-3 py-1.5 rounded-full border border-green-500/20">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                {t('live')}
                            </span>
                        </div>
                        
                        <div className="flex gap-3">
                            {!isSharing ? (
                                <button 
                                    onClick={startScreenShare} 
                                    className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all border border-gray-700"
                                >
                                    <Monitor size={18} />
                                    <span>{t('share_screen_btn')}</span>
                                </button>
                            ) : (
                                <button 
                                    onClick={stopScreenShare} 
                                    className="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg shadow-green-900/20"
                                >
                                    <MonitorOff size={18} />
                                    <span>{t('stop_share_btn')}</span>
                                </button>
                            )}
                            <button 
                                onClick={leaveChannel} 
                                className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg shadow-red-900/20"
                            >
                                <PhoneOff size={18} />
                                <span>{t('end_btn')}</span>
                            </button>
                        </div>
                    </div>

                    {/* Video Grid */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-1">
                        {/* Self View */}
                        <div className="bg-gray-900 rounded-2xl overflow-hidden aspect-video relative border border-gray-800 flex flex-col items-center justify-center shadow-xl">
                            {localCameraTrack ? (
                                <AgoraVideoPlayer videoTrack={localCameraTrack} />
                            ) : (
                                <>
                                    <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                                        <User className="text-gray-500" size={40} />
                                    </div>
                                    <p className="text-gray-500 font-medium">{t('you_local')}</p>
                                </>
                            )}
                            
                            <div className="absolute top-4 left-4 bg-black/40 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-white border border-white/10">
                                {t('you')}
                            </div>

                            {isSharing && (
                                <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg">
                                    <Monitor size={12} /> {t('sharing_status')}
                                </div>
                            )}
                        </div>

                        {/* Remote Users */}
                        {remoteUsers.map(user => (
                            <div key={user.uid} className="bg-black rounded-2xl overflow-hidden aspect-video relative border border-gray-800 shadow-xl">
                                <AgoraVideoPlayer videoTrack={user.videoTrack} />
                                <div className="absolute top-4 left-4 bg-black/40 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-white border border-white/10 flex items-center gap-2">
                                    <User size={12} />
                                    {t('user_label', { userId: user.uid })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

const AgoraVideoPlayer = ({ videoTrack }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && videoTrack) {
      videoTrack.play(ref.current);
    }
    return () => {
      if (videoTrack) {
        videoTrack.stop();
      }
    };
  }, [videoTrack]);

  return <div ref={ref} className="w-full h-full object-contain" />;
};

export default AgoraMeeting;