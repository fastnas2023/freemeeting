import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import AgoraMeeting from './AgoraMeeting';
import JitsiMeeting from './JitsiMeeting';
import WebRTCMeeting from './WebRTCMeeting';
import RoleManager from './RoleManager';
import { ToastContainer } from './UI';
import { Video, Zap, Cloud, Server, ArrowRight, User, Globe, Shield } from 'lucide-react';

function App() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState('home'); // 'home', 'webrtc', 'agora', 'jitsi'
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [toasts, setToasts] = useState([]);

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'zh' : 'en';
    i18n.changeLanguage(newLang);
  };

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleModeSelect = (selectedMode) => {
    if (username.trim()) {
      localStorage.setItem('username', username.trim());
    }
    setMode(selectedMode);
  };

  if (mode === 'agora') {
    return (
        <>
            <AgoraMeeting onBack={() => setMode('home')} username={username} addToast={addToast} />
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </>
    );
  }

  if (mode === 'jitsi') {
    return (
        <>
            <JitsiMeeting onBack={() => setMode('home')} username={username} addToast={addToast} />
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </>
    );
  }

  if (mode === 'webrtc') {
    return (
        <>
            <WebRTCMeeting onBack={() => setMode('home')} username={username} addToast={addToast} />
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </>
    );
  }

  if (mode === 'admin') {
      return <RoleManager onBack={() => setMode('home')} />;
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* Language Toggle */}
      <button 
          onClick={toggleLanguage}
          className="absolute top-6 right-6 p-2.5 rounded-full bg-gray-900/80 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-800 transition-all z-20 flex items-center gap-2"
          title={i18n.language === 'en' ? t('switch_to_zh') : t('switch_to_en')}
      >
          <Globe size={18} />
          <span className="text-xs font-medium uppercase tracking-wider">{i18n.language === 'en' ? 'EN' : '中'}</span>
      </button>

      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px]"></div>
      </div>

      <div className="text-center z-10 max-w-2xl mb-12">
          <div className="inline-flex items-center justify-center p-3 bg-gray-900 rounded-2xl mb-6 shadow-2xl border border-gray-800">
             <Video className="text-blue-500 mr-2" size={32} />
             <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">{t('app_title')}</h1>
          </div>
          <h2 className="text-5xl font-extrabold mb-6 tracking-tight leading-tight">
            {t('hero_title')} <br/>
            <span className="text-gray-500">{t('hero_subtitle')}</span>
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            {t('hero_description')}
          </p>
          
          {/* Username Input */}
          <div className="relative max-w-sm mx-auto group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="text-gray-500 group-focus-within:text-purple-400 transition-colors" size={20} />
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('enter_name_placeholder')}
              className="w-full bg-gray-900/80 border border-gray-700 text-white text-sm rounded-xl focus:ring-purple-500 focus:border-purple-500 block w-full pl-10 p-4 transition-all outline-none placeholder-gray-500 hover:border-gray-600"
            />
          </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl w-full z-10 px-4 md:px-0">
        {/* Jitsi Card - Highlighted as Best for Instant */}
        <div 
            className="group relative bg-gray-900/50 backdrop-blur-xl p-8 rounded-3xl border border-gray-800 hover:border-purple-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-900/20 cursor-pointer flex flex-col gap-4 overflow-hidden" 
            onClick={() => handleModeSelect('jitsi')}
        >
            <div className="absolute top-0 right-0 bg-purple-600/90 text-white text-[10px] font-bold px-3 py-1.5 rounded-bl-xl uppercase tracking-wider">{t('recommended_badge')}</div>
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Zap className="text-purple-400" size={24} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">{t('jitsi_card_title')}</h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                    {t('jitsi_card_desc')}
                </p>
            </div>
            <div className="mt-auto pt-4 flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">{t('jitsi_card_footer')}</span>
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-purple-600 transition-colors">
                    <ArrowRight size={14} className="text-white" />
                </div>
            </div>
        </div>

        {/* Agora Card */}
        <div 
            className="group relative bg-gray-900/50 backdrop-blur-xl p-8 rounded-3xl border border-gray-800 hover:border-blue-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-900/20 cursor-pointer flex flex-col gap-4" 
            onClick={() => handleModeSelect('agora')}
        >
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Cloud className="text-blue-400" size={24} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">{t('agora_card_title')}</h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                    {t('agora_card_desc')}
                </p>
            </div>
            <div className="mt-auto pt-4 flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">{t('agora_card_footer')}</span>
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                    <ArrowRight size={14} className="text-white" />
                </div>
            </div>
        </div>

        {/* WebRTC Card */}
        <div 
            className="group relative bg-gray-900/50 backdrop-blur-xl p-8 rounded-3xl border border-gray-800 hover:border-green-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-green-900/20 cursor-pointer flex flex-col gap-4" 
            onClick={() => handleModeSelect('webrtc')}
        >
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Server className="text-green-400" size={24} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-green-300 transition-colors">{t('webrtc_card_title')}</h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                    {t('webrtc_card_desc')}
                </p>
            </div>
            <div className="mt-auto pt-4 flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">{t('webrtc_card_footer')}</span>
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-green-600 transition-colors">
                    <ArrowRight size={14} className="text-white" />
                </div>
            </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-20 text-gray-600 text-sm flex flex-col items-center gap-4">
        <p>{t('footer_text')}</p>
        <button 
          onClick={() => setMode('admin')}
          className="flex items-center gap-2 text-xs text-gray-700 hover:text-blue-500 transition-colors"
        >
          <Shield size={12} />
          Admin Portal
        </button>
      </div>
    </div>
  );
}

export default App;
