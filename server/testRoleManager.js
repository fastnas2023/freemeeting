const assert = require('assert');
const fs = require('fs');
const path = require('path');
const roleManager = require('./roleManager');

const ROLES_FILE = path.join(__dirname, 'roles.json');
const LOGS_FILE = path.join(__dirname, 'audit_logs.json');

console.log('--- Starting Role Manager Tests ---');

// Backup original files
let originalRoles = null;
let originalLogs = null;

try {
  if (fs.existsSync(ROLES_FILE)) originalRoles = fs.readFileSync(ROLES_FILE);
  if (fs.existsSync(LOGS_FILE)) originalLogs = fs.readFileSync(LOGS_FILE);
} catch (e) {
  console.warn('Could not backup files', e);
}

try {
  // TEST 1: Verify Default Roles
  console.log('Test 1: Verify Default Roles...');
  const roles = roleManager.getRoles();
  assert.ok(roles.admin, 'Admin role should exist');
  assert.ok(roles.host, 'Host role should exist');
  assert.ok(roles.participant, 'Participant role should exist');
  console.log('✅ Passed');

  // TEST 2: Update Role Permission
  console.log('Test 2: Update Role Permission (Host canRecord -> false)...');
  const updatedHost = roleManager.updateRole('admin', 'host', {
    permissions: { canRecord: false }
  });
  assert.strictEqual(updatedHost.permissions.canRecord, false, 'Host permission should be updated');
  
  // Verify persistence in memory
  const rolesAfterUpdate = roleManager.getRoles();
  assert.strictEqual(rolesAfterUpdate.host.permissions.canRecord, false, 'In-memory role should be updated');
  console.log('✅ Passed');

  // TEST 3: Access Control (Participant cannot manage roles)
  console.log('Test 3: Access Control (Participant cannot manage roles)...');
  try {
    roleManager.updateRole('participant', 'host', { permissions: { canRecord: true } });
    assert.fail('Should have thrown an error');
  } catch (err) {
    assert.strictEqual(err.message, 'Access Denied: Insufficient permissions');
  }
  console.log('✅ Passed');

  // TEST 4: Audit Logging
  console.log('Test 4: Audit Logging...');
  const logs = roleManager.getLogs();
  const lastLog = logs[0];
  assert.strictEqual(lastLog.action, 'UPDATE_ROLE', 'Last log action should be UPDATE_ROLE');
  assert.strictEqual(lastLog.actor, 'admin', 'Last log actor should be admin');
  assert.strictEqual(lastLog.details.target, 'host', 'Last log target should be host');
  console.log('✅ Passed');

  // TEST 5: Role Clarity Enhancement Data
  console.log('Test 5: Verify Clarity Enhancement Data (Color & Description)...');
  const adminRole = roleManager.getRole('admin');
  assert.ok(adminRole.color, 'Role should have a color property');
  assert.ok(adminRole.description, 'Role should have a description');
  console.log('✅ Passed');

  console.log('--- All Tests Passed Successfully ---');

} catch (err) {
  console.error('❌ Test Failed:', err);
  process.exit(1);
} finally {
  // Restore original files
  if (originalRoles) fs.writeFileSync(ROLES_FILE, originalRoles);
  if (originalLogs) fs.writeFileSync(LOGS_FILE, originalLogs);
  console.log('--- Environment Restored ---');
}
