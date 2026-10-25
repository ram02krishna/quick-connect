import { create } from "zustand";
import { toast } from "sonner";
import { useSocketStore } from "./useSocketStore";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";
import { getAudioContext } from "@lib/sound";

interface CallPartner {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export type CallState = "idle" | "incoming" | "outgoing" | "connected";
type CallKind = "audio" | "video";

interface CallStoreState {
  callState: CallState;
  callType: CallKind;
  isGroupCall: boolean;

  // 1-to-1
  partner: CallPartner | null;
  remoteStream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;

  // group (mesh)
  groupChatId: string | null;
  groupChatTitle: string | null;
  peerConnections: Record<string, RTCPeerConnection>;
  remoteStreams: Record<string, MediaStream>;
  participants: Record<string, CallPartner>;

  localStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  isMinimized: boolean;
  /** Ringtone loudness (0–1). */
  ringVolume: number;
  /** Loudness of the other person's voice (0–1). Independent from the ringtone. */
  callVolume: number;

  initiateCall: (targetUserId: string, targetName: string, targetAvatar: string | null, type: CallKind) => Promise<void>;
  receiveCall: (payload: { fromUserId: string; fromUserName: string; fromUserAvatar: string | null; sdp: RTCSessionDescriptionInit; callType: CallKind }) => void;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  handleAnswer: (fromUserId: string, sdp: RTCSessionDescriptionInit) => void;
  handlePeerDeclined: (fromUserId: string, reason?: string) => void;
  handlePeerEnded: (fromUserId: string) => void;
  handlePeerUnavailable: (targetUserId: string) => void;

  initiateGroupCall: (chatId: string, chatTitle: string, type: CallKind) => Promise<void>;
  receiveGroupCall: (payload: { chatId: string; chatTitle: string; chatAvatar: string | null; fromUserId: string; fromUserName: string; fromUserAvatar: string | null; callType: CallKind }) => void;
  acceptGroupCall: () => Promise<void>;
  respondToGroupCall: (status: "accepted" | "declined") => void;
  handleParticipantJoined: (chatId: string, userId: string) => Promise<void>;
  handleParticipantLeft: (chatId: string, userId: string) => void;
  handleGroupOffer: (fromUserId: string, sdp: RTCSessionDescriptionInit, callType: CallKind) => Promise<void>;
  handleGroupAnswer: (fromUserId: string, sdp: RTCSessionDescriptionInit) => Promise<void>;
  handleGroupEnded: (chatId: string) => void;

  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
  handleIceCandidate: (candidate: RTCIceCandidateInit, fromUserId?: string) => void;
  resetCallStore: () => void;
  setRingVolume: (volume: number) => void;
  setCallVolume: (volume: number) => void;
  setIsMinimized: (isMinimized: boolean) => void;
}

// ─── ringtone ────────────────────────────────────────────────────────────────

let ringGain: GainNode | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;

const comfortGain = (vol: number) => Math.pow(Math.max(0, Math.min(1, vol)), 1.2) * 0.25;

function readStoredVolume(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = parseFloat(localStorage.getItem(key) ?? "");
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) return Math.round(parsed * 100) / 100;
  } catch { /* storage unavailable */ }
  return fallback;
}

function startRingtone(type: "dial" | "ring") {
  stopRingtone();
  const audio = getAudioContext();
  if (!audio) return;

  ringGain = audio.createGain();
  ringGain.gain.value = comfortGain(useCallStore.getState().ringVolume);
  ringGain.connect(audio.destination);

  const beep = () => {
    if (!ringGain) return;
    const now = audio.currentTime;
    if (type === "dial") {
      for (const freq of [440, 480]) {
        const osc = audio.createOscillator();
        osc.frequency.setValueAtTime(freq, now);
        osc.connect(ringGain);
        osc.start(now);
        osc.stop(now + 1.5);
      }
    } else {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = audio.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.15);
        osc.connect(ringGain!);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.3);
      });
    }
  };

  beep();
  ringInterval = setInterval(beep, type === "dial" ? 4000 : 2500);
}

