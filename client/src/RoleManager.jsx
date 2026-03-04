import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Users, 
  Settings, 
  Save, 
  History, 
  Check, 
  X, 
  AlertTriangle,
  Lock,
  Eye,
  Edit3
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

const RoleManager = ({ onBack }) => {
  const [roles, setRoles] = useState({});
  const [selectedRole, setSelectedRole] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('roles'); // 'roles' or 'logs'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'success', 'error'

  // Simulate current user being an Admin
  const currentUserRole = 'admin'; 

  useEffect(() => {
    fetchRoles();
    fetchLogs();
  }, []);

  const fetchRoles = async () => {
    try {
      const res = await fetch(`${API_URL}/api/roles`);
      const data = await res.json();
      setRoles(data);
      if (!selectedRole && Object.keys(data).length > 0) {
        setSelectedRole(Object.keys(data)[0]);
      }
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch roles');
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/logs`);
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  };

  const handlePermissionChange = (roleKey, permissionKey, value) => {
    setRoles(prev => ({
      ...prev,
      [roleKey]: {
        ...prev[roleKey],
        permissions: {
          ...prev[roleKey].permissions,
          [permissionKey]: value
        }
      }
    }));
  };

  const handleSave = async () => {
    if (!selectedRole) return;
    setSaveStatus('saving');
    
    try {
      const roleData = roles[selectedRole];
      const res = await fetch(`${API_URL}/api/roles/${selectedRole}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managerRole: currentUserRole,
          updates: roleData
        })
      });

      if (!res.ok) throw new Error('Failed to update');
      
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
      fetchLogs(); // Refresh logs
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  if (loading) return <div className="p-8 text-white">Loading Role Manager...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <header className="mb-8 flex items-center justify-between border-b border-gray-800 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 mr-2 text-gray-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
          <Shield className="text-blue-500" size={32} />
          <div>
            <h1 className="text-2xl font-bold">Role Management System</h1>
            <p className="text-gray-400 text-sm">Configure permissions and access levels</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${activeTab === 'roles' ? 'bg-blue-600' : 'hover:bg-gray-800'}`}
          >
            <Users size={18} /> Roles
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${activeTab === 'logs' ? 'bg-blue-600' : 'hover:bg-gray-800'}`}
          >
            <History size={18} /> Audit Logs
          </button>
        </div>
      </header>

      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar: Role List */}
          <div className="lg:col-span-1 space-y-3">
            {Object.entries(roles).map(([key, role]) => (
              <button
                key={key}
                onClick={() => setSelectedRole(key)}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group relative overflow-hidden ${
                  selectedRole === key 
                    ? 'bg-gray-800 border-blue-500 shadow-lg shadow-blue-900/20' 
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600 hover:bg-gray-800'
                }`}
              >
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1 transition-all" 
                  style={{ backgroundColor: role.color }}
                />
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-lg">{role.name}</span>
                  {role.inherits && (
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400" title={`Inherits from ${role.inherits}`}>
                       ↳ {role.inherits}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 truncate">{role.description}</p>
              </button>
            ))}
          </div>

          {/* Main Content: Role Details */}
          <div className="lg:col-span-3 bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-xl">
            {selectedRole && roles[selectedRole] ? (
              <div className="space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-3xl font-bold flex items-center gap-3">
                      <span 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: roles[selectedRole].color }}
                      />
                      {roles[selectedRole].name}
                      <span className="text-sm font-normal text-gray-400 bg-gray-900 px-3 py-1 rounded-full border border-gray-700">
                        {selectedRole}
                      </span>
                    </h2>
                    <p className="text-gray-400 mt-2">{roles[selectedRole].description}</p>
                  </div>
                  <button 
                    onClick={handleSave}
                    disabled={saveStatus === 'saving'}
                    className={`px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${
                      saveStatus === 'success' ? 'bg-green-600' :
                      saveStatus === 'error' ? 'bg-red-600' :
                      'bg-blue-600 hover:bg-blue-500'
                    }`}
                  >
                    {saveStatus === 'saving' ? 'Saving...' : 
                     saveStatus === 'success' ? <><Check size={18} /> Saved</> : 
                     saveStatus === 'error' ? <><AlertTriangle size={18} /> Error</> : 
                     <><Save size={18} /> Save Changes</>}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                  {Object.entries(roles[selectedRole].permissions).map(([perm, value]) => (
                    <div 
                      key={perm}
                      className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
                        value 
                          ? 'bg-blue-500/10 border-blue-500/30' 
                          : 'bg-gray-900/50 border-gray-700 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {value ? <Check className="text-blue-400" size={20} /> : <X className="text-gray-500" size={20} />}
                        <span className="font-medium">{perm.replace(/([A-Z])/g, ' $1').trim()}</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={value}
                          onChange={(e) => handlePermissionChange(selectedRole, perm, e.target.checked)}
                          disabled={selectedRole === 'admin' && perm === 'canManageRoles'} // Prevent locking out admin
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  ))}
                </div>

                {/* Clarity Enhancement: Visualization */}
                <div className="mt-8 p-6 bg-gray-900/50 rounded-xl border border-gray-700">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Eye size={20} className="text-purple-400" />
                    Permission Visibility Preview
                  </h3>
                  <div className="flex gap-4 flex-wrap">
                    {Object.entries(roles[selectedRole].permissions)
                      .filter(([_, val]) => val)
                      .map(([perm]) => (
                        <span key={perm} className="px-3 py-1 bg-blue-900/30 text-blue-300 rounded-lg text-sm border border-blue-800/50">
                          {perm}
                        </span>
                      ))}
                    {Object.values(roles[selectedRole].permissions).every(v => !v) && (
                      <span className="text-gray-500 italic">No active permissions</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-500">
                <Settings size={48} className="mb-4 opacity-50" />
                <p>Select a role to configure</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-gray-700">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <History className="text-orange-400" />
              Operation Audit Log
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-sm text-gray-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded text-xs font-bold border border-blue-800/50">
                        {log.actor}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-white">
                      {log.action}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {log.details.target && (
                        <span className="text-yellow-400 font-mono mr-2">
                          [{log.details.target}]
                        </span>
                      )}
                      <span className="opacity-80">
                        Updated {Object.keys(log.details.changes?.permissions || {}).length} permissions
                      </span>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      No logs available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManager;
