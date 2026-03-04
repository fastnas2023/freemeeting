import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import io from 'socket.io-client';
import { Mic, MicOff, Monitor, MonitorOff, PhoneOff, Users, Copy, Check, AlertTriangle, Loader2, Wifi, WifiOff, Settings, Video as VideoIcon, Volume2, StopCircle, SignalLow, Shield, UserX, Crown, VolumeX, Edit, RefreshCw, Clock } from 'lucide-react';
import { Loader } from './UI';

// Use relative path for socket.io to leverage Vite proxy in dev and same-origin in prod
const socket = io();

const stunServers = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
      ],
    },
  ],
};

function WebRTCMeeting({ onBack, addToast, username }) {
  const { t } = useTranslation();
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [uiState, setUiState] = useState('welcome'); // 'welcome', 'setup', 'meeting'
  const [isSharing, setIsSharing] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [copied, setCopied] = useState(false);
  const [signalingState, setSignalingState] = useState('connected'); // connected, disconnected
  const [connectionStatus, setConnectionStatus] = useState('new'); // new, checking, connected, failed, disconnected

  // Device Setup State
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicId, setSelectedMicId] = useState('');
  const [volumeLevel, setVolumeLevel] = useState(0);
  
  // Screen Share Preview State
  const [sharePreviewStream, setSharePreviewStream] = useState(null);
  const [isSharePreviewOpen, setIsSharePreviewOpen] = useState(false);
  const [isLowDataMode, setIsLowDataMode] = useState(false);

  // Role Management State
  const [myRole, setMyRole] = useState('participant');
  const [roleDefinitions, setRoleDefinitions] = useState({});
  const [remoteRoles, setRemoteRoles] = useState({}); // { socketId: roleName }
  const [roomCreator, setRoomCreator] = useState(null);
  const [isCreator, setIsCreator] = useState(false);
  const [activeRooms, setActiveRooms] = useState([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);

  useEffect(() => {
    if (uiState === 'welcome') {
      fetchActiveRooms();
      const interval = setInterval(fetchActiveRooms, 5000);
      return () => clearInterval(interval);
    }
  }, [uiState]);

  const fetchActiveRooms = () => {
    setIsLoadingRooms(true);
    fetch('/api/rooms')
      .then(res => res.json())
      .then(data => {
        setActiveRooms(data);
        setIsLoadingRooms(false);
      })
      .catch(err => {
        console.error('Failed to load rooms:', err);
        setIsLoadingRooms(false);
      });
  };

  const localVideoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const peersRef = useRef({}); // { socketId: RTCPeerConnection }
  const localStreamRef = useRef(null); // Combined stream (video + audio)
  const audioStreamRef = useRef(null); // Separate audio stream from mic
  const videoStreamRef = useRef(null); // Separate video stream from camera
  const screenStreamRef = useRef(null); // Separate video stream from screen share
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const volumeIntervalRef = useRef(null);

  useEffect(() => {
    // Fetch role definitions
    fetch('/api/roles')
      .then(res => res.json())
      .then(data => {
        setRoleDefinitions(data);
        console.log('Role definitions loaded:', data);
      })
      .catch(err => console.error('Failed to load roles:', err));

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      setSignalingState('connected');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      setSignalingState('disconnected');
      addToast(t('disconnected_signaling'), 'error');
    });

    socket.on('connect_error', (err) => {
      console.error('Signaling server connection error:', err);
      setSignalingState('disconnected');
      addToast(t('signaling_error'), 'error');
    });

    socket.on('role-assigned', (role) => {
      console.log('Role assigned:', role);
      setMyRole(role);
      addToast(t('role_assigned') + `: ${role}`, 'info');
    });

    socket.on('role-updated', ({ userId, newRole }) => {
      if (userId === socket.id) {
        setMyRole(newRole);
        addToast(t('role_changed_to') + ` ${newRole}`, 'info');
      } else {
        setRemoteRoles(prev => ({
          ...prev,
          [userId]: newRole
        }));
      }
    });

    socket.on('room-info', (roomInfo) => {
      setRoomCreator(roomInfo.creator);
      setIsCreator(roomInfo.creator === socket.id);
    });

    socket.on('room-closed', () => {
      addToast(t('room_closed'), 'error');
      onBack();
    });

    socket.on('user-kicked', ({ targetUserId }) => {
      if (targetUserId === socket.id) {
        // Cleanup streams
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        addToast(t('you_were_kicked'), 'error');
        onBack();
      } else {
        addToast(t('user_kicked_msg'), 'info');
      }
    });

    socket.on('user-muted', ({ targetUserId, kind }) => {
      if (targetUserId === socket.id) {
        if (kind === 'audio') {
          if (localStreamRef.current) {
              localStreamRef.current.getAudioTracks().forEach(track => track.enabled = false);
          }
          setIsAudioEnabled(false);
          addToast(t('you_were_muted_audio'), 'warning');
        } else if (kind === 'video') {
          if (localStreamRef.current) {
              localStreamRef.current.getVideoTracks().forEach(track => track.enabled = false);
          }
          setIsVideoEnabled(false);
          addToast(t('you_were_muted_video'), 'warning');
        }
      }
    });

    socket.on('user-connected', (userId) => {
      console.log('User connected:', userId);
      createPeerConnection(userId, true);
    });

    socket.on('user-disconnected', (userId) => {
      console.log('User disconnected:', userId);
      addToast(t('user_left_msg', { userId }), 'info'); // Add toast
      
      if (peersRef.current[userId]) {
        peersRef.current[userId].close();
        delete peersRef.current[userId];
      }
      
      // Always try to remove from remoteStreams to ensure UI updates
      setRemoteStreams((prev) => {
        const newStreams = { ...prev };
        if (newStreams[userId]) {
            delete newStreams[userId];
        }
        return newStreams;
      });
      
      // Also clean up roles
      setRemoteRoles(prev => {
        const newRoles = { ...prev };
        delete newRoles[userId];
        return newRoles;
      });
    });

    socket.on('offer', async (payload) => {
      console.log('Received offer from:', payload.sender);
      const pc = createPeerConnection(payload.sender, false);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { target: payload.sender, sdp: answer, sender: socket.id });
    });

    socket.on('answer', async (payload) => {
      console.log('Received answer from:', payload.sender);
      const pc = peersRef.current[payload.sender];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      }
    });

    socket.on('ice-candidate', async (payload) => {
      const pc = peersRef.current[payload.sender];
      if (pc && payload.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.error('Error adding received ice candidate', e);
        }
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('role-assigned');
      socket.off('role-updated');
      socket.off('room-info');
      socket.off('room-closed');
      socket.off('user-kicked');
      socket.off('user-muted');
      socket.off('user-connected');
      socket.off('user-disconnected');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');

      // Cleanup local media and connections on unmount
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      Object.values(peersRef.current).forEach(pc => pc.close());
      peersRef.current = {};
    };
  }, []);

  useEffect(() => {
    // Get Devices
    const getDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            setCameras(devices.filter(d => d.kind === 'videoinput'));
            setMics(devices.filter(d => d.kind === 'audioinput'));
        } catch (e) {
            console.error("Error enumerating devices:", e);
        }
    };
    getDevices();

    // Permissions change listener
    navigator.mediaDevices.ondevicechange = getDevices;

    return () => {
        navigator.mediaDevices.ondevicechange = null;
        stopPreview();
    };
  }, []);

  useEffect(() => {
      if (uiState === 'setup') {
          startPreview();
      } else {
          stopPreview();
      }
  }, [uiState, selectedCameraId, selectedMicId, isLowDataMode]);

  const startPreview = async () => {
      try {
          if (videoStreamRef.current) {
              videoStreamRef.current.getTracks().forEach(t => t.stop());
          }
          if (audioStreamRef.current) {
              audioStreamRef.current.getTracks().forEach(t => t.stop());
          }

          const constraints = {
              video: {
                  deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
                  width: isLowDataMode ? { ideal: 320 } : { ideal: 1280 },
                  height: isLowDataMode ? { ideal: 240 } : { ideal: 720 },
                  frameRate: isLowDataMode ? { ideal: 15 } : { ideal: 30 }
              },
              audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
          };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          
          // Video Preview
          videoStreamRef.current = new MediaStream(stream.getVideoTracks());
          if (previewVideoRef.current) {
              previewVideoRef.current.srcObject = videoStreamRef.current;
          }

          // Audio Volume Meter
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
              audioStreamRef.current = new MediaStream([audioTrack]);
              
              const audioContext = new (window.AudioContext || window.webkitAudioContext)();
              const source = audioContext.createMediaStreamSource(audioStreamRef.current);
              const analyser = audioContext.createAnalyser();
              analyser.fftSize = 256;
              source.connect(analyser);
              
              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              
              if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
              
              volumeIntervalRef.current = setInterval(() => {
                  analyser.getByteFrequencyData(dataArray);
                  const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                  setVolumeLevel(Math.min(100, average * 2)); // Amplify a bit
              }, 100);
          }

      } catch (e) {
          console.error("Error starting preview:", e);
          // Don't show toast here to avoid spam on initial load if permission denied
      }
  };

  const stopPreview = () => {
      if (videoStreamRef.current) {
          videoStreamRef.current.getTracks().forEach(t => t.stop());
          videoStreamRef.current = null;
      }
      if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(t => t.stop());
          audioStreamRef.current = null;
      }
      if (volumeIntervalRef.current) {
          clearInterval(volumeIntervalRef.current);
          volumeIntervalRef.current = null;
      }
      setVolumeLevel(0);
  };


  const createPeerConnection = (targetId, isInitiator) => {
    const pc = new RTCPeerConnection(stunServers);
    peersRef.current[targetId] = pc;
    pc.onconnectionstatechange = () => {
      console.log(`Connection state change for ${targetId}: ${pc.connectionState}`);
      setConnectionStatus(pc.connectionState);
      
      if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
          addToast(t('connection_lost', { targetId }), 'error');
          
          // Cleanup
          setRemoteStreams((prev) => {
              const newStreams = { ...prev };
              delete newStreams[targetId];
              return newStreams;
          });
          
          if (peersRef.current[targetId]) {
              delete peersRef.current[targetId];
          }
      }
    };

    // ICE Connection State Monitoring & Reconnection
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state change for ${targetId}: ${pc.iceConnectionState}`);
      
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
         // Aggressive cleanup on failure
         console.log(`ICE failed/closed for ${targetId}, cleaning up.`);
         
         setRemoteStreams((prev) => {
            const newStreams = { ...prev };
            delete newStreams[targetId];
            return newStreams;
        });

        if (peersRef.current[targetId]) {
             peersRef.current[targetId].close();
             delete peersRef.current[targetId];
        }
      } else if (pc.iceConnectionState === 'disconnected') {
        addToast(t('connection_unstable', { targetId }), 'warning');
        console.log(`Attempting ICE restart for ${targetId}`);
        // Only the initiator should restart ICE to avoid collisions
        if (isInitiator) {
          pc.createOffer({ iceRestart: true })
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              socket.emit('offer', {
                target: targetId,
                sdp: pc.localDescription,
                sender: socket.id,
              });
            })
            .catch((err) => console.error("Error restarting ICE:", err));
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          target: targetId,
          candidate: event.candidate,
          sender: socket.id,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote track from:', targetId);
      setRemoteStreams((prev) => ({
        ...prev,
        [targetId]: event.streams[0],
      }));
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    } else if (audioStreamRef.current) {
        // If we only have audio but no "combined" stream
        audioStreamRef.current.getTracks().forEach(track => pc.addTrack(track, audioStreamRef.current));
    }

    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('offer', {
            target: targetId,
            sdp: pc.localDescription,
            sender: socket.id,
          });
        });
    }

    return pc;
  };

  // Helper to add track to all peers
  const addTrackToPeers = (track, stream) => {
      Object.keys(peersRef.current).forEach((userId) => {
          const pc = peersRef.current[userId];
          const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
          
          if (sender) {
              sender.replaceTrack(track);
          } else {
              pc.addTrack(track, stream);
          }
          
          // Renegotiate
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              socket.emit('offer', {
                target: userId,
                sdp: pc.localDescription,
                sender: socket.id,
              });
            });
      });
  };

  // Helper to remove track from all peers
  const removeTrackFromPeers = (kind) => {
      Object.keys(peersRef.current).forEach((userId) => {
          const pc = peersRef.current[userId];
          const sender = pc.getSenders().find((s) => s.track?.kind === kind);
          if (sender) {
              pc.removeTrack(sender);
              
              // Renegotiate
              pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .then(() => {
                  socket.emit('offer', {
                    target: userId,
                    sdp: pc.localDescription,
                    sender: socket.id,
                  });
                });
          }
      });
  };

  const joinRoom = (id) => {
    const targetId = typeof id === 'string' ? id : roomId;
    if (targetId) {
      if (typeof id === 'string') setRoomId(id);
      setUiState('setup');
    } else {
        addToast(t('enter_room_id_error'), "error");
    }
  };

  const confirmJoin = async () => {
    setUiState('meeting');
    setJoined(true);

    // Initialize local stream with selected devices
    try {
        const constraints = {
            video: {
                deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
                width: isLowDataMode ? { ideal: 320 } : { ideal: 1280 },
                height: isLowDataMode ? { ideal: 240 } : { ideal: 720 },
                frameRate: isLowDataMode ? { ideal: 15 } : { ideal: 30 }
            },
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        
        // Split for refs
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        
        if (videoTrack) {
            videoStreamRef.current = new MediaStream([videoTrack]);
            setIsVideoEnabled(true);
        }
        if (audioTrack) {
            audioStreamRef.current = new MediaStream([audioTrack]);
            setIsAudioEnabled(true);
        }

        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
        }

    } catch (e) {
        console.error("Error getting user media on join:", e);
        addToast(t('device_access_error'), "error");
    }

    // Emit join after stream is ready so tracks can be added to peer connection immediately
    socket.emit('join-room', roomId, socket.id, username || 'Anonymous');
  };

  const toggleLowDataMode = async () => {
    const newMode = !isLowDataMode;
    
    // If just in setup mode, state change triggers useEffect which calls startPreview with new constraints
    if (uiState === 'setup') {
        setIsLowDataMode(newMode);
        return;
    }

    if (!isVideoEnabled) {
       setIsLowDataMode(newMode);
       addToast(newMode ? t('low_data_mode_on') : t('low_data_mode_off'), "info");
       return;
    }

    try {
        // Stop current video track
        if (videoStreamRef.current) {
             videoStreamRef.current.getTracks().forEach(t => t.stop());
        }

        const constraints = {
            video: {
                deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
                width: newMode ? { ideal: 320 } : { ideal: 1280 },
                height: newMode ? { ideal: 240 } : { ideal: 720 },
                frameRate: newMode ? { ideal: 15 } : { ideal: 30 }
            },
            audio: false 
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const newVideoTrack = stream.getVideoTracks()[0];

        if (newVideoTrack) {
            videoStreamRef.current = new MediaStream([newVideoTrack]);
            
            // Update local stream ref (which might have audio too)
            if (localStreamRef.current) {
                const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
                if (oldVideoTrack) {
                    localStreamRef.current.removeTrack(oldVideoTrack);
                    oldVideoTrack.stop();
                }
                localStreamRef.current.addTrack(newVideoTrack);
            }

            // Update local video preview
            if (localVideoRef.current) {
                 localVideoRef.current.srcObject = localStreamRef.current;
            }

            // Replace track for all peers
            Object.values(peersRef.current).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(newVideoTrack);
                }
            });
            
            setIsLowDataMode(newMode);
            addToast(newMode ? t('low_data_mode_on') : t('low_data_mode_off'), "info");
        }
    } catch (e) {
        console.error("Error switching quality:", e);
        addToast(t('switch_quality_error'), "error");
    }
  };

  const hasPermission = (permissionName) => {
    // If role definitions not loaded, default to false (safe fail)
    if (!roleDefinitions || !roleDefinitions[myRole]) return false;
    return roleDefinitions[myRole].permissions[permissionName] === true;
  };

  const handleKickUser = (targetUserId) => {
    if (!hasPermission('canKickUsers')) {
      addToast(t('permission_denied'), 'error');
      return;
    }
    socket.emit('kick-user', { targetUserId });
  };

  const handleMuteUser = (targetUserId, kind) => {
    if (!hasPermission('canMuteOthers')) {
      addToast(t('permission_denied'), 'error');
      return;
    }
    socket.emit('mute-user', { targetUserId, kind });
  };

  const handleUpdateRole = (targetUserId, currentRole) => {
    if (!hasPermission('canManageRoles')) {
      addToast(t('permission_denied'), 'error');
      return;
    }

    // Cycle: participant -> host -> admin -> participant
    let newRole = 'participant';
    if (currentRole === 'participant') newRole = 'host';
    else if (currentRole === 'host') newRole = 'admin';
    else if (currentRole === 'admin') newRole = 'participant';

    socket.emit('update-role', { targetUserId, newRole });
  };

  const handleCloseRoom = () => {
    socket.emit('close-room');
  };

  const toggleAudio = () => {
      if (isAudioEnabled) {
          if (localStreamRef.current) {
              localStreamRef.current.getAudioTracks().forEach(track => track.enabled = false);
          }
          setIsAudioEnabled(false);
      } else {
          if (localStreamRef.current) {
              localStreamRef.current.getAudioTracks().forEach(track => track.enabled = true);
          }
          setIsAudioEnabled(true);
      }
  };

  const toggleVideo = () => {
      if (isSharing) {
          // If sharing, only toggle the camera track state (which is currently not being sent)
          // so it's ready when sharing stops
          const newStatus = !isVideoEnabled;
          setIsVideoEnabled(newStatus);
          
          if (videoStreamRef.current) {
              videoStreamRef.current.getVideoTracks().forEach(track => track.enabled = newStatus);
          }
          return;
      }

      if (isVideoEnabled) {
          if (localStreamRef.current) {
              localStreamRef.current.getVideoTracks().forEach(track => track.enabled = false);
          }
          setIsVideoEnabled(false);
      } else {
          if (localStreamRef.current) {
              localStreamRef.current.getVideoTracks().forEach(track => track.enabled = true);
          }
          setIsVideoEnabled(true);
      }
  };

  const startScreenShare = async () => {
    if (!hasPermission('canShareScreen')) {
      addToast(t('permission_denied_screen_share'), 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); // Captures system audio too
      
      // Stop sharing if user cancels via browser UI
      stream.getVideoTracks()[0].onended = () => {
        // If we were still in preview mode, just close it
        if (isSharePreviewOpen) {
            setSharePreviewStream(null);
            setIsSharePreviewOpen(false);
        } else {
            stopScreenShare();
        }
      };

      setSharePreviewStream(stream);
      setIsSharePreviewOpen(true);

    } catch (err) {
      console.error('Error starting screen share:', err);
    }
  };

  const confirmScreenShare = () => {
      if (!sharePreviewStream) return;

      const stream = sharePreviewStream;
      screenStreamRef.current = stream;
      
      if (!localStreamRef.current) {
          localStreamRef.current = new MediaStream();
      }
      
      // Handle Video Track
      const videoTrack = stream.getVideoTracks()[0];
      localStreamRef.current.addTrack(videoTrack);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current; // Show local preview
      }

      setIsSharing(true);
      
      addTrackToPeers(videoTrack, localStreamRef.current);

      // Clear preview state
      setIsSharePreviewOpen(false);
      setSharePreviewStream(null);

      videoTrack.onended = () => {
        stopScreenShare();
      };
  };

  const cancelScreenShare = () => {
      if (sharePreviewStream) {
          sharePreviewStream.getTracks().forEach(track => track.stop());
      }
      setSharePreviewStream(null);
      setIsSharePreviewOpen(false);
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    
    // Remove screen track from local stream
    if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
            localStreamRef.current.removeTrack(videoTrack);
        }
    }

    setIsSharing(false);
    
    // Restore Camera if available
    if (videoStreamRef.current && videoStreamRef.current.getVideoTracks().length > 0) {
        const cameraTrack = videoStreamRef.current.getVideoTracks()[0];
        
        // Ensure it's enabled if isVideoEnabled is true, or disabled if false
        cameraTrack.enabled = isVideoEnabled;
        
        if (localStreamRef.current) {
            localStreamRef.current.addTrack(cameraTrack);
        }
        
        // Restore to peers
        addTrackToPeers(cameraTrack, localStreamRef.current);
        
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }
        
    } else {
        // No camera to restore, just remove video sender
        removeTrackFromPeers('video');
        
        if (localVideoRef.current) {
            // Keep audio if present
            if (localStreamRef.current && localStreamRef.current.getVideoTracks().length === 0) {
                 // localVideoRef.current.srcObject = null; 
            } else {
                localVideoRef.current.srcObject = localStreamRef.current;
            }
        }
    }
  };

  const copyRoomId = () => {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const startRecording = async () => {
    if (!hasPermission('canRecord')) {
      addToast(t('permission_denied_record'), 'error');
      return;
    }

    try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
              video: { mediaSource: "screen" },
              audio: true
          });
          
          const recorder = new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;
          
          recorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                  recordedChunksRef.current.push(event.data);
              }
          };
          
          recorder.onstop = () => {
              const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              document.body.appendChild(a);
              a.style = 'display: none';
              a.href = url;
              a.download = `meeting-recording-${Date.now()}.webm`;
              a.click();
              window.URL.revokeObjectURL(url);
              recordedChunksRef.current = [];
              setIsRecording(false);
              addToast(t('recording_saved'), "success");
          };
          
          recorder.start();
          setIsRecording(true);
          addToast(t('recording_started'), "success");
          
          // Stop recording if user stops sharing via browser UI
          stream.getVideoTracks()[0].onended = () => {
              stopRecording();
          };

      } catch (err) {
          console.error("Error starting recording:", err);
          addToast(t('recording_error'), "error");
      }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
  };

  if (uiState === 'welcome') {
      return (
        <div className="h-screen bg-gray-950 flex items-center justify-center p-4">
          <div className="flex flex-col md:flex-row gap-8 w-full max-w-5xl">
            {/* Join/Create Section */}
            <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl w-full md:w-1/3 border border-gray-800 flex flex-col">
              <div className="flex justify-center mb-8">
                <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                  <Users size={40} className="text-white" />
                </div>
              </div>
              <h2 className="text-3xl font-bold text-center mb-2 text-white">{t('join_meeting_title')}</h2>
              <p className="text-center text-gray-400 mb-8">{t('join_meeting_desc')}</p>
              
              <div className="space-y-4 flex-grow">
                <div>
                  <input
                    type="text"
                    placeholder={t('room_id_placeholder')}
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                  />
                </div>
                <button
                  onClick={joinRoom}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all transform active:scale-95 shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2"
                >
                  {t('continue_btn')} <Users size={18} />
                </button>
                <button
                  onClick={onBack}
                  className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors"
                >
                  {t('back_home_btn')}
                </button>
              </div>
            </div>

            {/* Active Rooms List */}
            <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl w-full md:w-2/3 border border-gray-800 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Monitor size={20} className="text-green-500" />
                        {t('active_rooms_title')}
                    </h3>
                    <button 
                        onClick={fetchActiveRooms}
                        disabled={isLoadingRooms}
                        className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                        title={t('refresh_rooms')}
                    >
                        <RefreshCw size={18} className={isLoadingRooms ? "animate-spin" : ""} />
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-3 max-h-[500px]">
                    {isLoadingRooms && activeRooms.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                            <Loader2 size={30} className="animate-spin mb-2" />
                            <p>{t('loading')}...</p>
                        </div>
                    ) : activeRooms.length > 0 ? (
                        activeRooms.map((room) => (
                            <div key={room.roomId} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 hover:border-blue-500/50 hover:bg-gray-800 transition-all group">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-lg font-bold text-blue-400">{room.roomId}</span>
                                            {room.creatorName && (
                                                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                    <Crown size={10} />
                                                    {room.creatorName}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-gray-400">
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={14} />
                                                <span>{new Date(room.createdAt).toLocaleTimeString()}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Users size={14} />
                                                <span>{room.userCount} {t('users_count')}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => joinRoom(room.roomId)}
                                        className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg text-sm font-medium transition-all opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0"
                                    >
                                        {t('join_now_btn')}
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
                            <MonitorOff size={30} className="mb-2 opacity-50" />
                            <p>{t('no_active_rooms')}</p>
                        </div>
                    )}
                </div>
            </div>
          </div>
        </div>
      );
  }

  if (uiState === 'setup') {
      return (
          <div className="h-screen bg-gray-950 flex items-center justify-center p-4">
              <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-4xl border border-gray-800 flex flex-col md:flex-row gap-8">
                  {/* Preview Section */}
                  <div className="flex-1">
                      <h3 className="text-xl font-semibold text-white mb-4">{t('preview_label')}</h3>
                      <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 shadow-inner group">
                          <video
                              ref={previewVideoRef}
                              autoPlay
                              muted
                              playsInline
                              className="w-full h-full object-cover transform scale-x-[-1]"
                          />
                          <div className="absolute bottom-4 left-4 flex gap-2">
                              <div className="bg-black/50 backdrop-blur px-3 py-1 rounded-full flex items-center gap-2">
                                  {volumeLevel > 5 ? <Mic size={14} className="text-green-400" /> : <MicOff size={14} className="text-red-400" />}
                                  <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                                      <div 
                                          className="h-full bg-green-500 transition-all duration-100" 
                                          style={{ width: `${volumeLevel}%` }}
                                      />
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Settings Section */}
                  <div className="flex-1 flex flex-col justify-center space-y-6">
                      <div>
                          <h2 className="text-2xl font-bold text-white mb-2">{t('setup_title')}</h2>
                          <p className="text-gray-400">{t('setup_desc')}</p>
                      </div>

                      <div className="space-y-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-400 mb-2">{t('camera_label')}</label>
                              <div className="relative">
                                  <select
                                      value={selectedCameraId}
                                      onChange={(e) => setSelectedCameraId(e.target.value)}
                                      className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white appearance-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                  >
                                      {cameras.map(cam => (
                                          <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${cam.deviceId.slice(0, 5)}...`}</option>
                                      ))}
                                  </select>
                                  <VideoIcon size={18} className="absolute left-3 top-3.5 text-gray-400" />
                              </div>
                          </div>

                          <div>
                              <label className="block text-sm font-medium text-gray-400 mb-2">{t('microphone_label')}</label>
                              <div className="relative">
                                  <select
                                      value={selectedMicId}
                                      onChange={(e) => setSelectedMicId(e.target.value)}
                                      className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white appearance-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                  >
                                      {mics.map(mic => (
                                          <option key={mic.deviceId} value={mic.deviceId}>{mic.label || `Mic ${mic.deviceId.slice(0, 5)}...`}</option>
                                      ))}
                                  </select>
                                  <Mic size={18} className="absolute left-3 top-3.5 text-gray-400" />
                              </div>
                          </div>

                          <div className="flex items-center justify-between bg-gray-800 p-3 rounded-xl border border-gray-700">
                              <div className="flex items-center gap-2">
                                  <SignalLow size={18} className="text-gray-400" />
                                  <span className="text-sm text-gray-300">{t('low_data_mode')}</span>
                              </div>
                              <button 
                                  onClick={toggleLowDataMode}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${isLowDataMode ? 'bg-green-500' : 'bg-gray-600'}`}
                              >
                                  <span className={`${isLowDataMode ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                              </button>
                          </div>
                      </div>

                      <div className="flex gap-4 pt-4">
                          <button
                              onClick={confirmJoin}
                              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-lg shadow-blue-900/30 transition-all active:scale-95"
                          >
                              {t('join_now_btn')}
                          </button>
                          <button
                              onClick={() => setUiState('welcome')}
                              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors"
                          >
                              {t('back_btn') || 'Back'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden relative">
            {/* Header Status Bar */}
            <div className="h-16 bg-gray-900/90 backdrop-blur border-b border-gray-800 flex justify-between items-center px-6 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-1.5 rounded-lg border border-gray-700/50">
                        <Users size={16} className="text-gray-400" />
                        <span className="font-mono font-medium text-gray-200">{roomId}</span>
                        <button 
                            onClick={copyRoomId} 
                            className="ml-2 hover:bg-gray-700 p-1 rounded transition-colors"
                            title={t('copy_room_id')}
                        >
                            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-gray-400" />}
                        </button>
                    </div>
                    
                    {/* Status Indicators */}
                        <div className="flex items-center gap-3 ml-2">
                            {/* Role Badge */}
                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                                myRole === 'creator'
                                    ? 'bg-red-500/10 border-red-500/20 text-red-500'
                                    : myRole === 'admin' 
                                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-500' 
                                    : myRole === 'host'
                                    ? 'bg-orange-500/10 border-orange-500/20 text-orange-500'
                                    : 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                            }`}>
                                {myRole === 'creator' && <Crown size={14} />}
                                {myRole === 'admin' && <Shield size={14} />}
                                {myRole === 'host' && <Crown size={14} />}
                                {myRole === 'participant' && <Users size={14} />}
                                <span className="text-[10px] font-medium uppercase tracking-wider">
                                    {myRole === 'creator' ? t('creator_label') : myRole.toUpperCase()}
                                </span>
                            </div>

                            {/* Close Room Button (Creator Only) */}
                            {isCreator && (
                                <button
                                    onClick={handleCloseRoom}
                                    className="ml-2 py-1.5 px-3 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-colors border border-red-500/50 shadow-sm shadow-red-900/20 flex items-center gap-1.5"
                                >
                                    <UserX size={14} />
                                    {t('close_room')}
                                </button>
                            )}

                            {/* Signaling Status */}
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                            signalingState === 'connected' 
                                ? 'bg-green-500/10 border-green-500/20 text-green-500' 
                                : 'bg-red-500/10 border-red-500/20 text-red-500'
                        }`}>
                            {signalingState === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
                            <span className="text-[10px] font-medium uppercase tracking-wider">
                                {signalingState === 'connected' ? t('signal_ok') : t('offline')}
                            </span>
                        </div>

                        {/* Connection Status (only show if active) */}
                        {Object.keys(remoteStreams).length > 0 && (
                             <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                                connectionStatus === 'connected'
                                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                                    : (connectionStatus === 'failed' || connectionStatus === 'disconnected')
                                    ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'
                                    : 'bg-gray-500/10 border-gray-500/20 text-gray-400'
                             }`}>
                                {connectionStatus === 'connected' ? (
                                    <Check size={14} />
                                ) : (connectionStatus === 'failed' || connectionStatus === 'disconnected') ? (
                                    <AlertTriangle size={14} />
                                ) : (
                                    <Loader2 size={14} className="animate-spin" />
                                )}
                                <span className="text-[10px] font-medium uppercase tracking-wider">
                                    {connectionStatus}
                                </span>
                             </div>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{t('live')}</span>
                </div>
            </div>

            {/* Main Content Area - Grid Layout */}
            <div className="flex-1 p-4 overflow-y-auto bg-[#121212]">
                <div className={`grid gap-4 h-full w-full ${
                    Object.keys(remoteStreams).length === 0 ? 'grid-cols-1' :
                    Object.keys(remoteStreams).length === 1 ? 'grid-cols-1 md:grid-cols-2' :
                    'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                }`}>
                    
                    {/* Local User */}
                    <div className="relative bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-xl flex flex-col">
                        <div className="absolute top-4 left-4 z-10 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-2">
                            <span className="text-xs font-medium text-white">{t('you')}</span>
                            {!isAudioEnabled && <MicOff size={12} className="text-red-500" />}
                        </div>
                        
                        <div className="flex-1 relative flex items-center justify-center bg-gray-950">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className={`w-full h-full object-contain ${!isSharing && !isAudioEnabled ? 'hidden' : ''}`}
                            />
                            
                            {/* Avatar / Placeholder when no video/sharing */}
                            {(!isSharing && (!localStreamRef.current || localStreamRef.current.getVideoTracks().length === 0)) && (
                                <div className="flex flex-col items-center justify-center">
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg mb-4">
                                        {t('me_placeholder')}
                                    </div>
                                    <p className="text-gray-500 text-sm">{t('camera_off')}</p>
                                </div>
                            )}
                        </div>
                    </div>

                        {/* Remote Users */}
                    {Object.entries(remoteStreams).map(([userId, stream]) => (
                        <div key={userId} className="relative bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-xl flex flex-col group">
                            <div className="absolute top-4 left-4 z-10 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-2">
                                <span className="text-xs font-medium text-white">{t('user_label', { userId: userId.slice(0, 4) })}</span>
                                {/* Remote Role Badge */}
                                {remoteRoles[userId] && (
                                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                                        remoteRoles[userId] === 'admin' ? 'bg-purple-500/80 text-white' :
                                        remoteRoles[userId] === 'host' ? 'bg-orange-500/80 text-white' :
                                        'bg-blue-500/50 text-white'
                                    }`}>
                                        {remoteRoles[userId] === 'admin' && <Shield size={8} />}
                                        {remoteRoles[userId] === 'host' && <Crown size={8} />}
                                        {remoteRoles[userId]}
                                    </div>
                                )}
                            </div>
                            
                            {/* Admin Controls Overlay */}
                            {hasPermission('canManageRoles') && (
                                <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                    <button
                                        onClick={() => handleUpdateRole(userId, remoteRoles[userId] || 'participant')}
                                        className="p-2 bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg backdrop-blur-sm shadow-lg transition-transform hover:scale-105"
                                        title={t('change_role_tooltip')}
                                    >
                                        <Shield size={14} />
                                    </button>
                                    {hasPermission('canKickUsers') && (
                                        <button 
                                            onClick={() => handleKickUser(userId)}
                                            className="p-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg backdrop-blur-sm shadow-lg transition-transform hover:scale-105"
                                            title={t('kick_user_tooltip')}
                                        >
                                            <UserX size={14} />
                                        </button>
                                    )}
                                    {hasPermission('canMuteOthers') && (
                                        <button 
                                            onClick={() => handleMuteUser(userId, 'audio')}
                                            className="p-2 bg-yellow-600/80 hover:bg-yellow-600 text-white rounded-lg backdrop-blur-sm shadow-lg transition-transform hover:scale-105"
                                            title={t('mute_user_tooltip')}
                                        >
                                            <VolumeX size={14} />
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="flex-1 bg-gray-950 flex items-center justify-center">
                                <VideoPlayer stream={stream} />
                            </div>
                        </div>
                    ))}
                    
                    {/* Waiting State */}
                    {Object.keys(remoteStreams).length === 0 && (
                        <div className="hidden md:flex bg-gray-900/30 border-2 border-dashed border-gray-800 rounded-2xl flex-col items-center justify-center text-gray-600 p-8">
                            <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mb-4">
                                <Users size={24} className="opacity-50" />
                            </div>
                            <p className="font-medium">{t('waiting_for_others')}</p>
                            <p className="text-sm mt-2 opacity-60">{t('share_room_id_hint')} <span className="font-mono text-blue-400">{roomId}</span></p>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Control Bar */}
            <div className="h-20 bg-gray-900 border-t border-gray-800 flex items-center justify-center px-4 pb-4">
                <div className="flex items-center gap-3 bg-gray-800/80 backdrop-blur-lg px-6 py-3 rounded-2xl border border-gray-700 shadow-2xl transform -translate-y-2">
                    
                    <button
                        onClick={toggleAudio}
                        className={`p-3 rounded-xl transition-all duration-200 flex flex-col items-center gap-1 w-20 ${
                            isAudioEnabled 
                            ? 'bg-gray-700/50 hover:bg-gray-600 text-white' 
                            : 'bg-red-500/10 hover:bg-red-500/20 text-red-500'
                        }`}
                        title={isAudioEnabled ? t('mute_mic_tooltip') : t('unmute_mic_tooltip')}
                    >
                        {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                        <span className="text-[10px] font-medium">{isAudioEnabled ? t('mute_btn') : t('unmute_btn')}</span>
                    </button>

                    <button
                        onClick={toggleVideo}
                        className={`p-3 rounded-xl transition-all duration-200 flex flex-col items-center gap-1 w-20 ${
                            isVideoEnabled 
                            ? 'bg-gray-700/50 hover:bg-gray-600 text-white' 
                            : 'bg-red-500/10 hover:bg-red-500/20 text-red-500'
                        }`}
                        title={isVideoEnabled ? t('stop_video_tooltip') : t('start_video_tooltip')}
                    >
                        {isVideoEnabled ? <VideoIcon size={20} /> : <VideoIcon size={20} className="text-red-500" />}
                        <span className="text-[10px] font-medium">{isVideoEnabled ? t('stop_video_btn') : t('start_video_btn')}</span>
                    </button>

                    <button
                        onClick={isSharing ? stopScreenShare : startScreenShare}
                        className={`p-3 rounded-xl transition-all duration-200 flex flex-col items-center gap-1 w-20 ${
                            isSharing 
                            ? 'bg-green-500/10 hover:bg-green-500/20 text-green-500' 
                            : 'bg-gray-700/50 hover:bg-gray-600 text-white'
                        }`}
                        title={isSharing ? t('stop_sharing_tooltip') : t('share_screen_tooltip')}
                    >
                        {isSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
                        <span className="text-[10px] font-medium">{isSharing ? t('stop_sharing_btn') : t('share_screen_btn')}</span>
                    </button>

                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`p-3 rounded-xl transition-all duration-200 flex flex-col items-center gap-1 w-20 ${
                            isRecording 
                            ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 animate-pulse' 
                            : 'bg-gray-700/50 hover:bg-gray-600 text-white'
                        }`}
                        title={isRecording ? t('stop_recording_tooltip') : t('start_recording_tooltip')}
                    >
                        {isRecording ? <StopCircle size={20} /> : <div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center"><div className="w-2 h-2 bg-current rounded-full"></div></div>}
                        <span className="text-[10px] font-medium">{isRecording ? t('rec_btn') : t('record_btn')}</span>
                    </button>

                    <button
                        onClick={toggleLowDataMode}
                        className={`p-3 rounded-xl transition-all duration-200 flex flex-col items-center gap-1 w-20 ${
                            isLowDataMode 
                            ? 'bg-green-500/10 hover:bg-green-500/20 text-green-500' 
                            : 'bg-gray-700/50 hover:bg-gray-600 text-white'
                        }`}
                        title={isLowDataMode ? t('low_data_mode_on') : t('low_data_mode_off')}
                    >
                        <SignalLow size={20} />
                        <span className="text-[10px] font-medium whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">{t('low_data_mode')}</span>
                    </button>

                    <div className="w-px h-8 bg-gray-700 mx-2"></div>

                    <button
                        onClick={onBack}
                        className="p-3 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-all duration-200 flex flex-col items-center gap-1 w-20 shadow-lg shadow-red-900/20"
                        title={t('leave_meeting_tooltip')}
                    >
                        <PhoneOff size={20} />
                        <span className="text-[10px] font-medium">{t('leave_btn')}</span>
                    </button>
                </div>
            </div>

            {/* Screen Share Confirmation Modal */}
            {isSharePreviewOpen && sharePreviewStream && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-500/10 rounded-lg">
                                    <Monitor className="text-blue-500" size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-white leading-tight">{t('confirm_screen_share_title')}</h3>
                                    <p className="text-xs text-gray-400">{t('confirm_screen_share_desc')}</p>
                                </div>
                            </div>
                            <button onClick={cancelScreenShare} className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg">
                                <span className="sr-only">Close</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        
                        <div className="flex-1 bg-black p-4 flex items-center justify-center overflow-hidden relative group">
                             <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800/20 via-black to-black pointer-events-none"></div>
                             <video
                                ref={ref => {
                                    if (ref && sharePreviewStream) {
                                        ref.srcObject = sharePreviewStream;
                                    }
                                }}
                                autoPlay
                                playsInline
                                muted
                                className="max-w-full max-h-[60vh] rounded-lg border border-gray-800 shadow-2xl z-10"
                            />
                        </div>
                        
                        <div className="p-6 bg-gray-900 border-t border-gray-800 space-y-6">
                            <div className="flex items-start gap-3 text-yellow-400 bg-yellow-400/5 p-4 rounded-xl border border-yellow-400/10">
                                <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="font-medium text-sm">{t('privacy_warning_title')}</p>
                                    <p className="text-sm opacity-90 leading-relaxed">{t('privacy_warning_desc')}</p>
                                </div>
                            </div>
                            
                            <div className="flex gap-3 justify-end">
                                <button 
                                    onClick={cancelScreenShare}
                                    className="px-6 py-2.5 rounded-xl font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-all border border-transparent hover:border-gray-700"
                                >
                                    {t('cancel_btn')}
                                </button>
                                <button 
                                    onClick={confirmScreenShare}
                                    className="px-6 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <Check size={18} />
                                    {t('start_sharing_btn')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
    </div>
  );
}

const VideoPlayer = ({ stream }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-contain"
    />
  );
};

export default WebRTCMeeting;