function stopRingtone() {
  if (ringInterval) clearInterval(ringInterval);
  ringInterval = null;
  try { ringGain?.disconnect(); } catch { /* already disconnected */ }
  ringGain = null;
}

// ─── WebRTC ──────────────────────────────────────────────────────────────────

const RING_TIMEOUT_MS = 45_000;

function buildRtcConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
  ];
  // STUN alone can't connect people behind symmetric NATs (common on mobile data).
  // Provide a TURN relay through NEXT_PUBLIC_TURN_* to make those calls work.
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(",").map((u) => u.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return { iceServers, bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" };
}

async function getMediaStream(type: CallKind): Promise<{ stream: MediaStream; actualType: CallKind }> {
  const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" };
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) throw new Error("Calls need a secure (https) connection and a supported browser.");

  const audioOnly = async () => ({ stream: await md.getUserMedia({ audio, video: false }), actualType: "audio" as CallKind });

  if (type === "audio") {
    try {
      return await audioOnly();
    } catch (err: any) {
      if (err.name === "NotFoundError") throw new Error("No microphone found. Connect one and try again.");
      if (err.name === "NotAllowedError") throw new Error("Microphone permission denied. Allow access in your browser settings.");
      if (err.name === "NotReadableError") throw new Error("Your microphone is being used by another app.");
      throw err;
    }
  }

  try {
    return { stream: await md.getUserMedia({ audio, video }), actualType: "video" };
  } catch (err: any) {
    if (err.name === "NotAllowedError") {
      throw new Error("Camera or microphone permission denied. Allow access in your browser settings.");
    }
    if (err.name === "OverconstrainedError") {
      try {
        return { stream: await md.getUserMedia({ audio, video: true }), actualType: "video" };
      } catch { /* fall through to audio only */ }
    }
    if (["NotFoundError", "OverconstrainedError", "NotReadableError"].includes(err.name)) {
      toast.warning("Camera unavailable — continuing as a voice call.");
      return audioOnly();
    }
    throw err;
  }
}

const emit = (event: string, payload?: unknown) => useSocketStore.getState().socket?.emit(event, payload);

