import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Video, Users, LogOut, Copy, Check, Zap, Shield, Globe, ArrowRight, AlertTriangle, X } from 'lucide-react';

// Jitsi Meet uses a public server (meet.jit.si) by default.
// NO API KEY REQUIRED. TRULY ZERO CONFIG.

const JitsiMeeting = ({ onBack, username, addToast }) => {
  const { t } = useTranslation();
  const jitsiContainerRef = useRef(null);
  const [roomName, setRoomName] = useState('');
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const apiRef = useRef(null);

  // Generate a random room name on mount
  useEffect(() => {
    const randomRoom = 'FreeMeeting-' + Math.random().toString(36).substring(2, 10);
    setRoomName(randomRoom);
  }, []);

  const copyRoomName = () => {
    navigator.clipboard.writeText(roomName);
    setCopied(true);
    addToast(t('jitsi_room_copied'), "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const startMeeting = (name) => {
    const room = name || roomName;
    setMeetingStarted(true);

    // Wait for DOM to update
    setTimeout(() => {
        if (!window.JitsiMeetExternalAPI) {
            addToast(t('jitsi_api_error'), "error");
            setMeetingStarted(false);
            return;
        }

        const domain = import.meta.env.VITE_JITSI_DOMAIN || 'meet.jit.si';
        if (domain === 'meet.jit.si') {
            setShowWarning(true);
        }
        const options = {
            roomName: room,
            width: '100%',
            height: '100%',
            parentNode: jitsiContainerRef.current,
            configOverwrite: {
                startWithAudioMuted: true,
                startWithVideoMuted: false,
                theme: {
                    default: 'dark'
                },
                // Attempt to hide branding
                hideConferenceTimer: false,
                subject: ' ', // Hide room name if possible
                disableDeepLinking: true,
            },
            interfaceConfigOverwrite: {
                TOOLBAR_BUTTONS: [
                    'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
                    'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
                    'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
                    'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
                    'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone',
                    'security'
                ],
                SHOW_JITSI_WATERMARK: false,
                SHOW_WATERMARK_FOR_GUESTS: false,
                SHOW_BRAND_WATERMARK: false,
                SHOW_POWERED_BY: false,
                SHOW_PROMOTIONAL_CLOSE_PAGE: false,
                DEFAULT_BACKGROUND: '#000000',
                DEFAULT_REMOTE_DISPLAY_NAME: 'Fellow Attendee',
                // Hiding other elements
                HIDE_DEEP_LINKING_LOGO: true,
                MOBILE_APP_PROMO: false,
            },
            userInfo: {
                displayName: username || t('guest_user')
            }
        };

        apiRef.current = new window.JitsiMeetExternalAPI(domain, options);

        apiRef.current.addEventListeners({
            readyToClose: () => {
                handleClose();
            },
            // videoConferenceLeft event can be triggered when redirecting to auth (e.g. "Login to Host")
            // causing the meeting to close prematurely. We rely on readyToClose or manual exit.
            // videoConferenceLeft: () => {
            //    handleClose();
            // }
        });
    }, 100);
  };

  const handleClose = () => {
      if (apiRef.current) {
          apiRef.current.dispose();
          apiRef.current = null;
      }
      setMeetingStarted(false);
      onBack(); // Go back to home when meeting ends
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gray-950 text-white font-sans selection:bg-purple-500/30 overflow-hidden">
        {/* Header */}
        {!meetingStarted && (
            <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-50">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                        <Zap className="text-purple-400" size={24} />
                    </div>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                        {t('jitsi_title')}
                    </span>
                </h2>
                <button 
                    onClick={onBack} 
                    className="group flex items-center gap-2 px-4 py-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all duration-200"
                >
                    <LogOut size={18} className="group-hover:-translate-x-0.5 transition-transform" />
                    <span>{t('exit_btn')}</span>
                </button>
            </div>
        )}

        {/* Content */}
        <div className="flex-1 relative overflow-hidden">
            {meetingStarted && showWarning && (
                <div className="absolute top-0 left-0 w-full z-50 bg-orange-600/90 text-white px-4 py-2 text-sm flex justify-between items-center backdrop-blur-sm shadow-md">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={16} />
                        <span>{t('jitsi_public_warning')}</span>
                    </div>
                    <button onClick={() => setShowWarning(false)} className="hover:bg-white/20 p-1 rounded transition">
                        <X size={16}/>
                    </button>
                </div>
            )}
            {!meetingStarted ? (
                <div className="flex flex-col items-center justify-center min-h-[calc(100vh-88px)] p-6 relative">
                    {/* Background Elements */}
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

                    <div className="text-center mb-16 relative z-10 max-w-2xl mx-auto">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium mb-6">
                            <Globe size={14} />
                            <span>{t('global_infra')}</span>
                        </div>
                        <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight">
                            {t('zero_config_title')} <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">{t('meeting_title_suffix')}</span>
                        </h1>
                        <p className="text-xl text-gray-400 leading-relaxed">
                            {t('jitsi_powered_desc')} 
                            <span className="text-gray-300 block mt-2">{t('jitsi_secure_desc')}</span>
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl px-4 relative z-10">
                        {/* Start New */}
                        <div 
                            onClick={() => startMeeting(roomName)}
                            className="group relative overflow-hidden bg-gray-900/50 backdrop-blur-sm border border-gray-800 hover:border-purple-500/50 rounded-2xl p-8 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/10"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Zap size={120} />
                            </div>
                            
                            <div className="relative z-10 h-full flex flex-col">
                                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-transform duration-300">
                                    <Video className="text-white" size={28} />
                                </div>
                                
                                <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">{t('start_instant_meeting')}</h3>
                                <p className="text-gray-400 mb-8 flex-1">{t('start_instant_desc')}</p>
                                
                                <div className="flex items-center gap-2 text-purple-400 font-medium group-hover:translate-x-2 transition-transform">
                                    {t('launch_now')} <ArrowRight size={18} />
                                </div>
                            </div>
                        </div>

                        {/* Join Existing */}
                        <div className="group relative overflow-hidden bg-gray-900/50 backdrop-blur-sm border border-gray-800 hover:border-pink-500/50 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-pink-500/10">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Users size={120} />
                            </div>

                            <div className="relative z-10 h-full flex flex-col">
                                <div className="w-14 h-14 bg-gray-800 rounded-xl flex items-center justify-center mb-6 border border-gray-700 group-hover:border-pink-500/30 transition-colors">
                                    <Users className="text-gray-300 group-hover:text-pink-400 transition-colors" size={28} />
                                </div>

                                <h3 className="text-2xl font-bold text-white mb-2">{t('join_existing_room')}</h3>
                                <p className="text-gray-400 mb-6">{t('join_existing_desc')}</p>

                                <div className="mt-auto space-y-4">
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            value={roomName}
                                            placeholder={t('enter_room_name_placeholder')} 
                                            className="w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition-all font-mono"
                                            onChange={(e) => setRoomName(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                copyRoomName();
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                            title={t('copy_room_name')}
                                        >
                                            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                                        </button>
                                    </div>
                                    
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startMeeting(roomName);
                                        }}
                                        className="w-full bg-gray-800 hover:bg-pink-600 text-white font-bold py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 border border-gray-700 hover:border-pink-500"
                                    >
                                        {t('join_room_btn')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-12 flex gap-6 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                            <Shield size={14} />
                            <span>{t('e2e_encrypted')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Zap size={14} />
                            <span>{t('low_latency')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Globe size={14} />
                            <span>{t('open_source_label')}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="w-full h-full relative bg-black">
                     <button 
                        onClick={handleClose}
                        className="absolute top-4 left-4 z-[100] bg-gray-900/80 hover:bg-red-600 text-white p-2 rounded-full backdrop-blur-sm transition-all border border-gray-700 hover:border-red-500"
                        title={t('leave_meeting_title')}
                    >
                        <LogOut size={20} />
                    </button>
                    <div ref={jitsiContainerRef} className="w-full h-full"></div>
                </div>
            )}
        </div>
    </div>
  );
};

export default JitsiMeeting;
