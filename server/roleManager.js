const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const ROLES_FILE = path.join(DATA_DIR, 'roles.json');
const LOGS_FILE = path.join(DATA_DIR, 'audit_logs.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default Roles Configuration
const DEFAULT_ROLES = {
  creator: {
    name: 'Creator',
    description: 'Room Creator with absolute control',
    color: '#ff0000',
    permissions: {
      canManageRoles: true,
      canMuteOthers: true,
      canKickUsers: true,
      canRecord: true,
      canShareScreen: true,
      canChat: true,
      canCloseRoom: true
    },
    inherits: 'admin'
  },
  admin: {
    name: 'Admin',
    description: 'System Administrator with full access',
    color: '#800080',
    permissions: {
      canManageRoles: true,
      canMuteOthers: true,
      canKickUsers: true,
      canRecord: true,
      canShareScreen: true,
      canChat: true,
      canCloseRoom: false
    },
    inherits: null
  },
  host: {
    name: 'Host',
    description: 'Meeting Host',
    color: '#00ff00',
    permissions: {
      canManageRoles: false,
      canMuteOthers: true,
      canKickUsers: true,
      canRecord: true,
      canShareScreen: true,
      canChat: true
    },
    inherits: 'participant'
  },
  participant: {
    name: 'Participant',
    description: 'Regular meeting attendee',
    color: '#0000ff',
    permissions: {
      canManageRoles: false,
      canMuteOthers: false,
      canKickUsers: false,
      canRecord: false,
      canShareScreen: true,
      canChat: true
    },
    inherits: null
  }
};

// Initialize files if not exist
if (!fs.existsSync(ROLES_FILE)) {
  fs.writeFileSync(ROLES_FILE, JSON.stringify(DEFAULT_ROLES, null, 2));
}

if (!fs.existsSync(LOGS_FILE)) {
  fs.writeFileSync(LOGS_FILE, JSON.stringify([], null, 2));
}

class RoleManager {
  constructor() {
    this.roles = JSON.parse(fs.readFileSync(ROLES_FILE));
    this.logs = JSON.parse(fs.readFileSync(LOGS_FILE));
  }

  getRoles() {
    return this.roles;
  }

  getRole(roleName) {
    return this.roles[roleName];
  }

  updateRole(managerRole, targetRoleName, updates) {
    // 1. Check Manager Permissions
    if (!this.roles[managerRole] || !this.roles[managerRole].permissions.canManageRoles) {
      throw new Error('Access Denied: Insufficient permissions');
    }

    if (!this.roles[targetRoleName]) {
      throw new Error('Target role not found');
    }

    const oldRole = JSON.parse(JSON.stringify(this.roles[targetRoleName]));
    
    // 2. Update Role (Isolation & Inheritance handling could be here)
    // For now, we apply updates directly to the target role
    this.roles[targetRoleName] = {
      ...this.roles[targetRoleName],
      ...updates,
      permissions: {
        ...this.roles[targetRoleName].permissions,
        ...(updates.permissions || {})
      }
    };

    // 3. Persist
    this._saveRoles();

    // 4. Log Operation
    this._logOperation(managerRole, 'UPDATE_ROLE', {
      target: targetRoleName,
      changes: updates,
      previous: oldRole
    });

    return this.roles[targetRoleName];
  }

  getLogs() {
    return this.logs;
  }

  _saveRoles() {
    fs.writeFileSync(ROLES_FILE, JSON.stringify(this.roles, null, 2));
  }

  _logOperation(actor, action, details) {
    const logEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      actor,
      action,
      details
    };
    this.logs.unshift(logEntry); // Newest first
    // Limit logs to 100
    if (this.logs.length > 100) this.logs.pop();
    
    fs.writeFileSync(LOGS_FILE, JSON.stringify(this.logs, null, 2));
  }
}

module.exports = new RoleManager();