export const useCallStore = create<CallStoreState>((set, get) => {
  // Not kept in Zustand state: these never drive rendering.
  let pendingCandidates: RTCIceCandidateInit[] = [];
  let pendingGroupCandidates: Record<string, RTCIceCandidateInit[]> = {};
  let pendingOffer: RTCSessionDescriptionInit | null = null;
  let ringTimer: ReturnType<typeof setTimeout> | null = null;
  // Incremented on every reset; async steps compare it to notice the call was cancelled meanwhile.
  let session = 0;

  const clearRingTimer = () => {
    if (ringTimer) clearTimeout(ringTimer);
    ringTimer = null;
  };

  const armRingTimer = (onTimeout: () => void) => {
    clearRingTimer();
    ringTimer = setTimeout(onTimeout, RING_TIMEOUT_MS);
  };

  const closeEverything = () => {
    const { localStream, remoteStream, peerConnection, peerConnections, remoteStreams } = get();
    localStream?.getTracks().forEach((t) => t.stop());
    remoteStream?.getTracks().forEach((t) => t.stop());
    Object.values(remoteStreams).forEach((s) => s.getTracks().forEach((t) => t.stop()));
    try { peerConnection?.close(); } catch { /* ignore */ }
    Object.values(peerConnections).forEach((pc) => { try { pc.close(); } catch { /* ignore */ } });
    stopRingtone();
    clearRingTimer();
    pendingCandidates = [];
    pendingGroupCandidates = {};
    pendingOffer = null;
  };

  const addCandidates = (pc: RTCPeerConnection, list: RTCIceCandidateInit[]) => {
    list.forEach((c) => void pc.addIceCandidate(new RTCIceCandidate(c)).catch((err) => console.warn("ICE candidate rejected:", err)));
  };

  const participantInfo = (chatId: string | null, userId: string): CallPartner => {
    const chat = chatId ? useChatStore.getState().chats.find((c) => c.id === chatId) : null;
    const member = chat?.members?.find((m) => m.userId === userId);
    return { id: userId, name: member?.user?.name || "Participant", avatarUrl: member?.user?.avatarUrl || null };
  };

  const createGroupPeer = (userId: string) => {
    const pc = new RTCPeerConnection(buildRtcConfig());
    const { localStream } = get();
    localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.onicecandidate = (e) => {
      if (e.candidate) emit("call:ice-candidate", { targetUserId: userId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (e.streams?.[0]) set((s) => ({ remoteStreams: { ...s.remoteStreams, [userId]: e.streams[0] } }));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") toast.error(`Lost connection with ${get().participants[userId]?.name ?? "a participant"}.`);
    };

    set((s) => ({ peerConnections: { ...s.peerConnections, [userId]: pc } }));
    return pc;
  };

  const blankCall = {
    callState: "idle" as CallState,
    isGroupCall: false,
    partner: null,
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    groupChatId: null,
    groupChatTitle: null,
    peerConnections: {},
    remoteStreams: {},
    participants: {},
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    isMinimized: false,
  };

  return {
    ...blankCall,
    callType: "audio",
    ringVolume: readStoredVolume("quickconnect_call_ring_volume", 0.3),
    callVolume: readStoredVolume("quickconnect_call_volume", 1),

    setIsMinimized: (isMinimized) => set({ isMinimized }),

    setRingVolume: (volume) => {
      const v = Math.max(0, Math.min(1, Math.round(volume * 100) / 100));
      set({ ringVolume: v });
      try { localStorage.setItem("quickconnect_call_ring_volume", String(v)); } catch { /* ignore */ }
      if (ringGain) ringGain.gain.value = comfortGain(v);
    },

    setCallVolume: (volume) => {
      const v = Math.max(0, Math.min(1, Math.round(volume * 100) / 100));
      set({ callVolume: v });
      try { localStorage.setItem("quickconnect_call_volume", String(v)); } catch { /* ignore */ }
    },

    // ── 1:1: caller ──────────────────────────────────────────────────────────

    initiateCall: async (targetUserId, targetName, targetAvatar, type) => {
      if (get().callState !== "idle") return;
      if (!useSocketStore.getState().isConnected) {
        toast.error("You're offline. Reconnect to place a call.");
        return;
      }

      const mine = ++session;
      set({
        ...blankCall, callState: "outgoing", callType: type,
        partner: { id: targetUserId, name: targetName, avatarUrl: targetAvatar },
      });
      startRingtone("dial");

      try {
        const { stream, actualType } = await getMediaStream(type);
        // Hung up while the permission prompt was open — release the devices and stop.
        if (mine !== session) { stream.getTracks().forEach((t) => t.stop()); return; }

        set({ callType: actualType, localStream: stream });

        const pc = new RTCPeerConnection(buildRtcConfig());
        set({ peerConnection: pc });
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Candidates are held back until the offer has been sent, so the callee never sees them first.
        let offerSent = false;
        const held: RTCIceCandidate[] = [];
        const sendCandidate = (c: RTCIceCandidate) => emit("call:ice-candidate", { targetUserId, candidate: c });

        pc.ontrack = (e) => { if (e.streams?.[0]) set({ remoteStream: e.streams[0] }); };
        pc.onicecandidate = (e) => {
          if (!e.candidate) return;
          offerSent ? sendCandidate(e.candidate) : held.push(e.candidate);
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" && mine === session) {
            toast.error("The call connection failed.");
            get().endCall();
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (mine !== session) return;

        emit("call:initiate", { targetUserId, sdp: offer, callType: actualType });
        offerSent = true;
        held.splice(0).forEach(sendCandidate);

        armRingTimer(() => {
          if (mine !== session || get().callState !== "outgoing") return;
          toast.info(`${targetName} didn't answer.`);
          get().endCall();
        });
      } catch (err: any) {
        if (mine !== session) return;
        console.error("Call initiation error:", err);
        toast.error(err.message || "Couldn't start the call.");
        get().resetCallStore();
      }
    },

    // ── 1:1: callee ──────────────────────────────────────────────────────────

    receiveCall: (payload) => {
      // Already busy: tell the caller instead of overwriting the call in progress.
      if (get().callState !== "idle") {
        emit("call:decline", { targetUserId: payload.fromUserId, reason: "busy" });
        return;
      }

      const mine = ++session;
      pendingOffer = payload.sdp;
      pendingCandidates = [];

      set({
        ...blankCall, callState: "incoming", callType: payload.callType,
        partner: { id: payload.fromUserId, name: payload.fromUserName, avatarUrl: payload.fromUserAvatar },
      });
      startRingtone("ring");

      const pc = new RTCPeerConnection(buildRtcConfig());
      set({ peerConnection: pc });

      pc.onicecandidate = (e) => {
        if (e.candidate) emit("call:ice-candidate", { targetUserId: payload.fromUserId, candidate: e.candidate });
      };
      pc.ontrack = (e) => { if (e.streams?.[0]) set({ remoteStream: e.streams[0] }); };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" && mine === session) {
          toast.error("The call connection failed.");
          get().endCall();
        }
      };

      armRingTimer(() => {
        if (mine !== session || get().callState !== "incoming") return;
        get().declineCall();
      });
    },

    acceptCall: async () => {
      const { peerConnection, partner, callType } = get();
      if (!peerConnection || !partner) return;
      const mine = session;
      stopRingtone();
      clearRingTimer();

      try {
        const { stream, actualType } = await getMediaStream(callType);
        if (mine !== session) { stream.getTracks().forEach((t) => t.stop()); return; }

        set({ callState: "connected", callType: actualType, localStream: stream });
        // Local tracks first so the answer negotiates our media too.
        stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

        if (pendingOffer) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
          addCandidates(peerConnection, pendingCandidates);
          pendingCandidates = [];
          pendingOffer = null;
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        emit("call:accept", { targetUserId: partner.id, sdp: answer });
      } catch (err: any) {
        if (mine !== session) return;
        console.error("Error accepting call:", err);
        toast.error(err.message || "Couldn't answer the call.");
        get().declineCall();
      }
    },

    declineCall: () => {
      const { partner, isGroupCall } = get();
      if (isGroupCall) get().respondToGroupCall("declined");
      else if (partner) emit("call:decline", { targetUserId: partner.id });
      get().resetCallStore();
    },

    endCall: () => {
      const { callState, partner, isGroupCall, groupChatId } = get();
      if (isGroupCall && groupChatId) {
        // Before anyone has joined the starter cancels the ring for everyone; afterwards they just leave.
        emit(callState === "outgoing" ? "call:end-group" : "call:leave-group", { chatId: groupChatId });
      } else if (partner) {
        emit("call:hangup", { targetUserId: partner.id });
      }
      get().resetCallStore();
    },

    handleAnswer: (fromUserId, sdp) => {
      const { peerConnection, partner } = get();
      if (!peerConnection || partner?.id !== fromUserId) return;
      stopRingtone();
      clearRingTimer();
      set({ callState: "connected" });
      peerConnection
        .setRemoteDescription(new RTCSessionDescription(sdp))
        .then(() => { addCandidates(peerConnection, pendingCandidates); pendingCandidates = []; })
        .catch((err) => console.error("Applying the answer failed:", err));
    },

    handlePeerDeclined: (fromUserId, reason) => {
      const { partner, callState } = get();
      if (partner?.id !== fromUserId || callState === "idle") return;
      get().resetCallStore();
      toast.info(reason === "busy" ? `${partner.name} is on another call.` : `${partner.name} declined the call.`);
    },

    handlePeerEnded: (fromUserId) => {
      const { partner, callState } = get();
      if (partner?.id !== fromUserId || callState === "idle") return;
      const wasConnected = callState === "connected";
      get().resetCallStore();
      toast.info(wasConnected ? "Call ended" : "Missed call");
    },

    handlePeerUnavailable: (targetUserId) => {
      const { partner, callState } = get();
      if (partner?.id !== targetUserId || callState !== "outgoing") return;
      get().resetCallStore();
      toast.info(`${partner.name} isn't online right now.`);
    },

    // ── group ────────────────────────────────────────────────────────────────

    initiateGroupCall: async (chatId, chatTitle, type) => {
      if (get().callState !== "idle") return;
      if (!useSocketStore.getState().isConnected) {
        toast.error("You're offline. Reconnect to place a call.");
        return;
      }

      const mine = ++session;
      set({ ...blankCall, callState: "outgoing", callType: type, isGroupCall: true, groupChatId: chatId, groupChatTitle: chatTitle });
      startRingtone("dial");

      try {
        const { stream, actualType } = await getMediaStream(type);
        if (mine !== session) { stream.getTracks().forEach((t) => t.stop()); return; }

        set({ callType: actualType, localStream: stream });
        emit("call:initiate-group", { chatId, callType: actualType });

        armRingTimer(() => {
          if (mine !== session || get().callState !== "outgoing") return;
          toast.info("Nobody joined the call.");
          get().endCall();
        });
      } catch (err: any) {
        if (mine !== session) return;
        toast.error(err.message || "Couldn't start the call.");
        get().resetCallStore();
      }
    },

    receiveGroupCall: (payload) => {
      if (get().callState !== "idle") return;
      const mine = ++session;
      set({
        ...blankCall, callState: "incoming", callType: payload.callType, isGroupCall: true,
        groupChatId: payload.chatId, groupChatTitle: payload.chatTitle,
        participants: { [payload.fromUserId]: { id: payload.fromUserId, name: payload.fromUserName, avatarUrl: payload.fromUserAvatar } },
      });
      startRingtone("ring");
      armRingTimer(() => {
        if (mine === session && get().callState === "incoming") get().declineCall();
      });
    },

    acceptGroupCall: async () => {
      const { groupChatId, callType } = get();
      if (!groupChatId) return;
      const mine = session;
      stopRingtone();
      clearRingTimer();

      try {
        const { stream, actualType } = await getMediaStream(callType);
        if (mine !== session) { stream.getTracks().forEach((t) => t.stop()); return; }

        set({ callState: "connected", callType: actualType, localStream: stream });
        emit("call:join-group", { chatId: groupChatId });
        get().respondToGroupCall("accepted");
      } catch (err: any) {
        if (mine !== session) return;
        toast.error(err.message || "Couldn't join the call.");
        get().declineCall();
      }
    },

    respondToGroupCall: (status) => {
      const { groupChatId } = get();
      if (groupChatId) emit("call:group-response", { chatId: groupChatId, status });
    },

    handleParticipantJoined: async (chatId, userId) => {
      const { callState, isGroupCall, callType, groupChatId } = get();
      if (!isGroupCall || groupChatId !== chatId || (callState !== "connected" && callState !== "outgoing")) return;

      if (callState === "outgoing") {
        set({ callState: "connected" });
        stopRingtone();
        clearRingTimer();
      }

      set((s) => ({ participants: { ...s.participants, [userId]: participantInfo(chatId, userId) } }));

      // Existing participants make the offer; the newcomer answers.
      const pc = createGroupPeer(userId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        emit("call:offer", { targetUserId: userId, sdp: offer, callType });
      } catch (err) {
        console.error("Couldn't offer to new participant:", err);
      }
    },

    handleParticipantLeft: (chatId, userId) => {
      const { groupChatId, peerConnections, remoteStreams, participants } = get();
      if (groupChatId !== chatId) return;
      try { peerConnections[userId]?.close(); } catch { /* ignore */ }
      const { [userId]: _pc, ...pcs } = peerConnections;
      const { [userId]: _stream, ...streams } = remoteStreams;
      const { [userId]: _p, ...rest } = participants;
      set({ peerConnections: pcs, remoteStreams: streams, participants: rest });
    },

    handleGroupOffer: async (fromUserId, sdp) => {
      const { callState, isGroupCall, groupChatId } = get();
      if (!isGroupCall || (callState !== "connected" && callState !== "outgoing")) return;
      if (callState === "outgoing") { set({ callState: "connected" }); stopRingtone(); clearRingTimer(); }

      set((s) => ({ participants: { ...s.participants, [fromUserId]: participantInfo(groupChatId, fromUserId) } }));

      const pc = createGroupPeer(fromUserId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        if (pendingGroupCandidates[fromUserId]) {
          addCandidates(pc, pendingGroupCandidates[fromUserId]);
          delete pendingGroupCandidates[fromUserId];
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        emit("call:answer", { targetUserId: fromUserId, sdp: answer });
      } catch (err) {
        console.error("Couldn't answer group offer:", err);
      }
    },

    handleGroupAnswer: async (fromUserId, sdp) => {
      const pc = get().peerConnections[fromUserId];
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        if (pendingGroupCandidates[fromUserId]) {
          addCandidates(pc, pendingGroupCandidates[fromUserId]);
          delete pendingGroupCandidates[fromUserId];
        }
      } catch (err) {
        console.error("Couldn't apply group answer:", err);
      }
    },

    handleGroupEnded: (chatId) => {
      const { isGroupCall, groupChatId, callState } = get();
      if (!isGroupCall || groupChatId !== chatId || callState === "idle") return;
      const wasConnected = callState === "connected";
      get().resetCallStore();
      toast.info(wasConnected ? "Group call ended" : "Missed group call");
    },

    // ── ICE ──────────────────────────────────────────────────────────────────

    handleIceCandidate: (candidate, fromUserId) => {
      const { isGroupCall, peerConnections, peerConnection, partner } = get();

      if (isGroupCall) {
        if (!fromUserId) return;
        const pc = peerConnections[fromUserId];
        if (pc?.remoteDescription) void pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
        else (pendingGroupCandidates[fromUserId] ??= []).push(candidate);
        return;
      }

      if (fromUserId && partner && fromUserId !== partner.id) return;
      if (peerConnection?.remoteDescription) void peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
      else pendingCandidates.push(candidate);
    },

    // ── controls ─────────────────────────────────────────────────────────────

    toggleMute: () => {
      const { localStream, isMuted } = get();
      localStream?.getAudioTracks().forEach((t) => (t.enabled = isMuted));
      set({ isMuted: !isMuted });
    },

    toggleCamera: () => {
      const { localStream, isCameraOff, isScreenSharing } = get();
      if (isScreenSharing) { void get().toggleScreenShare(); return; }
      localStream?.getVideoTracks().forEach((t) => (t.enabled = isCameraOff));
      set({ isCameraOff: !isCameraOff });
    },

    toggleScreenShare: async () => {
      const { localStream, isScreenSharing, peerConnection, peerConnections, isCameraOff, callType } = get();
      if (!localStream || callType !== "video") return;

      const allPeers = () => [...(peerConnection ? [peerConnection] : []), ...Object.values(peerConnections)];
      const swapVideoTrack = (next: MediaStreamTrack) => {
        allPeers().forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          void sender?.replaceTrack(next).catch(console.error);
        });
        const old = localStream.getVideoTracks()[0];
        if (old) { old.stop(); localStream.removeTrack(old); }
        localStream.addTrack(next);
      };

      try {
        if (!isScreenSharing) {
          const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const track = display.getVideoTracks()[0];
          track.onended = () => { if (get().isScreenSharing) void get().toggleScreenShare(); };
          swapVideoTrack(track);
          set({ isScreenSharing: true, isCameraOff: false });
        } else {
          const camera = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } });
          const track = camera.getVideoTracks()[0];
          track.enabled = !isCameraOff;
          swapVideoTrack(track);
          set({ isScreenSharing: false });
        }
      } catch (err: any) {
        if (err?.name !== "NotAllowedError") toast.error("Couldn't change screen sharing.");
      }
    },

    resetCallStore: () => {
      session++;
      closeEverything();
      set({ ...blankCall });
    },
  };
});
