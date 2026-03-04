const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const roleManager = require('./roleManager');

const app = express();
app.use(cors());
app.use(express.json()); // Enable JSON body parsing

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
}

// --- Role Management API ---

// Get all roles
app.get('/api/roles', (req, res) => {
  try {
    const roles = roleManager.getRoles();
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a role
app.post('/api/roles/:targetRole', (req, res) => {
  const { targetRole } = req.params;
  const { managerRole, updates } = req.body; // In real app, managerRole comes from Auth token

  try {
    const updatedRole = roleManager.updateRole(managerRole, targetRole, updates);
    res.json(updatedRole);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// Get audit logs
app.get('/api/logs', (req, res) => {
  try {
    const logs = roleManager.getLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get active rooms
app.get('/api/rooms', (req, res) => {
  try {
    const roomList = Object.entries(rooms).map(([roomId, data]) => {
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      return {
        roomId,
        creator: data.creator, // userId
        creatorName: data.creatorName || 'Unknown',
        createdAt: data.createdAt,
        userCount: roomSockets ? roomSockets.size : 0
      };
    });
    res.json(roomList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------

// Agora Token Endpoint
app.get('/rtctoken', (req, resp) => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  const channelName = req.query.channel;
  
  if (!appId || !appCertificate) {
    return resp.status(500).json({ 'error': 'Agora environment variables not configured' });
  }

  if (!channelName) {
    return resp.status(400).json({ 'error': 'channel is required' });
  }

  // Simple Password Check
  const password = req.query.password;
  const serverPassword = process.env.MEETING_PASSWORD;
  if (serverPassword && password !== serverPassword) {
      return resp.status(401).json({ 'error': 'Invalid meeting password' });
  }

  let uid = req.query.uid;
  if (!uid || uid === '') {
    uid = 0;
  }
  
  let role = RtcRole.PUBLISHER;
  if (req.query.role === 'subscriber') {
    role = RtcRole.SUBSCRIBER;
  }
  
  let expireTime = req.query.expiry;
  if (!expireTime || expireTime === '') {
    expireTime = 3600;
  } else {
    expireTime = parseInt(expireTime, 10);
  }
  
  const currentTime = Math.floor(Date.now() / 1000);
  const privilegeExpireTime = currentTime + expireTime;
  
  let token;
  try {
      token = RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, uid, role, privilegeExpireTime);
      return resp.json({ 'rtcToken': token, 'appId': appId });
  } catch (err) {
      console.error(err);
      return resp.status(500).json({ 'error': 'Failed to generate token' });
  }
});

// Serve React App in Production
if (process.env.NODE_ENV === 'production') {
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // In production, replace with your client URL
    methods: ['GET', 'POST']
  }
});

// Store room state if needed, but for now we rely on socket.io rooms
// Room metadata: { roomId: { creator: userId, createdAt: timestamp } }
const rooms = {};

// In-memory role mapping: { roomId: { userId: roleName } }
const roomRoles = {};

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('join-room', (roomId, userId, username) => {
    // Leave previous rooms if any (optional, depending on use case)
    // Array.from(socket.rooms).forEach(room => {
    //   if (room !== socket.id) socket.leave(room);
    // });

    console.log(`User ${userId} (${username}) joining room ${roomId}`);
    
    // Initialize room metadata if not exists
    if (!rooms[roomId]) {
      console.log(`Creating new room ${roomId} with creator ${userId}`);
      rooms[roomId] = {
        creator: userId,
        creatorName: username,
        createdAt: Date.now()
      };
    }

    // Determine Role
    let assignedRole = 'participant';
    if (!roomRoles[roomId]) {
      roomRoles[roomId] = {};
    }

    // Check if user is the creator
    if (rooms[roomId].creator === userId) {
      assignedRole = 'creator';
    } else {
      // Check if room has any users (using socket.io adapter)
      // Fallback for legacy logic or if creator logic fails: first user is admin/creator
      const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      if (roomSize === 0 && !rooms[roomId].creator) {
         // Should not happen if we just created it above, but good for safety
         rooms[roomId].creator = userId;
         assignedRole = 'creator';
      }
    }
    
    console.log(`Assigning role ${assignedRole} to user ${userId} in room ${roomId}`);

    // Store role
    roomRoles[roomId][userId] = assignedRole;

    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);
    
    // Emit assigned role to the user
    socket.emit('role-assigned', assignedRole);
    
    // Emit room info including creator
    socket.emit('room-info', {
      creator: rooms[roomId].creator,
      createdAt: rooms[roomId].createdAt,
      isCreator: rooms[roomId].creator === userId
    });

    // Store metadata on socket for disconnect handling
    socket.userData = { roomId, userId, username };
  });

  // Role Management Signaling
  socket.on('update-role', ({ targetUserId, newRole }) => {
    console.log(`[Role] update-role request from ${socket.id} for ${targetUserId} to ${newRole}`);
    const { roomId, userId } = socket.userData || {};
    if (!roomId || !userId) {
        console.log(`[Role] update-role failed: missing userData`, socket.userData);
        return;
    }

    // Verify requester is admin or creator
    const requesterRole = roomRoles[roomId]?.[userId];
    console.log(`[Role] requester ${userId} role: ${requesterRole}`);
    
    if (requesterRole !== 'admin' && requesterRole !== 'creator') {
      socket.emit('error', 'Unauthorized: Only admins/creators can change roles');
      return;
    }

    // Update state
    if (roomRoles[roomId]) {
      roomRoles[roomId][targetUserId] = newRole;
    }

    // Broadcast update to room (so everyone updates UI)
    io.to(roomId).emit('role-updated', { userId: targetUserId, newRole });
  });

  socket.on('kick-user', ({ targetUserId }) => {
    console.log(`[Role] kick-user request from ${socket.id} for ${targetUserId}`);
    const { roomId, userId } = socket.userData || {};
    if (!roomId || !userId) {
        console.log(`[Role] kick-user failed: missing userData`, socket.userData);
        return;
    }

    const requesterRole = roomRoles[roomId]?.[userId];
    console.log(`[Role] requester ${userId} role: ${requesterRole}`);

    // Check permissions (Creator can kick anyone, Admin can kick participants)
    // For now, allow both to kick for simplicity, or restrict based on target role if needed
    if (requesterRole !== 'admin' && requesterRole !== 'creator') {
      socket.emit('error', 'Unauthorized: Insufficient permissions');
      return;
    }

    // Broadcast kick event to the room so everyone knows (and target client handles disconnect)
    io.to(roomId).emit('user-kicked', { targetUserId });
    console.log(`[Role] user-kicked emitted to room ${roomId}`);
  });

  socket.on('mute-user', ({ targetUserId, kind }) => { // kind: 'audio' | 'video'
    console.log(`[Role] mute-user request from ${socket.id} for ${targetUserId} (${kind})`);
    const { roomId, userId } = socket.userData || {};
    if (!roomId || !userId) {
        console.log(`[Role] mute-user failed: missing userData`, socket.userData);
        return;
    }

    const requesterRole = roomRoles[roomId]?.[userId];
    console.log(`[Role] requester ${userId} role: ${requesterRole}`);

    // Check permissions (Admin or Creator can mute)
    if (requesterRole !== 'admin' && requesterRole !== 'creator') {
      socket.emit('error', 'Unauthorized: Insufficient permissions');
      return;
    }

    // Broadcast mute event (target client will disable track)
    io.to(roomId).emit('user-muted', { targetUserId, kind });
    console.log(`[Role] user-muted emitted to room ${roomId}`);
  });

  socket.on('close-room', () => {
    console.log(`[Role] close-room request from ${socket.id}`);
    const { roomId, userId } = socket.userData || {};
    if (!roomId || !userId) return;

    // Only Creator can close room
    if (rooms[roomId]?.creator !== userId) {
        socket.emit('error', 'Unauthorized: Only creator can close the room');
        return;
    }

    // Broadcast room closed event
    io.to(roomId).emit('room-closed');
    
    // Cleanup
    delete rooms[roomId];
    delete roomRoles[roomId];
    
    // Disconnect all sockets in room? Or let client handle redirection.
    // Ideally, client receives 'room-closed' and redirects to home.
  });

  // Signaling: Offer
  socket.on('offer', (payload) => {
    // Payload: { target, sdp, sender }
    io.to(payload.target).emit('offer', payload);
  });

  // Signaling: Answer
  socket.on('answer', (payload) => {
    // Payload: { target, sdp, sender }
    io.to(payload.target).emit('answer', payload);
  });

  // Signaling: ICE Candidate
  socket.on('ice-candidate', (payload) => {
    // Payload: { target, candidate, sender }
    io.to(payload.target).emit('ice-candidate', payload);
  });

  socket.on('disconnect', () => {
    const { roomId, userId } = socket.userData || {};
    
    if (roomId && userId) {
      console.log(`User ${userId} disconnected from room ${roomId}`);
      
      // Handle Creator Departure
      if (rooms[roomId] && rooms[roomId].creator === userId) {
        console.log(`Creator ${userId} left room ${roomId}. Transferring ownership...`);
        
        // Get remaining users in the room
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        let newCreatorId = null;

        if (roomSockets && roomSockets.size > 0) {
            // Pick the first available socket as new creator
            // In a real app, we might check join time or other metrics
            // roomSockets is a Set of socket IDs. We need to map to user IDs if possible, 
            // but our userData is on socket. We need to find the socket that is NOT the current one (which is disconnecting).
            // Actually, 'disconnect' fires, the socket is still in the room? 
            // No, socket.io removes it automatically? It depends on timing.
            // Usually 'disconnecting' has rooms, 'disconnect' might not.
            // But we have roomRoles which has userIds.
            
            const remainingUserIds = Object.keys(roomRoles[roomId] || {}).filter(uid => uid !== userId);
            
            if (remainingUserIds.length > 0) {
                // Pick the first one (arbitrary transfer)
                newCreatorId = remainingUserIds[0];
                
                // Find socket for newCreatorId to get username
                const roomSockets = io.sockets.adapter.rooms.get(roomId);
                let newCreatorName = 'Unknown';
                if (roomSockets) {
                    for (const socketId of roomSockets) {
                        const s = io.sockets.sockets.get(socketId);
                        if (s && s.userData && s.userData.userId === newCreatorId) {
                            newCreatorName = s.userData.username;
                            break;
                        }
                    }
                }
                
                rooms[roomId].creator = newCreatorId;
                rooms[roomId].creatorName = newCreatorName;
                roomRoles[roomId][newCreatorId] = 'creator';
                
                console.log(`Transferred ownership to ${newCreatorId} (${newCreatorName})`);
                
                // Notify everyone
                io.to(roomId).emit('room-info', {
                    creator: newCreatorId,
                    creatorName: newCreatorName,
                    createdAt: rooms[roomId].createdAt
                });
                io.to(roomId).emit('role-updated', { userId: newCreatorId, newRole: 'creator' });
                io.to(roomId).emit('notification', `Host left. Ownership transferred to ${newCreatorId}`);
            } else {
                console.log(`No users left in room ${roomId}. Deleting room.`);
                delete rooms[roomId];
            }
        } else {
             // Room is empty
             delete rooms[roomId];
        }
      }

      // Clean up role data
      if (roomRoles[roomId]) {
        delete roomRoles[roomId][userId];
        if (Object.keys(roomRoles[roomId]).length === 0) {
          delete roomRoles[roomId];
          if (rooms[roomId]) delete rooms[roomId]; // Double check cleanup
        }
      }

      console.log(`Broadcasting user-disconnected for ${userId} to room ${roomId}`);
      io.to(roomId).emit('user-disconnected', userId);
    } else {
      console.log('User disconnected (not in room):', socket.id);
    }
  });
});

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
